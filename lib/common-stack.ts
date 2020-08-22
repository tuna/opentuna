import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sns from '@aws-cdk/aws-sns';
import * as sns_sub from '@aws-cdk/aws-sns-subscriptions';
import * as path from 'path';

export class CommonStack extends cdk.Stack {
    readonly notifyTopic: sns.ITopic;

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.notifyTopic = new sns.Topic(this, 'NotificationTopic', {
            displayName: `OpenTuna Notification subscription topic'.`
        });
        const accountPublishPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [
                new iam.AnyPrincipal(),
            ],
        });
        accountPublishPolicy.addActions(
            "SNS:GetTopicAttributes",
            "SNS:ListSubscriptionsByTopic",
            "SNS:Publish",
        );
        accountPublishPolicy.addCondition('ArnLike', {
            'AWS:SourceArn': cdk.Arn.format({
                service: 'cloudwatch',
                resource: 'alarm',
                sep: ':',
                resourceName: '*',
            }, cdk.Stack.of(this))
        });
        accountPublishPolicy.addResources(this.notifyTopic.topicArn);
        this.notifyTopic.addToResourcePolicy(accountPublishPolicy);

        const slackHookUrl = this.node.tryGetContext('slackHookUrl');
        if (slackHookUrl) {
            const slackSubscription = new lambda.Function(this, 'slack-subscription', {
                handler: 'index.handler',
                runtime: lambda.Runtime.PYTHON_3_8,
                code: lambda.Code.fromAsset(path.join(__dirname, './lambda.d/slack-webhook')),
                environment: {
                    SLACK_WEBHOOK_URL: slackHookUrl,
                },
            });
            this.notifyTopic.addSubscription(new sns_sub.LambdaSubscription(slackSubscription));
        }

        cdk.Tag.add(this, 'component', 'common');
    }
}