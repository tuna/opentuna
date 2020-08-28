import * as cdk from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import * as Tuna from '../lib/content-server';
import * as mock from './context-provider-mock';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as sns from '@aws-cdk/aws-sns';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import '@aws-cdk/assert/jest';

describe('Content Server stack', () => {
  let app: cdk.App;
  let stack: cdk.Stack, parentStack: cdk.Stack;
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
    parentStack = new cdk.Stack(app, 'ParentStack', {
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
    const defaultALBListener = externalALB.addListener(`DefaultPort`, {
      port: 80,
      open: true,
    });
    const ecsCluster = new ecs.Cluster(parentStack, `ECSCluster`, {
      vpc,
    });
    const dashboard = new cloudwatch.Dashboard(parentStack, 'Dashboard');

    stack = new Tuna.ContentServerStack(parentStack, 'ContentServerStack', {
      vpc,
      fileSystemId: 'fs-012345',
      notifyTopic: topic,
      listener: defaultALBListener,
      ecsCluster,
      dashboard
    });
  });

  test('Content server running with IAM task role', () => {
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
          "Value": "ContentServer"
        }
      ]
    });
    expect(stack).toHaveResourceLike('AWS::ECS::TaskDefinition', {
      "TaskRoleArn": {
        "Fn::GetAtt": [
          "ContentServerTaskDefinitonTaskRole24E35D33",
          "Arn"
        ]
      },
    });
  });

  test('Content server service created', () => {
    expect(stack).toHaveResourceLike('AWS::ECS::Service', {
      "Cluster": {
        "Ref": "referencetoParentStackECSCluster91DDD157Ref"
      },
      "LaunchType": "FARGATE",
      "LoadBalancers": [
        {
          "ContainerName": "content-server",
          "ContainerPort": 80,
          "TargetGroupArn": {
            "Ref": "referencetoParentStackExternalALBDefaultPortContentServerGroupD94FAC32Ref"
          }
        }
      ],
      "PlatformVersion": "1.4.0",
      "Tags": [
        {
          "Key": "component",
          "Value": "ContentServer"
        }
      ],
      "TaskDefinition": {
        "Ref": "ContentServerTaskDefinitonD84A7F1E"
      }
    });
  });

  test('Content server task definition created', () => {
    expect(stack).toHaveResourceLike('AWS::ECS::TaskDefinition', {
      "ContainerDefinitions": [
        {
          "Essential": true,
          "LogConfiguration": {
            "LogDriver": "awslogs",
            "Options": {
              "awslogs-group": {
                "Ref": "ContentServerLogGroup11BFCDBD"
              },
              "awslogs-stream-prefix": "ContentServer",
              "awslogs-region": "cn-north-1",
              "awslogs-datetime-format": "\\[%d/%b/%Y:%H:%M:%S %z\\]"
            }
          },
          "MountPoints": [
            {
              "ContainerPath": "/mnt/efs",
              "SourceVolume": "efs-volume",
              "ReadOnly": true
            }
          ],
          "Name": "content-server",
          "PortMappings": [
            {
              "ContainerPort": 80,
              "Protocol": "tcp"
            }
          ]
        },
        {
          "Essential": false,
          "Image": "amazon/cloudwatch-agent:latest",
          "LogConfiguration": {
            "LogDriver": "awslogs",
            "Options": {
              "awslogs-group": {
                "Ref": "ContentServerCloudWatchAgentLogGroupC48BB829"
              },
              "awslogs-stream-prefix": "ContentServer",
              "awslogs-region": "cn-north-1",
            }
          },
          "Name": "cloudwatch-agent"
        }
      ],
      "Cpu": "256",
      "ExecutionRoleArn": {
        "Fn::GetAtt": [
          "ContentServerTaskDefinitonExecutionRole329A7455",
          "Arn"
        ]
      },
      "Memory": "512",
      "NetworkMode": "awsvpc",
      "RequiresCompatibilities": [
        "FARGATE"
      ],
      "TaskRoleArn": {
        "Fn::GetAtt": [
          "ContentServerTaskDefinitonTaskRole24E35D33",
          "Arn"
        ]
      },
      "Volumes": [
        {
          "Name": "efs-volume",
          "EfsVolumeConfiguration": {
            "FileSystemId": "fs-012345",
            "RootDirectory": "/data"
          }
        }
      ]
    });
  });

  test('Content server auto scaling policy created', () => {
    expect(stack).toHaveResourceLike('AWS::ApplicationAutoScaling::ScalingPolicy', {
      "PolicyName": "ParentStackContentServerStackContentServerFargateTaskCountTargetNetworkBandwidthScaling2D6CB7AD",
      "PolicyType": "TargetTrackingScaling",
      "ScalingTargetId": {
        "Ref": "ContentServerFargateTaskCountTarget2FDCB83B"
      },
      "TargetTrackingScalingPolicyConfiguration": {
        "CustomizedMetricSpecification": {
          "Dimensions": [
            {
              "Name": "interface",
              "Value": "eth1"
            }
          ],
          "MetricName": "net_bytes_sent",
          "Namespace": "OpenTuna",
          "Statistic": "Average"
        },
        "ScaleInCooldown": 600,
        "ScaleOutCooldown": 180,
        "TargetValue": 3 * 1024 * 1024 * 1024
      }
    });

    expect(stack).toHaveResourceLike('AWS::ApplicationAutoScaling::ScalingPolicy', {
      "PolicyName": "ParentStackContentServerStackContentServerFargateTaskCountTargetCpuIowaitScaling5705D108",
      "PolicyType": "TargetTrackingScaling",
      "ScalingTargetId": {
        "Ref": "ContentServerFargateTaskCountTarget2FDCB83B"
      },
      "TargetTrackingScalingPolicyConfiguration": {
        "CustomizedMetricSpecification": {
          "Dimensions": [
            {
              "Name": "cpu",
              "Value": "cpu-total"
            }
          ],
          "MetricName": "cpu_usage_iowait",
          "Namespace": "OpenTuna",
          "Statistic": "Average"
        },
        "ScaleInCooldown": 600,
        "ScaleOutCooldown": 180,
        "TargetValue": 25
      }
    });


    expect(stack).toHaveResourceLike('AWS::ApplicationAutoScaling::ScalableTarget', {
      "MaxCapacity": 16,
      "MinCapacity": 1,
      "ResourceId": {
        "Fn::Join": [
          "",
          [
            "service/",
            {
              "Ref": "referencetoParentStackECSCluster91DDD157Ref"
            },
            "/",
            {
              "Fn::GetAtt": [
                "ContentServerFargateServiceDD089154",
                "Name"
              ]
            }
          ]
        ]
      },
      "ScalableDimension": "ecs:service:DesiredCount",
      "ServiceNamespace": "ecs"
    });

  });

  test('Content server widgets in dashboard created', () => {
    expect(parentStack).toHaveResourceLike('AWS::CloudWatch::Dashboard', {
      "DashboardBody": {
        "Fn::Join": [
          "",
          [
            "{\"widgets\":[{\"type\":\"metric\",\"width\":6,\"height\":6,\"x\":0,\"y\":0,\"properties\":{\"view\":\"timeSeries\",\"title\":\"Content Server Network\",\"region\":\"",
            {
              "Ref": "AWS::Region"
            },
            "\",\"metrics\":[[\"OpenTuna\",\"net_bytes_sent\",\"interface\",\"eth1\",{\"label\":\"Sent B/min\",\"period\":60,\"stat\":\"Sum\"}],[\"OpenTuna\",\"net_bytes_recv\",\"interface\",\"eth1\",{\"label\":\"Recv B/min\",\"period\":60,\"stat\":\"Sum\"}]],\"yAxis\":{}}},{\"type\":\"metric\",\"width\":6,\"height\":6,\"x\":6,\"y\":0,\"properties\":{\"view\":\"timeSeries\",\"title\":\"Content Server Cpu\",\"region\":\"",
            {
              "Ref": "AWS::Region"
            },
            "\",\"metrics\":[[\"OpenTuna\",\"cpu_usage_iowait\",\"cpu\",\"cpu-total\",{\"label\":\"iowait%\",\"period\":60}],[\"OpenTuna\",\"cpu_usage_idle\",\"cpu\",\"cpu-total\",{\"label\":\"idle%\",\"period\":60}],[\"OpenTuna\",\"cpu_usage_user\",\"cpu\",\"cpu-total\",{\"label\":\"user%\",\"period\":60}],[\"OpenTuna\",\"cpu_usage_system\",\"cpu\",\"cpu-total\",{\"label\":\"system%\",\"period\":60}]],\"yAxis\":{}}},{\"type\":\"metric\",\"width\":6,\"height\":6,\"x\":12,\"y\":0,\"properties\":{\"view\":\"timeSeries\",\"title\":\"Content Server Task Count\",\"region\":\"",
            {
              "Ref": "AWS::Region"
            },
            "\",\"metrics\":[[\"AWS/ECS\",\"CPUUtilization\",\"ClusterName\",\"",
            {
              "Ref": "ECSCluster7D463CD4"
            },
            "\",\"ServiceName\",\"",
            {
              "Fn::GetAtt": [
                "ContentServerStackNestedStackContentServerStackNestedStackResource630D9438",
                "Outputs.ParentStackContentServerStackContentServerFargateServiceAAFFEA31Name"
              ]
            },
            "\",{\"label\":\"Task Count\",\"period\":60,\"stat\":\"SampleCount\"}]],\"yAxis\":{}}}]}"
          ]
        ]
      }
    });
  });

});
