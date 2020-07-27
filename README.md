# Open TUNA project!

This is the infrasture project of Open TUNA on AWS orchestrated by [AWS CDK][aws-cdk]. It consits of below independent [stacks][cfn-stack],

- Network stack(optional)
  - Create a dedicated VPC with public and private subnets across three AZs with NAT gateways
  - Create S3 Endpoint
- Storage stack(optional)
  - EFS file system
- Common stack
  - SNS notification topic
- Open TUNA stack
  - Tunasync Manager stack
    - auto scaling group for [tunasync][tunasync] manager
    - intranet application load balancer for manager's API
  - Tunasync Worker stack
    - auto scaling group for [tunasync][tunasync] worker
    - install necessary third party tools for mirroring tasks
    - use systemctl as daemon to start tunasync worker
    - send custom CloudWatch metrics of tunasync process info
  - Content Server stack
    - build custom nginx container
    - use Fargate service to serve mirror contents
    - internet facing appplication load balancer
  - Web Portal stack
    - use tuna/mirror-web
    - route tunasync.json to tunasync worker

## Prerequisites
- VPC with both public and private subnets crossing two AZs at least and NAT gateway. You can [deploy the network stack](#deploy-network-stackoptional) if you don't have a VPC sastfied the requirements.
- EFS file system associated with above VPC. You can deploy stack with provisioning a EFS file system without specifying the existing filesystem id of EFS.

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

Docker image for content server is automatically built and published. You can build and publish to ecr manually:

```bash
$ sudo docker build -t content-server:1.18-alpine .
$ sudo docker tag content-server:1.18-alpine ${uid}.dkr.ecr.${region}.amazonaws.com/content-server:1.18-alpine
$ sudo docker push ${uid}.dkr.ecr.${region}.amazonaws.com/content-server:1.18-alpine
```

## How to test
```shell
npm run test
```

## Post deployment
- Add email addresses or other subscriptions to notification topic created in common stack. The alarm notifications related to Open TUNA will be sent to those subscriptions.

[aws-cdk]: https://aws.amazon.com/cdk/
[cfn-stack]: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stacks.html
[configure-aws-cli]: https://docs.aws.amazon.com/zh_cn/cli/latest/userguide/cli-chap-configure.html
[tunasync]: https://github.com/tuna/tunasync