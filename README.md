# Open Tuna project!

This is the infrasture project of Open Tuna on AWS. It consits of below stacks,

- Network stack(optional)
  - Create a dedicated VPC with public and private subnets across three AZs with NAT gateways
  - Create S3 Endpoint

## Prerequisites
TBA

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

### How to deploy network stack(optional)
```shell
npx cdk deploy OpenTunaNetworkStack
```

[configure-aws-cli]: https://docs.aws.amazon.com/zh_cn/cli/latest/userguide/cli-chap-configure.html