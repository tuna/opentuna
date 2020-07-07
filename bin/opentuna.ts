#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import ec2 = require("@aws-cdk/aws-ec2");
import { StorageStack } from '../lib/storage-stack';

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
const storageStack = new StorageStack(app, `${appPrefix}StorageStack${suffix}`, {
    env,
    vpcId,
});

cdk.Tag.add(app, 'app', `${appPrefix}${suffix}`);