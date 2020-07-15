import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import logs = require('@aws-cdk/aws-logs');
import ecs_patterns = require('@aws-cdk/aws-ecs-patterns');
import custom_resources = require('@aws-cdk/custom-resources');
import ecr = require('@aws-cdk/aws-ecr');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import ecr_assets = require('@aws-cdk/aws-ecr-assets');
import path = require('path');
import { ITopic } from '@aws-cdk/aws-sns';
import { pathToFileURL } from 'url';

export interface ContentServerProps extends cdk.NestedStackProps {
    readonly vpc: ec2.IVpc;
    readonly fileSystemId: string;
    readonly notifyTopic: ITopic;
    readonly externalALB: elbv2.ApplicationLoadBalancer;
}

export class ContentServerStack extends cdk.NestedStack {
    constructor(scope: cdk.Construct, id: string, props: ContentServerProps) {
        super(scope, id, props);

        const stack = cdk.Stack.of(this);
        const usage = 'ContentServer';

        const cluster = new ecs.Cluster(this, `${usage}ECSCluster`, {
            vpc: props.vpc,
        });

        const imageAsset = new ecr_assets.DockerImageAsset(this, `${usage}DockerImage`, {
            directory: path.join(__dirname, '../content-server')
        });

        const httpPort = 80;
        const service = new ecs_patterns.ApplicationLoadBalancedFargateService(this, `${usage}Fargate`, {
            cluster: cluster,
            loadBalancer: props.externalALB,
            desiredCount: 2,
            taskImageOptions: {
                image: ecs.ContainerImage.fromDockerImageAsset(imageAsset),
                logDriver: new ecs.AwsLogDriver({
                    streamPrefix: usage,
                    logGroup: new logs.LogGroup(this, `${usage}LogGroup`, {
                        logGroupName: `/opentuna/contentserver`
                    })
                }),
            },
            // need 1.4.0 to mount EFS
            platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
        });

        // learned from https://github.com/aws-samples/amazon-efs-integrations/blob/master/lib/amazon-efs-integrations/ecs-service.ts
        const customTaskDefinitionJson = {
            containerDefinitions: [
                {
                    essential: true,
                    image: imageAsset.imageUri,
                    logConfiguration: {
                        logDriver: service.taskDefinition.defaultContainer?.logDriverConfig?.logDriver,
                        options: service.taskDefinition.defaultContainer?.logDriverConfig?.options,
                    },
                    memory: 512,
                    user: "root",
                    mountPoints: [{
                        containerPath: "/mnt/efs",
                        sourceVolume: "efs-volume",
                        readOnly: true,
                    }],
                    name: service.taskDefinition.defaultContainer?.containerName,
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
            executionRoleArn: service.taskDefinition.executionRole?.roleArn,
            family: service.taskDefinition.family,
            memory: '1024',
            networkMode: ecs.NetworkMode.AWS_VPC,
            requiresCompatibilities: [
                "FARGATE",
            ],
            taskRoleArn: service.taskDefinition.taskRole.roleArn,
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
        const customTaskDefinition = new custom_resources.AwsCustomResource(service, `${usage}CustomTaskDefinition`, {
            onCreate: createOrUpdateCustomTaskDefinition,
            onUpdate: createOrUpdateCustomTaskDefinition,
            policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
                resources: custom_resources.AwsCustomResourcePolicy.ANY_RESOURCE,
            }),
        });
        service.taskDefinition.executionRole?.grantPassRole(customTaskDefinition.grantPrincipal);
        service.taskDefinition.taskRole.grantPassRole(customTaskDefinition.grantPrincipal);

        // we will replace this hack when CDK supports EFS in Fargate
        (service.service.node.tryFindChild('Service') as ecs.CfnService)?.addPropertyOverride(
            'TaskDefinition',
            customTaskDefinition.getResponseField('taskDefinition.taskDefinitionArn'),
        );

        cdk.Tag.add(this, 'component', usage);
    }
}
