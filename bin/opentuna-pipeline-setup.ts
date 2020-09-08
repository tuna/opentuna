#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';

const app = new cdk.App();

const appPrefix = app.node.tryGetContext('stackPrefix') || 'OpenTuna';
const env = {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
};

const suffix = app.node.tryGetContext('stackSuffix') || '';

const trustedAccount = app.node.tryGetContext('trustedAccount');
if (!trustedAccount) {
    throw new Error(`Pls specify the trusted account for pipeline deployment via context 'trustedAccount'.`);
}

const stack = new cdk.Stack(app, `PipelineCrossAccountDeploymentSetupStack`, {
    env,
});

// the role to assume when the CDK is in write mode, i.e. deploy
// allow roles from the trusted account to assume this role
const openTunaDeployRole = new iam.Role(stack, 'DeployRole', {
    assumedBy: new iam.AccountPrincipal(trustedAccount),
    roleName: `opentuna-deployment-trust-${trustedAccount}-role`,
});

// Attach the AdministratorAccess policy to this role.
openTunaDeployRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

cdk.Tags.of(app).add('app', `${appPrefix}${suffix}`);

new cdk.CfnOutput(stack, `DeployRoleFor${trustedAccount}`, {
    value: `${openTunaDeployRole.roleArn}`,
    description: `Deployment role for trusted account ${trustedAccount}.`
});