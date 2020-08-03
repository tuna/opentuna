#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { OpenTunaPipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

const appPrefix = app.node.tryGetContext('stackPrefix') || 'OpenTuna';
const env = { 
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
};

const suffix = app.node.tryGetContext('stackSuffix') || '';

const vpcId = app.node.tryGetContext('vpcId');
if (!vpcId) {
    throw new Error('"vpcId" must be specified via context, for example "-c vpcId=vpc-123".');
}

new OpenTunaPipelineStack(app, `${appPrefix}PipelineStack${suffix}`, {
    env,
    vpcId,
    domainName: app.node.tryGetContext('domainName'),
    domainZone: app.node.tryGetContext('domainZone'),
    iamCertId: app.node.tryGetContext('iamCertId'),
});

cdk.Tag.add(app, 'app', `${appPrefix}${suffix}`);

app.synth();