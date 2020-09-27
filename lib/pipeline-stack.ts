import * as api from '@aws-cdk/aws-apigateway';
import * as apiv2 from '@aws-cdk/aws-apigatewayv2';
import * as cdk from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as events from '@aws-cdk/aws-events';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda_nodejs from '@aws-cdk/aws-lambda-nodejs';
import * as path from 'path';
import * as s3 from '@aws-cdk/aws-s3';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as sns from '@aws-cdk/aws-sns';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import * as targets from '@aws-cdk/aws-events-targets';

export interface Stage {
  name: string,
  stageName?: string,
  deployContexts: DeployContexts,
  assumeRoleContexts: AssumeRoleContexts,
}

export interface DeployContexts {
  vpcId: string,
  fileSystem?: { id: string, sgId: string },
  iamCertId: string,
  domainName: string,
  domainZone: string,
  additionalOptions?: string,
}

export interface AssumeRoleContexts {
  account: string,
  roleName: string,
}

export interface PipelineStage extends cdk.StackProps {
  topic: sns.ITopic,
  uat: Stage,
  prod: Stage,
}

export class PipelineStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props: PipelineStage) {
    super(scope, id, props);

    const stack = cdk.Stack.of(this);

    const pipelineBucket = new s3.Bucket(this, 'PipelineBucket');

    // create states of step functions for pipeline
    const failure = new sfn.Fail(this, 'Fail', {});
    const end = new sfn.Succeed(this, 'Stop deploying to next stage', {
      comment: 'next stage deployment is stopped.',
    });

