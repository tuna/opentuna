import * as cdk from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');
import sns = require('@aws-cdk/aws-sns');
import { TunaManagerStack } from './tuna-manager';

export interface OpenTunaStackProps extends cdk.StackProps {
  readonly vpcId: string;
  readonly fileSystemId: string;
  readonly notifyTopic: sns.ITopic;
}
export class OpentunaStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: OpenTunaStackProps) {
    super(scope, id, props);

    const stack = cdk.Stack.of(this);

    const vpc = ec2.Vpc.fromLookup(this, `VPC-${props.vpcId}`, {
      vpcId: props.vpcId,
    });

    const tunaManagerSG = new ec2.SecurityGroup(this, "TunaManagerSG", {
      vpc,
      description: "SG of Tuna Manager",
      allowAllOutbound: true,
    });
    const tunaManagerALBSG = new ec2.SecurityGroup(this, "TunaManagerALBSG", {
      vpc,
      description: "SG of ALB of Tuna Manager",
      allowAllOutbound: false,
    });

    // Tuna Manager stack
    const tunaManagerStack = new TunaManagerStack(this, 'TunaManagerStack', {
      vpc,
      fileSystemId: props.fileSystemId,
      notifyTopic: props.notifyTopic,
      tunaManagerSG,
      tunaManagerALBSG,
      timeout: cdk.Duration.minutes(10),
    });
  }
}
