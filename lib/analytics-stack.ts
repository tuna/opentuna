import * as athena from '@aws-cdk/aws-athena';
import * as cdk from '@aws-cdk/core';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import * as cw_actions from '@aws-cdk/aws-cloudwatch-actions';
import * as events from '@aws-cdk/aws-events';
import * as event_source from '@aws-cdk/aws-lambda-event-sources';
import * as glue from '@aws-cdk/aws-glue';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as sns from '@aws-cdk/aws-sns';
import * as targets from '@aws-cdk/aws-events-targets';
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

        const analyticsDatabase = new glue.Database(this, 'analyticsDatabase', {
            databaseName: `${props.resourcePrefix}_cf_access_logs`,
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
            catalogId: analyticsDatabase.catalogId,
            databaseName: analyticsDatabase.databaseName,
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
            catalogId: analyticsDatabase.catalogId,
            databaseName: analyticsDatabase.databaseName,
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

        const athenaQueryRtLocation = cloudFrontAccessLogsBucket.s3UrlForObject(athenaResultsPrefix);
        const transformPartFn = new lambda.Function(this, 'transformPartFn', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset(path.join(__dirname, './lambda.d/cf-logs-analytics')),
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
                DATABASE: analyticsDatabase.databaseName,
                ATHENA_QUERY_RESULTS_LOCATION: athenaQueryRtLocation,
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
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset(path.join(__dirname, './lambda.d/cf-logs-analytics')),
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
                DATABASE: analyticsDatabase.databaseName,
                ATHENA_QUERY_RESULTS_LOCATION: athenaQueryRtLocation,
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
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset(path.join(__dirname, './lambda.d/cf-logs-analytics')),
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

        // create combined glue table
        const combinedTableName = 'combined_view';
        new glue.CfnTable(this, 'Combined_CF_AccessLog', {
            catalogId: analyticsDatabase.catalogId,
            databaseName: analyticsDatabase.databaseName,
            tableInput: {
                description: 'combined view over gzip and parquet tables',
                name: combinedTableName,
                tableType: 'VIRTUAL_VIEW',
                parameters: {
                    'presto_view': 'true',
                },
                storageDescriptor: {
                    columns: (((partitionedGzTable.tableInput as glue.CfnTable.TableInputProperty).storageDescriptor as 
                        glue.CfnTable.StorageDescriptorProperty).columns as Array<glue.CfnTable.ColumnProperty>).concat(
                            ((partitionedGzTable.tableInput as glue.CfnTable.TableInputProperty).partitionKeys as Array<glue.CfnTable.ColumnProperty>)
                        ).concat([
                            {
                                name: 'file',
                                type: 'string',
                            }
                        ]),
                    serdeInfo: {
                    }
                },
                viewOriginalText: cdk.Fn.join('', [
                    '/* Presto View: ',
                    cdk.Fn.base64(
                        cdk.Fn.sub(JSON.stringify({
                            "originalSql": `SELECT *, "$path" as file FROM \${database}.\${partitioned_gz_table} WHERE (concat(year, month, day, hour) >= date_format(date_trunc('hour', ((current_timestamp - INTERVAL  '15' MINUTE) - INTERVAL  '1' HOUR)), '%Y%m%d%H')) UNION ALL SELECT *, "$path" as file FROM \${database}.\${partitioned_parquet_table} WHERE (concat(year, month, day, hour) < date_format(date_trunc('hour', ((current_timestamp - INTERVAL  '15' MINUTE) - INTERVAL  '1' HOUR)), '%Y%m%d%H'))`,
                            "catalog": "awsdatacatalog",
                            "schema": "${database}",
                            "columns": [
                                {"name": "date", "type": "date"},
                                {"name": "time", "type": "varchar"},
                                {"name": "location", "type": "varchar"},
                                {"name": "bytes", "type": "bigint"},
                                {"name": "request_ip", "type": "varchar"},
                                {"name": "method", "type": "varchar"},
                                {"name": "host", "type": "varchar"},
                                {"name": "uri", "type": "varchar"},
                                {"name": "status", "type": "integer"},
                                {"name": "referrer", "type": "varchar"},
                                {"name": "user_agent", "type": "varchar"},
                                {"name": "query_string", "type": "varchar"},
                                {"name": "cookie", "type": "varchar"},
                                {"name": "result_type", "type": "varchar"},
                                {"name": "request_id", "type": "varchar"},
                                {"name": "host_header", "type": "varchar"},
                                {"name": "request_protocol", "type": "varchar"},
                                {"name": "request_bytes", "type": "bigint"},
                                {"name": "time_taken", "type": "real"},
                                {"name": "xforwarded_for", "type": "varchar"},
                                {"name": "ssl_protocol", "type": "varchar"},
                                {"name": "ssl_cipher", "type": "varchar"},
                                {"name": "response_result_type", "type": "varchar"},
                                {"name": "http_version", "type": "varchar"},
                                {"name": "fle_status", "type": "varchar"},
                                {"name": "fle_encrypted_fields", "type": "integer"},
                                {"name": "c_port", "type": "integer"},
                                {"name": "time_to_first_byte", "type": "real"},
                                {"name": "x_edge_detailed_result_type", "type": "varchar"},
                                {"name": "sc_content_type", "type": "varchar"},
                                {"name": "sc_content_len", "type": "bigint"},
                                {"name": "sc_range_start", "type": "bigint"},
                                {"name": "sc_range_end", "type": "bigint"},
                                {"name": "year", "type": "varchar"},
                                {"name": "month", "type": "varchar"},
                                {"name": "day", "type": "varchar"},
                                {"name": "hour", "type": "varchar"},
                                {"name": "file", "type": "varchar"}
                            ]
                        }, null, 2), {
                            database: analyticsDatabase.databaseName,
                            partitioned_gz_table: partitionedGzTable.ref,
                            partitioned_parquet_table: partitionedParquetTable.ref,
                        })
                    ),
                    ' */',
                ]),
            }
        });

        new athena.CfnWorkGroup(this, 'OpenTUNAAthenaWorkgroup', {
            name: `OpenTUNA`,
            description: `OpenTUNA Workgroup.`,
            workGroupConfiguration: {
                enforceWorkGroupConfiguration: true,
                publishCloudWatchMetricsEnabled: true,
                resultConfiguration: {
                    outputLocation: athenaQueryRtLocation,
                }
            }
        });

        new athena.CfnNamedQuery(this, `template_monthly_mirrors_requests_per_day`, {
            database: analyticsDatabase.databaseName,
            name: `template_monthly_mirrors_requests_per_day`,
            queryString: `\
                SELECT CONCAT(year, '-', month, '-', day) AS day, count(*) as total_requests, SUM(bytes) AS total_bytes \
                FROM ${combinedTableName} \
                WHERE year = '<year>' \
                AND month = '<month>' \
                AND status < 400 \
                group by CONCAT(year, '-', month, '-', day) \
                order by day`,
            description: 'Template monthly total requests and bytes per day'
        });

        new athena.CfnNamedQuery(this, `template_monthly_mirrors_requests_stats_per_path`, {
            database: analyticsDatabase.databaseName,
            name: `template_monthly_mirrors_requests_stats_per_path`,
            queryString: `\
            SELECT substr(uri, 1, strpos(substr(uri, 2), '/') + 1) as uriwithprefix, count(*) as total_requests, SUM(bytes) AS total_bytes \
            FROM ${combinedTableName} \
            WHERE year = '<year>' \
            AND month = '<month>' \
            AND status < 400 \
            group by substr(uri, 1, strpos(substr(uri, 2), '/') + 1) \
            order by total_requests desc \
            limit 100`,
            description: 'Template monthly requests stats per path'
        });

        new athena.CfnNamedQuery(this, `template_monthly_pypi_stats_per_day`, {
            database: analyticsDatabase.databaseName,
            name: `template_monthly_pypi_stats_per_day`,
            queryString: `\
            SELECT CONCAT(year, '-', month, '-', day) AS day, count(*) as total_requests, SUM(bytes) AS total_bytes \
            FROM ${combinedTableName} \
            WHERE year = '<year>' \
            AND month = '<month>' \
            AND status < 400 \
            AND position('/pypi/web' in uri) = 1 \
            group by year, month, day \
            order by day`,
            description: 'Template monthly pypi stats per day'
        });

        new athena.CfnNamedQuery(this, `template_monthly_pypi_package_download_ranking`, {
            database: analyticsDatabase.databaseName,
            name: `template_monthly_pypi_package_download_ranking_per_month`,
            queryString: `\
            SELECT split(split(uri, '/')[8], '-')[1] as packageName, count(*) as download_count \
            from ${combinedTableName} \
            WHERE year = '<year>' \
            AND month = '<month>' \
            AND status < 400 \
            AND position('/pypi/web/packages/' in uri) = 1 \
            AND cardinality(split(uri, '/')) = 8 \
            group by split(split(uri, '/')[8], '-')[1] \
            order by download_count desc \
            limit 50`,
            description: 'Template monthly pypi packages download ranking'
        });

        cdk.Tags.of(this).add('component', 'analytics');
    }
}
