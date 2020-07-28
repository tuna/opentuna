import * as cdk from '@aws-cdk/core';
import acm = require('@aws-cdk/aws-certificatemanager');
import alias = require('@aws-cdk/aws-route53-targets');
import ec2 = require('@aws-cdk/aws-ec2');
import sns = require('@aws-cdk/aws-sns');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import ecs = require('@aws-cdk/aws-ecs');
import s3 = require('@aws-cdk/aws-s3');
import r53 = require('@aws-cdk/aws-route53');
import { TunaManagerStack } from './tuna-manager';
import { TunaWorkerStack } from './tuna-worker';
import { ContentServerStack } from './content-server';
import { WebPortalStack } from './web-portal';

export interface OpenTunaStackProps extends cdk.StackProps {
  readonly vpcId: string;
  readonly fileSystemId: string;
  readonly notifyTopic: sns.ITopic;
}
export class OpentunaStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: OpenTunaStackProps) {
    super(scope, id, props);

    const stack = cdk.Stack.of(this);

    const domainName = this.node.tryGetContext('domainName');
    let domainZone: r53.IHostedZone;
    let cert: acm.Certificate | undefined;
    if (domainName) {
      const domainZoneName = this.node.tryGetContext('domainZone');
      if (domainZoneName) {
        domainZone = r53.HostedZone.fromLookup(this, 'HostedZone', {
          domainName: domainZoneName,
        });
        cert = new acm.Certificate(this, 'Certificate', {
          domainName: domainName,
          subjectAlternativeNames: [`${stack.region}.${domainName}`],
          validation: acm.CertificateValidation.fromDns(domainZone),
        });
      }
    }

    const vpc = ec2.Vpc.fromLookup(this, `VPC-${props.vpcId}`, {
      vpcId: props.vpcId,
    });

    const assetBucket = new s3.Bucket(this, `OpenTunaAssets`, {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const tunaManagerSG = new ec2.SecurityGroup(this, "TunaManagerSG", {
      vpc,
      description: "SG of Tuna Manager",
      allowAllOutbound: true,
    });
    const tunaManagerALBSG = new ec2.SecurityGroup(this, "TunaManagerALBSG", {
      vpc,
      description: "SG of ALB of Tuna Manager",
      allowAllOutbound: false,
    });
    const tunaWorkerSG = new ec2.SecurityGroup(this, "TunaWorkerSG", {
      vpc,
      description: "SG of Tuna Worker",
      allowAllOutbound: true,
    });
    const externalALBSG = new ec2.SecurityGroup(this, "ExternalALBSG", {
      vpc,
      description: "SG of External ALB",
      allowAllOutbound: false,
    });
    const externalALB = new elbv2.ApplicationLoadBalancer(this, "ExternalALB", {
      vpc,
      securityGroup: externalALBSG,
      internetFacing: true,
      http2Enabled: cert ? true : false,
    });
    const defaultALBPort: number = cert ? 443 : 80;
    const defaultALBListener = externalALB.addListener(`DefaultPort-${defaultALBPort}`, {
      protocol: defaultALBPort === 443 ? elbv2.ApplicationProtocol.HTTPS : elbv2.ApplicationProtocol.HTTP,
      port: defaultALBPort,
      open: true,
      certificates: cert ? [cert] : undefined,
      sslPolicy: cert ? elbv2.SslPolicy.RECOMMENDED : undefined,
    });
    if (cert) {
      externalALB.addListener(`DefaultPort-80`, {
        protocol: elbv2.ApplicationProtocol.HTTP,
        port: 80,
        open: true,
        defaultAction: elbv2.ListenerAction.redirect({
          port: '443',
          protocol: elbv2.ApplicationProtocol.HTTPS,
          permanent: true,
        }),
      });
      new r53.ARecord(this, 'ALBCustomDomain', {
        zone: domainZone!,
        recordName: `${stack.region}.${domainName}`,
        ttl: cdk.Duration.minutes(5),
        target: r53.RecordTarget.fromAlias(new alias.LoadBalancerTarget(externalALB)),
      });
    }

    // Tunasync Manager stack
    const tunaManagerStack = new TunaManagerStack(this, 'TunaManagerStack', {
      vpc,
      fileSystemId: props.fileSystemId,
      notifyTopic: props.notifyTopic,
      tunaManagerSG,
      tunaManagerALBSG,
      timeout: cdk.Duration.minutes(10),
    });

    // Tunasync Worker stack
    const tunaWorkerStack = new TunaWorkerStack(this, 'TunaWorkerStack', {
      vpc,
      fileSystemId: props.fileSystemId,
      notifyTopic: props.notifyTopic,
      managerUrl: `http://${tunaManagerStack.managerALB.loadBalancerDnsName}:${tunaManagerStack.managerPort}`,
      timeout: cdk.Duration.minutes(10),
      tunaWorkerSG,
      assetBucket,
    });

    tunaManagerALBSG.connections.allowFrom(tunaWorkerSG, ec2.Port.tcp(tunaManagerStack.managerPort), 'Access from tuna worker');
    tunaWorkerSG.connections.allowFrom(tunaManagerSG, ec2.Port.tcp(tunaWorkerStack.workerPort), 'Access from tuna manager');

    const ecsCluster = new ecs.Cluster(this, `ECSCluster`, {
      vpc,
    });

    // Content Server stack
    const contentServerStack = new ContentServerStack(this, 'ContentServerStack', {
      vpc,
      fileSystemId: props.fileSystemId,
      notifyTopic: props.notifyTopic,
      ecsCluster,
      listener: defaultALBListener,
    });

    // Web Portal stack
    const webPortalStack = new WebPortalStack(this, 'WebPortalStack', {
      vpc,
      externalALBListener: defaultALBListener,
      ecsCluster,
      tunaManagerASG: tunaManagerStack.managerASG,
      tunaManagerALBTargetGroup: tunaManagerStack.managerALBTargetGroup,
    });
    tunaManagerSG.connections.allowFrom(externalALBSG, ec2.Port.tcp(80), 'Allow external ALB to access tuna manager');
  }
}
