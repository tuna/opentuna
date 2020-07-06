import { expect as expectCDK, haveResource } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as network from '../lib/network-stack';
import '@aws-cdk/assert/jest';

describe('Network stack', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new network.NetworkStack(app, 'OpenTunaNetworkStack', {
      env: {
        region: 'cn-northwest-1',
        account: '1234567890xx',
      }
    });
    cdk.Tag.add(app, 'app', `OpenTuna`);
  });

  test('VPC created with expected cidr and tags', () => {
    expect(stack).toHaveResourceLike('AWS::EC2::VPC', {
      "CidrBlock": "10.58.0.0/16",
      "EnableDnsHostnames": true,
      "EnableDnsSupport": true,
      "Tags": [
        {
          "Key": "app",
          "Value": "OpenTuna"
        },
        {
          "Key": "Name",
          "Value": "OpenTunaNetworkStack/OpenTunaVPC"
        },
        {
          "Key": "usage",
          "Value": "network"
        }
      ]
    });
  });

  test('S3 endpoint created', () => {
    expect(stack).toHaveResource('AWS::EC2::VPCEndpoint', {
      "ServiceName": {
        "Fn::Join": [
          "",
          [
            "com.amazonaws.",
            {
              "Ref": "AWS::Region"
            },
            ".s3"
          ]
        ]
      },
      "VpcId": {
        "Ref": "OpenTunaVPC6D91E9E6"
      },
      "RouteTableIds": [
        {
          "Ref": "OpenTunaVPCprivateSubnet1RouteTable4D1FC147"
        },
        {
          "Ref": "OpenTunaVPCprivateSubnet2RouteTable1C005576"
        },
        {
          "Ref": "OpenTunaVPCprivateSubnet3RouteTableE615376C"
        },
        {
          "Ref": "OpenTunaVPCingressSubnet1RouteTableE6228C01"
        },
        {
          "Ref": "OpenTunaVPCingressSubnet2RouteTable96BCD4F0"
        },
        {
          "Ref": "OpenTunaVPCingressSubnet3RouteTable196AFDFA"
        }
      ],
      "VpcEndpointType": "Gateway"
    });
  });

  test('VPCId output', () => {
    expect(stack).toHaveOutput({
      outputName: 'VPCId',
      exportName: `${stack.stackName}-VPCId`,
    });
  });
});