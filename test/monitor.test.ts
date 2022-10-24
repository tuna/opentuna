import * as cdk from '@aws-cdk/core';
import * as sns from '@aws-cdk/aws-sns';
import * as cxapi from '@aws-cdk/cx-api';
import * as Tuna from '../lib/monitor-stack';
import * as mock from './context-provider-mock';
import * as ec2 from '@aws-cdk/aws-ec2';
import '@aws-cdk/assert/jest';
import { getMirrorTestingConfig } from '../lib/mirror-config';

describe('Tuna monitor stack', () => {
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
      }
    });
    const parentStack = new cdk.Stack(app, 'ParentStack', {
      env: {
        region: 'cn-north-1',
        account: '1234567890xx',
      },
    });
    const topic = new sns.Topic(parentStack, 'SnsTopic');
    const vpc = ec2.Vpc.fromLookup(parentStack, `VPC`, {
      vpcId,
    });
    const tunaManagerALBSG = new ec2.SecurityGroup(parentStack, "TunaManagerALBSG", {
      vpc,
      description: "SG of Tuna Manager ALB",
      allowAllOutbound: true,
    });

    stack = new Tuna.MonitorStack(parentStack, 'AnalyticsStack', {
      vpc,
      domainName: 'example.com',
      notifyTopic: topic,
      tunaManagerUrl: 'manager.example.com',
      tunaManagerALBSG,
    });
  });

  test('periodic rule created', () => {
    expect(stack).toHaveResourceLike('AWS::Events::Rule', {
      "ScheduleExpression": "rate(30 minutes)",
      "State": "ENABLED",
    });
  });

  test('code build projects and event rules created', () => {
    for (let cfg of getMirrorTestingConfig('staging', 'example.com')) {
      for (let image of cfg.images) {
        expect(stack).toHaveResourceLike('AWS::CodeBuild::Project', {
          "Artifacts": {
            "Type": "NO_ARTIFACTS"
          },
          "Environment": {
            "ComputeType": "BUILD_GENERAL1_SMALL",
            "Image": {
              "Fn::Join": [
                "",
                [
                  "048912060910.dkr.ecr.cn-northwest-1.",
                  {
                    "Ref": "AWS::URLSuffix"
                  },
                  `/dockerhub/${image}`
                ]
              ]
            },
            "ImagePullCredentialsType": "SERVICE_ROLE",
            "PrivilegedMode": false,
            "Type": "LINUX_CONTAINER"
          },
          "ConcurrentBuildLimit": 1,
          "TimeoutInMinutes": 30,
        });

        // sns notify event
        expect(stack).toHaveResourceLike('AWS::Events::Rule', {
          "EventPattern": {
            "source": [
              "aws.codebuild"
            ],
            "detail": {
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
                "Ref": "referencetoParentStackSnsTopic08E282D6Ref"
              },
              "Id": "Target0",
              "InputTransformer": {
                "InputPathsMap": {
                  "detail-project-name": "$.detail.project-name",
                  "detail-build-status": "$.detail.build-status",
                  "account": "$.account",
                  "detail-build-id": "$.detail.build-id"
                },
                "InputTemplate": `{\"type\":\"repo-sanity\",\"sanityTarget\":\"${cfg.name}\",\"sanityProjectImage\":\"${image}\",\"sanityProjectName\":<detail-project-name>,\"sanityBuildStatus\":<detail-build-status>,\"account\":<account>,\"sanityBuildId\":<detail-build-id>}`
              }
            }
          ]
        });

        // lambda trigger event
        expect(stack).toHaveResourceLike('AWS::Events::Rule', {
          "EventPattern": {
            "source": [
              "aws.codebuild"
            ],
            "detail": {
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
                "Fn::GetAtt": [
                  "TunasyncHandler32F624BF",
                  "Arn"
                ]
              },
              "Id": "Target0",
              "Input": `{\"name\":\"${cfg.name}\",\"repo\":\"${cfg.repo}\",\"image\":\"${image}\"}`
            }
          ]
        });
      }
    }
  });

  test('tunasync handler lambda created', () => {
    expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
      "Handler": "index.handler",
      "Role": {
        "Fn::GetAtt": [
          "TunasyncHandlerServiceRole27B629C3",
          "Arn"
        ]
      },
      "Runtime": "python3.8",
      "Environment": {
        "Variables": {
          "TUNASYNC_MANAGER_URL": "manager.example.com"
        }
      },
      "VpcConfig": {
        "SecurityGroupIds": [
          {
            "Fn::GetAtt": [
              "TunasyncActionSG2C3146ED",
              "GroupId"
            ]
          }
        ],
        "SubnetIds": [
          "subnet-0a6dab6bc063ea432",
          "subnet-08dd359da55a6160b",
          "subnet-0d300d086b989eefc"
        ]
      }
    });

    // permit eventbridge to invoke lambda
    expect(stack).toHaveResourceLike('AWS::Lambda::Permission', {
      "Action": "lambda:InvokeFunction",
      "FunctionName": {
        "Fn::GetAtt": [
          "TunasyncHandler32F624BF",
          "Arn"
        ]
      },
      "Principal": "events.amazonaws.com",
      "SourceArn": {
        "Fn::GetAtt": [
          "MonitorProjectForELRepocentos7MonitorProjectForELRepocentos7FailedLambdaD7E8BD28",
          "Arn"
        ]
      }
    });
  });

});
