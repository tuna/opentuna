import * as cdk from '@aws-cdk/core';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as route53 from '@aws-cdk/aws-route53';
import * as route53targets from '@aws-cdk/aws-route53-targets';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import * as alias from '@aws-cdk/aws-route53-targets';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as sns from '@aws-cdk/aws-sns';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as s3 from '@aws-cdk/aws-s3';
import * as r53 from '@aws-cdk/aws-route53';
import { TunaManagerStack } from './tuna-manager';
import { TunaWorkerStack } from './tuna-worker';
import { ContentServerStack } from './content-server';
import { WebPortalStack } from './web-portal';
import { CloudFrontInvalidate } from './cloudfront-invalidate';
import { AnalyticsStack } from './analytics-stack';
import { MonitorStack } from './monitor-stack';
import { assert } from 'console';

export interface OpenTunaStackProps extends cdk.StackProps {
  readonly vpcId: string;
  readonly fileSystemId: string;
  readonly fileSystemSGId: string;
  readonly notifyTopic: sns.ITopic;
}
export class OpentunaStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: OpenTunaStackProps) {
    super(scope, id, props);

    const stack = cdk.Stack.of(this);

    const domainName = this.node.tryGetContext('domainName');
    const domainZoneName = this.node.tryGetContext('domainZone');
    const iamCertId = this.node.tryGetContext('iamCertId');
    let useHTTPS = false;
    let domainZone: r53.IHostedZone | undefined;
    // ACM or IAM certificate
    let cloudfrontCert: acm.Certificate | string | null = null;
    if (domainName && domainZoneName) {
      domainZone = r53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: domainZoneName,
      });
      useHTTPS = true;
      if (iamCertId !== undefined) {
        // Use IAM first when specified
        cloudfrontCert = iamCertId;
      } else if (!stack.region.startsWith('cn-')) {
        // Try to use ACM certificate in us-east-1 for CloudFront
        cloudfrontCert = new acm.DnsValidatedCertificate(this, 'CloudFrontCertificate', {
          domainName: domainName,
          hostedZone: domainZone,
          validation: acm.CertificateValidation.fromDns(domainZone),
          region: 'us-east-1',
        });
      } else {
        throw new Error('You must specify iamCertId context for cn regions');
      }
    }

    const vpc = ec2.Vpc.fromLookup(this, `VPC-${props.vpcId}`, {
      vpcId: props.vpcId,
    });

    const assetBucket = new s3.Bucket(this, `OpenTunaAssets`, {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    // setup bucket for rubygems
    const tunaRepoBucket = new s3.Bucket(this, 'TunaRepoBucket');

    // CloudWatch dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'OpenTUNA-Dashboard',
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
      http2Enabled: useHTTPS,
    });
    dashboard.addWidgets(new cloudwatch.GraphWidget({
      title: 'ALB Processed Data',
      left: [externalALB.metricProcessedBytes({
        label: 'Bytes per minute',
        period: cdk.Duration.minutes(1),
      })]
    }), new cloudwatch.GraphWidget({
      title: 'ALB Connections',
      left: [externalALB.metricNewConnectionCount({
        label: 'New',
        period: cdk.Duration.minutes(1),
      }), externalALB.metricActiveConnectionCount({
        label: 'Active',
        period: cdk.Duration.minutes(1),
      }), externalALB.metricRejectedConnectionCount({
        label: 'Rejected',
        period: cdk.Duration.minutes(1),
      })]
    }), new cloudwatch.GraphWidget({
      title: 'ALB HTTP Code from Target',
      left: [externalALB.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_2XX_COUNT, {
        label: '2XX',
        period: cdk.Duration.minutes(1),
      }), externalALB.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_3XX_COUNT, {
        label: '3XX',
        period: cdk.Duration.minutes(1),
      }), externalALB.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_4XX_COUNT, {
        label: '4XX',
        period: cdk.Duration.minutes(1),
      }), externalALB.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
        label: '5XX',
        period: cdk.Duration.minutes(1),
      })]
    }));

    let cert: acm.Certificate | undefined;
    if (useHTTPS) {
      cert = new acm.Certificate(this, 'Certificate', {
        domainName: domainName,
        subjectAlternativeNames: [`${stack.region}.${domainName}`],
        validation: acm.CertificateValidation.fromDns(domainZone),
      });
    }
    const defaultALBPort: number = useHTTPS ? 443 : 80;
    const defaultALBListener = externalALB.addListener(`DefaultPort-${defaultALBPort}`, {
      protocol: useHTTPS ? elbv2.ApplicationProtocol.HTTPS : elbv2.ApplicationProtocol.HTTP,
      port: defaultALBPort,
      open: true,
      certificates: cert ? [cert] : undefined,
      sslPolicy: useHTTPS ? elbv2.SslPolicy.RECOMMENDED : undefined,
    });
    let httpOnlyALBListener: elbv2.ApplicationListener | undefined;
    if (useHTTPS) {
      // redirect HTTP to HTTPS
      httpOnlyALBListener = externalALB.addListener(`DefaultPort-80`, {
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
      assetBucket,
    });
    const managerUrl = `http://${tunaManagerStack.managerALB.loadBalancerDnsName}:${tunaManagerStack.managerPort}`;

    // Tunasync Worker stack
    const tunaWorkerStack = new TunaWorkerStack(this, 'TunaWorkerStack', {
      vpc,
      fileSystemId: props.fileSystemId,
      notifyTopic: props.notifyTopic,
      managerUrl,
      timeout: cdk.Duration.minutes(10),
      tunaWorkerSG,
      assetBucket,
      tunaRepoBucket,
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
      httpOnlyListener: httpOnlyALBListener,
      dashboard,
    });

    // Web Portal stack
    const webPortalStack = new WebPortalStack(this, 'WebPortalStack', {
      vpc,
      externalALBListener: defaultALBListener,
      ecsCluster,
      tunaManagerASG: tunaManagerStack.managerASG,
      tunaManagerALBTargetGroup: tunaManagerStack.managerALBTargetGroup,
      fileSystemId: props.fileSystemId,
      fileSystemSGId: props.fileSystemSGId,
    });
    tunaManagerSG.connections.allowFrom(externalALBSG, ec2.Port.tcp(80), 'Allow external ALB to access tuna manager');

    // Monitor stack
    const monitorStack = new MonitorStack(this, 'MonitorStack', {
      vpc,
      domainName,
      notifyTopic: props.notifyTopic,
      tunaManagerUrl: managerUrl,
      tunaManagerALBSG,
    });

    let commonBehaviorConfig = {
      // special handling for redirections
      forwardedValues: {
        headers: ['Host'],
        queryString: true,
      },
      // default 1 day cache
      defaultTtl: cdk.Duration.days(1),
    };

    // origin access identity for s3 bucket
    const oai = new cloudfront.OriginAccessIdentity(this, 'TunaRepoOAI');
    tunaRepoBucket.grantRead(oai);

    // CloudFront as cdn
    let cloudfrontProps = {
      originConfigs: [{
        customOriginSource: {
          domainName: useHTTPS ? `${stack.region}.${domainName}` : externalALB.loadBalancerDnsName,
          originProtocolPolicy: cloudfront.OriginProtocolPolicy.MATCH_VIEWER
        },
        behaviors: [{
          ...commonBehaviorConfig,
          isDefaultBehavior: true,
        }, {
          ...commonBehaviorConfig,
          pathPattern: '/debian/*',
        }, {
          ...commonBehaviorConfig,
          pathPattern: '/debian-security/*',
        }, {
          ...commonBehaviorConfig,
          pathPattern: '/ubuntu/*',
        }, {
          ...commonBehaviorConfig,
          // 5min cache for tunasync status
          pathPattern: '/jobs',
          defaultTtl: cdk.Duration.minutes(5),
        }],
      }, {
        s3OriginSource: {
          s3BucketSource: tunaRepoBucket,
          originAccessIdentity: oai,
        },
        behaviors: [{
          pathPattern: '/rubygems/gems/*',
          // 1w cache for gem specs
          defaultTtl: cdk.Duration.days(7),
        }, {
          pathPattern: '/rubygems/*',
          // 1h cache for index files
          defaultTtl: cdk.Duration.minutes(60),
        }]
      }],
      defaultRootObject: '',
      errorConfigurations: [
        {
          errorCode: 500,
          errorCachingMinTtl: 30,
        },
        {
          errorCode: 502,
          errorCachingMinTtl: 0,
        },
        {
          errorCode: 503,
          errorCachingMinTtl: 0,
        },
        {
          errorCode: 404,
          errorCachingMinTtl: 3600,
          responseCode: 404,
          responsePagePath: '/404.html',
        }
      ],
    } as cloudfront.CloudFrontWebDistributionProps;
    if (useHTTPS) {
      // when https is enabled
      cloudfrontProps = {
        httpVersion: cloudfront.HttpVersion.HTTP2,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        ...cloudfrontProps
      };

      if (cloudfrontCert instanceof acm.DnsValidatedCertificate) {
        // ACM cert
        cloudfrontProps = {
          aliasConfiguration: {
            acmCertRef: cloudfrontCert.certificateArn,
            names: [domainName],
          },
          ...cloudfrontProps
        }
      } else if (typeof cloudfrontCert === "string") {
        // IAM cert
        cloudfrontProps = {
          viewerCertificate: cloudfront.ViewerCertificate.fromIamCertificate(
            cloudfrontCert,
            {
              aliases: [domainName],
              securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2018,
              sslMethod: cloudfront.SSLMethod.SNI, // default
            }
          ),
          ...cloudfrontProps
        };
      }
    }
    // some particular options for China regions
    if (stack.region.startsWith('cn-')) {
      cloudfrontProps = Object.assign(cloudfrontProps, {
        enableIpV6: false,
        priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      });
    }
    const logsBucket = new s3.Bucket(this, "OpentunaLogs");

    // ALB logs
    externalALB.logAccessLogs(logsBucket, 'alb-logs');

    const cloudfrontLogPrefix = "new/";
    // nested stack for log analysis
    const OpentunaAnalyticsStack = new AnalyticsStack(this, 'OpentunaAnalyticsStack', {
      resourcePrefix: "opentuna",
      newKeyPrefix: cloudfrontLogPrefix,
      gzKeyPrefix: "partitioned-gz/",
      parquetKeyPrefix: "partitioned-parquet/",
      logBucket: logsBucket,
      notifyTopic: props.notifyTopic
    });
    cloudfrontProps = Object.assign(cloudfrontProps, {
      loggingConfig: {
        bucket: logsBucket,
        includeCookies: true,
        prefix: cloudfrontLogPrefix
      }
    });
    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'CloudFrontDist', cloudfrontProps);

    // HACK: override /debian/* viewer protocol policy to allow-all
    // see https://github.com/aws/aws-cdk/issues/7086
    let dist = distribution.node.defaultChild as cloudfront.CfnDistribution;
    let conf = dist.distributionConfig as cloudfront.CfnDistribution.DistributionConfigProperty;
    let cacheBehaviors = conf.cacheBehaviors as cloudfront.CfnDistribution.CacheBehaviorProperty[];
    let behavior = cacheBehaviors[0];
    assert(behavior.pathPattern == '/debian/*');
    for (let i = 0; i < cacheBehaviors.length; i++) {
      if (['/debian/*', '/debian-security/*', '/ubuntu/*'].indexOf(cacheBehaviors[i].pathPattern) != -1) {
        cacheBehaviors[i] = {
          ...cacheBehaviors[i],
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
        } as cloudfront.CfnDistribution.CacheBehaviorProperty;
      }
    }

    if (domainZone) {
      new route53.ARecord(this, 'ARecord', {
        zone: domainZone!,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(distribution)),
        ttl: cdk.Duration.minutes(5),
      });
    }

    // invalidate cloudfront when web-portal changes
    new CloudFrontInvalidate(this, 'CloudFrontInvalidate', {
      distribution: distribution,
      distributionPaths: ['/help*', '/news*', '/status*', '/static*', '/*.html', '/'],
      updateKey: webPortalStack.dockerImageHash,
    });
  }
}
