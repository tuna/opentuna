import * as cxapi from '@aws-cdk/cx-api';
import * as cdk from '@aws-cdk/core';
import * as storage from '../lib/storage-stack';
import '@aws-cdk/assert/jest';
import * as mock from './context-provider-mock';

describe('Storage stack', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new storage.StorageStack(app, 'OpenTunaStorageStack', {
      env: {
        region: 'cn-northwest-1',
        account: '1234567890xx',
      },
      vpcId: 'vpc-id',
    });
    cdk.Tags.of(app).add('app', `OpenTuna`);
  });

  test('EFS file system created with expected properties', () => {
    expect(stack).toHaveResourceLike('AWS::EFS::FileSystem', {
      "Encrypted": false,
      "FileSystemTags": [
        {
          "Key": "app",
          "Value": "OpenTuna"
        },
        {
          "Key": "component",
          "Value": "storage"
        },
        {
          "Key": "Name",
          "Value": "OpenTunaStorageStack/OpenTunaEfsFileSystem"
        }
      ],
      "LifecyclePolicies": [
        {
          "TransitionToIA": "AFTER_90_DAYS"
        }
      ],
      "PerformanceMode": "generalPurpose",
      "ThroughputMode": "bursting"
    });
  });

  test('Security group for EFS filesystem', () => {
    const previous = mock.mockContextProviderWith({
      vpcId: 'vpc-id',
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
        'vpc-id': 'vpc-id',
      });

      expect(options.subnetGroupNameTag).toEqual(undefined);
    });

    try {
      stack = new storage.StorageStack(app, 'OpenTunaStorageStackRefresh', {
        env: {
          region: 'cn-northwest-1',
          account: '1234567890xx',
        },
        vpcId: 'vpc-id',
      });

      expect(stack).toHaveResourceLike('AWS::EC2::SecurityGroup', {
        "SecurityGroupIngress": [
          {
            "CidrIp": "10.58.0.0/16",
            "Description": "allow connect from vpc",
            "FromPort": 2049,
            "IpProtocol": "tcp",
            "ToPort": 2049
          }
        ],
        "VpcId": "vpc-id"
      });
    } finally {
      mock.restoreContextProvider(previous);
    }
  });

  test('FileSystemId output', () => {
    expect(stack).toHaveOutput({
      outputName: 'FileSystemId',
      exportName: `${stack.stackName}-FileSystemId`,
    });
  });

  test('FileSystemSGId output', () => {
    expect(stack).toHaveOutput({
      outputName: 'FileSystemSGId',
      exportName: `${stack.stackName}-FileSystemSGId`,
    });
  });
});
