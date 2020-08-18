import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as logs from '@aws-cdk/aws-logs';
import * as custom_resources from '@aws-cdk/custom-resources';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as ecr_assets from '@aws-cdk/aws-ecr-assets';
import * as path from 'path';
import * as ssm from '@aws-cdk/aws-ssm';
import * as iam from '@aws-cdk/aws-iam';
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

        const param = new ssm.StringParameter(this, 'CloudWatchConfigStringParameter', {
            description: 'Parameter for CloudWatch agent',
            parameterName: 'CloudWatchConfig',
            stringValue: JSON.stringify(
                {
                    "metrics": {
                        "namespace": "OpenTuna",
                        "metrics_collected": {
                            "cpu": {
                                "measurement": ["usage_idle", "usage_iowait", "usage_system", "usage_user"],
                            },
                            "net": {
                                "measurement": ["bytes_sent", "bytes_recv", "packets_sent", "packets_recv"],
                            },
                            "netstat": {
                                "measurement": ["tcp_established", "tcp_syn_sent", "tcp_close"],
                            }
                        }
                    },
                    "logs": {
                        "metrics_collected": {
                            "emf": {}
                        }
                    }
                }
            ),
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

        // cloudwatch agent
        const cloudWatchAgentlogGroup = new logs.LogGroup(this, `${usage}CloudWatchAgentLogGroup`, {
            logGroupName: `/opentuna/cloudwatch-agent`,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
        const cloudWatchAgent = taskDefinition.addContainer("cloudwatch-agent", {
            image: ecs.ContainerImage.fromRegistry('amazon/cloudwatch-agent:latest'),
            logging: new ecs.AwsLogDriver({
                streamPrefix: usage,
                logGroup: cloudWatchAgentlogGroup,
            }),
            essential: false,
        });

        // learned from https://github.com/aws-samples/amazon-efs-integrations/blob/master/lib/amazon-efs-integrations/ecs-service.ts
        const customTaskDefinitionJson = {
            containerDefinitions: [
                {
                    essential: true,
                    image: imageAsset.imageUri,
                    logConfiguration: {
                        logDriver: container.logDriverConfig!.logDriver,
                        options: container.logDriverConfig!.options,
                    },
                    memory: 512,
                    user: "root",
                    mountPoints: [{
                        containerPath: "/mnt/efs",
                        sourceVolume: "efs-volume",
                        readOnly: true,
                    }],
                    name: container.containerName,
                    portMappings: [
                        {
                            containerPort: httpPort,
                            hostPort: httpPort,
                            protocol: 'tcp',
                        },
                    ],
                },
                {
                    essential: false,
                    name: cloudWatchAgent.containerName,
                    image: "amazon/cloudwatch-agent:latest",
                    logConfiguration: {
                        logDriver: cloudWatchAgent.logDriverConfig!.logDriver,
                        options: cloudWatchAgent.logDriverConfig!.options,
                    },
                    secrets: [{
                        name: 'CW_CONFIG_CONTENT',
                        valueFrom: param.parameterName
                    }]
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

        // setup cloudwatch agent permissions
        service.taskDefinition.executionRole!.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMReadOnlyAccess'));
        service.taskDefinition.executionRole!.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'));
        service.taskDefinition.taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'));

        // we will replace this hack when CDK supports EFS in Fargate
        (service.node.tryFindChild('Service') as ecs.CfnService)?.addPropertyOverride(
            'TaskDefinition',
            customTaskDefinition.getResponseField('taskDefinition.taskDefinitionArn'),
        );

        props.listener.addTargets('ContentServer', {
            port: httpPort,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [service],
            healthCheck: {
                enabled: true,
                timeout: cdk.Duration.seconds(15),
            },
        });

        cdk.Tag.add(this, 'component', usage);
    }
}
