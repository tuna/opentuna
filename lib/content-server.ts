import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import logs = require('@aws-cdk/aws-logs');
import custom_resources = require('@aws-cdk/custom-resources');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import ecr_assets = require('@aws-cdk/aws-ecr-assets');
import path = require('path');
import { ITopic } from '@aws-cdk/aws-sns';

export interface ContentServerProps extends cdk.NestedStackProps {
    readonly vpc: ec2.IVpc;
    readonly fileSystemId: string;
    readonly notifyTopic: ITopic;
    readonly ecsCluster: ecs.Cluster;
    readonly listener: elbv2.ApplicationListener;
}

export class ContentServerStack extends cdk.NestedStack {

    constructor(scope: cdk.Construct, id: string, props: ContentServerProps) {
        super(scope, id, props);

        const usage = 'ContentServer';

        const imageAsset = new ecr_assets.DockerImageAsset(this, `${usage}DockerImage`, {
            directory: path.join(__dirname, '../content-server'),
            repositoryName: "opentuna/content-server"
        });

        const httpPort = 80;
        const taskDefinition = new ecs.FargateTaskDefinition(this, `${usage}TaskDefiniton`, {});
        const logGroup = new logs.LogGroup(this, `${usage}LogGroup`, {
            logGroupName: `/opentuna/contentserver`,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
        const container = taskDefinition.addContainer("content-server", {
            image: ecs.ContainerImage.fromDockerImageAsset(imageAsset),
            logging: new ecs.AwsLogDriver({
                streamPrefix: usage,
                // like [16/Jul/2020:02:24:46 +0000]
                datetimeFormat: "\\[%d/%b/%Y:%H:%M:%S %z\\]",
                logGroup,
            }),
        });
        container.addPortMappings({
            containerPort: httpPort,
        });

        // learned from https://github.com/aws-samples/amazon-efs-integrations/blob/master/lib/amazon-efs-integrations/ecs-service.ts
        const customTaskDefinitionJson = {
            containerDefinitions: [
                {
                    essential: true,
                    image: imageAsset.imageUri,
                    logConfiguration: {
                        logDriver: taskDefinition.defaultContainer!.logDriverConfig!.logDriver,
                        options: taskDefinition.defaultContainer!.logDriverConfig!.options,
                    },
                    memory: 512,
                    user: "root",
                    mountPoints: [{
                        containerPath: "/mnt/efs",
                        sourceVolume: "efs-volume",
                        readOnly: true,
                    }],
                    name: taskDefinition.defaultContainer!.containerName,
                    portMappings: [
                        {
                            containerPort: httpPort,
                            hostPort: httpPort,
                            protocol: 'tcp',
                        },
                    ],
                },
            ],
            cpu: '256',
            executionRoleArn: taskDefinition.executionRole?.roleArn,
            family: taskDefinition.family,
            memory: '1024',
            networkMode: ecs.NetworkMode.AWS_VPC,
            requiresCompatibilities: [
                "FARGATE",
            ],
            taskRoleArn: taskDefinition.taskRole.roleArn,
            volumes: [{
                name: "efs-volume",
                efsVolumeConfiguration: {
                    fileSystemId: props.fileSystemId,
                    rootDirectory: "/data",
                },
            }],
        };

        const createOrUpdateCustomTaskDefinition = {
            action: 'registerTaskDefinition',
            outputPath: 'taskDefinition.taskDefinitionArn',
            parameters: customTaskDefinitionJson,
            physicalResourceId: custom_resources.PhysicalResourceId.fromResponse('taskDefinition.taskDefinitionArn'),
            service: 'ECS',
        };
        const customTaskDefinition = new custom_resources.AwsCustomResource(this, `${usage}CustomTaskDefinition`, {
            onCreate: createOrUpdateCustomTaskDefinition,
            onUpdate: createOrUpdateCustomTaskDefinition,
            policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
                resources: custom_resources.AwsCustomResourcePolicy.ANY_RESOURCE,
            }),
        });

        const service = new ecs.FargateService(this, `${usage}Fargate`, {
            cluster: props.ecsCluster,
            desiredCount: 2,
            platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
            taskDefinition,
        });
        service.taskDefinition.executionRole?.grantPassRole(customTaskDefinition.grantPrincipal);
        service.taskDefinition.taskRole.grantPassRole(customTaskDefinition.grantPrincipal);

        // we will replace this hack when CDK supports EFS in Fargate
        (service.node.tryFindChild('Service') as ecs.CfnService)?.addPropertyOverride(
            'TaskDefinition',
            customTaskDefinition.getResponseField('taskDefinition.taskDefinitionArn'),
        );

        props.listener.addTargets('ContentServer', {
            port: httpPort,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [ service ],
            healthCheck: {
                enabled: true,
                timeout: cdk.Duration.seconds(15),
            },
        });

        cdk.Tag.add(this, 'component', usage);
    }
}
