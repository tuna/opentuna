import * as cdk from '@aws-cdk/core';
import * as pipeline from '../lib/pipeline-stack';
import * as sns from '@aws-cdk/aws-sns';
import '@aws-cdk/assert/jest';

describe('Pipeline stack', () => {
    let app: cdk.App;
    let stack: cdk.Stack;

    beforeEach(() => {
        app = new cdk.App();
        const env = {
            region: 'cn-northwest-1',
            account: '1234567890xx',
        };
        const commonStack = new cdk.Stack(app, 'CommonStack', {
            env,
        });
        const topic = new sns.Topic(commonStack, 'Test Topic');
        stack = new pipeline.PipelineStack(app, 'OpenTunaPipelineStack', {
            env,
            topic,
            uat: {
                name: 'UAT',
                deployContexts: {
                    vpcId: 'vpc-12345',
                    iamCertId: "iam-cert-12345",
                    domainName: "uat.mydomain.com",
                    domainZone: "uat.mydomain.com",
                },
                assumeRoleContexts: {
                    account: '123456789000',
                    roleName: 'deploy-role',
                }
            },
            prod: {
                name: 'PROD',
                deployContexts: {
                    vpcId: 'vpc-54321',
                    iamCertId: "iam-cert-54321",
                    domainName: "mydomain.com",
                    domainZone: "mydomain.com",
                },
                assumeRoleContexts: {
                    account: '123456789111',
                    roleName: 'deploy-role',
                }
            },
        });
    });

    test('step machine and api gateway integration', () => {
        expect(stack).toHaveResourceLike('AWS::ApiGateway::Method', {
            HttpMethod: "PUT",
            Integration: {
                IntegrationHttpMethod: "POST",
                PassthroughBehavior: "WHEN_NO_TEMPLATES",
                RequestTemplates: {
                    'application/json': {
                        "Fn::Join": [
                            "",
                            [
                              "{\n              \"input\": \"{ \\\"commit\\\": \\\"$input.params('commit')\\\" }\",\n              \"stateMachineArn\": \"",
                              {
                                "Ref": "PipelineC660917D"
                              },
                              "\"\n            }"
                            ]
                        ]
                    }
                },
                Type: "AWS",
                "Uri": {
                    "Fn::Join": [
                      "",
                      [
                        "arn:",
                        {
                          "Ref": "AWS::Partition"
                        },
                        ":apigateway:cn-northwest-1:states:action/StartExecution"
                      ]
                    ]
                  }
            },
        });
    });

    test('pipeline trigger url output', () => {
        expect(stack).toHaveOutput({
            exportName: `startUrl`,
        });
    });
});
