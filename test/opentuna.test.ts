import * as cdk from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import * as Tuna from '../lib/opentuna-stack';
import * as mock from './context-provider-mock';
import ec2 = require('@aws-cdk/aws-ec2');
import sns = require('@aws-cdk/aws-sns');
import '@aws-cdk/assert/jest';
import { ResourcePart } from '@aws-cdk/assert/lib/assertions/have-resource';

describe('Tuna Manager stack', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  const vpcId = 'vpc-123456';
  let previous: (scope: cdk.Construct, options: cdk.GetContextValueOptions) => cdk.GetContextValueResult;

  beforeAll(() => {
    previous = mock.mockContextProviderWith({
      vpcId,
      vpcCidrBlock: "10.58.0.0/16",
      "subnetGroups": [
        {
          "name": "ingress",
          "type": cxapi.VpcSubnetGroupType.PUBLIC,
          "subnets": [
            {
              "subnetId": "subnet-000f2b20b0ebaef37",
              "cidr": "10.58.0.0/22",
              "availabilityZone": "cn-northwest-1a",
              "routeTableId": "rtb-0f5312df5fe3ae508"
            },
            {
              "subnetId": "subnet-0b2cce92f08506a9a",
              "cidr": "10.58.4.0/22",
              "availabilityZone": "cn-northwest-1b",
              "routeTableId": "rtb-07e969fe93b6edd9a"
            },
            {
              "subnetId": "subnet-0571b340c9f28375c",
              "cidr": "10.58.8.0/22",
              "availabilityZone": "cn-northwest-1c",
              "routeTableId": "rtb-02ae139a60f628b5c"
            }
          ]
        },
        {
          "name": "private",
          "type": cxapi.VpcSubnetGroupType.PRIVATE,
          "subnets": [
            {
              "subnetId": "subnet-0a6dab6bc063ea432",
              "cidr": "10.58.32.0/19",
              "availabilityZone": "cn-northwest-1a",
              "routeTableId": "rtb-0be722c725fd0d29f"
            },
            {
              "subnetId": "subnet-08dd359da55a6160b",
              "cidr": "10.58.64.0/19",
              "availabilityZone": "cn-northwest-1b",
              "routeTableId": "rtb-0b13567ae92b08708"
            },
            {
              "subnetId": "subnet-0d300d086b989eefc",
              "cidr": "10.58.96.0/19",
              "availabilityZone": "cn-northwest-1c",
              "routeTableId": "rtb-08fe9e7932d86517e"
            }
          ]
        }
      ]
    }, options => {
      expect(options.filter).toEqual({
        'vpc-id': vpcId,
      });
    });
  });

  afterAll(() => {
    mock.restoreContextProvider(previous);
  });

  beforeEach(() => {
    app = new cdk.App();

    const env = {
      region: 'cn-northwest-1',
      account: '1234567890xx',
    }

    const commonStack = new cdk.Stack(app, 'CommonStack', {
      env,
    });
    const topic = new sns.Topic(commonStack, 'Test Topic');

    stack = new Tuna.OpentunaStack(app, 'OpenTunaStack', {
      vpcId,
      fileSystemId: 'fs-012345',
      fileSystemSGId: 'sg-012345',
      notifyTopic: topic,
      env,
    });
  });

  test('Nested Tunasync Manager stack created', () => {
    expect(stack).toHaveResourceLike('AWS::CloudFormation::Stack', {
      "Parameters": {
        "referencetoOpenTunaStackTunaManagerALBSG3A9F434BGroupId": {
          "Fn::GetAtt": [
            "TunaManagerALBSGD1FA31EB",
            "GroupId"
          ]
        },
        "referencetoOpenTunaStackTunaManagerSG9C92138FGroupId": {
          "Fn::GetAtt": [
            "TunaManagerSGEC810641",
            "GroupId"
          ]
        }
      },
      "TimeoutInMinutes": 10,
    });
  });

  test('Nested Tunasync Worker stack created', () => {
    expect(stack).toHaveResourceLike('AWS::CloudFormation::Stack', {
      "Parameters": {
        "referencetoOpenTunaStackTunaWorkerSGDC640D13GroupId": {
          "Fn::GetAtt": [
            "TunaWorkerSG1B6F268B",
            "GroupId"
          ]
        },
        "referencetoOpenTunaStackTunaManagerStackNestedStackTunaManagerStackNestedStackResource1B954434OutputsOpenTunaStackTunaManagerStackTunaManagerALB7C30A3CCDNSName": {
          "Fn::GetAtt": [
            "TunaManagerStackNestedStackTunaManagerStackNestedStackResourceA0EA7C16",
            "Outputs.OpenTunaStackTunaManagerStackTunaManagerALB7C30A3CCDNSName"
          ]
        }
      },
      "TimeoutInMinutes": 10,
    });
  });

  test('Nested Analytics stack created', () => {
    expect(stack).toHaveResourceLike('AWS::CloudFormation::Stack', {
      "Parameters": {
        "referencetoOpenTunaStackOpentunaLogs65B95EA3Ref": {
          "Ref": "OpentunaLogsA361D92E"
        },
        "referencetoOpenTunaStackOpentunaLogs65B95EA3Arn": {
          "Fn::GetAtt": [
            "OpentunaLogsA361D92E",
            "Arn"
          ]
        },
        "referencetoOpenTunaStackAssetParameters2701798aa8ab89b534cb48e7dba835aaaf846305bfc31d56e470d21afb52cfbdS3Bucket5CE45487Ref": {
          "Ref": "AssetParameters2701798aa8ab89b534cb48e7dba835aaaf846305bfc31d56e470d21afb52cfbdS3BucketE1D9B02B"
        },
        "referencetoOpenTunaStackAssetParameters2701798aa8ab89b534cb48e7dba835aaaf846305bfc31d56e470d21afb52cfbdS3VersionKey8BCE27ADRef": {
          "Ref": "AssetParameters2701798aa8ab89b534cb48e7dba835aaaf846305bfc31d56e470d21afb52cfbdS3VersionKey0DC029EB"
        }
      }
    });
    expect(stack).toHaveResourceLike('AWS::CloudFront::Distribution', {
      "DistributionConfig": {
        "Logging": {
          "Bucket": {
            "Fn::GetAtt": [
              "OpentunaLogsA361D92E",
              "RegionalDomainName"
            ]
          },
          "IncludeCookies": true,
          "Prefix": "new/"
        }
      }
    });
  });

  test('Security groups between worker and manager with least privillege', () => {
    expect(stack).toHaveResourceLike('AWS::EC2::SecurityGroupIngress', {
      "IpProtocol": "tcp",
      "FromPort": 80,
      "GroupId": {
        "Fn::GetAtt": [
          "TunaManagerALBSGD1FA31EB",
          "GroupId"
        ]
      },
      "SourceSecurityGroupId": {
        "Fn::GetAtt": [
          "TunaWorkerSG1B6F268B",
          "GroupId"
        ]
      },
      "ToPort": 80
    });
    expect(stack).toHaveResourceLike('AWS::EC2::SecurityGroupIngress', {
      "IpProtocol": "tcp",
      "FromPort": 80,
      "GroupId": {
        "Fn::GetAtt": [
          "TunaWorkerSG1B6F268B",
          "GroupId"
        ]
      },
      "SourceSecurityGroupId": {
        "Fn::GetAtt": [
          "TunaManagerSGEC810641",
          "GroupId"
        ]
      },
      "ToPort": 80
    });
  });

  test('Asset bucket created', () => {
    cdk.Tag.add(app, 'app', `OpenTuna`);
    expect(stack).toHaveResourceLike('AWS::S3::Bucket', {
      "Properties": {
        "Tags": [
          {
            "Key": "app",
            "Value": "OpenTuna"
          }
        ]
      },
      "UpdateReplacePolicy": "Delete",
      "DeletionPolicy": "Delete",
    }, ResourcePart.CompleteDefinition);
  });

  test('default listener 80 created without custom domain', () => {
    expect(stack).toHaveResourceLike('AWS::ElasticLoadBalancingV2::Listener', {
      "DefaultActions": [
        {
          "TargetGroupArn": {
            "Ref": "ExternalALBDefaultPort80ContentServerGroup4C4C350F"
          },
          "Type": "forward"
        }
      ],
      "LoadBalancerArn": {
        "Ref": "ExternalALB7DC65DEC"
      },
      "Port": 80,
      "Protocol": "HTTP"
    });

    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::TargetGroup', {
      "HealthCheckEnabled": true,
      "HealthCheckTimeoutSeconds": 15,
      "Port": 80,
      "Protocol": "HTTP",
      "TargetType": "ip",
      "VpcId": vpcId,
    });

    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::TargetGroup', {
      "Port": 80,
      "Protocol": "HTTP",
      "TargetGroupAttributes": [
        {
          "Key": "deregistration_delay.timeout_seconds",
          "Value": "10"
        },
        {
          "Key": "slow_start.duration_seconds",
          "Value": "60"
        }
      ],
      "TargetType": "ip",
      "VpcId": vpcId,
    });

    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::ListenerRule', {
      "Actions": [
        {
          "TargetGroupArn": {
            "Ref": "WebPortalWebTargetGroupB563B993"
          },
          "Type": "forward"
        }
      ],
      "Conditions": [
        {
          "Field": "path-pattern",
          "PathPatternConfig": {
            "Values": [
              "/",
              "/404.html",
              "/index.html",
              "/robots.txt",
              "/sitemap.xml"
            ]
          }
        }
      ],
      "ListenerArn": {
        "Ref": "ExternalALBDefaultPort806952D605"
      },
      "Priority": 10
    });

    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::ListenerRule', {
      "Actions": [
        {
          "TargetGroupArn": {
            "Ref": "WebPortalWebTargetGroupB563B993"
          },
          "Type": "forward"
        }
      ],
      "Conditions": [
        {
          "Field": "path-pattern",
          "PathPatternConfig": {
            "Values": [
              "/help/*",
              "/news/*",
              "/static/*",
              "/status/*"
            ]
          }
        }
      ],
      "ListenerArn": {
        "Ref": "ExternalALBDefaultPort806952D605"
      },
      "Priority": 15
    });

    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::ListenerRule', {
      "Actions": [
        {
          "RedirectConfig": {
            "Path": "/jobs",
            "StatusCode": "HTTP_302"
          },
          "Type": "redirect"
        }
      ],
      "Conditions": [
        {
          "Field": "path-pattern",
          "PathPatternConfig": {
            "Values": [
              "/static/tunasync.json"
            ]
          }
        }
      ],
      "ListenerArn": {
        "Ref": "ExternalALBDefaultPort806952D605"
      },
      "Priority": 6
    });

    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::ListenerRule', {
      "Actions": [
        {
          "TargetGroupArn": {
            "Fn::GetAtt": [
              "WebPortalStackNestedStackWebPortalStackNestedStackResourceFBF35EF3",
              "Outputs.OpenTunaStackWebPortalStackWebPortalManagerTargetGroup51E2D9E3Ref"
            ]
          },
          "Type": "forward"
        }
      ],
      "Conditions": [
        {
          "Field": "path-pattern",
          "PathPatternConfig": {
            "Values": [
              "/jobs"
            ]
          }
        }
      ],
      "ListenerArn": {
        "Ref": "ExternalALBDefaultPort806952D605"
      },
      "Priority": 20
    });
  });

  test('alb listeners created with custom domain and domain zone', () => {
    ({ app, stack } = overrideTunaStackWithContextDomainName(app, stack, vpcId, undefined, 'ap-northeast-1'));

    expect(stack).toHaveResourceLike('AWS::ElasticLoadBalancingV2::Listener', {
      "DefaultActions": [
        {
          "RedirectConfig": {
            "Port": "443",
            "Protocol": "HTTPS",
            "StatusCode": "HTTP_301"
          },
          "Type": "redirect"
        }
      ],
      "LoadBalancerArn": {
        "Ref": "ExternalALB7DC65DEC"
      },
      "Port": 80,
      "Protocol": "HTTP"
    });

    expect(stack).toHaveResourceLike('AWS::ElasticLoadBalancingV2::Listener', {
      "DefaultActions": [
        {
          "TargetGroupArn": {
            "Ref": "ExternalALBDefaultPort443ContentServerGroup775F404E"
          },
          "Type": "forward"
        }
      ],
      "LoadBalancerArn": {
        "Ref": "ExternalALB7DC65DEC"
      },
      "Port": 443,
      "Protocol": "HTTPS",
      "Certificates": [
        {
          "CertificateArn": {
            "Ref": "Certificate4E7ABB08"
          }
        }
      ],
      "SslPolicy": "ELBSecurityPolicy-2016-08"
    });
  });

  test('public access alb is expected', () => {
    const iamCertId = 'iam-cert-id';
    ({ app, stack } = overrideTunaStackWithContextDomainName(app, stack, vpcId, iamCertId));

    expect(stack).toHaveResourceLike('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      "LoadBalancerAttributes": [
        {
          "Key": "access_logs.s3.enabled",
          "Value": "true"
        },
        {
          "Key": "access_logs.s3.bucket",
          "Value": {
            "Ref": "OpentunaLogsA361D92E"
          }
        },
        {
          "Key": "access_logs.s3.prefix",
          "Value": "alb-logs"
        }
      ],
      "Scheme": "internet-facing",
      "Type": "application",
    });
  });

  test('certificate and r53 record of alb', () => {
    const iamCertId = 'iam-cert-id';
    ({ app, stack } = overrideTunaStackWithContextDomainName(app, stack, vpcId, iamCertId));

    expect(stack).toHaveResourceLike('AWS::CertificateManager::Certificate', {
      "DomainName": "tuna.example.com",
      "DomainValidationOptions": [
        {
          "DomainName": "tuna.example.com",
          "HostedZoneId": "12345678"
        },
        {
          "DomainName": "cn-north-1.tuna.example.com",
          "HostedZoneId": "12345678"
        }
      ],
      "SubjectAlternativeNames": [
        "cn-north-1.tuna.example.com"
      ],
      "ValidationMethod": "DNS"
    });

    expect(stack).toHaveResourceLike('AWS::Route53::RecordSet', {
      "Name": "cn-north-1.tuna.example.com.",
      "Type": "A",
      "AliasTarget": {
        "DNSName": {
          "Fn::Join": [
            "",
            [
              "dualstack.",
              {
                "Fn::GetAtt": [
                  "ExternalALB7DC65DEC",
                  "DNSName"
                ]
              }
            ]
          ]
        },
        "HostedZoneId": {
          "Fn::GetAtt": [
            "ExternalALB7DC65DEC",
            "CanonicalHostedZoneID"
          ]
        }
      },
      "HostedZoneId": "12345678"
    });
  });

  test('cloudfront distribution with iam cert in China', () => {
    const iamCertId = 'iam-cert-id';
    ({ app, stack } = overrideTunaStackWithContextDomainName(app, stack, vpcId, iamCertId));

    expect(stack).toHaveResourceLike('AWS::CloudFront::Distribution', {
      "DistributionConfig": {
        "Aliases": [
          "tuna.example.com"
        ],
        "ViewerCertificate": {
          "IamCertificateId": iamCertId,
          "MinimumProtocolVersion": "TLSv1.2_2018",
          "SslSupportMethod": "sni-only"
        },
        "Enabled": true,
        "HttpVersion": "http2",
        "IPV6Enabled": false,
        "PriceClass": "PriceClass_All",
      },
    });
  });

  test('cloudfront distribution without iam cert in China should fail', () => {
    expect(() => overrideTunaStackWithContextDomainName(app, stack, vpcId)).toThrow('You must specify iamCertId context for cn regions');
  });

  test('cloudfront distribution in global', () => {
    ({ app, stack } = overrideTunaStackWithContextDomainName(app, stack, vpcId, undefined, 'ap-northeast-1'));

    expect(stack).toHaveResourceLike('AWS::CloudFront::Distribution', {
      "DistributionConfig": {
        "CacheBehaviors": [
          {
            "AllowedMethods": [
              "GET",
              "HEAD"
            ],
            "CachedMethods": [
              "GET",
              "HEAD"
            ],
            "Compress": true,
            "DefaultTTL": 300,
            "ForwardedValues": {
              "Headers": [
                "Host",
                "CloudFront-Forwarded-Proto"
              ],
              "QueryString": true
            },
            "PathPattern": "/jobs",
            "TargetOriginId": "origin1",
            "ViewerProtocolPolicy": "redirect-to-https"
          },
          {
            "AllowedMethods": [
              "GET",
              "HEAD"
            ],
            "CachedMethods": [
              "GET",
              "HEAD"
            ],
            "Compress": true,
            "ForwardedValues": {
              "Cookies": {
                "Forward": "none"
              },
              "QueryString": false
            },
            "PathPattern": "/rubygems/*",
            "TargetOriginId": "origin2",
            "ViewerProtocolPolicy": "redirect-to-https"
          }
        ],
        "Origins": [
          {
            "ConnectionAttempts": 3,
            "ConnectionTimeout": 10,
            "CustomOriginConfig": {
              "HTTPPort": 80,
              "HTTPSPort": 443,
              "OriginKeepaliveTimeout": 5,
              "OriginProtocolPolicy": "https-only",
              "OriginReadTimeout": 30,
              "OriginSSLProtocols": [
                "TLSv1.2"
              ]
            },
            "DomainName": "ap-northeast-1.tuna.example.com",
            "Id": "origin1"
          },
          {
            "ConnectionAttempts": 3,
            "ConnectionTimeout": 10,
            "DomainName": {
              "Fn::GetAtt": [
                "RubygemsBucketEFD2E331",
                "RegionalDomainName"
              ]
            },
            "Id": "origin2",
            "S3OriginConfig": {}
          }
        ],
        "Aliases": [
          "tuna.example.com"
        ],
        "ViewerCertificate": {
          "AcmCertificateArn": {
            "Fn::GetAtt": [
              "CloudFrontCertificateCertificateRequestorResource1EE7A77A",
              "Arn"
            ]
          },
          "SslSupportMethod": "sni-only"
        },
        "Enabled": true,
        "HttpVersion": "http2",
        "IPV6Enabled": true,
        "PriceClass": "PriceClass_100",
        "CustomErrorResponses": [
          {
            "ErrorCachingMinTTL": 30,
            "ErrorCode": 500
          },
          {
            "ErrorCachingMinTTL": 0,
            "ErrorCode": 502
          },
          {
            "ErrorCachingMinTTL": 0,
            "ErrorCode": 503
          },
          {
            "ErrorCachingMinTTL": 3600,
            "ErrorCode": 404,
            "ResponseCode": 404,
            "ResponsePagePath": "/404.html"
          }
        ],
      },
    });
  });

  test('custom resource to invalidate cloudfront distribution', () => {
    ({ app, stack } = overrideTunaStackWithContextDomainName(app, stack, vpcId, undefined, 'ap-northeast-1'));

    expect(stack).toHaveResourceLike('Custom::CloudFrontInvalidate', {
      "ServiceToken": {
        "Fn::GetAtt": [
          "SingletonLambdaCloudFrontInvalidateSingletonFunctionED3F4C9D",
          "Arn"
        ]
      },
      "DistributionId": {
        "Ref": "CloudFrontDistCFDistribution179E93F8"
      },
      "DistributionPaths": [
        "/help/*",
        "/news/*",
        "/status/*",
        "/*.html",
        "/"
      ],
    });

    expect(stack).toHaveResourceLike('AWS::IAM::Policy', {
      "PolicyDocument": {
        "Statement": [
          {
            "Action": [
              "cloudfront:GetInvalidation",
              "cloudfront:CreateInvalidation"
            ],
            "Effect": "Allow",
            "Resource": "*"
          }
        ],
        "Version": "2012-10-17"
      },
      "PolicyName": "SingletonLambdaCloudFrontInvalidateSingletonFunctionServiceRoleDefaultPolicyCA9A4034",
      "Roles": [
        {
          "Ref": "SingletonLambdaCloudFrontInvalidateSingletonFunctionServiceRoleA1C3B8D5"
        }
      ]
    });

    expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
      "Handler": "index.handler",
      "Role": {
        "Fn::GetAtt": [
          "SingletonLambdaCloudFrontInvalidateSingletonFunctionServiceRoleA1C3B8D5",
          "Arn"
        ]
      },
      "Runtime": "python3.8",
      "Timeout": 600
    });
  });

  test('cloudwatch dashboard', () => {
    ({ app, stack } = overrideTunaStackWithContextDomainName(app, stack, vpcId, undefined, 'ap-northeast-1'));

    expect(stack).toHaveResourceLike('AWS::CloudWatch::Dashboard', {
      "DashboardName": "OpenTUNA-Dashboard"
    });
  });
});

function overrideTunaStackWithContextDomainName(app: cdk.App, stack: cdk.Stack, vpcId: string,
  iamCertId?: string, region?: string) {
  app = new cdk.App({
    context: {
      domainName: 'tuna.example.com',
      domainZone: 'example.com',
      iamCertId,
    }
  });

  const env = {
    region: region ? region : 'cn-north-1',
    account: '1234567890xx',
  }

  const commonStack = new cdk.Stack(app, 'CommonStack', {
    env,
  });
  const topic = new sns.Topic(commonStack, 'Test Topic');

  stack = new Tuna.OpentunaStack(app, 'OpenTunaStack', {
    vpcId,
    fileSystemId: 'fs-012345',
    fileSystemSGId: 'sg-012345',
    notifyTopic: topic,
    env,
  });
  return { app, stack };
}

