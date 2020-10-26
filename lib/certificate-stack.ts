import * as cdk from '@aws-cdk/core';
import * as sns from '@aws-cdk/aws-sns';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import * as cw_actions from '@aws-cdk/aws-cloudwatch-actions';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as iam from '@aws-cdk/aws-iam';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambda_nodejs from '@aws-cdk/aws-lambda-nodejs';
import * as path from 'path';
import * as route53 from '@aws-cdk/aws-route53';

export interface CertificateProps extends cdk.NestedStackProps {
    readonly notifyTopic: sns.ITopic;
    readonly domainName: string;
    readonly hostedZone: route53.IHostedZone;
    readonly contactEmail: string;
    readonly distributionId: string;
}

export class CertificateStack extends cdk.NestedStack {
    constructor(scope: cdk.Construct, id: string, props: CertificateProps) {
        super(scope, id, props);

        const stack = cdk.Stack.of(this);

        const domainName = props.domainName;
        const project = new codebuild.Project(this, `CertificateProject`, {
            environment: {
                buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('debian:buster'),
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: 0.2,
                phases: {
                    build: {
                        commands: [
                            "set -ex",
                            "sed -E -i \"s/(deb.debian.org|security.debian.org)/opentuna.cn/\" /etc/apt/sources.list",
                            "apt-get update",
                            "apt-get install -y python3-pip curl unzip jq",
                            "curl --retry 3 --retry-delay 5 https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o awscliv2.zip",
                            "unzip awscliv2.zip",
                            "./aws/install",
                            "pip3 install -i https://opentuna.cn/pypi/web/simple certbot==1.9.0 certbot-dns-route53==1.9.0 cryptography==3.1.1",
                            "for i in $(seq 1 5); do [ $i -gt 1 ] && sleep 15; certbot certonly --dns-route53 -d $DOMAIN_NAME --email $EMAIL --agree-tos --non-interactive && s=0 && break || s=$?; done; (exit $s)",
                            "export CERT_NAME=$DOMAIN_NAME-$(date +%s)",
                            "export CERT_ID=$(aws iam upload-server-certificate --server-certificate-name $CERT_NAME --certificate-body file:///etc/letsencrypt/live/$DOMAIN_NAME/cert.pem --private-key file:///etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem --certificate-chain file:///etc/letsencrypt/live/$DOMAIN_NAME/chain.pem --path /cloudfront/opentuna/ | jq '.ServerCertificateMetadata.ServerCertificateId' --raw-output)",
                            "export ORIGINAL_ETAG=$(aws cloudfront get-distribution-config --id $DISTRIBUTIONID --query 'ETag' --output text)",
                            "aws cloudfront get-distribution-config --id $DISTRIBUTIONID --query 'DistributionConfig' --output json | jq \".ViewerCertificate.IAMCertificateId=\\\"$CERT_ID\\\"\" | jq \".ViewerCertificate.Certificate=\\\"$CERT_ID\\\"\" >/tmp/$DISTRIBUTIONID-config.json",
                            "aws cloudfront update-distribution --id $DISTRIBUTIONID --if-match $ORIGINAL_ETAG --distribution-config file:///tmp/$DISTRIBUTIONID-config.json",
                        ]
                    }
                },
                env: {
                    variables: {
                        "DEBIAN_FRONTEND": "noninteractive",
                        "DOMAIN_NAME": domainName,
                        "EMAIL": props.contactEmail,
                        "DISTRIBUTIONID": props.distributionId,
                    },
                    'exported-variables': [
                        'CERT_NAME',
                        'CERT_ID',
                    ]
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

        const certIssuedTopic = this.node.tryGetContext('certTopicArn');
        if (certIssuedTopic) {
            const eventSenderFn = new lambda_nodejs.NodejsFunction(this, 'IAMCertEventSender', {
                entry: path.join(__dirname, './lambda.d/iam-cert-event-sender/index.ts'),
                handler: 'iamCertEventSender',
                timeout: cdk.Duration.minutes(1),
                runtime: lambda.Runtime.NODEJS_12_X,
                environment: {
                    TOPIC_ARN: certIssuedTopic,
                }
            });
            eventSenderFn.addToRolePolicy(new iam.PolicyStatement({
                actions: ['sns:Publish',],
                effect: iam.Effect.ALLOW,
                resources: [certIssuedTopic],
            }));
            const eventNotifyAlarm = new cloudwatch.Alarm(this, 'IAMEventNotifyAlarm', {
                metric: eventSenderFn.metricErrors({ period: cdk.Duration.minutes(5) }),
                alarmDescription: `IAM cert event notify alarm`,
                threshold: 1,
                evaluationPeriods: 1,
                treatMissingData: cloudwatch.TreatMissingData.IGNORE,
                actionsEnabled: true,
            });
            eventNotifyAlarm.addAlarmAction(new cw_actions.SnsAction(props.notifyTopic));
            project.onBuildSucceeded(`CertificateProjectSuccessSNS`, {
                target: new targets.LambdaFunction(eventSenderFn, {
                    event: events.RuleTargetInput.fromObject({
                        type: 'certificate',
                        certificateDomain: domainName,
                        stage: this.node.tryGetContext('stage') || 'prod',
                        iamCertId: events.EventField.fromPath('$.detail.additional-information.exported-environment-variables[0].value'),
                        iamCertName: events.EventField.fromPath('$.detail.additional-information.exported-environment-variables[1].value'),
                        certificateProjectName: events.EventField.fromPath('$.detail.project-name'),
                        certificateBuildStatus: events.EventField.fromPath('$.detail.build-status'),
                        certificateBuildId: events.EventField.fromPath('$.detail.build-id'),
                        account: events.EventField.account,
                    }),
                }),
            });
        }

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

        // permissions for updating existing cloudfront configuration
        project.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["cloudfront:GetDistributionConfig", "cloudfront:UpdateDistribution"],
            resources: [cdk.Arn.format({
                partition: stack.partition,
                region: '*',
                service: 'cloudfront',
                resource: 'distribution',
                resourceName: props.distributionId,
            }, stack)]
        }));
    }
}