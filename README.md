# Open Tuna project!

This is the infrasture project of Open Tuna on AWS. It consits of below independent stacks,

- Network stack(optional)
  - Create a dedicated VPC with public and private subnets across three AZs with NAT gateways
  - Create S3 Endpoint
- Storage stack(optional)
  - EFS file system

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

[configure-aws-cli]: https://docs.aws.amazon.com/zh_cn/cli/latest/userguide/cli-chap-configure.html