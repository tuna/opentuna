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
import { getMirrorConfig } from './mirror-config';

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
            mirrors: getMirrorConfig(stage),
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