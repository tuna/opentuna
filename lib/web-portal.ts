import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import logs = require('@aws-cdk/aws-logs');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import ecr_assets = require('@aws-cdk/aws-ecr-assets');
import autoscaling = require('@aws-cdk/aws-autoscaling');
import lambda = require('@aws-cdk/aws-lambda');
import efs = require('@aws-cdk/aws-efs');
import events = require('@aws-cdk/aws-events');
import events_targets = require('@aws-cdk/aws-events-targets');
import path = require('path');
import fs = require('fs');

export interface WebPortalProps extends cdk.NestedStackProps {
    readonly vpc: ec2.IVpc;
    readonly externalALBListener: elbv2.ApplicationListener;
    readonly ecsCluster: ecs.Cluster;
    readonly tunaManagerASG: autoscaling.AutoScalingGroup;
    readonly tunaManagerALBTargetGroup: elbv2.ApplicationTargetGroup;
    readonly fileSystemId: string;
    readonly fileSystemSGId: string;
}

export class WebPortalStack extends cdk.NestedStack {
    readonly dockerImageHash: string;

    constructor(scope: cdk.Construct, id: string, props: WebPortalProps) {
        super(scope, id, props);

        const stack = cdk.Stack.of(this);
        const usage = 'WebPortal';

        const imageAsset = new ecr_assets.DockerImageAsset(this, `${usage}DockerImage`, {
            directory: path.join(__dirname, '../web-portal'),
            repositoryName: "opentuna/web-portal"
        });
        this.dockerImageHash = imageAsset.sourceHash;

        const httpPort = 80;
        const taskDefinition = new ecs.FargateTaskDefinition(this, `${usage}TaskDefiniton`, {});
        const logGroup = new logs.LogGroup(this, `${usage}LogGroup`, {
            logGroupName: `/opentuna/webportal`,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
        const container = taskDefinition.addContainer("web", {
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

        const service = new ecs.FargateService(this, `${usage}Fargate`, {
            cluster: props.ecsCluster,
            taskDefinition,
            platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
        });

        // one target can have at most 5 path patterns, so split them
        // route web files to this service
        let webTargetGroup = new elbv2.ApplicationTargetGroup(scope, `${usage}WebTargetGroup`, {
            port: httpPort,
            vpc: props.vpc,
            slowStart: cdk.Duration.seconds(60),
            deregistrationDelay: cdk.Duration.seconds(10),
            targets: [service],
        });
        props.externalALBListener.addTargetGroups(`${usage}TargetGroup`, {
            priority: 10,
            targetGroups: [webTargetGroup],
            conditions: [elbv2.ListenerCondition.pathPatterns([
                "/",
                "/404.html",
                "/index.html",
                "/robots.txt",
                "/sitemap.xml",
            ])],
        })
        props.externalALBListener.addTargetGroups(`${usage}TargetGroup2`, {
            targetGroups: [webTargetGroup],
            priority: 15,
            conditions: [elbv2.ListenerCondition.pathPatterns([
                "/help/*",
                "/news/*",
                "/static/*",
                "/status/*",
            ])],
        })

        // redirect /static/tunasync.json to /jobs
        props.externalALBListener.addAction(`${usage}RedirectJobsHTTPAction`, {
            action: elbv2.ListenerAction.redirect({
                path: "/jobs",
            }),
            priority: 6,
            conditions: [elbv2.ListenerCondition.pathPatterns([
                "/static/tunasync.json",
            ])],
        })
        // redirect /static/status/isoinfo.json to /isoinfo.json
        props.externalALBListener.addAction(`${usage}RedirectIsoHTTPAction`, {
            action: elbv2.ListenerAction.redirect({
                path: "/isoinfo.json",
            }),
            priority: 8,
            conditions: [elbv2.ListenerCondition.pathPatterns([
                "/static/status/isoinfo.json",
            ])],
        })

        // route /jobs to tuna manager
        // there is no easy way to do this yet
        // see https://github.com/aws/aws-cdk/issues/5667
        let targetGroup = new elbv2.ApplicationTargetGroup(this, `${usage}ManagerTargetGroup`, {
            port: httpPort,
            targetType: elbv2.TargetType.INSTANCE,
            vpc: props.vpc,
            healthCheck: {
                path: '/ping',
            }
        });
        const cfnAsg = props.tunaManagerASG.node.defaultChild as autoscaling.CfnAutoScalingGroup;
        cfnAsg.targetGroupArns = [props.tunaManagerALBTargetGroup.targetGroupArn, targetGroup.targetGroupArn];
        props.externalALBListener.addAction(`${usage}ManagerTarget`, {
            action: elbv2.ListenerAction.forward([targetGroup]),
            priority: 20,
            conditions: [elbv2.ListenerCondition.pathPatterns([
                "/jobs",
            ])],
        })

        // lambda function to generate iso download links
        fs.copyFileSync(path.join(__dirname, '../web-portal/mirror-web/geninfo/genisolist.ini'), path.join(__dirname, '../web-portal/genisolist/genisolist.ini'));
        fs.copyFileSync(path.join(__dirname, '../web-portal/mirror-web/geninfo/genisolist.py'), path.join(__dirname, '../web-portal/genisolist/genisolist.py'));
        const fileSystem = efs.FileSystem.fromFileSystemAttributes(this, `FileSystem`, {
            fileSystemId: props.fileSystemId,
            securityGroup: ec2.SecurityGroup.fromSecurityGroupId(this, `FileSystemSG`, props.fileSystemSGId)
        });
        const accessPoint = new efs.AccessPoint(this, `${usage}GenIsoLambdaAccessPoint`, {
            fileSystem,
            path: '/data',
            // NOTE: is there a better way?
            posixUser: {
                uid: '0',
                gid: '0',
            },
        });
        const func = new lambda.Function(this, `${usage}GenIsoLambda`, {
            code: lambda.Code.fromAsset(path.join(__dirname, '../web-portal/genisolist')),
            runtime: lambda.Runtime.PYTHON_3_8,
            handler: 'wrapper.lambda_handler',
            vpc: props.vpc,
            filesystem: lambda.FileSystem.fromEfsAccessPoint(accessPoint, '/mnt/data'),
            timeout: cdk.Duration.seconds(60)
        });
        // trigger lambda every day
        const rule = new events.Rule(this, `${usage}GenIsoPeriodic`, {
            schedule: events.Schedule.expression('rate(1 day)')
        });
        rule.addTarget(new events_targets.LambdaFunction(func));

        cdk.Tags.of(this).add('component', usage);
        
        // TODO: workaround the 'Tags' prop of LogGroup is not supported in zhy yet
        (logGroup.node.defaultChild as logs.CfnLogGroup).addPropertyDeletionOverride('Tags');
    }
}
