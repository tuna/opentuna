import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as sns from '@aws-cdk/aws-sns';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as iam from '@aws-cdk/aws-iam';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import * as route53 from '@aws-cdk/aws-route53';

export interface CertificateProps extends cdk.NestedStackProps {
    readonly vpc: ec2.IVpc;
    readonly notifyTopic: sns.ITopic;
    readonly hostedZone: route53.IHostedZone;
    readonly contactEmail: string;
}

export class CertificateStack extends cdk.NestedStack {
    constructor(scope: cdk.Construct, id: string, props: CertificateProps) {
        super(scope, id, props);

        const domainName = props.hostedZone.zoneName;
        const project = new codebuild.Project(this, `CertificateProject`, {
            environment: {
                buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('debian:buster'),
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: 0.2,
                phases: {
                    build: {
                        commands: [
                            "sed -E -i \"s/(deb.debian.org|security.debian.org)/opentuna.cn/\" /etc/apt/sources.list",
                            "apt-get update",
                            "apt-get install -y python3-pip curl unzip",
                            "curl --retry 3 --retry-delay 5 https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o awscliv2.zip",
                            "unzip awscliv2.zip",
                            "./aws/install",
                            "pip3 install -i https://opentuna.cn/pypi/web/simple certbot==1.9.0 certbot-dns-route53==1.9.0 cryptography==3.1.1",
                            "certbot certonly --dns-route53 -d $DOMAIN_NAME --email $EMAIL --agree-tos",
                            "aws iam upload-server-certificate --server-certificate-name $DOMAIN_NAME-$(date +%s) --certificate-body file:///etc/letsencrypt/live/$DOMAIN_NAME/cert.pem --private-key file:///etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem --certificate-chain file:///etc/letsencrypt/live/$DOMAIN_NAME/chain.pem --path /cloudfront/"
                        ]
                    }
                },
                env: {
                    variables: {
                        "DEBIAN_FRONTEND": "noninteractive",
                        "DOMAIN_NAME": domainName,
                        "EMAIL": props.contactEmail,
                    }
                }
            })
        });

        // Notify SNS Topic
        project.onBuildFailed(`CertificateProjectFailedSNS`, {
            target: new targets.SnsTopic(props.notifyTopic, {
                message: events.RuleTargetInput.fromObject({
                    type: 'certificate',
                    certificateDomain: domainName,
                    certificateProjectName: events.EventField.fromPath('$.detail.project-name'),
                    certificateBuildStatus: events.EventField.fromPath('$.detail.build-status'),
                    certificateBuildId: events.EventField.fromPath('$.detail.build-id'),
                    account: events.EventField.account,
                }),
            })
        });

        // permissions required by certbot-dns-route53 plugin
        project.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["route53:ListHostedZones", "route53:GetChange"],
            resources: ["*"]
        }))
        project.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["route53:ChangeResourceRecordSets"],
            resources: [props.hostedZone.hostedZoneArn]
        }))

        // permissions for iam server certificate upload
        project.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["iam:UploadServerCertificate"],
            resources: ["*"]
        }))
    }
}