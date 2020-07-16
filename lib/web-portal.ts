import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import logs = require('@aws-cdk/aws-logs');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import ecr_assets = require('@aws-cdk/aws-ecr-assets');
import path = require('path');
import { ITopic } from '@aws-cdk/aws-sns';

export interface WebPortalProps extends cdk.NestedStackProps {
    readonly vpc: ec2.IVpc;
    readonly fileSystemId: string;
    readonly notifyTopic: ITopic;
    readonly externalALBListener: elbv2.ApplicationListener;
    readonly ecsCluster: ecs.Cluster;
}

export class WebPortalStack extends cdk.NestedStack {
    constructor(scope: cdk.Construct, id: string, props: WebPortalProps) {
        super(scope, id, props);

        const stack = cdk.Stack.of(this);
        const usage = 'WebPortal';

        const imageAsset = new ecr_assets.DockerImageAsset(this, `${usage}DockerImage`, {
            directory: path.join(__dirname, '../web-portal'),
            repositoryName: "opentuna/web-portal"
        });

        const httpPort = 80;
        const taskDefinition = new ecs.FargateTaskDefinition(this, `${usage}TaskDefiniton`, {});
        const logGroup = new logs.LogGroup(this, `${usage}LogGroup`, {
            logGroupName: `/opentuna/webportal`
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
        });

        props.externalALBListener.addTargets(`${usage}TargetGroup`, {
            port: httpPort,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [service],
            healthCheck: {
                path: '/',
            },
            priority: 10,
            conditions: [elbv2.ListenerCondition.pathPatterns(["/index.html"])],
            slowStart: cdk.Duration.seconds(60),
            deregistrationDelay: cdk.Duration.seconds(10),
        })

        cdk.Tag.add(this, 'component', usage);
    }
}
