import * as cdk from '@aws-cdk/core';
import iam = require('@aws-cdk/aws-iam');
import sns = require('@aws-cdk/aws-sns');

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

        cdk.Tag.add(this, 'component', 'common');
    }
}