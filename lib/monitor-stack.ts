import * as cdk from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import * as lambda from '@aws-cdk/aws-lambda';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecr from '@aws-cdk/aws-ecr';
import * as sns from '@aws-cdk/aws-sns';
import * as path from 'path';
import { getMirrorTestingConfig } from './mirror-config';

export interface MonitorProps extends cdk.NestedStackProps {
    readonly vpc: ec2.IVpc;
    readonly notifyTopic: sns.ITopic;
    readonly tunaManagerUrl: string;
    readonly tunaManagerALBSG: ec2.SecurityGroup;
    readonly domainName?: string;
}

export class MonitorStack extends cdk.NestedStack {
    constructor(scope: cdk.Construct, id: string, props: MonitorProps) {
        super(scope, id, props);

        const tunasyncActionSG = new ec2.SecurityGroup(this, "TunasyncActionSG", {
            vpc: props.vpc,
            description: "SG of Tunasync Action",
            allowAllOutbound: true,
        });
        const tunasyncAction = new lambda.Function(this, 'TunasyncHandler', {
            vpc: props.vpc,
            securityGroups: [tunasyncActionSG],
            handler: 'index.handler',
            runtime: lambda.Runtime.PYTHON_3_8,
            code: lambda.Code.fromAsset(path.join(__dirname, './lambda.d/tunasync-handler')),
            environment: {
                TUNASYNC_MANAGER_URL: props.tunaManagerUrl,
            },
        });
        props.tunaManagerALBSG.addIngressRule(tunasyncActionSG, ec2.Port.tcp(80), 'Allow tunasync handler Lambda function to access tunasync manager');

        const stage = this.node.tryGetContext('stage') || 'prod';
        if (props.domainName) {
            for (let cfg of getMirrorTestingConfig(stage, props.domainName)) {
                // don't exceed the limit of event targets
                const event = new events.Rule(this, `MonitorRule${cfg.name}`, {
                    schedule: events.Schedule.expression('rate(30 minutes)'),
                });
                for (let image of cfg.images) {
                    let dockerImage: codebuild.IBuildImage = codebuild.LinuxBuildImage.fromDockerRegistry(image);
                    if (this.region.startsWith('cn-')) {
                        let [repo, tag] = image.split(':');
                        let nwcdRepo = ecr.Repository.fromRepositoryArn(this, `NWCDRepo${cfg.name}${image}`, `arn:aws-cn:ecr:cn-northwest-1:048912060910:repository/dockerhub/${repo}`);
                        // use nwcd mirror from https://github.com/nwcdlabs/container-mirror
                        dockerImage = codebuild.LinuxBuildImage.fromEcrRepository(nwcdRepo, tag);
                    }

                    const project = new codebuild.Project(this, `MonitorProjectFor${cfg.name}${image}`, {
                        timeout: cdk.Duration.minutes(30),
                        queuedTimeout: cdk.Duration.minutes(10),
                        concurrentBuildLimit: 1,
                        environment: {
                            buildImage: dockerImage,
                        },
                        buildSpec: codebuild.BuildSpec.fromObject({
                            version: 0.2,
                            phases: {
                                build: {
                                    commands: cfg.commands,
                                }
                            }
                        })
                    });
                    event.addTarget(new targets.CodeBuildProject(project));

                    // Notify SNS Topic
                    project.onBuildFailed(`MonitorProjectFor${cfg.name}${image}FailedSNS`, {
                        target: new targets.SnsTopic(props.notifyTopic, {
                            message: events.RuleTargetInput.fromObject({
                                type: 'repo-sanity',
                                sanityTarget: cfg.name,
                                sanityProjectImage: image,
                                sanityProjectName: events.EventField.fromPath('$.detail.project-name'),
                                sanityBuildStatus: events.EventField.fromPath('$.detail.build-status'),
                                account: events.EventField.account,
                                sanityBuildId: events.EventField.fromPath('$.detail.build-id'),
                            }),
                        })
                    });

                    // Trigger Lambda function to start syncing
                    project.onBuildFailed(`MonitorProjectFor${cfg.name}${image}FailedLambda`, {
                        target: new targets.LambdaFunction(tunasyncAction, {
                            event: events.RuleTargetInput.fromObject({
                                name: cfg.name,
                                repo: cfg.repo,
                                image: image,
                            }),
                        })
                    });
                }
            }
        }
    }
}