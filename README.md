# Open Tuna project!

This is the infrasture project of Open Tuna on AWS orchestrated by [AWS CDK][aws-cdk]. It consits of below independent [stacks][cfn-stack],

- Network stack(optional)
  - Create a dedicated VPC with public and private subnets across three AZs with NAT gateways
  - Create S3 Endpoint
- Storage stack(optional)
  - EFS file system
- Common stack
  - SNS notification topic
- Open Tuna stack
  - Tuna Manager stack
    - auto scaling group for tuna manager
    - intranet application load balancer for manager's API

## Prerequisites
- VPC with both public and private subnets crossing two AZs at least and NAT gateway. You can [deploy the network stack](#deploy-network-stackoptional) if you don't have a VPC sastfied the requirements.

## How to deploy it
### Prerequisites
- An AWS account
- Configure [credential of aws cli][configure-aws-cli]
- Install node.js LTS version, such as 12.x
- Install Docker Engine
   
### Install project dependencies
```shell
npm run init
```

### Deploy network stack(optional)
```shell
npm run deploy-network
```

### Deploy storage stack(optional)
```shell
npx cdk deploy OpenTunaStorageStack -c vpcId=<existing vpc Id>
```

### Deploy open tuna stack
```shell
# deploy storage and common stack as well
npx cdk deploy OpenTunaStack -c vpcId=<existing vpc Id>

# or deploy with existing EFS filesystem
npx cdk deploy OpenTunaStack -c vpcId=<existing vpc Id> -c fileSystemId=<existing filesystem id>
```

## How to test
```shell
npm run test
```

## Post deployment
- Add email addresses or other subscriptions to notification topic created in common stack. The alarm notification of tuna manager will be sent to those subscriptions.

[aws-cdk]: https://aws.amazon.com/cdk/
[cfn-stack]: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stacks.html
[configure-aws-cli]: https://docs.aws.amazon.com/zh_cn/cli/latest/userguide/cli-chap-configure.html