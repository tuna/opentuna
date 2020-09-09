import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as efs from '@aws-cdk/aws-efs';

export interface StorageStackProps extends cdk.StackProps {
  readonly vpcId: string;
}

export class StorageStack extends cdk.Stack {

  readonly fileSystem: efs.IFileSystem;

  constructor(scope: cdk.Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const stack = cdk.Stack.of(this);

    const vpc = ec2.Vpc.fromLookup(this, `OpenTunaVpc`, {
      vpcId: props.vpcId,
    })
    this.fileSystem = new efs.FileSystem(this, 'OpenTunaEfsFileSystem', {
      vpc: vpc,
      encrypted: false,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_90_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    // TODO only grant connection from particular security groups.
    this.fileSystem.connections.allowDefaultPortFrom(ec2.Peer.ipv4(vpc.vpcCidrBlock),
      'allow connect from vpc');

    cdk.Tags.of(this).add('component', 'storage');

    new cdk.CfnOutput(this, 'FileSystemId', {
      value: `${this.fileSystem.fileSystemId}`,
      exportName: `${stack.stackName}-FileSystemId`,
      description: 'EFS FileSystem id'
    });

    new cdk.CfnOutput(this, 'FileSystemSGId', {
      value: `${this.fileSystem.connections.securityGroups[0].securityGroupId}`,
      exportName: `${stack.stackName}-FileSystemSGId`,
      description: 'EFS FileSystem SG id'
    });
  }
}
