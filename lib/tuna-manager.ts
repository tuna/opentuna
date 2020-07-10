import autoscaling = require('@aws-cdk/aws-autoscaling');
import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import fs = require('fs');
import iam = require('@aws-cdk/aws-iam');
import path = require('path');
import region_info = require('@aws-cdk/region-info');
import { ITopic } from '@aws-cdk/aws-sns';
import Mustache = require('mustache');

export interface TunaManagerProps extends cdk.NestedStackProps {
    readonly vpc: ec2.IVpc;
    readonly fileSystemId: string;
    readonly notifyTopic: ITopic;
    readonly tunaManagerSG: ec2.ISecurityGroup;
    readonly tunaManagerALBSG: ec2.ISecurityGroup;
}
export class TunaManagerStack extends cdk.NestedStack {

    readonly managerPort = 80;
    readonly managerALB: elbv2.IApplicationLoadBalancer;

    constructor(scope: cdk.Construct, id: string, props: TunaManagerProps) {
        super(scope, id, props);

        const stack = cdk.Stack.of(this);
        const regionInfo = region_info.RegionInfo.get(stack.region);
        const usage = 'TunaManager';

        const ec2Role = new iam.Role(this, `${usage}EC2Role`, {
            assumedBy: new iam.CompositePrincipal(
                new iam.ServicePrincipal('ec2.amazonaws.com')),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
            ]
        });

        const userdata = fs.readFileSync(path.join(__dirname, './tuna-manager-user-data.txt'), 'utf-8');
        const newProps = {
            fileSystemId: props.fileSystemId,
            regionEndpoint: `efs.${stack.region}.${regionInfo.domainSuffix}`,
            port: this.managerPort,
        }

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
        listener.addTargets(`${usage}TargetGroup`, {
            port: this.managerPort,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [tunaManagerASG],
            healthCheck: {
                path: '/ping',
            },
            slowStart: cdk.Duration.seconds(60),
            deregistrationDelay: cdk.Duration.seconds(10),
        });

        cdk.Tag.add(this, 'component', usage);
    }
}