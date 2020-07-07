import * as cdk from '@aws-cdk/core';
import ec2 = require("@aws-cdk/aws-ec2");

export class NetworkStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const stack = cdk.Stack.of(this);

    const vpc = new ec2.Vpc(this, 'OpenTunaVPC', {
      cidr: '10.58.0.0/16',
      enableDnsHostnames: true,
      enableDnsSupport: true,
      maxAzs: 3,
      subnetConfiguration: [
        {
          cidrMask: 22,
          name: 'ingress',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 19,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE
        }
      ]
    });
    vpc.addGatewayEndpoint('S3GatewayEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    cdk.Tag.add(this, 'usage', 'network');

    new cdk.CfnOutput(this, 'VPCId', {
      value: `${vpc.vpcId}`,
      exportName: `${stack.stackName}-VPCId`,
      description: 'Vpc id'
    });    
  }
}
