import * as cdk from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import * as Tuna from '../lib/monitor-stack';
import * as mock from './context-provider-mock';
import '@aws-cdk/assert/jest';

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

    stack = new Tuna.MonitorStack(parentStack, 'AnalyticsStack', {
      domainName: 'example.com',
    });
  });

  test('s3 bucket for canary created', () => {
    expect(stack).toHaveResource('AWS::S3::Bucket');
  });

  test('CloudFront homepage canary created', () => {
    expect(stack).toHaveResourceLike('AWS::Synthetics::Canary', {
      "ArtifactS3Location": {
        "Fn::Join": [
          "",
          [
            "s3://",
            {
              "Ref": "CanaryBucket3FE82AD4"
            },
            "/CloudFrontHomepage/"
          ]
        ]
      },
      "ExecutionRoleArn": {
        "Fn::GetAtt": [
          "CloudFrontHomepageCanaryServiceRole8FD919D6",
          "Arn"
        ]
      },
      "Name": "cloudfronthomepage",
      "RuntimeVersion": "syn-1.0",
      "Schedule": {
        "DurationInSeconds": "0",
        "Expression": "rate(5 minutes)"
      },
      "StartCanaryAfterCreation": true,
    });
  });

  test('ALB homepage canary created', () => {
    expect(stack).toHaveResourceLike('AWS::Synthetics::Canary', {
      "ArtifactS3Location": {
        "Fn::Join": [
          "",
          [
            "s3://",
            {
              "Ref": "CanaryBucket3FE82AD4"
            },
            "/ALBHomepage/"
          ]
        ]
      },
      "ExecutionRoleArn": {
        "Fn::GetAtt": [
          "ALBHomepageCanaryServiceRole040A4260",
          "Arn"
        ]
      },
      "Name": "albhomepage",
      "RuntimeVersion": "syn-1.0",
      "Schedule": {
        "DurationInSeconds": "0",
        "Expression": "rate(5 minutes)"
      },
      "StartCanaryAfterCreation": true,
    });
  });

  test('Tuna status canary created', () => {
    expect(stack).toHaveResourceLike('AWS::Synthetics::Canary', {
      "ArtifactS3Location": {
        "Fn::Join": [
          "",
          [
            "s3://",
            {
              "Ref": "CanaryBucket3FE82AD4"
            },
            "/TunasyncStatus/"
          ]
        ]
      },
      "ExecutionRoleArn": {
        "Fn::GetAtt": [
          "TunasyncStatusCanaryServiceRoleC8BD849B",
          "Arn"
        ]
      },
      "Name": "tunasyncstatus",
      "RuntimeVersion": "syn-1.0",
      "Schedule": {
        "DurationInSeconds": "0",
        "Expression": "rate(5 minutes)"
      },
      "StartCanaryAfterCreation": true,
    });
  });
});
