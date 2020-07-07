#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import ec2 = require("@aws-cdk/aws-ec2");
import { NetworkStack } from '../lib/network-stack';

const app = new cdk.App();

const appPrefix = app.node.tryGetContext('stackPrefix') || 'OpenTuna';
const env = { 
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
};

const suffix = app.node.tryGetContext('stackSuffix') || '';

new NetworkStack(app, `${appPrefix}NetworkStack${suffix}`, {
    env,
});

cdk.Tag.add(app, 'app', `${appPrefix}${suffix}`);