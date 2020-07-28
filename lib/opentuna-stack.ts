import * as cdk from '@aws-cdk/core';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as route53 from '@aws-cdk/aws-route53';
import * as route53targets from '@aws-cdk/aws-route53-targets';
import * as acm from '@aws-cdk/aws-certificatemanager';
import ec2 = require('@aws-cdk/aws-ec2');
import sns = require('@aws-cdk/aws-sns');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import ecs = require('@aws-cdk/aws-ecs');
import s3 = require('@aws-cdk/aws-s3');
import { TunaManagerStack } from './tuna-manager';
import { TunaWorkerStack } from './tuna-worker';
import { ContentServerStack } from './content-server';
import { WebPortalStack } from './web-portal';

export interface OpenTunaStackProps extends cdk.StackProps {
  readonly vpcId: string;
  readonly fileSystemId: string;
  readonly domainName: string;
  readonly notifyTopic: sns.ITopic;
}
export class OpentunaStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: OpenTunaStackProps) {
    super(scope, id, props);

    const stack = cdk.Stack.of(this);

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
    });

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
      externalALB,
      ecsCluster
    });

    // Web Portal stack
    const webPortalStack = new WebPortalStack(this, 'WebPortalStack', {
      vpc,
      externalALBListener: contentServerStack.externalALBListener,
      ecsCluster,
      tunaManagerASG: tunaManagerStack.managerASG,
      tunaManagerALBTargetGroup: tunaManagerStack.managerALBTargetGroup,
    });
    tunaManagerSG.connections.allowFrom(externalALBSG, ec2.Port.tcp(80), 'Allow external ALB to access tuna manager');

    // dns zone
    const zone = route53.PublicHostedZone.fromLookup(this, 'PublicHostedZone', {
      domainName: props.domainName,
    });

    // https certificate
    const certificate = new acm.DnsValidatedCertificate(this, 'Cert', {
      domainName: props.domainName,
      hostedZone: zone,
      // cloudfront requirement
      region: 'us-east-1',
    });

    // CloudFront as cdn
    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'CloudFrontDist', {
      aliasConfiguration: {
        acmCertRef: certificate.certificateArn,
        names: [props.domainName],
      },
      originConfigs: [{
        customOriginSource: {
          domainName: externalALB.loadBalancerDnsName,
          originProtocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        },
        behaviors: [{
          isDefaultBehavior: true,
        }, {
          // special handling for /static/tunasync.json
          // because of redirection
          pathPattern: '/static/tunasync.json',
          forwardedValues: {
            headers: ['Host', 'CloudFront-Forwarded-Proto'],
            queryString: true,
          },
        }],
      }],
    });

    const dnsRecord = new route53.ARecord(this, 'ARecord', {
      target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(distribution)),
      zone,
    });
  }
}
