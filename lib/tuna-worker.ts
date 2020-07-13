import autoscaling = require('@aws-cdk/aws-autoscaling');
import cdk = require('@aws-cdk/core');
import cloudwatch = require('@aws-cdk/aws-cloudwatch');
import cw_actions = require('@aws-cdk/aws-cloudwatch-actions');
import ec2 = require('@aws-cdk/aws-ec2');
import fs = require('fs');
import iam = require('@aws-cdk/aws-iam');
import path = require('path');
import sns = require('@aws-cdk/aws-sns');
import region_info = require('@aws-cdk/region-info');
import Mustache = require('mustache');

export interface TunaWorkerProps extends cdk.NestedStackProps {
    readonly vpc: ec2.IVpc;
    readonly fileSystemId: string;
    readonly notifyTopic: sns.ITopic;
    readonly managerUrl: string;
    readonly tunaWorkerSG: ec2.ISecurityGroup;
}
export class TunaWorkerStack extends cdk.NestedStack {

    readonly workerPort = 80;

    constructor(scope: cdk.Construct, id: string, props: TunaWorkerProps) {
        super(scope, id, props);

        const stack = cdk.Stack.of(this);
        const stage = this.node.tryGetContext('stage') || 'prod';

        const regionInfo = region_info.RegionInfo.get(stack.region);
        const usage = 'TunaWorker';

        const ec2Role = new iam.Role(this, `OpenTuna${usage}EC2Role`, {
            assumedBy: new iam.CompositePrincipal(
                new iam.ServicePrincipal('ec2.amazonaws.com')),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
            ],
        });

        const userdata = fs.readFileSync(path.join(__dirname, './tuna-worker-user-data.txt'), 'utf-8');

        const namespace = `OpenTuna`;
        const metricName = 'procstat_lookup_pid_count';
        const dimensionName = 'AutoScalingGroupName';

        const newProps = {
            fileSystemId: props.fileSystemId,
            regionEndpoint: `efs.${stack.region}.${regionInfo.domainSuffix}`,
            s3RegionEndpoint: `s3.${stack.region}.${regionInfo.domainSuffix}`,
            port: this.workerPort,
            managerUrl: props.managerUrl,
            region: stack.region,
            logPrefix: `/opentuna/${stage}/tunasync`,
            repoRoot: '/mnt/efs/opentuna',
            namespace,
            dimensionName,
            mirrors: stage === 'prod' ? [
                {
                    name: 'alpine',
                    interval: 1440,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/alpine/'
                },
                {
                    name: 'elrepo',
                    interval: 720,
                    provider: 'rsync',
                    upstream: 'rsync://ftp.yz.yamagata-u.ac.jp/pub/linux/RPMS/elrepo/'
                },
                {
                    name: 'epel',
                    interval: 720,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/epel/'
                },
                {
                    name: 'centos',
                    interval: 720,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/centos/'
                },
                {
                    name: 'centos-altarch',
                    interval: 1440,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/centos-altarch/'
                },
                {
                    name: 'debian',
                    interval: 720,
                    retry: 100,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.bfsu.edu.cn/debian/'
                },
                {
                    name: 'debian-security',
                    interval: 720,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/debian-security/'
                }, 
                {
                    name: 'docker-ce',
                    interval: 1440,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/docker-ce/'
                },
                {
                    name: 'gitlab-ce',
                    interval: 1440,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/gitlab-ce/'
                },
                {
                    name: 'gitlab-runner',
                    interval: 1440,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/gitlab-runner/'
                },
                {
                    name: 'grafana',
                    interval: 1440,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/grafana/'
                },
                {
                    name: 'jenkins',
                    interval: 1440,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/jenkins/'
                },
                {
                    name: 'kubernetes',
                    interval: 1440,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/kubernetes/'
                },
                {
                    name: 'mariadb',
                    interval: 720,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/mariadb/'
                },
                {
                    name: 'mongodb',
                    interval: 1440,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/mongodb/'
                },
                {
                    name: 'mysql',
                    interval: 1440,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/mysql/'
                },
                {
                    name: 'nodejs-release',
                    interval: 1440,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/nodejs-release/'
                },
                {
                    name: 'nodesource',
                    interval: 1440,
                    provider: 'rsync',
                    upstream: 'rsync://mirrors.tuna.tsinghua.edu.cn/nodesource/'
                },
                {
                    name: 'pypi',
                    /**
                     * For unified cloudwatch agent to ingest multiple line logs,
                     * https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html#CloudWatch-Agent-Configuration-File-Logssection
                     */
                    logStartPattern: '^\\\\\\\\d{4}-\\\\\\\\d{2}-\\\\\\\\d{2}\\\\\\\\s\\\\\\\\d{2}:\\\\\\\\d{2}:\\\\\\\\d{2},\\\\\\\\d{3}',
                    timeFormat: '%Y-%m-%d %H:%M:%S',
                    provider: 'command',
                    upstream: 'https://pypi.python.org/',
                    command: '$TUNASCRIPT_PATH/pypi.sh',
                    interval: 5,
                    envs: [
                        'INIT = "0"',
                    ]
                },
                {
                    name: 'ubuntu',
                    provider: 'two-stage-rsync',
                    stage1_profile: 'debian',
                    upstream: 'rsync://archive.ubuntu.com/ubuntu/',
                    rsync_options: [ '"--delete-excluded"', ]
                },
            ]
            :
            [
                {
                    name: 'elrepo',
                    interval: 720,
                    provider: 'rsync',
                    retry: 10,
                    upstream: 'rsync://ftp.yz.yamagata-u.ac.jp/pub/linux/RPMS/elrepo/'
                },
                {
                    name: 'pypi',
                    /**
                     * For unified cloudwatch agent to ingest multiple line logs,
                     * https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html#CloudWatch-Agent-Configuration-File-Logssection
                     */
                    logStartPattern: '^\\\\\\\\d{4}-\\\\\\\\d{2}-\\\\\\\\d{2}\\\\\\\\s\\\\\\\\d{2}:\\\\\\\\d{2}:\\\\\\\\d{2},\\\\\\\\d{3}',
                    timeFormat: '%Y-%m-%d %H:%M:%S',
                    provider: 'command',
                    upstream: 'https://pypi.python.org/',
                    command: '$TUNASCRIPT_PATH/pypi.sh',
                    interval: 5,
                    envs: [
                        'INIT = "0"',
                    ]
                },
            ],
        };

