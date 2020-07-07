import { expect as expectCDK, haveResource } from '@aws-cdk/assert';
import * as cxschema from '@aws-cdk/cloud-assembly-schema';
import * as cxapi from '@aws-cdk/cx-api';
import * as cdk from '@aws-cdk/core';
import * as storage from '../lib/storage-stack';
import ec2 = require("@aws-cdk/aws-ec2");
import '@aws-cdk/assert/jest';

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
    cdk.Tag.add(app, 'app', `OpenTuna`);
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
          "Key": "Name",
          "Value": "OpenTunaStorageStack/OpenTunaEfsFileSystem"
        },
        {
          "Key": "usage",
          "Value": "storage"
        }
      ],
      "LifecyclePolicies": [
        {
          "TransitionToIA": "AFTER_14_DAYS"
        }
      ],
      "PerformanceMode": "generalPurpose",
      "ThroughputMode": "bursting"
    });
  });

  test('Security group for EFS filesystem', () => {
    const previous = mockVpcContextProviderWith({
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
      restoreContextProvider(previous);
    }
  });

  test('FileSystemId output', () => {
    expect(stack).toHaveOutput({
      outputName: 'FileSystemId',
      exportName: `${stack.stackName}-FileSystemId`,
    });
  });
});

interface MockVcpContextResponse {
  readonly vpcId: string;
  readonly vpcCidrBlock: string;
  readonly subnetGroups: cxapi.VpcSubnetGroup[];
}

function mockVpcContextProviderWith(
  response: MockVcpContextResponse,
  paramValidator?: (options: cxschema.VpcContextQuery) => void) {
  const previous = cdk.ContextProvider.getValue;
  cdk.ContextProvider.getValue = (_scope: cdk.Construct, options: cdk.GetContextValueOptions) => {
    // do some basic sanity checks
    expect(options.provider).toEqual(cxschema.ContextProvider.VPC_PROVIDER);

    if (paramValidator) {
      paramValidator(options.props as any);
    }

    return {
      value: {
        availabilityZones: [],
        isolatedSubnetIds: undefined,
        isolatedSubnetNames: undefined,
        isolatedSubnetRouteTableIds: undefined,
        privateSubnetIds: undefined,
        privateSubnetNames: undefined,
        privateSubnetRouteTableIds: undefined,
        publicSubnetIds: undefined,
        publicSubnetNames: undefined,
        publicSubnetRouteTableIds: undefined,
        ...response,
      } as cxapi.VpcContextResponse,
    };
  };
  return previous;
}

function restoreContextProvider(previous: (scope: cdk.Construct, options: cdk.GetContextValueOptions) => cdk.GetContextValueResult): void {
  cdk.ContextProvider.getValue = previous;
}