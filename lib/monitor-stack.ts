import * as cdk from '@aws-cdk/core';
import * as synthetics from '@aws-cdk/aws-synthetics';
import * as s3 from '@aws-cdk/aws-s3';
import * as path from 'path';
import * as fs from 'fs';
import * as Mustache from 'mustache';

export interface MonitorProps extends cdk.NestedStackProps {
    domainName?: string;
}

export class MonitorStack extends cdk.NestedStack {
    constructor(scope: cdk.Construct, id: string, props: MonitorProps) {
        super(scope, id, props);

        const url = fs.readFileSync(path.join(__dirname, './lambda.d/screenshot/index.js'), 'utf-8');
        const bucket = new s3.Bucket(this, 'CanaryBucket');

        const cloudFrontHomepage = new synthetics.Canary(this, 'CloudFrontHomepageCanary', {
            canaryName: 'cloudfronthomepage',
            test: synthetics.Test.custom({
                code: synthetics.Code.fromInline(Mustache.render(url, {
                    url: `https://${props.domainName}`
                })),
                handler: 'index.handler',
            }),
            artifactsBucketLocation: {
                bucket,
                prefix: '/CloudFrontHomepage/'
            },
        });

        const albHomepage = new synthetics.Canary(this, 'ALBHomepageCanary', {
            canaryName: 'albhomepage',
            test: synthetics.Test.custom({
                code: synthetics.Code.fromInline(Mustache.render(url, {
                    url: `https://${this.region}.${props.domainName}`
                })),
                handler: 'index.handler',
            }),
            artifactsBucketLocation: {
                bucket,
                prefix: '/ALBHomepage/'
            }
        });

        const tunasyncStatus = new synthetics.Canary(this, 'TunasyncStatusCanary', {
            canaryName: 'tunasyncstatus',
            test: synthetics.Test.custom({
                code: synthetics.Code.fromInline(Mustache.render(url, {
                    url: `https://${props.domainName}/static/tunasync.json`
                })),
                handler: 'index.handler',
            }),
            artifactsBucketLocation: {
                bucket,
                prefix: '/TunasyncStatus/'
            }
        });
    }
}