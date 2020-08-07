import * as cdk from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import * as Tuna from '../lib/web-portal';
import * as mock from './context-provider-mock';
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import sns = require('@aws-cdk/aws-sns');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import '@aws-cdk/assert/jest';
import { AutoScalingGroup } from '@aws-cdk/aws-autoscaling';

describe('Content Server stack', () => {
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
    const parentStack = new cdk.Stack(app, 'ParentStack', {
      env: {
        region: 'cn-north-1',
        account: '1234567890xx',
      },
    });
    const topic = new sns.Topic(parentStack, 'Test Topic');
    const vpc = ec2.Vpc.fromLookup(parentStack, `VPC`, {
      vpcId,
    });

    const externalALBSG = new ec2.SecurityGroup(parentStack, "ExternalALBSG", {
      vpc,
      description: "SG of External ALB",
      allowAllOutbound: false,
    });
    const externalALB = new elbv2.ApplicationLoadBalancer(parentStack, "ExternalALB", {
      vpc,
      securityGroup: externalALBSG,
      internetFacing: true,
    });
    const ecsCluster = new ecs.Cluster(parentStack, `ECSCluster`, {
      vpc,
    });
    const externalALBListener = externalALB.addListener(`ExternalALBListener`, {
      port: 80,
    });
    const tunaManagerASG = new AutoScalingGroup(parentStack, `TunaManagerASG`, {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.C5, ec2.InstanceSize.LARGE),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
    });
    const tunaManagerALBTargetGroup = externalALBListener.addTargets(`TunaManagerTargetGroup`, {
    });

    stack = new Tuna.WebPortalStack(parentStack, 'WebPortalStack', {
      vpc,
      externalALBListener,
      ecsCluster,
      tunaManagerASG,
      tunaManagerALBTargetGroup,
      fileSystemId: 'sg-012345',
      fileSystemSGId: 'sg-012345',
    });
  });

  test('Web portal running with IAM task role', () => {
    expect(stack).toHaveResource('AWS::IAM::Role', {
      "AssumeRolePolicyDocument": {
        "Statement": [
          {
            "Action": "sts:AssumeRole",
            "Effect": "Allow",
            "Principal": {
              "Service": "ecs-tasks.amazonaws.com"
            }
          }
        ],
        "Version": "2012-10-17"
      },
      "Tags": [
        {
          "Key": "component",
          "Value": "WebPortal"
        }
      ]
    });
    expect(stack).toHaveResourceLike('AWS::ECS::TaskDefinition', {
      "TaskRoleArn": {
        "Fn::GetAtt": [
          "WebPortalTaskDefinitonTaskRole79275C7D",
          "Arn"
        ]
      }
    });
  });

  test('Web portal service created', () => {
    expect(stack).toHaveResourceLike('AWS::ECS::Service', {
      "Cluster": {
        "Ref": "referencetoParentStackECSCluster91DDD157Ref",
      },
      "LaunchType": "FARGATE",
      "LoadBalancers": [
        {
          "ContainerName": "web",
          "ContainerPort": 80,
        }
      ],
      "Tags": [
        {
          "Key": "component",
          "Value": "WebPortal"
        }
      ],
      "TaskDefinition": {
        "Ref": "WebPortalTaskDefiniton3F36337B"
      }
    });
  });

  test('Gen iso lambda function created', () => {
    expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
      "Handler": "wrapper.lambda_handler",
      "Role": {
        "Fn::GetAtt": [
          "WebPortalGenIsoLambdaServiceRole8DD34FF6",
          "Arn"
        ]
      },
      "Runtime": "python3.7",
      "FileSystemConfigs": [
        {
          "LocalMountPath": "/mnt/data",
          "Arn": {
            "Fn::Join": [
              "",
              [
                "arn:",
                {
                  "Ref": "AWS::Partition"
                },
                ":elasticfilesystem:cn-north-1:1234567890xx:access-point/",
                {
                  "Ref": "WebPortalGenIsoLambdaAccessPoint2AA40B4D"
                }
              ]
            ]
          }
        }
      ],
      "Tags": [
        {
          "Key": "component",
          "Value": "WebPortal"
        }
      ],
    });
  });

  test('Trigger gen iso lambda function every day', () => {
    expect(stack).toHaveResourceLike('AWS::Events::Rule', {
      "ScheduleExpression": "rate(1 day)",
      "State": "ENABLED",
      "Targets": [
        {
          "Arn": {
            "Fn::GetAtt": [
              "WebPortalGenIsoLambda7643ECF2",
              "Arn"
            ]
          },
          "Id": "Target0"
        }
      ]
    });
  });

});