    const sourceBranch = this.node.tryGetContext('sourceBranch') ?? 'master';
    const buildAndTestProject = new codebuild.Project(this, 'OpenTUNABuild', {
      source: codebuild.Source.gitHub({
        owner: this.node.tryGetContext('sourceOwner') ?? 'tuna',
        repo: this.node.tryGetContext('sourceRepo') ?? 'opentuna',
        cloneDepth: 1,
        branchOrRef: sourceBranch,
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('node:12-buster'),
        privileged: true,
      },
      cache: codebuild.Cache.bucket(pipelineBucket, {
        prefix: 'pipeline/build',
      }),
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        env: {
          'exported-variables': [
            'COMMIT_HASH'
          ],
        },
        phases: {
          install: {
            commands: [
              'npm config set registry https://registry.npm.taobao.org',
              'npm run install-deps',
            ],
          },
          pre_build: {
            commands: [
              'git submodule init',
              'git submodule update --depth 1',
              'export COMMIT_HASH=`git rev-parse HEAD`',
            ],
          },
          build: {
            commands: [
              'npm run build',
              'npm run test',
            ],
          },
        },
        cache: {
          paths: [
            'node_modules/',
            '.git/modules/',
          ]
        },
      })
    });

    // TODO: pass the commit when trigger the pipeline stepfunctions
    const commitVersion = sourceBranch;

    const codeBuildTestTask = new tasks.CodeBuildStartBuild(stack, 'Build & Test', {
      project: buildAndTestProject,
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
    }).addCatch(failure, {
      errors: ['CustomError']
    }).addCatch(failure, {
      errors: ['States.ALL']
    });

    const uatDeployTask = new tasks.CodeBuildStartBuild(stack, `Deploy to ${props.uat.name} account ${props.uat.assumeRoleContexts.account}`, {
      project: this.deployToAccount(pipelineBucket, commitVersion, props.topic, props.uat),
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
    }).addCatch(failure, {
      errors: ['CustomError']
    }).addCatch(failure, {
      errors: ['States.ALL']
    });

    const prodDeployTask = new tasks.CodeBuildStartBuild(stack, `Deploy to ${props.prod.name} account ${props.prod.assumeRoleContexts.account}`, {
      project: this.deployToAccount(pipelineBucket, commitVersion, props.topic, props.prod),
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
    }).addCatch(failure, {
      errors: ['CustomError']
    }).addCatch(failure, {
      errors: ['States.ALL']
    });

    const approvalActionsFn = new lambda_nodejs.NodejsFunction(this, 'PipelineApprovalActions', {
      entry: path.join(__dirname, './lambda.pipelines.d/approver-actions/index.ts'),
      handler: 'pipelineApprovalAction'
    });
    const approvalActionsIntegration = new apiv2.LambdaProxyIntegration({
      handler: approvalActionsFn,
    });

    const pipelineApi = new apiv2.HttpApi(this, 'OpenTUNAPipelineHttpApi');
    pipelineApi.addRoutes({
      path: '/approval',
      methods: [apiv2.HttpMethod.GET],
      integration: approvalActionsIntegration,
    });

    const approverNotificationFn = new lambda_nodejs.NodejsFunction(this, 'PipelineApproverNotification', {
      entry: path.join(__dirname, './lambda.pipelines.d/approver-notification/index.ts'),
      handler: 'pipelineApproverNotification'
    });
    props.topic.grantPublish(approverNotificationFn);

    const nextStage = props.prod.name;
    const approvalTimeoutInMinutes = this.node.tryGetContext('approvalTimeoutInMinutes') ?? 60 * 24 * 3;
    const approvalTask = new tasks.LambdaInvoke(this, 'Notify approvers', {
      lambdaFunction: approverNotificationFn,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      timeout: cdk.Duration.minutes(approvalTimeoutInMinutes),
      payload: sfn.TaskInput.fromObject({
        ExecutionContext: sfn.TaskInput.fromJsonPathAt('$$').value,
        ActionEndpoint: pipelineApi.url,
        SNSTopicArn: props.topic.topicArn,
        Commit: commitVersion, // TODO: replaced by commit given executation pipelines
        NextStage: nextStage,
        Timeout: approvalTimeoutInMinutes,
        Stage: props.uat.name,
        Domain: props.uat.deployContexts.domainName,
      }),
    }).addCatch(failure, {
      errors: ['CustomError']
    }).addCatch(failure, {
      errors: ['States.ALL']
    });

    const getApproverChoice = new sfn.Choice(this, `Can the pipeline continue deploying to next stage "${nextStage}"?`);
    getApproverChoice.when(sfn.Condition.stringEquals('$.Status', 'Approved'), prodDeployTask);
    getApproverChoice.when(sfn.Condition.stringEquals('$.Status', 'Rejected'), end);

    const definition = codeBuildTestTask.next(uatDeployTask).next(approvalTask)
      .next(getApproverChoice);

    const pipeline = new sfn.StateMachine(this, 'Pipeline', {
      definition,
    });

    approvalActionsFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'states:SendTaskSuccess',
        'states:SendTaskFailure',
        'states:SendTaskHeartbeat',
      ],
      resources: [
        cdk.Arn.format({
          service: 'states',
          resource: 'stateMachine',
          sep: ':',
          resourceName: `${pipeline.stateMachineName}`,
        }, stack),
      ]
    }));

    // create restful API endpoint to start pipeline
    const pipelineRestApi = new api.RestApi(this, 'PipelineRestApi', {
      deployOptions: {
        stageName: 'pipeline',
        loggingLevel: api.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
      endpointConfiguration: {
        types: [ api.EndpointType.REGIONAL, ],
      },
    });
    const stateRole = new iam.Role(this, 'StateRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
    });
    stateRole.attachInlinePolicy(new iam.Policy(this, 'StatePolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['states:StartExecution'],
          effect: iam.Effect.ALLOW,
          resources: [pipeline.stateMachineArn],
        }),
      ],
    }));

    const errorResponses = [
      {
        selectionPattern: '400',
        statusCode: '400',
        responseTemplates: {
          'application/json': `{
            "error": "Bad input!"
          }`,
        },
      },
      {
        selectionPattern: '5\\d{2}',
        statusCode: '500',
        responseTemplates: {
          'application/json': `{
            "error": "Internal Service Error!"
          }`,
        },
      },
    ];

    const integrationResponses = [
      {
        statusCode: '200',
        responseTemplates: {
          'application/json': `{
            "executionArn": "integration.response.body.executionArn",
            "startDate": "integration.response.body.startDate"
          }`,
        },
      },
      ...errorResponses,
    ];

    const pipelineStepFunctionsIntegration = new api.AwsIntegration({
      service: 'states',
      action: 'StartExecution',
      options: {
        credentialsRole: stateRole,
        integrationResponses,
        passthroughBehavior: api.PassthroughBehavior.WHEN_NO_TEMPLATES,
        requestTemplates: {
          'application/json': `{
              "input": "{ \\\"commit\\\": \\\"$input.params('commit')\\\" }",
              "stateMachineArn": "${pipeline.stateMachineArn}"
            }`,
        },
      },
    });
    const startPath = 'start';
    pipelineRestApi.root.addResource(startPath).addMethod('PUT',
      pipelineStepFunctionsIntegration, {
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '500' }
      ]
    },
    );

    new cdk.CfnOutput(this, 'PipelineAPI', {
      value: pipelineRestApi.urlForPath(`/${startPath}`),
      exportName: 'startUrl',
      description: 'endpoint of starting OpenTUNA pipeline',
    });

    cdk.Tags.of(this).add('component', 'pipeline');
  }

  deployToAccount(
    pipelineBucket: s3.IBucket,
    sourceVersion: string,
    topic: sns.ITopic,
    stage: Stage,
  ): codebuild.IProject {
    const stack = cdk.Stack.of(this);

    const prj = new codebuild.Project(this, `OpenTuna${stage.name}Deployment`, {
      source: codebuild.Source.gitHub({
        owner: this.node.tryGetContext('sourceOwner') ?? 'tuna',
        repo: this.node.tryGetContext('sourceRepo') ?? 'opentuna',
        cloneDepth: 1,
        branchOrRef: sourceVersion,
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
        privileged: true,
        computeType: codebuild.ComputeType.SMALL,
      },
      cache: codebuild.Cache.bucket(pipelineBucket, {
        prefix: `pipeline/deployment/${stage.name}`,
      }),
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 12
            },
            commands: [
              'npm config set registry https://registry.npm.taobao.org',
              'npm ci',
            ],
          },
          pre_build: {
            commands: [
              'git submodule init',
              'git submodule update --depth 1',
            ],
          },
          build: {
            commands: [
              `ASSUME_ROLE_ARN=arn:${stack.partition}:iam::${stage.assumeRoleContexts.account}:role/${stage.assumeRoleContexts.roleName}`,
              `SESSION_NAME=deployment-to-${stage.assumeRoleContexts.account}`,
              'creds=$(mktemp -d)/creds.json',
              'echo "assuming role ${ASSUME_ROLE_ARN} with session-name ${SESSION_NAME}"',
              'aws sts assume-role --role-arn $ASSUME_ROLE_ARN --role-session-name $SESSION_NAME > $creds',
              `export AWS_ACCESS_KEY_ID=$(cat \${creds} | grep "AccessKeyId" | cut -d '"' -f 4)`,
              `export AWS_SECRET_ACCESS_KEY=$(cat \${creds} | grep "SecretAccessKey" | cut -d '"' -f 4)`,
              `export AWS_SESSION_TOKEN=$(cat \${creds} | grep "SessionToken" | cut -d '"' -f 4)`,
              `npx cdk deploy OpenTunaStack --require-approval never -v \
              -c stage=${stage.stageName ?? stage.name} \
              -c vpcId=${stage.deployContexts.vpcId} \
              ${this.getFileSystemOptions(stage.deployContexts.fileSystem)} \
              -c domainName=${stage.deployContexts.domainName} \
              -c domainZone=${stage.deployContexts.domainZone} \
              -c iamCertId=${stage.deployContexts.iamCertId} \
              ${stage.deployContexts.additionalOptions ?? ''} \
              `,
            ],
          },
        },
        cache: {
          paths: [
            'node_modules/',
            '.git/modules/',
          ]
        },
      })
    });
    prj.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: ['*'],
    }));
    prj.onBuildFailed(`${stage.name}DeployFailed`, {
      target: new targets.SnsTopic(topic, {
        message: events.RuleTargetInput.fromObject({
          type: 'pipeline',
          stage: stage.name,
          commit: sourceVersion,
          result: 'failed',
        }),
      }),
    });
    prj.onBuildSucceeded(`${stage.name}DeploySucceeded`, {
      target: new targets.SnsTopic(topic, {
        message: events.RuleTargetInput.fromObject({
          type: 'pipeline',
          stage: stage.name,
          commit: sourceVersion,
          result: 'succeeded',
        }),
      }),
    });
    return prj;
  }

  getFileSystemOptions(fileSystem?: {
    id: string, sgId: string,
  }): string {
    if (fileSystem)
      return `-c fileSystemId=${fileSystem.id} -c fileSystemSGId=${fileSystem.sgId}`;
    return '';
  }
}
