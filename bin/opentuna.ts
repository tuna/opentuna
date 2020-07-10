#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { StorageStack } from '../lib/storage-stack';
import { CommonStack } from '../lib/common-stack';
import { OpentunaStack } from '../lib/opentuna-stack';

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

let fileSystemId = app.node.tryGetContext('fileSystemId');

if (!fileSystemId) {
    const storageStack = new StorageStack(app, `${appPrefix}StorageStack${suffix}`, {
        env,
        vpcId,
    });
    fileSystemId = storageStack.fileSystem.fileSystemId;
}

const commonStack = new CommonStack(app, `${appPrefix}CommonStack${suffix}`, {
    env,
});
new OpentunaStack(app, `${appPrefix}Stack${suffix}`, {
    env,
    vpcId,
    fileSystemId,
    notifyTopic: commonStack.notifyTopic,
});

cdk.Tag.add(app, 'app', `${appPrefix}${suffix}`);