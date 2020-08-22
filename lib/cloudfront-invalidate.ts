// some code below is learned from source code of aws-cdk:
// https://github.com/aws/aws-cdk/blob/master/packages/%40aws-cdk/aws-s3-deployment/lib/bucket-deployment.ts
// which is licensed under Apache-2.0

import * as cdk from '@aws-cdk/core';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';

export interface CloudFrontInvalidateProps {
    readonly distribution: cloudfront.IDistribution;
    readonly distributionPaths: string[];
    // distribution is updated when `updateKey` changes
    readonly updateKey: string;
}

export class CloudFrontInvalidate extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, props: CloudFrontInvalidateProps) {
        super(scope, id);

        const handler = new lambda.SingletonFunction(this, `${id}CustomResourceHandler`, {
            uuid: 'CloudFrontInvalidateSingletonFunction',
            code: lambda.Code.fromAsset(path.join(__dirname, './lambda.d/cloudfront-invalidate')),
            runtime: lambda.Runtime.PYTHON_3_8,
            handler: 'index.handler',
            timeout: cdk.Duration.minutes(10),
        });

        // policy to access cloudfront
        handler.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['cloudfront:GetInvalidation', 'cloudfront:CreateInvalidation'],
            resources: ['*'],
        }));

        new cdk.CustomResource(this, 'CustomResource', {
            serviceToken: handler.functionArn,
            resourceType: 'Custom::CloudFrontInvalidate',
            properties: {
                DistributionId: props.distribution.distributionId,
                DistributionPaths: props.distributionPaths,
                UpdateKey: props.updateKey,
            },
        });
    }
}