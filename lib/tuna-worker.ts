import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as cdk from '@aws-cdk/core';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import * as cw_actions from '@aws-cdk/aws-cloudwatch-actions';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import * as sns from '@aws-cdk/aws-sns';
import * as region_info from '@aws-cdk/region-info';
import * as Mustache from 'mustache';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { getMirrorConfig } from './mirror-config';

export interface TunaWorkerProps extends cdk.NestedStackProps {
    readonly vpc: ec2.IVpc;
    readonly fileSystemId: string;
    readonly notifyTopic: sns.ITopic;
    readonly managerUrl: string;
    readonly tunaWorkerSG: ec2.ISecurityGroup;
    readonly assetBucket: s3.IBucket;
    readonly rubygemsBucket: s3.IBucket;
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

        const tunaScriptPath = '/tunasync-scripts';
        const confProps = {
            repoRoot: '/mnt/efs/opentuna',
            port: this.workerPort,
            logPrefix: `/opentuna/${stage}/tunasync`,
            namespace,
            dimensionName,
            mirrors: getMirrorConfig(stage),
            region: stack.region,
        };

        // TODO replace cdk.out by outdir variable
        const tmpOutput = path.join(__dirname, `../cdk.out/tuna-worker-conf-files`);
        deleteFolderRecursive(tmpOutput);
        fs.mkdirSync(tmpOutput, {
            recursive: true
        });
        const tunasyncWorkerConf = Mustache.render(
            fs.readFileSync(path.join(__dirname, './tuna-worker-tunasync.conf'), 'utf-8'),
            confProps).replace('$TUNASCRIPT_PATH', tunaScriptPath);
        const tunasyncWorkerConfFile =
            `tuna-worker-${md5Hash(tunasyncWorkerConf)}.conf`;
        fs.writeFileSync(`${tmpOutput}/${tunasyncWorkerConfFile}`, tunasyncWorkerConf);

        const cloudwatchAgentConf = Mustache.render(
            fs.readFileSync(path.join(__dirname, './tuna-worker-cloudwatch-agent.txt'), 'utf-8'),
            confProps);
        const cloudwatchAgentConfFile =
            `amazon-cloudwatch-agent-${md5Hash(cloudwatchAgentConf)}.conf`;
        fs.writeFileSync(`${tmpOutput}/${cloudwatchAgentConfFile}`, cloudwatchAgentConf);

        const rubygemsScript = Mustache.render(
            fs.readFileSync(path.join(__dirname, './tuna-worker-rubygems-s3.sh'), 'utf-8'),
            confProps);
        const rubyGemsScriptFile =
            `rubygems-s3-${md5Hash(rubygemsScript)}.conf`;
        fs.writeFileSync(`${tmpOutput}/${rubyGemsScriptFile}`, rubygemsScript);

        const confPrefix = 'tunasync/worker/';
        const confFileDeployment = new s3deploy.BucketDeployment(this, 'WorkerConfFileDeployments', {
            sources: [s3deploy.Source.asset(tmpOutput)],
            destinationBucket: props.assetBucket,
            destinationKeyPrefix: confPrefix, // optional prefix in destination bucket
            prune: false,
            retainOnDelete: false,
        });

        const newProps = {
            fileSystemId: props.fileSystemId,
            regionEndpoint: `efs.${stack.region}.${regionInfo.domainSuffix}`,
            s3RegionEndpoint: `s3.${stack.region}.${regionInfo.domainSuffix}`,
            region: stack.region,
            repoRoot: '/mnt/efs/opentuna',
            managerUrl: props.managerUrl,
            tunaScriptPath,
            tunasyncWorkerConf: props.assetBucket.s3UrlForObject(`${confPrefix}${tunasyncWorkerConfFile}`),
            cloudwatchAgentConf: props.assetBucket.s3UrlForObject(`${confPrefix}${cloudwatchAgentConfFile}`),
            rubygemsBucket: props.rubygemsBucket.bucketName,
            rubygemsScript: props.assetBucket.s3UrlForObject(`${confPrefix}${rubyGemsScriptFile}`),
        };

        const rawUserData = Mustache.render(userdata, newProps);
        if (rawUserData.length > 16 * 1024) {
            throw new Error(`The size of user data of ${usage} EC2 exceeds 16KB.`);
        }

        props.assetBucket.grantRead(ec2Role, `${confPrefix}*`);

        const tunaWorkerASG = new autoscaling.AutoScalingGroup(this, `${usage}ASG`, {
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.C5, ec2.InstanceSize.XLARGE),
            machineImage: ec2.MachineImage.latestAmazonLinux({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
            }),
            vpc: props.vpc,
            // save cost to put worker in public subnet with public IP
            vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC, },
            associatePublicIpAddress: true,
            userData: ec2.UserData.custom(rawUserData),
            role: ec2Role,
            notificationsTopic: props.notifyTopic,
            minCapacity: 1,
            maxCapacity: 1,
            healthCheck: autoscaling.HealthCheck.ec2({ grace: cdk.Duration.seconds(180) }),
            updateType: autoscaling.UpdateType.ROLLING_UPDATE,
            cooldown: cdk.Duration.seconds(30),
        });
        tunaWorkerASG.node.addDependency(confFileDeployment);
        tunaWorkerASG.addSecurityGroup(props.tunaWorkerSG);
        props.rubygemsBucket.grantReadWrite(tunaWorkerASG.role);

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

var deleteFolderRecursive = function (path: fs.PathLike) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(function (file, index) {
            var curPath = path + "/" + file;
            if (fs.lstatSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
};


var md5Hash = function (content: string) {
    return crypto.createHash('md5').update(content).digest('hex');
}