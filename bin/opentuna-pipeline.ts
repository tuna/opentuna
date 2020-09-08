#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import * as fs from 'fs';
import * as path from 'path';
import { PipelineStack, Stage } from '../lib/pipeline-stack';
import { CommonStack } from '../lib/common-stack';

const app = new cdk.App();

const appPrefix = app.node.tryGetContext('stackPrefix') || 'OpenTuna';
const env = { 
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
};

const suffix = app.node.tryGetContext('stackSuffix') || '';

const commonStack = new CommonStack(app, `${appPrefix}CommonStack${suffix}`, {
    env,
});

const uatJsonFile = app.node.tryGetContext('UATConf') || `../cdk.out/uat.json`;
const uat: Stage = JSON.parse(fs.readFileSync(path.join(__dirname, uatJsonFile), 'utf-8'));
const prodJsonFile = app.node.tryGetContext('ProdConf') || `../cdk.out/prod.json`;
const prod: Stage = JSON.parse(fs.readFileSync(path.join(__dirname, prodJsonFile), 'utf-8'));

new PipelineStack(app, `${appPrefix}PipelineStack${suffix}`, {
    env,
    topic: commonStack.notifyTopic,
    uat,
    prod,
});

cdk.Tags.of(app).add('app', `${appPrefix}${suffix}`);