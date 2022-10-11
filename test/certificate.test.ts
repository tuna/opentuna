import * as cdk from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import { CertificateStack } from '../lib/certificate-stack';
import * as mock from './context-provider-mock';
import * as r53 from '@aws-cdk/aws-route53';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as sns from '@aws-cdk/aws-sns';
import '@aws-cdk/assert/jest';

describe('Tuna certificate stack', () => {
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
    app = new cdk.App({
      context: {
        stage: 'prod',
        certTopicArn: 'arn:aws-cn:sns:::topic/ssss',
      }
    });
    const parentStack = new cdk.Stack(app, 'ParentStack', {
      env: {
        region: 'cn-north-1',
        account: '1234567890xx',
      },
    });
    const notifyTopic = new sns.Topic(parentStack, 'Test Topic');
    const hostedZone = r53.HostedZone.fromLookup(parentStack, 'HostedZone', {
      domainName: 'example.com',
    });

    stack = new CertificateStack(parentStack, 'CertificateStack', {
      notifyTopic,
      domainName: 'mirrors.example.com',
      hostedZone,
      contactEmail: "test@example.com",
      distributionId: 'distribution-id',
    });
  });

  test('Codebuild project created', () => {
    expect(stack).toHaveResourceLike('AWS::CodeBuild::Project', {
      "Artifacts": {
        "Type": "NO_ARTIFACTS"
      },
      "Environment": {
        "ComputeType": "BUILD_GENERAL1_SMALL",
        "Image": "debian:buster",
        "ImagePullCredentialsType": "SERVICE_ROLE",
        "PrivilegedMode": false,
        "Type": "LINUX_CONTAINER"
      },
      "ServiceRole": {
        "Fn::GetAtt": [
          "CertificateProjectRole66DF04D1",
          "Arn"
        ]
      }
    });

    expect(stack).toHaveResourceLike('AWS::IAM::Role', {
      "AssumeRolePolicyDocument": {
        "Statement": [
          {
            "Action": "sts:AssumeRole",
            "Effect": "Allow",
            "Principal": {
              "Service": "codebuild.amazonaws.com"
            }
          }
        ],
        "Version": "2012-10-17"
      },
    });

    expect(stack).toHaveResourceLike('AWS::IAM::Policy', {
      "PolicyDocument": {
        "Statement": [
          {
            "Action": [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents"
            ],
            "Effect": "Allow",
            "Resource": [
              {
                "Fn::Join": [
                  "",
                  [
                    "arn:",
                    {
                      "Ref": "AWS::Partition"
                    },
                    ":logs:cn-north-1:1234567890xx:log-group:/aws/codebuild/",
                    {
                      "Ref": "CertificateProject407BDDAD"
                    }
                  ]
                ]
              },
              {
                "Fn::Join": [
                  "",
                  [
                    "arn:",
                    {
                      "Ref": "AWS::Partition"
                    },
                    ":logs:cn-north-1:1234567890xx:log-group:/aws/codebuild/",
                    {
                      "Ref": "CertificateProject407BDDAD"
                    },
                    ":*"
                  ]
                ]
              }
            ]
          },
          {
            "Action": [
              "codebuild:CreateReportGroup",
              "codebuild:CreateReport",
              "codebuild:UpdateReport",
              "codebuild:BatchPutTestCases",
              "codebuild:BatchPutCodeCoverages"
            ],
            "Effect": "Allow",
            "Resource": {
              "Fn::Join": [
                "",
                [
                  "arn:",
                  {
                    "Ref": "AWS::Partition"
                  },
                  ":codebuild:cn-north-1:1234567890xx:report-group/",
                  {
                    "Ref": "CertificateProject407BDDAD"
                  },
                  "-*"
                ]
              ]
            }
          },
          {
            "Action": [
              "route53:ListHostedZones",
              "route53:GetChange"
            ],
            "Effect": "Allow",
            "Resource": "*"
          },
          {
            "Action": "route53:ChangeResourceRecordSets",
            "Effect": "Allow",
            "Resource": {
              "Fn::Join": [
                "",
                [
                  "arn:",
                  {
                    "Ref": "AWS::Partition"
                  },
                  ":route53:::hostedzone/12345678"
                ]
              ]
            }
          },
          {
            "Action": "iam:UploadServerCertificate",
            "Effect": "Allow",
            "Resource": "*"
          },
          {
            "Action": [
              "cloudfront:GetDistributionConfig",
              "cloudfront:UpdateDistribution"
            ],
            "Effect": "Allow",
            "Resource": {
              "Fn::Join": [
                "",
                [
                  "arn:",
                  {
                    "Ref": "AWS::Partition"
                  },
                  ":cloudfront:*:1234567890xx:distribution/distribution-id"
                ]
              ]
            }
          }
        ],
        "Version": "2012-10-17"
      },
      "PolicyName": "CertificateProjectRoleDefaultPolicy769838D7",
      "Roles": [
        {
          "Ref": "CertificateProjectRole66DF04D1"
        }
      ]
    });

    expect(stack).toHaveResourceLike('AWS::Events::Rule', {
      "EventPattern": {
        "source": [
          "aws.codebuild"
        ],
        "detail": {
          "project-name": [
            {
              "Ref": "CertificateProject407BDDAD"
            }
          ],
          "build-status": [
            "FAILED"
          ]
        },
        "detail-type": [
          "CodeBuild Build State Change"
        ]
      },
      "State": "ENABLED",
      "Targets": [
        {
          "Arn": {
            "Ref": "referencetoParentStackTestTopicCEBA4F88Ref"
          },
          "Id": "Target0",
          "InputTransformer": {
            "InputPathsMap": {
              "detail-project-name": "$.detail.project-name",
              "detail-build-status": "$.detail.build-status",
              "detail-build-id": "$.detail.build-id",
              "account": "$.account"
            },
            "InputTemplate": "{\"type\":\"certificate\",\"certificateDomain\":\"mirrors.example.com\",\"certificateProjectName\":<detail-project-name>,\"certificateBuildStatus\":<detail-build-status>,\"certificateBuildId\":<detail-build-id>,\"account\":<account>}"
          }
        }
      ]
    });

    expect(stack).toHaveResourceLike('AWS::Events::Rule', {
      "EventPattern": {
        "source": [
          "aws.codebuild"
        ],
        "detail": {
          "project-name": [
            {
              "Ref": "CertificateProject407BDDAD"
            }
          ],
          "build-status": [
            "SUCCEEDED"
          ]
        },
        "detail-type": [
          "CodeBuild Build State Change"
        ]
      },
      "State": "ENABLED",
      "Targets": [
        {
          "Arn": {
            "Fn::GetAtt": [
              "CertRenewSchedulerA1D1D56E",
              "Arn"
            ]
          },
          "Id": "Target0",
          "Input": {
            "Fn::Join": [
              "",
              [
                "{\"ruleName\":\"opentuna-cert-renew-scheduler-rule\",\"certificateProjectARN\":\"",
                {
                  "Fn::GetAtt": [
                    "CertificateProject407BDDAD",
                    "Arn"
                  ]
                },
                "\",\"interval\":69,\"ruleRole\":\"",
                {
                  "Fn::GetAtt": [
                    "IamCertBuildRuleRole7255FF72",
                    "Arn"
                  ]
                },
                "\"}"
              ]
            ]
          }
        },
        {
          "Arn": {
            "Fn::GetAtt": [
              "IAMCertEventSender432115AB",
              "Arn"
            ]
          },
          "Id": "Target1",
          "InputTransformer": {
            "InputPathsMap": {
              "detail-additional-information-exported-environment-variables-0--value": "$.detail.additional-information.exported-environment-variables[0].value",
              "detail-additional-information-exported-environment-variables-1--value": "$.detail.additional-information.exported-environment-variables[1].value",
              "detail-project-name": "$.detail.project-name",
              "detail-build-status": "$.detail.build-status",
              "detail-build-id": "$.detail.build-id",
              "account": "$.account"
            },
            "InputTemplate": "{\"type\":\"certificate\",\"certificateDomain\":\"mirrors.example.com\",\"stage\":\"prod\",\"iamCertId\":<detail-additional-information-exported-environment-variables-0--value>,\"iamCertName\":<detail-additional-information-exported-environment-variables-1--value>,\"certificateProjectName\":<detail-project-name>,\"certificateBuildStatus\":<detail-build-status>,\"certificateBuildId\":<detail-build-id>,\"account\":<account>}"
          }
        }
      ]
    });
  });

});
