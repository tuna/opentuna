import * as cdk from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import * as Tuna from '../lib/tuna-worker';
import * as mock from './vpc-mock';
import ec2 = require('@aws-cdk/aws-ec2');
import sns = require('@aws-cdk/aws-sns');
import '@aws-cdk/assert/jest';

describe('Tunasync worker stack', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  const vpcId = 'vpc-123456';
  let previous: (scope: cdk.Construct, options: cdk.GetContextValueOptions) => cdk.GetContextValueResult;

  beforeAll(() => {
    previous = mock.mockVpcContextProviderWith({
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
        stage: 'testing',
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
    });
  });

  test('Tunasync worker auto scaling group created', () => {
    expect(stack).toHaveResourceLike('AWS::AutoScaling::AutoScalingGroup', {
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
    });
  });

  test('Tunasync worker launch configuration', () => {
    expect(stack).toHaveResourceLike('AWS::AutoScaling::LaunchConfiguration', {
      "InstanceType": "c5.xlarge",
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
        "Fn::Base64": "Content-Type: multipart/mixed; boundary=\"//\"\nMIME-Version: 1.0\n\n--//\nContent-Type: text/cloud-config; charset=\"us-ascii\"\nMIME-Version: 1.0\nContent-Transfer-Encoding: 7bit\nContent-Disposition: attachment; filename=\"cloud-config.txt\"\n\n#cloud-config\nrepo_update: true\nrepo_upgrade: all\npackages:\n - nfs-utils\n - amazon-efs-utils\n - python3-pip\n - git\n\n# run commands\nruncmd:\n - file_system_id_1=fs-012345\n - efs_mount_point_1=/mnt/efs/opentuna\n - mkdir -p \"${efs_mount_point_1}\"\n - test -f \"/sbin/mount.efs\" && echo \"${file_system_id_1}:/ ${efs_mount_point_1} efs tls,_netdev\" >> /etc/fstab || echo \"${file_system_id_1}.efs.cn-north-1.amazonaws.com.cn:/ ${efs_mount_point_1} nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,_netdev 0 0\" >> /etc/fstab\n - test -f \"/sbin/mount.efs\" && echo -e \"\\n[client-info]\\nsource=liw\" >> /etc/amazon/efs/efs-utils.conf\n - mount -a -t efs,nfs4 defaults\n - tunaversion=v0.6.6\n - tunafile=\"${efs_mount_point_1}/tunasync/install/tunasync-linux-bin-${tunaversion}.tar.bz2\"\n - (test -f ${tunafile} && tar -xf ${tunafile} -C /usr/local/bin/) || (wget -c https://github.com/tuna/tunasync/releases/download/${tunaversion}/tunasync-linux-bin.tar.bz2 -O - | tar xjf -  -C /usr/local/bin/)\n - export PIP_DEFAULT_TIMEOUT=20; pip3 install -i https://pypi.tuna.tsinghua.edu.cn/simple 'bandersnatch<4.0' || pip3 install -i https://pypi.douban.com/simple 'bandersnatch<4.0'\n - tunascript_bin=\"${efs_mount_point_1}/tunasync/install/tunasync-scripts.tar.gz\"\n - tunascriptpath=/tunasync-scripts\n - mkdir -p ${tunascriptpath}\n - (test -f ${tunascript_bin} && tar -xf ${tunascript_bin} -C ${tunascriptpath}) || (git clone https://github.com/tuna/tunasync-scripts.git ${tunascriptpath})\n - rpm -i https://s3.cn-north-1.amazonaws.com.cn/amazoncloudwatch-agent-cn-north-1/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm\n\ncloud_final_modules:\n- [scripts-user, always]\n--//\nContent-Type: text/x-shellscript; charset=\"us-ascii\"\nMIME-Version: 1.0\nContent-Transfer-Encoding: 7bit\nContent-Disposition: attachment; filename=\"userdata.txt\"\n\n#!/bin/bash -xe\nHOSTNAME=`hostname`\nREPO_ROOT=/mnt/efs/opentuna\nTUNASCRIPT_PATH=/tunasync-scripts\nmkdir -p /etc/tunasync/\n\n# create tunasync work config\ncat > /etc/tunasync/worker.conf << EOF\n[global]\nname = \"tunasync-worker\"\nlog_dir = \"${REPO_ROOT}/log/{{.Name}}\"\nmirror_dir = \"${REPO_ROOT}/data/\"\nconcurrent = 10\ninterval = 1\nretry = 5\n\n[manager]\napi_base = \"http://tunasync-manager:80\"\ntoken = \"\"\nca_cert = \"\"\n\n[cgroup]\nenable = false\n\n[server]\nhostname = \"$HOSTNAME\"\nlisten_addr = \"0.0.0.0\"\nlisten_port = 80\nssl_cert = \"\"\nssl_key = \"\"\n\n[[mirrors]]\nname = \"elrepo\"\ninterval = 720\nretry = 10\nprovider = \"rsync\"\nupstream = \"rsync://ftp.yz.yamagata-u.ac.jp/pub/linux/RPMS/elrepo/\"\n[[mirrors]]\nname = \"pypi\"\ninterval = 5\nprovider = \"command\"\nupstream = \"https://pypi.python.org/\"\ncommand = \"$TUNASCRIPT_PATH/pypi.sh\"\n        [mirrors.env]\n        INIT = \"0\"\nEOF\n\n# create tunasync service\ncat > /usr/lib/systemd/system/tunasync.service << EOF\n[Unit]\nDescription=Tunasync Worker daemon\n\n[Service]\nExecStart=/usr/local/bin/tunasync worker -config /etc/tunasync/worker.conf\nExecReload=/bin/kill -HUP \\$MAINPID\nType=simple\nKillMode=control-group\nRestart=on-failure\nRestartSec=20s\nStandardOutput=syslog\nStandardError=syslog\nSyslogIdentifier=tunasync\n\n[Install]\nWantedBy=multi-user.target\nEOF\n\ncat > /etc/rsyslog.d/tunasync.conf << EOF\nif \\$programname == 'tunasync' then /var/log/tunasync.log\n& stop\nEOF\n\n# start tunasync service\nsystemctl daemon-reload\nsystemctl restart rsyslog\nsystemctl enable tunasync.service\nsystemctl start tunasync.service\n\n# configure conf json of CloudWatch agent\nmkdir -p /opt/aws/amazon-cloudwatch-agent/etc/\ncat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << EOF\n{\n\"metrics\": {\n        \"namespace\": \"OpenTuna\",\n        \"append_dimensions\": {\n        \"ImageId\": \"\\${aws:ImageId}\",\n        \"InstanceId\": \"\\${aws:InstanceId}\",\n        \"InstanceType\": \"\\${aws:InstanceType}\",\n        \"AutoScalingGroupName\": \"\\${aws:AutoScalingGroupName}\"\n        },\n        \"aggregation_dimensions\" : [[\"AutoScalingGroupName\"]],\n        \"metrics_collected\": {\n        \"procstat\": [\n                {\n                \"exe\": \"tunasync\",\n                \"measurement\": [\n                        \"pid_count\"\n                ]\n                }\n        ]\n        }\n},\n\"logs\": {\n        \"logs_collected\": {\n        \"files\": {\n                \"collect_list\": [\n                {\n                        \"file_path\": \"/var/log/tunasync.log\",\n                        \"log_group_name\": \"/opentuna/testing/tunasync/worker\",\n                        \"log_stream_name\": \"{instance_id}_{hostname}\",\n                        \"timestamp_format\": \"%H: %M: %S%y%b%-d\",\n                        \"timezone\": \"UTC\"\n                }\n                ,\n                {\n                        \"file_path\": \"/mnt/efs/opentuna/log/elrepo/elrepo_**\",\n                        \"log_group_name\": \"/opentuna/testing/tunasync/mirrors/elrepo\",\n                        \"log_stream_name\": \"{instance_id}_{hostname}\",\n                        \"timestamp_format\": \"%H: %M: %S%y%b%-d\",\n                        \"timezone\": \"UTC\"\n                }\n                ,\n                {\n                        \"file_path\": \"/mnt/efs/opentuna/log/pypi/pypi_**\",\n                        \"log_group_name\": \"/opentuna/testing/tunasync/mirrors/pypi\",\n                        \"log_stream_name\": \"{instance_id}_{hostname}\",\n                        \"timestamp_format\": \"%Y-%m-%d %H:%M:%S\",\n                        \"multi_line_start_pattern\": \"^\\\\\\\\d{4}-\\\\\\\\d{2}-\\\\\\\\d{2}\\\\\\\\s\\\\\\\\d{2}:\\\\\\\\d{2}:\\\\\\\\d{2},\\\\\\\\d{3}\",\n                        \"timezone\": \"UTC\"\n                }\n                ]\n        }\n        },\n        \"log_stream_name\": \"open-mirror-default-stream-name\"\n}\n}\nEOF\n\n# start cloudwatch agent\n/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s &\n--//"
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