import * as cdk from '@aws-cdk/core';
import * as sns from '@aws-cdk/aws-sns';
import * as cxapi from '@aws-cdk/cx-api';
import * as Tuna from '../lib/monitor-stack';
import * as mock from './context-provider-mock';
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

    stack = new Tuna.MonitorStack(parentStack, 'AnalyticsStack', {
      domainName: 'example.com',
      notifyTopic: topic,
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
            "Image": image,
            "ImagePullCredentialsType": "SERVICE_ROLE",
            "PrivilegedMode": false,
            "Type": "LINUX_CONTAINER"
          },
        });

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
                "InputTemplate": "{\"type\":\"repo-sanity\",\"sanityTarget\":\"elrepo\",\"sanityProjectImage\":\"centos:7\",\"sanityProjectName\":<detail-project-name>,\"sanityBuildStatus\":<detail-build-status>,\"account\":<account>,\"sanityBuildId\":<detail-build-id>}"
              }
            }
          ]
        });
      }
    }
  });

});
