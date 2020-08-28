import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as logs from '@aws-cdk/aws-logs';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as ecr_assets from '@aws-cdk/aws-ecr-assets';
import * as path from 'path';
import * as ssm from '@aws-cdk/aws-ssm';
import * as iam from '@aws-cdk/aws-iam';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import { ITopic } from '@aws-cdk/aws-sns';
import { AdjustmentType } from '@aws-cdk/aws-autoscaling';

export interface ContentServerProps extends cdk.NestedStackProps {
    readonly vpc: ec2.IVpc;
    readonly fileSystemId: string;
    readonly notifyTopic: ITopic;
    readonly ecsCluster: ecs.Cluster;
    readonly listener: elbv2.ApplicationListener;
    readonly dashboard: cloudwatch.Dashboard;
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
        const taskDefinition = new ecs.FargateTaskDefinition(this, `${usage}TaskDefiniton`, {
            volumes: [{
                name: "efs-volume",
                efsVolumeConfiguration: {
                    fileSystemId: props.fileSystemId,
                    rootDirectory: "/data",
                },
            }]
        });
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
        container.addMountPoints({
            readOnly: true,
            containerPath: "/mnt/efs",
            sourceVolume: "efs-volume"
        });
        container.addPortMappings({
            containerPort: httpPort,
        });

        // cloudwatch agent
        const cloudWatchAgentlogGroup = new logs.LogGroup(this, `${usage}CloudWatchAgentLogGroup`, {
            logGroupName: `/opentuna/${usage}/cloudwatch-agent`,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
        const cloudWatchAgent = taskDefinition.addContainer("cloudwatch-agent", {
            image: ecs.ContainerImage.fromRegistry('amazon/cloudwatch-agent:latest'),
            logging: new ecs.AwsLogDriver({
                streamPrefix: usage,
                logGroup: cloudWatchAgentlogGroup,
            }),
            essential: false,
            secrets: {
                "CW_CONFIG_CONTENT": ecs.Secret.fromSsmParameter(param),
            }
        });

        const service = new ecs.FargateService(this, `${usage}Fargate`, {
            cluster: props.ecsCluster,
            desiredCount: 1,
            platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
            taskDefinition,
        });

        // setup cloudwatch agent permissions
        // allow execution role to read ssm parameter
        param.grantRead(service.taskDefinition.executionRole!);
        service.taskDefinition.executionRole!.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'));
        service.taskDefinition.taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'));

        const targetGroup = props.listener.addTargets('ContentServer', {
            port: httpPort,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [service],
            healthCheck: {
                enabled: true,
                timeout: cdk.Duration.seconds(15),
            },
        });

        // auto scaling
        const scaling = service.autoScaleTaskCount({
            minCapacity: 1,
            maxCapacity: 16
        });
        const bytesSentEth1 = new cloudwatch.Metric({
            namespace: 'OpenTuna',
            metricName: 'net_bytes_sent',
            dimensions: {
                interface: "eth1"
            },
            statistic: cloudwatch.Statistic.AVERAGE,
        });
        // each task instance has about 500Mbps bandwidth
        // 500Mbps * 60s/min / 8b/B = 3750MB/min
        // must use direct metric because of api limitation
        // so only eth1 is used
        scaling.scaleToTrackCustomMetric('NetworkBandwidthScaling', {
            metric: bytesSentEth1,
            targetValue: 3 * 1024 * 1024 * 1024, // 3GiB/min
            scaleInCooldown: cdk.Duration.minutes(10),
            scaleOutCooldown: cdk.Duration.minutes(3),
        });
        const cpuUsage = {
            namespace: 'OpenTuna',
            dimensions: {
                cpu: "cpu-total"
            },
            statistic: cloudwatch.Statistic.AVERAGE,
            period: cdk.Duration.minutes(1),
        };
        const cpuUsageIowait = new cloudwatch.Metric({
            metricName: 'cpu_usage_iowait',
            ...cpuUsage
        });
        // peak iowait% is around 40%
        scaling.scaleToTrackCustomMetric('CpuIowaitScaling', {
            metric: cpuUsageIowait,
            targetValue: 25,
            scaleInCooldown: cdk.Duration.minutes(10),
            scaleOutCooldown: cdk.Duration.minutes(3),
        });

        // Add widget for content server
        const bytesEth1 = {
            namespace: 'OpenTuna',
            dimensions: {
                interface: "eth1"
            },
            statistic: cloudwatch.Statistic.SUM,
            period: cdk.Duration.minutes(1),
        };
        props.dashboard.addWidgets(new cloudwatch.GraphWidget({
            title: 'Content Server Network',
            left: [
                new cloudwatch.Metric({
                    metricName: 'net_bytes_sent',
                    label: 'Sent B/min',
                    ...bytesEth1
                }),
                new cloudwatch.Metric({
                    metricName: 'net_bytes_recv',
                    label: 'Recv B/min',
                    ...bytesEth1
                })
            ]
        }), new cloudwatch.GraphWidget({
            title: 'Content Server Cpu',
            left: [
                new cloudwatch.Metric({
                    metricName: 'cpu_usage_iowait',
                    label: 'iowait%',
                    ...cpuUsage
                }),
                new cloudwatch.Metric({
                    metricName: 'cpu_usage_idle',
                    label: 'idle%',
                    ...cpuUsage
                }),
                new cloudwatch.Metric({
                    metricName: 'cpu_usage_user',
                    label: 'user%',
                    ...cpuUsage
                }),
                new cloudwatch.Metric({
                    metricName: 'cpu_usage_system',
                    label: 'system%',
                    ...cpuUsage
                }),
            ]
        }), new cloudwatch.GraphWidget({
            title: 'Content Server Task Count',
            left: [service.metricCpuUtilization({
                statistic: cloudwatch.Statistic.SAMPLE_COUNT,
                period: cdk.Duration.minutes(1),
                label: 'Task Count'
            })]
        }));

        cdk.Tag.add(this, 'component', usage);
    }
}