        const tunaWorkerASG = new autoscaling.AutoScalingGroup(this, `${usage}ASG`, {
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.C5, ec2.InstanceSize.XLARGE),
            machineImage: ec2.MachineImage.latestAmazonLinux({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
            }),
            vpc: props.vpc,
            // save cost to put worker in public subnet with public IP
            vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC, },
            associatePublicIpAddress: true,
            userData: ec2.UserData.custom(Mustache.render(userdata, newProps)),
            role: ec2Role,
            notificationsTopic: props.notifyTopic,
            minCapacity: 1,
            maxCapacity: 1,
            healthCheck: autoscaling.HealthCheck.ec2({ grace: cdk.Duration.seconds(180) }),
            updateType: autoscaling.UpdateType.ROLLING_UPDATE,
            cooldown: cdk.Duration.seconds(30),
        });
        tunaWorkerASG.addSecurityGroup(props.tunaWorkerSG);

        // create CloudWatch custom metrics and alarm for Tunasync worker process
        const runningTunaWorkerProcessMetric = new cloudwatch.Metric({
            namespace: namespace,
            metricName: metricName,
            statistic: 'sum',
            period: cdk.Duration.minutes(1),
            dimensions: {
                [dimensionName]: tunaWorkerASG.autoScalingGroupName
            },
        });
        const tunaWorkerAlarm = new cloudwatch.Alarm(this, 'TunaWorkerAlarm', {
            metric: runningTunaWorkerProcessMetric,
            alarmDescription: `Running Tunasync Worker Process Alarm.`,
            comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
            threshold: 1,
            evaluationPeriods: 3,
            treatMissingData: cloudwatch.TreatMissingData.BREACHING,
            actionsEnabled: true,
        });
        tunaWorkerAlarm.addAlarmAction(new cw_actions.SnsAction(props.notifyTopic));
        tunaWorkerAlarm.addOkAction(new cw_actions.SnsAction(props.notifyTopic));

        cdk.Tag.add(this, 'component', usage);
    }
}