import * as cdk from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import * as Tuna from '../lib/tuna-worker';
import * as mock from './context-provider-mock';
import ec2 = require('@aws-cdk/aws-ec2');
import fs = require('fs');
import path = require('path');
import s3 = require('@aws-cdk/aws-s3');
import sns = require('@aws-cdk/aws-sns');
import '@aws-cdk/assert/jest';
import { ResourcePart } from '@aws-cdk/assert/lib/assertions/have-resource';

describe('Tunasync worker stack', () => {
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
    const topic = new sns.Topic(parentStack, 'Test Topic');
    const vpc = ec2.Vpc.fromLookup(parentStack, `VPC`, {
      vpcId,
    });
    const bucket = new s3.Bucket(parentStack, 'AssetBucket');
    const tunaRepoBucket = new s3.Bucket(parentStack, 'TunaRepoBucket');

    const tunaWorkerSG = new ec2.SecurityGroup(parentStack, "TunaWorkerSG", {
      vpc,
      description: "SG of Tuna Worker",
      allowAllOutbound: true,
    });

    stack = new Tuna.TunaWorkerStack(parentStack, 'TunaWorkerStack', {
      vpc,
      fileSystemId: 'fs-012345',
      notifyTopic: topic,
      managerUrl: 'http://tunasync-manager:80',
      tunaWorkerSG,
      assetBucket: bucket,
      tunaRepoBucket,
    });
  });

  test('Tunasync worker auto scaling group created', () => {
    expect(stack).toHaveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
      "Properties": {
        "MaxSize": "1",
        "MinSize": "1",
        "Cooldown": "30",
        "HealthCheckGracePeriod": 180,
        "HealthCheckType": "EC2",
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
            "Value": "TunaWorker"
          },
          {
            "Key": "Name",
            "PropagateAtLaunch": true,
            "Value": "ParentStack/TunaWorkerStack/TunaWorkerASG"
          }
        ],
      },
      "DependsOn": [
        "WorkerConfFileDeploymentsAwsCliLayer019B0252",
        "WorkerConfFileDeploymentsCustomResource426C58D0"
      ],
    }, ResourcePart.CompleteDefinition);
  });

  test('Config files deployment', () => {
    expect(stack).toHaveResourceLike('Custom::CDKBucketDeployment', {
      "DestinationBucketName": {
        "Ref": "referencetoParentStackAssetBucket9670BCE7Ref"
      },
      "DestinationBucketKeyPrefix": "tunasync/worker/",
      "RetainOnDelete": false,
      "Prune": false
    });
    // verify tuna-worker.conf
    const confFilePath = path.join(__dirname, `../cdk.out/tuna-worker-conf-files`);
    const tunaWorkers = fs.readdirSync(confFilePath, { withFileTypes: true, }).filter((file: fs.Dirent) => file.name.match(/tuna-worker-.*\.conf/gi));
    expect(tunaWorkers).toHaveLength(1);

    const TOML = require('@iarna/toml');
    const tunaConf = TOML.parse(fs.readFileSync(`${confFilePath}/${tunaWorkers[0].name}`, 'utf-8'));
    expect(tunaConf.global.log_dir).toEqual('/mnt/efs/opentuna/log/{{.Name}}');
    expect(tunaConf.manager.api_base).toEqual('++MANAGERURL++');
    expect(tunaConf.server.hostname).toEqual('++HOSTNAME++');
    const debian = tunaConf.mirrors.find((m: { name: string }) => m.name === 'debian');
    expect(debian.rsync_options).toEqual(['--no-H']);
    const pypi = tunaConf.mirrors.find((m: { name: string }) => m.name === 'pypi');
    expect(pypi.command).toEqual('/tunasync-scripts/pypi.sh');
    const rubygems = tunaConf.mirrors.find((m: { name: string }) => m.name === 'rubygems');
    expect(rubygems.command).toEqual('/tunasync-scripts/rubygems-s3.sh');

    const cloudwatchAgents = fs.readdirSync(confFilePath, { withFileTypes: true, }).filter((file: fs.Dirent) => file.name.match(/amazon-cloudwatch-agent-.*\.conf/gi));
    expect(cloudwatchAgents).toHaveLength(1);
    const cloudwatchAgentConf = fs.readFileSync(`${confFilePath}/${cloudwatchAgents[0].name}`, 'utf-8');
    expect(cloudwatchAgentConf).toContain(' "ImageId": "${aws:ImageId}",');
  });

  test('Tunasync worker launch configuration', () => {
    const confFilePath = path.join(__dirname, `../cdk.out/tuna-worker-conf-files`);
    const tunaWorkers = fs.readdirSync(confFilePath, { withFileTypes: true, }).filter((file: fs.Dirent) => file.name.match(/tuna-worker-.*\.conf/gi));
    expect(tunaWorkers).toHaveLength(1);
    const tunasyncConfFilename = tunaWorkers[0].name;

    const cloudwatchAgents = fs.readdirSync(confFilePath, { withFileTypes: true, }).filter((file: fs.Dirent) => file.name.match(/amazon-cloudwatch-agent-.*\.conf/gi));
    expect(cloudwatchAgents).toHaveLength(1);
    const cloudAgentConfFilename = cloudwatchAgents[0].name;

    const rubygemsScript = fs.readdirSync(confFilePath, { withFileTypes: true, }).filter((file: fs.Dirent) => file.name.match(/rubygems-s3-.*\.sh/gi));
    expect(rubygemsScript).toHaveLength(1);
    const rubygemsScriptFilename = rubygemsScript[0].name;

    expect(stack).toHaveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
      "InstanceType": "c5.xlarge",
      "MetadataOptions": {
        "HttpTokens": "required"
      },      
      "AssociatePublicIpAddress": true,
      "SecurityGroups": [
        {
          "Fn::GetAtt": [
            "TunaWorkerASGInstanceSecurityGroup7903FDF8",
            "GroupId"
          ]
        },
        {
          "Ref": "referencetoParentStackTunaWorkerSG0338A104GroupId"
        }
      ],
      "UserData": {
        "Fn::Base64": {
          "Fn::Join": [
            "",
            [
              "Content-Type: multipart/mixed; boundary=\"//\"\nMIME-Version: 1.0\n\n--//\nContent-Type: text/cloud-config; charset=\"us-ascii\"\nMIME-Version: 1.0\nContent-Transfer-Encoding: 7bit\nContent-Disposition: attachment; filename=\"cloud-config.txt\"\n\n#cloud-config\nrepo_update: true\nrepo_upgrade: all\npackages:\n - nfs-utils\n - amazon-efs-utils\n - python3-pip\n - git\n - awscli\n - docker\n - amazon-cloudwatch-agent\n - gcc\n - python3-devel\n\n# run commands\nruncmd:\n - file_system_id_1=fs-012345\n - efs_mount_point_1=/mnt/efs/opentuna\n - mkdir -p \"${efs_mount_point_1}\"\n - test -f \"/sbin/mount.efs\" && echo \"${file_system_id_1}:/ ${efs_mount_point_1} efs tls,_netdev\" >> /etc/fstab || echo \"${file_system_id_1}.efs.cn-north-1.amazonaws.com.cn:/ ${efs_mount_point_1} nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,_netdev 0 0\" >> /etc/fstab\n - test -f \"/sbin/mount.efs\" && echo -e \"\\n[client-info]\\nsource=liw\" >> /etc/amazon/efs/efs-utils.conf\n - mount -a -t efs,nfs4 defaults\n - tunaversion=v0.7.0\n - tunafile=\"${efs_mount_point_1}/tunasync/install/tunasync-linux-amd64-bin-${tunaversion}.tar.gz\"\n - (test -f ${tunafile} && tar -xf ${tunafile} -C /usr/local/bin/) || (wget -t 20 --retry-connrefused -w 5 -T 10 -c https://github.com/tuna/tunasync/releases/download/${tunaversion}/tunasync-linux-amd64-bin.tar.gz -O - | tar xzf -  -C /usr/local/bin/)\n - amazon-linux-extras install python3.8\n - export PIP_DEFAULT_TIMEOUT=20; pip3.8 install -i https://pypi.tuna.tsinghua.edu.cn/simple 'bandersnatch==5.3.0' 'packaging==21.3' || pip3.8 install -i https://pypi.douban.com/simple 'bandersnatch==5.3.0' 'packaging==21.3'\n - tunascript_bin=\"${efs_mount_point_1}/tunasync/install/tunasync-scripts.tar.gz\"\n - tunascriptpath=/tunasync-scripts\n - mkdir -p ${tunascriptpath}\n - (test -f ${tunascript_bin} && tar -xf ${tunascript_bin} -C ${tunascriptpath}) || (git clone https://github.com/tuna/tunasync-scripts.git ${tunascriptpath})\n\ncloud_final_modules:\n- [scripts-user, always]\n--//\nContent-Type: text/x-shellscript; charset=\"us-ascii\"\nMIME-Version: 1.0\nContent-Transfer-Encoding: 7bit\nContent-Disposition: attachment; filename=\"userdata.txt\"\n\n#!/bin/bash -xe\nwhich bandersnatch || exit 10 # mandantory checking bandersnatch installed\nHOSTNAME=`hostname`\nMANAGERURL=\"http://tunasync-manager:80\"\nTUNA_REPO_BUCKET=\"",
              {
                "Ref": "referencetoParentStackTunaRepoBucketBFDC0FF9Ref"
              },
              "\"\nmkdir -p /etc/tunasync/\n\nexport AWS_DEFAULT_REGION=cn-north-1\n\n# create tunasync work config\naws s3 cp s3://",
              {
                "Ref": "referencetoParentStackAssetBucket9670BCE7Ref"
              },
              `/tunasync/worker/${tunasyncConfFilename} /etc/tunasync/worker.conf\nsed -i \"s|++HOSTNAME++|$HOSTNAME|g\" /etc/tunasync/worker.conf\nsed -i \"s|++MANAGERURL++|$MANAGERURL|g\" /etc/tunasync/worker.conf\nsed -i \"s|++TUNA_REPO_BUCKET++|$TUNA_REPO_BUCKET|g\" /etc/tunasync/worker.conf\n\n# create tunasync service\ncat > /usr/lib/systemd/system/tunasync.service << EOF\n[Unit]\nDescription=Tunasync Worker daemon\n\n[Service]\nExecStart=/usr/local/bin/tunasync worker -config /etc/tunasync/worker.conf\nExecReload=/bin/kill -HUP \\$MAINPID\nType=simple\nKillMode=control-group\nRestart=on-failure\nRestartSec=20s\nStandardOutput=syslog\nStandardError=syslog\nSyslogIdentifier=tunasync\n\n[Install]\nWantedBy=multi-user.target\nEOF\n\ncat > /etc/rsyslog.d/tunasync.conf << EOF\nif \\$programname == 'tunasync' then /var/log/tunasync.log\n& stop\nEOF\n\n# setup rubygems script\naws s3 cp s3://`,
              {
                "Ref": "referencetoParentStackAssetBucket9670BCE7Ref"
              },
              `/tunasync/worker/${rubygemsScriptFilename} /tunasync-scripts/rubygems-s3.sh\nchmod +x /tunasync-scripts/rubygems-s3.sh\n\n# start tunasync service\nsystemctl daemon-reload\nsystemctl restart rsyslog\nsystemctl enable tunasync.service\nsystemctl start tunasync.service\nsystemctl enable docker.service\nsystemctl start docker.service\n\n# configure conf json of CloudWatch agent\nmkdir -p /opt/aws/amazon-cloudwatch-agent/etc/\naws s3 cp s3://`,
              {
                "Ref": "referencetoParentStackAssetBucket9670BCE7Ref"
              },
              `/tunasync/worker/${cloudAgentConfFilename} /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json\n\n# start cloudwatch agent\n/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s &\n--//`
            ]
          ]
        }
      }
    });
  });

  test('Tunasync worker running with IAM profile role having SSM managed policy and cloudwatch agent', () => {
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
          "Value": "TunaWorker"
        }
      ]
    });
    expect(stack).toHaveResource('AWS::IAM::InstanceProfile', {
      "Roles": [
        {
          "Ref": "OpenTunaTunaWorkerEC2Role79F8475A"
        }
      ]
    });
    expect(stack).toHaveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
      "IamInstanceProfile": {
        "Ref": "TunaWorkerASGInstanceProfile8F23D0B2"
      },
    });
  });

  test('Tunasync worker process running alarm', () => {
    expect(stack).toHaveResourceLike('AWS::CloudWatch::Alarm', {
      "ComparisonOperator": "LessThanThreshold",
      "EvaluationPeriods": 3,
      "ActionsEnabled": true,
      "AlarmActions": [
        {
          "Ref": "referencetoParentStackTestTopicCEBA4F88Ref"
        }
      ],
      "Dimensions": [
        {
          "Name": "AutoScalingGroupName",
          "Value": {
            "Ref": "TunaWorkerASG0CF9EDEF"
          }
        }
      ],
      "MetricName": "procstat_lookup_pid_count",
      "Namespace": "OpenTuna",
      "OKActions": [
        {
          "Ref": "referencetoParentStackTestTopicCEBA4F88Ref"
        }
      ],
      "Period": 60,
      "Statistic": "Sum",
      "Threshold": 1,
      "TreatMissingData": "breaching"
    });
  });

});