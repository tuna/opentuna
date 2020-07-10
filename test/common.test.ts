import * as cdk from '@aws-cdk/core';
import * as Tuna from '../lib/common-stack';
import '@aws-cdk/assert/jest';

describe('Tuna Common stack', () => {
  let app: cdk.App;
  let stack: Tuna.CommonStack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new Tuna.CommonStack(app, 'CommonStack', {
      env: {
        region: 'cn-northwest-1',
        account: '1234567890xx',
      },
    });
    cdk.Tag.add(app, 'app', `OpenTuna`);
  });

  test('SNS Topic created', () => {
    expect(stack).toHaveResource('AWS::SNS::Topic', {
      "DisplayName": "OpenTuna Notification subscription topic'.",
      "Tags": [
        {
          "Key": "app",
          "Value": "OpenTuna"
        },
        {
          "Key": "component",
          "Value": "common"
        }
      ]
    });
  });

  test('Topic Policies', () => {
    expect(stack).toHaveResourceLike('AWS::SNS::TopicPolicy', {
      "PolicyDocument": {
        "Statement": [
          {
            "Action": [
              "SNS:GetTopicAttributes",
              "SNS:ListSubscriptionsByTopic",
              "SNS:Publish"
            ],
            "Condition": {
              "ArnLike": {
                "AWS:SourceArn": {
                  "Fn::Join": [
                    "",
                    [
                      "arn:",
                      {
                        "Ref": "AWS::Partition"
                      },
                      ":cloudwatch:cn-northwest-1:1234567890xx:alarm:*"
                    ]
                  ]
                }
              }
            },
            "Effect": "Allow",
            "Principal": "*",
            "Resource": {
              "Ref": "NotificationTopicEB7A0DF1"
            },
            "Sid": "0"
          }
        ],
        "Version": "2012-10-17"
      },
    });
  });

  test('Topic property assigend.', () => {
    expect(stack.notifyTopic).toBeDefined();
  });
});
