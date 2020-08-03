import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import { Construct, SecretValue, Stack, StackProps } from '@aws-cdk/core';
import { CdkPipeline, SimpleSynthAction } from "@aws-cdk/pipelines";

export interface PipelineStackProps extends cdk.StackProps {
  readonly vpcId: string;
  readonly domainName?: string;
  readonly domainZone?: string;
  readonly iamCertId?: string;
}
/**
 * The stack that defines the Open Tuna pipeline
 */
export class OpenTunaPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const sourceArtifact = new codepipeline.Artifact();
    const cloudAssemblyArtifact = new codepipeline.Artifact();
 
    const domainNameOption = props.domainName ? `-c domainName=${props.domainName}` : '';
    const domainZoneOption = props.domainZone ? `-c domainName=${props.domainZone}` : '';
    const iamCertIdOption = props.iamCertId ? `-c domainName=${props.iamCertId}` : '';

    const pipeline = new CdkPipeline(this, 'Pipeline', {
      // The pipeline name
      pipelineName: 'OpenTunaPipeline',
      cloudAssemblyArtifact,

      // Where the source can be found
      sourceAction: new codepipeline_actions.GitHubSourceAction({
        actionName: 'GitHub',
        output: sourceArtifact,
        oauthToken: SecretValue.secretsManager('github-token'),
        owner: 'tuna',
        repo: 'opentuna',
        trigger: codepipeline_actions.GitHubTrigger.POLL,
        branch: 'cicd',
      }),

       // How it will be built and synthesized
       synthAction: SimpleSynthAction.standardNpmSynth({
         sourceArtifact,
         cloudAssemblyArtifact,
         synthCommand: `npx cdk synth OpenTunaStack -c vpcId=${props.vpcId} ${domainNameOption} ${domainZoneOption} ${iamCertIdOption}`
       }),
    });

    // This is where we add the application stages
    // ...

    cdk.Tag.add(this, 'component', `pipeline`);
  }
}