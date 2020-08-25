import cdk = require('@aws-cdk/core');
import cloudwatch = require('@aws-cdk/aws-cloudwatch');
import cw_actions = require('@aws-cdk/aws-cloudwatch-actions');
import events = require('@aws-cdk/aws-events');
import event_source = require('@aws-cdk/aws-lambda-event-sources');
import glue = require('@aws-cdk/aws-glue')
import iam = require('@aws-cdk/aws-iam');
import lambda = require('@aws-cdk/aws-lambda');
import s3 = require('@aws-cdk/aws-s3');
import sns = require('@aws-cdk/aws-sns');
import targets = require('@aws-cdk/aws-events-targets');
import * as path from 'path';

export interface AnalyticsProps extends cdk.NestedStackProps {
    readonly resourcePrefix: string;
    readonly newKeyPrefix: string;
    readonly gzKeyPrefix: string;
    readonly parquetKeyPrefix: string;
    readonly athenaResultsPrefix?: string;
    readonly logBucket: s3.Bucket;
    readonly notifyTopic: sns.ITopic;
}

export class AnalyticsStack extends cdk.NestedStack {
    constructor(scope: cdk.Construct, id: string, props: AnalyticsProps) {
        super(scope, id, props);

        const athenaResultsPrefix = props.athenaResultsPrefix ? props.athenaResultsPrefix : "athena-query-results";

        const cloudFrontAccessLogsBucket = props.logBucket;
        const analyticsDatabase = new glue.CfnDatabase(this, "analyticsDatabase", {
            catalogId: cdk.Aws.ACCOUNT_ID,
            databaseInput: {
                name: `${props.resourcePrefix}_cf_access_logs_db`
            }
        });

        const partitionKeys = [
            { name: "year", type: "string" },
            { name: "month", type: "string" },
            { name: "day", type: "string" },
            { name: "hour", type: "string" },
        ]
        const storageDescCols = [
            { name: "date", type: "date" },
            { name: "time", type: "string" },
            { name: "location", type: "string" },
            { name: "bytes", type: "bigint" },
            { name: "request_ip", type: "string" },
            { name: "method", type: "string" },
            { name: "host", type: "string" },
            { name: "uri", type: "string" },
            { name: "status", type: "int" },
            { name: "referrer", type: "string" },
            { name: "user_agent", type: "string" },
            { name: "query_string", type: "string" },
            { name: "cookie", type: "string" },
            { name: "result_type", type: "string" },
            { name: "result_id", type: "string" },
            { name: "host_header", type: "string" },
            { name: "request_protocol", type: "string" },
            { name: "request_bytes", type: "bigint" },
            { name: "time_taken", type: "float" },
            { name: "xforwarded_for", type: "string" },
            { name: "ssl_protocol", type: "string" },
            { name: "ssl_cipher", type: "string" },
            { name: "response_result_type", type: "string" },
            { name: "http_version", type: "string" },
            { name: "fle_status", type: "string" },
            { name: "fle_encrypted_fields", type: "int" },
            { name: "c_port", type: "int" },
            { name: "time_to_first_byte", type: "float" },
            { name: "x_edge_detailed_result_type", type: "string" },
            { name: "sc_content_type", type: "string" },
            { name: "sc_content_len", type: "bigint" },
            { name: "sc_range_start", type: "bigint" },
            { name: "sc_range_end", type: "bigint" },
        ];

        const partitionedGzTable = new glue.CfnTable(this, "partitionedGzTable", {
            catalogId: cdk.Aws.ACCOUNT_ID,
            databaseName: analyticsDatabase.ref,
            tableInput: {
                name: "partitioned_gz",
                description: "Gzip logs delivered by Amazon CloudFront partitioned",
                tableType: "EXTERNAL_TABLE",
                parameters: { "skip.header.line.count": "2" },
                partitionKeys: partitionKeys,
                storageDescriptor: {
                    outputFormat: "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
                    columns: storageDescCols,
                    inputFormat: "org.apache.hadoop.mapred.TextInputFormat",
                    location: cloudFrontAccessLogsBucket.s3UrlForObject(props.gzKeyPrefix),
                    serdeInfo: {
                        parameters: {
                            "field.delim\"": "\t",
                            "serialization.format": "\t"
                        },
                        serializationLibrary: "org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe"
                    }
                }
            }
        });
        const partitionedParquetTable = new glue.CfnTable(this, "partitionedParquetTable", {
            catalogId: cdk.Aws.ACCOUNT_ID,
            databaseName: analyticsDatabase.ref,
            tableInput: {
                name: "partitioned_parquet",
                description: "Parquet format access logs as transformed from gzip version",
                tableType: "EXTERNAL_TABLE",
                parameters: { has_encrypted_data: 'false', "parquet.compression": "SNAPPY" },
                partitionKeys: partitionKeys,
                storageDescriptor: {
                    outputFormat: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat",
                    columns: storageDescCols,
                    inputFormat: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat",
                    location: cloudFrontAccessLogsBucket.s3UrlForObject(props.parquetKeyPrefix),
                    serdeInfo: {
                        serializationLibrary: "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
                    }
                }
            }
        });

        const policyAllowAthena = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["athena:StartQueryExecution", "athena:GetQueryExecution"],
            resources: ['*']
        });
        const policyAllowS3Bucket = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:ListBucket", "s3:GetBucketLocation"],
            resources: [cloudFrontAccessLogsBucket.bucketArn]
        });
        const policyAllowS3BucketReadDeleteOriginLog = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:GetObject", "s3:DeleteObject"],
            resources: [cloudFrontAccessLogsBucket.arnForObjects(props.newKeyPrefix.concat("*"))]
        });
        const policyAllowS3BucketReadGz = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:GetObject"],
            resources: [cloudFrontAccessLogsBucket.arnForObjects(props.gzKeyPrefix.concat("*"))]
        });
        const policyAllowS3BucketWriteGz = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:PutObject"],
            resources: [cloudFrontAccessLogsBucket.arnForObjects(props.gzKeyPrefix.concat("*"))]
        });
        const policyAllowS3BucketWriteParquet = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:PutObject"],
            resources: [cloudFrontAccessLogsBucket.arnForObjects(props.parquetKeyPrefix.concat("*"))]
        });
        const policyAllowS3BucketWriteResult = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:PutObject"],
            resources: [cloudFrontAccessLogsBucket.arnForObjects(athenaResultsPrefix.concat("/*"))]
        });

        const transformPartFn = new lambda.Function(this, 'transformPartFn', {
            runtime: lambda.Runtime.NODEJS_12_X,
            code: lambda.Code.asset(path.join(__dirname, './lambda.d/cf-logs-analytics')),
            handler: 'transformPartition.handler',
            timeout: cdk.Duration.seconds(900),
            initialPolicy: [
                policyAllowAthena, policyAllowS3Bucket,
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        "glue:CreatePartition", "glue:GetDatabase", "glue:GetTable",
                        "glue:BatchCreatePartition", "glue:GetPartition", "glue:GetPartitions",
                        "glue:CreateTable", "glue:DeleteTable", "glue:DeletePartition"
                    ],
                    resources: ['*']
                }),
                policyAllowS3BucketReadGz, policyAllowS3BucketWriteParquet, policyAllowS3BucketWriteResult
            ],
            environment: {
                SOURCE_TABLE: partitionedGzTable.ref,
                TARGET_TABLE: partitionedParquetTable.ref,
                DATABASE: analyticsDatabase.ref,
                ATHENA_QUERY_RESULTS_LOCATION: cloudFrontAccessLogsBucket.s3UrlForObject(athenaResultsPrefix)
            }
        });
        const transformPartFnAlarm = new cloudwatch.Alarm(this, 'transformPartFnAlarm', {
            metric: transformPartFn.metricErrors({ period: cdk.Duration.hours(1) }),
            alarmDescription: `TransformPart Lambda Function Alarm.`,
            threshold: 1,
            evaluationPeriods: 3,
            treatMissingData: cloudwatch.TreatMissingData.BREACHING,
            actionsEnabled: true,
        });
        transformPartFnAlarm.addAlarmAction(new cw_actions.SnsAction(props.notifyTopic));
        transformPartFnAlarm.addOkAction(new cw_actions.SnsAction(props.notifyTopic));
        const hourlyEvtAt1 = new events.Rule(this, 'hourlyEvtAt1', {
            schedule: events.Schedule.cron({ minute: '1' }),
            targets: [new targets.LambdaFunction(transformPartFn)]
        });

        const createPartFn = new lambda.Function(this, 'createPartFn', {
            runtime: lambda.Runtime.NODEJS_12_X,
            code: lambda.Code.asset(path.join(__dirname, './lambda.d/cf-logs-analytics')),
            handler: 'createPartitions.handler',
            timeout: cdk.Duration.seconds(5),
            initialPolicy: [
                policyAllowAthena, policyAllowS3Bucket,
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        "glue:CreatePartition", "glue:GetDatabase", "glue:GetTable", "glue:BatchCreatePartition"
                    ],
                    resources: ['*']
                }),
                policyAllowS3BucketWriteGz, policyAllowS3BucketWriteResult
            ],
            environment: {
                TABLE: partitionedGzTable.ref,
                DATABASE: analyticsDatabase.ref,
                ATHENA_QUERY_RESULTS_LOCATION: cloudFrontAccessLogsBucket.s3UrlForObject(athenaResultsPrefix)
            }
        });
        const createPartFnAlarm = new cloudwatch.Alarm(this, 'createPartFnAlarm', {
            metric: createPartFn.metricErrors({ period: cdk.Duration.hours(1) }),
            alarmDescription: `CreatePart Lambda Function Alarm.`,
            threshold: 1,
            evaluationPeriods: 3,
            treatMissingData: cloudwatch.TreatMissingData.BREACHING,
            actionsEnabled: true,
        });
        createPartFnAlarm.addAlarmAction(new cw_actions.SnsAction(props.notifyTopic));
        createPartFnAlarm.addOkAction(new cw_actions.SnsAction(props.notifyTopic));
        const hourlyEvtAt55 = new events.Rule(this, 'hourlyEvtAt55', {
            schedule: events.Schedule.cron({ minute: '55' }),
            targets: [new targets.LambdaFunction(createPartFn)]
        });

        const moveNewAccessLogsFn = new lambda.Function(this, 'moveNewAccessLogsFn', {
            runtime: lambda.Runtime.NODEJS_12_X,
            code: lambda.Code.asset(path.join(__dirname, './lambda.d/cf-logs-analytics')),
            handler: 'moveAccessLogs.handler',
            timeout: cdk.Duration.seconds(30),
            initialPolicy: [
                policyAllowS3BucketReadDeleteOriginLog, policyAllowS3BucketWriteGz
            ],
            environment: {
                TARGET_KEY_PREFIX: props.gzKeyPrefix
            },
            events: [
                new event_source.S3EventSource(cloudFrontAccessLogsBucket, {
                    events: [s3.EventType.OBJECT_CREATED],
                    filters: [{ prefix: props.newKeyPrefix }]
                })
            ]
        });
        const moveNewAccessLogsFnAlarm = new cloudwatch.Alarm(this, 'moveNewAccessLogsFnAlarm', {
            metric: moveNewAccessLogsFn.metricErrors({ period: cdk.Duration.hours(1) }),
            alarmDescription: `MoveNewAccessLogs Lambda Function Alarm.`,
            threshold: 1,
            evaluationPeriods: 3,
            treatMissingData: cloudwatch.TreatMissingData.IGNORE,
            actionsEnabled: true,
        });
        moveNewAccessLogsFnAlarm.addAlarmAction(new cw_actions.SnsAction(props.notifyTopic));
        moveNewAccessLogsFnAlarm.addOkAction(new cw_actions.SnsAction(props.notifyTopic));
    }
}
