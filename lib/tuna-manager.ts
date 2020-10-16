import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as iam from '@aws-cdk/aws-iam';
import * as region_info from '@aws-cdk/region-info';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import * as elasticache from '@aws-cdk/aws-elasticache';
import { ITopic } from '@aws-cdk/aws-sns';
import * as path from 'path';
import * as fs from 'fs';
import * as Mustache from 'mustache';
import { md5Hash, deleteFolderRecursive } from './utils';

export interface TunaManagerProps extends cdk.NestedStackProps {
    readonly vpc: ec2.IVpc;
    readonly fileSystemId: string;
    readonly notifyTopic: ITopic;
    readonly tunaManagerSG: ec2.ISecurityGroup;
    readonly tunaManagerALBSG: ec2.ISecurityGroup;
    readonly assetBucket: s3.IBucket;
}
export class TunaManagerStack extends cdk.NestedStack {

    readonly managerPort = 80;
    readonly managerALB: elbv2.IApplicationLoadBalancer;
    readonly managerASG: autoscaling.AutoScalingGroup;
    readonly managerALBTargetGroup: elbv2.ApplicationTargetGroup;

    constructor(scope: cdk.Construct, id: string, props: TunaManagerProps) {
        super(scope, id, props);

        const stack = cdk.Stack.of(this);
        const stage = this.node.tryGetContext('stage') || 'prod';
        const regionInfo = region_info.RegionInfo.get(stack.region);
        const usage = 'TunaManager';

        const ec2Role = new iam.Role(this, `${usage}EC2Role`, {
            assumedBy: new iam.CompositePrincipal(
                new iam.ServicePrincipal('ec2.amazonaws.com')),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
            ]
        });

        const confProps = {
            namespace: "OpenTuna",
            dimensionName: "procstat_lookup_pid_count",
            logPrefix: `/opentuna/${stage}/tunasync`,
        };

        // TODO replace cdk.out by outdir variable
        const tmpOutput = path.join(__dirname, `../cdk.out/tuna-manager-conf-files`);
        deleteFolderRecursive(tmpOutput);
        fs.mkdirSync(tmpOutput, {
            recursive: true
        });
        const cloudwatchAgentConf = Mustache.render(
            fs.readFileSync(path.join(__dirname, './tuna-manager-cloudwatch-agent.json'), 'utf-8'),
            confProps);
        const cloudwatchAgentConfFile =
            `amazon-cloudwatch-agent-${md5Hash(cloudwatchAgentConf)}.conf`;
        fs.writeFileSync(`${tmpOutput}/${cloudwatchAgentConfFile}`, cloudwatchAgentConf);

        const confPrefix = 'tunasync/manager/';
        const confFileDeployment = new s3deploy.BucketDeployment(this, 'ManagerConfFileDeployments', {
            sources: [s3deploy.Source.asset(tmpOutput)],
            destinationBucket: props.assetBucket,
            destinationKeyPrefix: confPrefix, // optional prefix in destination bucket
            prune: false,
            retainOnDelete: false,
        });

        // create redis instance
        const redisPort = 6379;
        const redisSG = new ec2.SecurityGroup(this, 'ManagerRedisSG', {
            description: 'SG for redis cluster',
            vpc: props.vpc,
            allowAllOutbound: false,
        });
        // allow manager to access redis
        redisSG.addIngressRule(props.tunaManagerSG, ec2.Port.tcp(redisPort), 'allow tunasync manager to access redis');
        const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'ManagerRedisSubnetGroup', {
            description: 'Subnet Group of redis cluster',
            subnetIds: props.vpc.privateSubnets.map((subnet) => subnet.subnetId)
        });
        const redisCluster = new elasticache.CfnCacheCluster(this, 'ManagerRedis', {
            cacheNodeType: "cache.t3.micro",
            engine: "redis",
            numCacheNodes: 1,
            cacheSubnetGroupName: redisSubnetGroup.ref,
            vpcSecurityGroupIds: [redisSG.securityGroupId]
        });

        const userdata = fs.readFileSync(path.join(__dirname, './tuna-manager-user-data.txt'), 'utf-8');
        const newProps = {
            fileSystemId: props.fileSystemId,
            regionEndpoint: `efs.${stack.region}.${regionInfo.domainSuffix}`,
            region: stack.region,
            port: this.managerPort,
            cloudwatchAgentConf: props.assetBucket.s3UrlForObject(`${confPrefix}${cloudwatchAgentConfFile}`),
            redisHost: redisCluster.attrRedisEndpointAddress
        }
        props.assetBucket.grantRead(ec2Role, `${confPrefix}*`);

        const tunaManagerASG = new autoscaling.AutoScalingGroup(this, `${usage}ASG`, {
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.C5, ec2.InstanceSize.LARGE),
            machineImage: ec2.MachineImage.latestAmazonLinux({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
            }),
            vpc: props.vpc,
            userData: ec2.UserData.custom(Mustache.render(userdata, newProps)),
            role: ec2Role,
            notificationsTopic: props.notifyTopic,
            minCapacity: 1,
            maxCapacity: 1,
            healthCheck: autoscaling.HealthCheck.elb({ grace: cdk.Duration.seconds(180) }),
            updateType: autoscaling.UpdateType.ROLLING_UPDATE,
            cooldown: cdk.Duration.seconds(30),
        });
        this.managerASG = tunaManagerASG;
        tunaManagerASG.addSecurityGroup(props.tunaManagerSG);

        this.managerALB = new elbv2.ApplicationLoadBalancer(this, `${usage}ALB`, {
            vpc: props.vpc,
            securityGroup: props.tunaManagerALBSG,
            internetFacing: false,
            http2Enabled: false,
        });
        const listener = this.managerALB.addListener(`Listener${this.managerPort}`, {
            port: this.managerPort,
            open: false,
        });
        this.managerALBTargetGroup = listener.addTargets(`${usage}TargetGroup`, {
            port: this.managerPort,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [tunaManagerASG],
            healthCheck: {
                path: '/ping',
            },
            slowStart: cdk.Duration.seconds(60),
            deregistrationDelay: cdk.Duration.seconds(10),
        });

        cdk.Tags.of(this).add('component', usage);
    }
}