import * as cdk from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import { getMirrorTestingConfig } from './mirror-config';

export interface MonitorProps extends cdk.NestedStackProps {
    domainName?: string;
}

export class MonitorStack extends cdk.NestedStack {
    constructor(scope: cdk.Construct, id: string, props: MonitorProps) {
        super(scope, id, props);


        const stage = this.node.tryGetContext('stage') || 'prod';
        for (let cfg of getMirrorTestingConfig(stage)) {
            // don't exceed the limit of event targets
            const event = new events.Rule(this, `MonitorRule${cfg.name}`, {
                schedule: events.Schedule.expression('rate(30 minutes)'),
            });
            for (let image of cfg.images) {
                const project = new codebuild.Project(this, `MonitorProjectFor${image}`, {
                    environment: {
                        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry(image),
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
            }
        }
    }
}