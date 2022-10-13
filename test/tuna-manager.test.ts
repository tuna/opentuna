import * as cdk from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import * as s3 from '@aws-cdk/aws-s3';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as sns from '@aws-cdk/aws-sns';
import * as Tuna from '../lib/tuna-manager';
import * as mock from './context-provider-mock';
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
    const bucket = new s3.Bucket(parentStack, 'AssetBucket');

    const tunaManagerSG = new ec2.SecurityGroup(parentStack, "TunaManagerSG", {
      vpc,
      description: "SG of Tuna Manager",
      allowAllOutbound: true,
    });
    const tunaManagerALBSG = new ec2.SecurityGroup(parentStack, "TunaManagerALBSG", {
      vpc,
      description: "SG of ALB of Tuna Manager",
      allowAllOutbound: false,
    });

    stack = new Tuna.TunaManagerStack(parentStack, 'TunaManagerStack', {
      vpc,
      fileSystemId: 'fs-012345',
      notifyTopic: topic,
      tunaManagerSG,
      tunaManagerALBSG,
      assetBucket: bucket,
    });
  });

  test('Tuna manager auto scaling group created', () => {
    expect(stack).toHaveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
      "MaxSize": "1",
      "MinSize": "1",
      "Cooldown": "30",
      "HealthCheckGracePeriod": 180,
      "HealthCheckType": "ELB",
      "NotificationConfigurations": [
        {
          "NotificationTypes": [
            "autoscaling:EC2_INSTANCE_LAUNCH",
            "autoscaling:EC2_INSTANCE_LAUNCH_ERROR",
            "autoscaling:EC2_INSTANCE_TERMINATE",
            "autoscaling:EC2_INSTANCE_TERMINATE_ERROR"
          ],
          "TopicARN": {
            "Ref": "referencetoParentStackTestTopicCEBA4F88Ref"
          }
        }
      ],
      "Tags": [
        {
          "Key": "component",
          "PropagateAtLaunch": true,
          "Value": "TunaManager"
        },
        {
          "Key": "Name",
          "PropagateAtLaunch": true,
          "Value": "ParentStack/TunaManagerStack/TunaManagerASG"
        }
      ],
    });
  });

  test('Tuna manager launch configuration', () => {
    expect(stack).toHaveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
      "InstanceType": "c5.large",
      "SecurityGroups": [
        {
          "Fn::GetAtt": [
            "TunaManagerASGInstanceSecurityGroupC6CE4E34",
            "GroupId"
          ]
        },
        {
          "Ref": "referencetoParentStackTunaManagerSG1CFDBA88GroupId"
        }
      ],
      "UserData": {
        "Fn::Base64": {
          "Fn::Join": [
            "",
            [
              "Content-Type: multipart/mixed; boundary=\"//\"\nMIME-Version: 1.0\n\n--//\nContent-Type: text/cloud-config; charset=\"us-ascii\"\nMIME-Version: 1.0\nContent-Transfer-Encoding: 7bit\nContent-Disposition: attachment; filename=\"cloud-config.txt\"\n\n#cloud-config\nrepo_update: true\nrepo_upgrade: all\npackages:\n - nfs-utils\n - amazon-efs-utils\n - amazon-cloudwatch-agent\n\n# run commands\nruncmd:\n - file_system_id_1=fs-012345\n - efs_mount_point_1=/mnt/efs/opentuna\n - mkdir -p \"${efs_mount_point_1}\"\n - test -f \"/sbin/mount.efs\" && echo \"${file_system_id_1}:/ ${efs_mount_point_1} efs tls,_netdev\" >> /etc/fstab || echo \"${file_system_id_1}.efs.cn-north-1.amazonaws.com.cn:/ ${efs_mount_point_1} nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,_netdev 0 0\" >> /etc/fstab\n - test -f \"/sbin/mount.efs\" && echo -e \"\\n[client-info]\\nsource=liw\" >> /etc/amazon/efs/efs-utils.conf\n - mount -a -t efs,nfs4 defaults\n - tunaversion=v0.7.0\n - tunafile=\"${efs_mount_point_1}/tunasync/install/tunasync-linux-amd64-bin-${tunaversion}.tar.gz\"\n - (test -f ${tunafile} && tar -xf ${tunafile} -C /usr/local/bin/) || (wget -t 20 --retry-connrefused -w 5 -T 10 -c https://github.com/tuna/tunasync/releases/download/${tunaversion}/tunasync-linux-amd64-bin.tar.gz -O - | tar xzf - -C /usr/local/bin/)\n\ncloud_final_modules:\n- [scripts-user, always]\n--//\nContent-Type: text/x-shellscript; charset=\"us-ascii\"\nMIME-Version: 1.0\nContent-Transfer-Encoding: 7bit\nContent-Disposition: attachment; filename=\"userdata.txt\"\n\n#!/bin/bash -xe\nmkdir -p /etc/tunasync/\nmkdir -p /mnt/efs/opentuna/tunasync/\n\nexport AWS_DEFAULT_REGION=cn-north-1\n\n# setup tunasync manager config\ncat > /etc/tunasync/manager.conf << EOF\ndebug = false\n\n[server]\naddr = \"0.0.0.0\"\nport = 80\nssl_cert = \"\"\nssl_key = \"\"\n\n[files]\ndb_type = \"redis\"\ndb_file = \"redis://",
              {
                "Fn::GetAtt": [
                  "ManagerRedis",
                  "RedisEndpoint.Address"
                ]
              },
              "/\"\nca_cert = \"\"\n\nEOF\n\n# create tunasync service\ncat > /usr/lib/systemd/system/tunasync.service << EOF\n[Unit]\nDescription=Tunasync Manager daemon\n\n[Service]\nExecStart=/usr/local/bin/tunasync manager -config /etc/tunasync/manager.conf\nExecReload=/bin/kill -HUP \\$MAINPID\nType=simple\nKillMode=control-group\nRestart=on-failure\nRestartSec=20s\nStandardOutput=syslog\nStandardError=syslog\nSyslogIdentifier=tunasync\n\n[Install]\nWantedBy=multi-user.target\nEOF\n\ncat > /etc/rsyslog.d/tunasync.conf << EOF\nif \\$programname == 'tunasync' then /var/log/tunasync.log\n& stop\nEOF\n\n# start tunasync service\nsystemctl daemon-reload\nsystemctl restart rsyslog\nsystemctl enable tunasync.service\nsystemctl start tunasync.service\n\n# configure conf json of CloudWatch agent\nmkdir -p /opt/aws/amazon-cloudwatch-agent/etc/\naws s3 cp s3://",
              {
                "Ref": "referencetoParentStackAssetBucket9670BCE7Ref"
              },
              "/tunasync/manager/amazon-cloudwatch-agent-34b742e9c3c72b528e3f180d0c20a7ad.conf /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json\n\n# start cloudwatch agent\n/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s &\n--//"
            ]
          ]
        }
      }
    });
  });

  test('Tuna manager running with IAM profile role having SSM managed policy and cloudwatch agent', () => {
    expect(stack).toHaveResource('AWS::IAM::Role', {
      "AssumeRolePolicyDocument": {
        "Statement": [
          {
            "Action": "sts:AssumeRole",
            "Effect": "Allow",
            "Principal": {
              "Service": "ec2.amazonaws.com.cn"
            }
          }
        ],
        "Version": "2012-10-17"
      },
      "ManagedPolicyArns": [
        {
          "Fn::Join": [
            "",
            [
              "arn:",
              {
                "Ref": "AWS::Partition"
              },
              ":iam::aws:policy/AmazonSSMManagedInstanceCore"
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
              ":iam::aws:policy/CloudWatchAgentServerPolicy"
            ]
          ]
        }
      ],
      "Tags": [
        {
          "Key": "component",
          "Value": "TunaManager"
        }
      ]
    });
    expect(stack).toHaveResource('AWS::IAM::InstanceProfile', {
      "Roles": [
        {
          "Ref": "TunaManagerEC2Role51256D84"
        }
      ]
    });
    expect(stack).toHaveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
      "IamInstanceProfile": {
        "Ref": "TunaManagerASGInstanceProfileA5870CAF"
      },
    });
  });

  test('Intranet ALB for tuna manager', () => {
    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::TargetGroup', {
      "HealthCheckPath": "/ping",
      "Port": 80,
      "Protocol": "HTTP",
      "Tags": [
        {
          "Key": "component",
          "Value": "TunaManager"
        }
      ],
      "TargetGroupAttributes": [
        {
          "Key": "deregistration_delay.timeout_seconds",
          "Value": "10"
        },
        {
          "Key": "slow_start.duration_seconds",
          "Value": "60"
        },
        {
          "Key": "stickiness.enabled",
          "Value": "false"
        }
      ],
      "TargetType": "instance",
      "VpcId": vpcId,
    });
    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::Listener', {
      "DefaultActions": [
        {
          "TargetGroupArn": {
            "Ref": "TunaManagerALBListener80TunaManagerTargetGroupGroup43623F73"
          },
          "Type": "forward"
        }
      ],
      "LoadBalancerArn": {
        "Ref": "TunaManagerALBF8C74F37"
      },
      "Port": 80,
      "Protocol": "HTTP"
    });
    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      "LoadBalancerAttributes": [
        {
          "Key": "deletion_protection.enabled",
          "Value": "false"
        },
        {
          "Key": "routing.http2.enabled",
          "Value": "false"
        }
      ],
      "Scheme": "internal",
      "SecurityGroups": [
        {
          "Ref": "referencetoParentStackTunaManagerALBSG022297AFGroupId"
        }
      ],
      "Subnets": [
        "subnet-0a6dab6bc063ea432",
        "subnet-08dd359da55a6160b",
        "subnet-0d300d086b989eefc"
      ],
      "Tags": [
        {
          "Key": "component",
          "Value": "TunaManager"
        }
      ],
      "Type": "application"
    });

  });

  test('Redis cluster for tunasync manager', () => {
    expect(stack).toHaveResourceLike('AWS::EC2::SecurityGroup', {
      "GroupDescription": "SG for redis cluster",
      "VpcId": "vpc-123456"
    });

    expect(stack).toHaveResourceLike('AWS::EC2::SecurityGroupIngress', {
      "IpProtocol": "tcp",
      "Description": "allow tunasync manager to access redis",
      "FromPort": 6379,
      "GroupId": {
        "Fn::GetAtt": [
          "ManagerRedisSGE7ACDB7A",
          "GroupId"
        ]
      },
      "SourceSecurityGroupId": {
        "Ref": "referencetoParentStackTunaManagerSG1CFDBA88GroupId"
      },
      "ToPort": 6379
    });

    expect(stack).toHaveResourceLike('AWS::ElastiCache::SubnetGroup', {
      "Description": "Subnet Group of redis cluster",
      "SubnetIds": [
        "subnet-0a6dab6bc063ea432",
        "subnet-08dd359da55a6160b",
        "subnet-0d300d086b989eefc"
      ]
    });

    expect(stack).toHaveResourceLike('AWS::ElastiCache::CacheCluster', {
      "Properties": {
        "CacheNodeType": "cache.t3.micro",
        "Engine": "redis",
        "NumCacheNodes": 1,
        "CacheSubnetGroupName": {
          "Ref": "ManagerRedisSubnetGroup"
        },
        "VpcSecurityGroupIds": [
          {
            "Fn::GetAtt": [
              "ManagerRedisSGE7ACDB7A",
              "GroupId"
            ]
          }
        ]
      },
      "UpdateReplacePolicy": "Snapshot",
      "DeletionPolicy": "Snapshot",
    }, ResourcePart.CompleteDefinition);
    
  });

});
