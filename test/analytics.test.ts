import * as cdk from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import * as Tuna from '../lib/analytics-stack';
import * as mock from './context-provider-mock';
import ec2 = require('@aws-cdk/aws-ec2');
import fs = require('fs');
import path = require('path');
import s3 = require('@aws-cdk/aws-s3');
import sns = require('@aws-cdk/aws-sns');
import '@aws-cdk/assert/jest';

describe('Tuna log analysis stack', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  const vpcId = 'vpc-123456';
  let previous: (scope: cdk.Construct, options: cdk.GetContextValueOptions) => cdk.GetContextValueResult;

  beforeAll(() => {
    previous = mock.mockContextProviderWith({
      vpcId,
      vpcCidrBlock: "10.58.0.0/16",
      "subnetGroups": [
        {
          "name": "ingress",
          "type": cxapi.VpcSubnetGroupType.PUBLIC,
          "subnets": [
            {
              "subnetId": "subnet-000f2b20b0ebaef37",
              "cidr": "10.58.0.0/22",
              "availabilityZone": "cn-northwest-1a",
              "routeTableId": "rtb-0f5312df5fe3ae508"
            },
            {
              "subnetId": "subnet-0b2cce92f08506a9a",
              "cidr": "10.58.4.0/22",
              "availabilityZone": "cn-northwest-1b",
              "routeTableId": "rtb-07e969fe93b6edd9a"
            },
            {
              "subnetId": "subnet-0571b340c9f28375c",
              "cidr": "10.58.8.0/22",
              "availabilityZone": "cn-northwest-1c",
              "routeTableId": "rtb-02ae139a60f628b5c"
            }
          ]
        },
        {
          "name": "private",
          "type": cxapi.VpcSubnetGroupType.PRIVATE,
          "subnets": [
            {
              "subnetId": "subnet-0a6dab6bc063ea432",
              "cidr": "10.58.32.0/19",
              "availabilityZone": "cn-northwest-1a",
              "routeTableId": "rtb-0be722c725fd0d29f"
            },
            {
              "subnetId": "subnet-08dd359da55a6160b",
              "cidr": "10.58.64.0/19",
              "availabilityZone": "cn-northwest-1b",
              "routeTableId": "rtb-0b13567ae92b08708"
            },
            {
              "subnetId": "subnet-0d300d086b989eefc",
              "cidr": "10.58.96.0/19",
              "availabilityZone": "cn-northwest-1c",
              "routeTableId": "rtb-08fe9e7932d86517e"
            }
          ]
        }
      ]
    }, options => {
      expect(options.filter).toEqual({
        'vpc-id': vpcId,
      });
    });
  });

  afterAll(() => {
    mock.restoreContextProvider(previous);
  });

  beforeEach(() => {
    app = new cdk.App({
      context: {
        stage: 'prod',
      }
    });
    const parentStack = new cdk.Stack(app, 'ParentStack', {
      env: {
        region: 'cn-north-1',
        account: '1234567890xx',
      },
    });
    const bucket = new s3.Bucket(parentStack, 'LogBucket');
    const topic = new sns.Topic(parentStack, 'Test Topic');

    stack = new Tuna.AnalyticsStack(parentStack, 'AnalyticsStack', {
      resourcePrefix: "opentuna",
      newKeyPrefix: "new/",
      gzKeyPrefix: "partitioned-gz/",
      parquetKeyPrefix: "partitioned-parquet/",
      logBucket: bucket,
      notifyTopic: topic
    });
  });

  test('Glue database created', () => {
    expect(stack).toHaveResourceLike('AWS::Glue::Database', {
      "CatalogId": {
        "Ref": "AWS::AccountId"
      },
      "DatabaseInput": {
        "Name": "opentuna_cf_access_logs_db"
      }
    });
  });

  test('Partitioned gz table created', () => {
    expect(stack).toHaveResourceLike('AWS::Glue::Table', {
      "CatalogId": {
        "Ref": "AWS::AccountId"
      },
      "DatabaseName": {
        "Ref": "analyticsDatabase"
      },
      "TableInput": {
        "Description": "Gzip logs delivered by Amazon CloudFront partitioned",
        "Name": "partitioned_gz",
        "Parameters": {
          "skip.header.line.count": "2"
        },
        "PartitionKeys": [
          {
            "Name": "year",
            "Type": "string"
          },
          {
            "Name": "month",
            "Type": "string"
          },
          {
            "Name": "day",
            "Type": "string"
          },
          {
            "Name": "hour",
            "Type": "string"
          }
        ],
        "StorageDescriptor": {
          "Columns": [
            {
              "Name": "date",
              "Type": "date"
            },
            {
              "Name": "time",
              "Type": "string"
            },
            {
              "Name": "location",
              "Type": "string"
            },
            {
              "Name": "bytes",
              "Type": "bigint"
            },
            {
              "Name": "request_ip",
              "Type": "string"
            },
            {
              "Name": "method",
              "Type": "string"
            },
            {
              "Name": "host",
              "Type": "string"
            },
            {
              "Name": "uri",
              "Type": "string"
            },
            {
              "Name": "status",
              "Type": "int"
            },
            {
              "Name": "referrer",
              "Type": "string"
            },
            {
              "Name": "user_agent",
              "Type": "string"
            },
            {
              "Name": "query_string",
              "Type": "string"
            },
            {
              "Name": "cookie",
              "Type": "string"
            },
            {
              "Name": "result_type",
              "Type": "string"
            },
            {
              "Name": "result_id",
              "Type": "string"
            },
            {
              "Name": "host_header",
              "Type": "string"
            },
            {
              "Name": "request_protocol",
              "Type": "string"
            },
            {
              "Name": "request_bytes",
              "Type": "bigint"
            },
            {
              "Name": "time_taken",
              "Type": "float"
            },
            {
              "Name": "xforwarded_for",
              "Type": "string"
            },
            {
              "Name": "ssl_protocol",
              "Type": "string"
            },
            {
              "Name": "ssl_cipher",
              "Type": "string"
            },
            {
              "Name": "response_result_type",
              "Type": "string"
            },
            {
              "Name": "http_version",
              "Type": "string"
            },
            {
              "Name": "fle_status",
              "Type": "string"
            },
            {
              "Name": "fle_encrypted_fields",
              "Type": "int"
            },
            {
              "Name": "c_port",
              "Type": "int"
            },
            {
              "Name": "time_to_first_byte",
              "Type": "float"
            },
            {
              "Name": "x_edge_detailed_result_type",
              "Type": "string"
            },
            {
              "Name": "sc_content_type",
              "Type": "string"
            },
            {
              "Name": "sc_content_len",
              "Type": "bigint"
            },
            {
              "Name": "sc_range_start",
              "Type": "bigint"
            },
            {
              "Name": "sc_range_end",
              "Type": "bigint"
            }
          ],
          "InputFormat": "org.apache.hadoop.mapred.TextInputFormat",
          "Location": {
            "Fn::Join": [
              "",
              [
                "s3://",
                {
                  "Ref": "referencetoParentStackLogBucket8290A4D1Ref"
                },
                "/partitioned-gz/"
              ]
            ]
          },
          "OutputFormat": "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
          "SerdeInfo": {
            "Parameters": {
              "field.delim\"": "\t",
              "serialization.format": "\t"
            },
            "SerializationLibrary": "org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe"
          }
        },
        "TableType": "EXTERNAL_TABLE"
      }
    });
  });

  test('Parquet table created', () => {
    expect(stack).toHaveResourceLike('AWS::Glue::Table', {
      "CatalogId": {
        "Ref": "AWS::AccountId"
      },
      "DatabaseName": {
        "Ref": "analyticsDatabase"
      },
      "TableInput": {
        "Description": "Parquet format access logs as transformed from gzip version",
        "Name": "partitioned_parquet",
        "Parameters": {
          "has_encrypted_data": "false",
          "parquet.compression": "SNAPPY"
        },
        "PartitionKeys": [
          {
            "Name": "year",
            "Type": "string"
          },
          {
            "Name": "month",
            "Type": "string"
          },
          {
            "Name": "day",
            "Type": "string"
          },
          {
            "Name": "hour",
            "Type": "string"
          }
        ],
        "StorageDescriptor": {
          "Columns": [
            {
              "Name": "date",
              "Type": "date"
            },
            {
              "Name": "time",
              "Type": "string"
            },
            {
              "Name": "location",
              "Type": "string"
            },
            {
              "Name": "bytes",
              "Type": "bigint"
            },
            {
              "Name": "request_ip",
              "Type": "string"
            },
            {
              "Name": "method",
              "Type": "string"
            },
            {
              "Name": "host",
              "Type": "string"
            },
            {
              "Name": "uri",
              "Type": "string"
            },
            {
              "Name": "status",
              "Type": "int"
            },
            {
              "Name": "referrer",
              "Type": "string"
            },
            {
              "Name": "user_agent",
              "Type": "string"
            },
            {
              "Name": "query_string",
              "Type": "string"
            },
            {
              "Name": "cookie",
              "Type": "string"
            },
            {
              "Name": "result_type",
              "Type": "string"
            },
            {
              "Name": "result_id",
              "Type": "string"
            },
            {
              "Name": "host_header",
              "Type": "string"
            },
            {
              "Name": "request_protocol",
              "Type": "string"
            },
            {
              "Name": "request_bytes",
              "Type": "bigint"
            },
            {
              "Name": "time_taken",
              "Type": "float"
            },
            {
              "Name": "xforwarded_for",
              "Type": "string"
            },
            {
              "Name": "ssl_protocol",
              "Type": "string"
            },
            {
              "Name": "ssl_cipher",
              "Type": "string"
            },
            {
              "Name": "response_result_type",
              "Type": "string"
            },
            {
              "Name": "http_version",
              "Type": "string"
            },
            {
              "Name": "fle_status",
              "Type": "string"
            },
            {
              "Name": "fle_encrypted_fields",
              "Type": "int"
            },
            {
              "Name": "c_port",
              "Type": "int"
            },
            {
              "Name": "time_to_first_byte",
              "Type": "float"
            },
            {
              "Name": "x_edge_detailed_result_type",
              "Type": "string"
            },
            {
              "Name": "sc_content_type",
              "Type": "string"
            },
            {
              "Name": "sc_content_len",
              "Type": "bigint"
            },
            {
              "Name": "sc_range_start",
              "Type": "bigint"
            },
            {
              "Name": "sc_range_end",
              "Type": "bigint"
            }
          ],
          "InputFormat": "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat",
          "Location": {
            "Fn::Join": [
              "",
              [
                "s3://",
                {
                  "Ref": "referencetoParentStackLogBucket8290A4D1Ref"
                },
                "/partitioned-parquet/"
              ]
            ]
          },
          "OutputFormat": "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat",
          "SerdeInfo": {
            "SerializationLibrary": "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
          }
        },
        "TableType": "EXTERNAL_TABLE"
      }
    });
  });

  test('transformPartFnServiceRole created', () => {
    expect(stack).toHaveResourceLike('AWS::IAM::Role', {
      "AssumeRolePolicyDocument": {
        "Statement": [
          {
            "Action": "sts:AssumeRole",
            "Effect": "Allow",
            "Principal": {
              "Service": "lambda.amazonaws.com"
            }
          }
        ],
        "Version": "2012-10-17"
      },
      "ManagedPolicyArns": [
        {
          "Fn::Join": [
            "",
            [
              "arn:",
              {
                "Ref": "AWS::Partition"
              },
              ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
            ]
          ]
        }
      ]
    });
  });

  test('transformPartFnServiceRoleDefaultPolicy created', () => {
    expect(stack).toHaveResourceLike('AWS::IAM::Policy', {
      "PolicyDocument": {
        "Statement": [
          {
            "Action": [
              "athena:StartQueryExecution",
              "athena:GetQueryExecution"
            ],
            "Effect": "Allow",
            "Resource": "*"
          },
          {
            "Action": [
              "s3:ListBucket",
              "s3:GetBucketLocation"
            ],
            "Effect": "Allow",
            "Resource": {
              "Ref": "referencetoParentStackLogBucket8290A4D1Arn"
            }
          },
          {
            "Action": [
              "glue:CreatePartition",
              "glue:GetDatabase",
              "glue:GetTable",
              "glue:BatchCreatePartition",
              "glue:GetPartition",
              "glue:GetPartitions",
              "glue:CreateTable",
              "glue:DeleteTable",
              "glue:DeletePartition"
            ],
            "Effect": "Allow",
            "Resource": "*"
          },
          {
            "Action": "s3:GetObject",
            "Effect": "Allow",
            "Resource": {
              "Fn::Join": [
                "",
                [
                  {
                    "Ref": "referencetoParentStackLogBucket8290A4D1Arn"
                  },
                  "/partitioned-gz/*"
                ]
              ]
            }
          },
          {
            "Action": "s3:PutObject",
            "Effect": "Allow",
            "Resource": {
              "Fn::Join": [
                "",
                [
                  {
                    "Ref": "referencetoParentStackLogBucket8290A4D1Arn"
                  },
                  "/partitioned-parquet/*"
                ]
              ]
            }
          },
          {
            "Action": "s3:PutObject",
            "Effect": "Allow",
            "Resource": {
              "Fn::Join": [
                "",
                [
                  {
                    "Ref": "referencetoParentStackLogBucket8290A4D1Arn"
                  },
                  "/athena-query-results/*"
                ]
              ]
            }
          }
        ],
        "Version": "2012-10-17"
      },
      "PolicyName": "transformPartFnServiceRoleDefaultPolicy6664E863",
      "Roles": [
        {
          "Ref": "transformPartFnServiceRoleD7B69F8C"
        }
      ]
    });
  });

  test('transformPartFn created', () => {
    expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
      "Code": {
        "S3Bucket": {
          "Ref": "referencetoParentStackAssetParameters2701798aa8ab89b534cb48e7dba835aaaf846305bfc31d56e470d21afb52cfbdS3Bucket6F26A526Ref"
        },
        "S3Key": {
          "Fn::Join": [
            "",
            [
              {
                "Fn::Select": [
                  0,
                  {
                    "Fn::Split": [
                      "||",
                      {
                        "Ref": "referencetoParentStackAssetParameters2701798aa8ab89b534cb48e7dba835aaaf846305bfc31d56e470d21afb52cfbdS3VersionKeyE31AD7F2Ref"
                      }
                    ]
                  }
                ]
              },
              {
                "Fn::Select": [
                  1,
                  {
                    "Fn::Split": [
                      "||",
                      {
                        "Ref": "referencetoParentStackAssetParameters2701798aa8ab89b534cb48e7dba835aaaf846305bfc31d56e470d21afb52cfbdS3VersionKeyE31AD7F2Ref"
                      }
                    ]
                  }
                ]
              }
            ]
          ]
        }
      },
      "Handler": "transformPartition.handler",
      "Role": {
        "Fn::GetAtt": [
          "transformPartFnServiceRoleD7B69F8C",
          "Arn"
        ]
      },
      "Runtime": "nodejs12.x",
      "Environment": {
        "Variables": {
          "SOURCE_TABLE": {
            "Ref": "partitionedGzTable"
          },
          "TARGET_TABLE": {
            "Ref": "partitionedParquetTable"
          },
          "DATABASE": {
            "Ref": "analyticsDatabase"
          },
          "ATHENA_QUERY_RESULTS_LOCATION": {
            "Fn::Join": [
              "",
              [
                "s3://",
                {
                  "Ref": "referencetoParentStackLogBucket8290A4D1Ref"
                },
                "/athena-query-results"
              ]
            ]
          }
        }
      },
      "Timeout": 900
    });
  });

  test('transformPartFnAlarm created', () => {
    expect(stack).toHaveResourceLike('AWS::CloudWatch::Alarm', {
      "ComparisonOperator": "GreaterThanOrEqualToThreshold",
      "EvaluationPeriods": 3,
      "ActionsEnabled": true,
      "AlarmActions": [
        {
          "Ref": "referencetoParentStackTestTopicCEBA4F88Ref"
        }
      ],
      "AlarmDescription": "TransformPart Lambda Function Alarm.",
      "Dimensions": [
        {
          "Name": "FunctionName",
          "Value": {
            "Ref": "transformPartFn46C6D8E5"
          }
        }
      ],
      "MetricName": "Errors",
      "Namespace": "AWS/Lambda",
      "OKActions": [
        {
          "Ref": "referencetoParentStackTestTopicCEBA4F88Ref"
        }
      ],
      "Period": 3600,
      "Statistic": "Sum",
      "Threshold": 1,
      "TreatMissingData": "breaching"
    });
  });

  test('hourlyEvtAt1 created', () => {
    expect(stack).toHaveResourceLike('AWS::Events::Rule', {
      "ScheduleExpression": "cron(1 * * * ? *)",
      "State": "ENABLED",
      "Targets": [
        {
          "Arn": {
            "Fn::GetAtt": [
              "transformPartFn46C6D8E5",
              "Arn"
            ]
          },
          "Id": "Target0"
        }
      ]
    });
  });

  test('createPartFnServiceRole created', () => {
    expect(stack).toHaveResourceLike('AWS::IAM::Role', {
      "AssumeRolePolicyDocument": {
        "Statement": [
          {
            "Action": "sts:AssumeRole",
            "Effect": "Allow",
            "Principal": {
              "Service": "lambda.amazonaws.com"
            }
          }
        ],
        "Version": "2012-10-17"
      },
      "ManagedPolicyArns": [
        {
          "Fn::Join": [
            "",
            [
              "arn:",
              {
                "Ref": "AWS::Partition"
              },
              ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
            ]
          ]
        }
      ]
    });
  });

  test('createPartFnServiceRoleDefaultPolicy created', () => {
    expect(stack).toHaveResourceLike('AWS::IAM::Policy', {
      "PolicyDocument": {
        "Statement": [
          {
            "Action": [
              "athena:StartQueryExecution",
              "athena:GetQueryExecution"
            ],
            "Effect": "Allow",
            "Resource": "*"
          },
          {
            "Action": [
              "s3:ListBucket",
              "s3:GetBucketLocation"
            ],
            "Effect": "Allow",
            "Resource": {
              "Ref": "referencetoParentStackLogBucket8290A4D1Arn"
            }
          },
          {
            "Action": [
              "glue:CreatePartition",
              "glue:GetDatabase",
              "glue:GetTable",
              "glue:BatchCreatePartition"
            ],
            "Effect": "Allow",
            "Resource": "*"
          },
          {
            "Action": "s3:PutObject",
            "Effect": "Allow",
            "Resource": {
              "Fn::Join": [
                "",
                [
                  {
                    "Ref": "referencetoParentStackLogBucket8290A4D1Arn"
                  },
                  "/partitioned-gz/*"
                ]
              ]
            }
          },
          {
            "Action": "s3:PutObject",
            "Effect": "Allow",
            "Resource": {
              "Fn::Join": [
                "",
                [
                  {
                    "Ref": "referencetoParentStackLogBucket8290A4D1Arn"
                  },
                  "/athena-query-results/*"
                ]
              ]
            }
          }
        ],
        "Version": "2012-10-17"
      },
      "PolicyName": "createPartFnServiceRoleDefaultPolicy817B0B9D",
      "Roles": [
        {
          "Ref": "createPartFnServiceRole4726DB05"
        }
      ]
    });
  });

  test('createPartFn created', () => {
    expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
      "Code": {
        "S3Bucket": {
          "Ref": "referencetoParentStackAssetParameters2701798aa8ab89b534cb48e7dba835aaaf846305bfc31d56e470d21afb52cfbdS3Bucket6F26A526Ref"
        },
        "S3Key": {
          "Fn::Join": [
            "",
            [
              {
                "Fn::Select": [
                  0,
                  {
                    "Fn::Split": [
                      "||",
                      {
                        "Ref": "referencetoParentStackAssetParameters2701798aa8ab89b534cb48e7dba835aaaf846305bfc31d56e470d21afb52cfbdS3VersionKeyE31AD7F2Ref"
                      }
                    ]
                  }
                ]
              },
              {
                "Fn::Select": [
                  1,
                  {
                    "Fn::Split": [
                      "||",
                      {
                        "Ref": "referencetoParentStackAssetParameters2701798aa8ab89b534cb48e7dba835aaaf846305bfc31d56e470d21afb52cfbdS3VersionKeyE31AD7F2Ref"
                      }
                    ]
                  }
                ]
              }
            ]
          ]
        }
      },
      "Handler": "createPartitions.handler",
      "Role": {
        "Fn::GetAtt": [
          "createPartFnServiceRole4726DB05",
          "Arn"
        ]
      },
      "Runtime": "nodejs12.x",
      "Environment": {
        "Variables": {
          "TABLE": {
            "Ref": "partitionedGzTable"
          },
          "DATABASE": {
            "Ref": "analyticsDatabase"
          },
          "ATHENA_QUERY_RESULTS_LOCATION": {
            "Fn::Join": [
              "",
              [
                "s3://",
                {
                  "Ref": "referencetoParentStackLogBucket8290A4D1Ref"
                },
                "/athena-query-results"
              ]
            ]
          }
        }
      },
      "Timeout": 5
    });
  });

  test('createPartFnAlarm created', () => {
    expect(stack).toHaveResourceLike('AWS::CloudWatch::Alarm', {
      "ComparisonOperator": "GreaterThanOrEqualToThreshold",
      "EvaluationPeriods": 3,
      "ActionsEnabled": true,
      "AlarmActions": [
        {
          "Ref": "referencetoParentStackTestTopicCEBA4F88Ref"
        }
      ],
      "AlarmDescription": "CreatePart Lambda Function Alarm.",
      "Dimensions": [
        {
          "Name": "FunctionName",
          "Value": {
            "Ref": "createPartFn5EFB8D22"
          }
        }
      ],
      "MetricName": "Errors",
      "Namespace": "AWS/Lambda",
      "OKActions": [
        {
          "Ref": "referencetoParentStackTestTopicCEBA4F88Ref"
        }
      ],
      "Period": 3600,
      "Statistic": "Sum",
      "Threshold": 1,
      "TreatMissingData": "breaching"
    });
  });

  test('hourlyEvtAt55 created', () => {
    expect(stack).toHaveResourceLike('AWS::Events::Rule', {
      "ScheduleExpression": "cron(55 * * * ? *)",
      "State": "ENABLED",
      "Targets": [
        {
          "Arn": {
            "Fn::GetAtt": [
              "createPartFn5EFB8D22",
              "Arn"
            ]
          },
          "Id": "Target0"
        }
      ]
    });
  });

  test('moveNewAccessLogsFnServiceRole created', () => {
    expect(stack).toHaveResourceLike('AWS::IAM::Role', {
      "AssumeRolePolicyDocument": {
        "Statement": [
          {
            "Action": "sts:AssumeRole",
            "Effect": "Allow",
            "Principal": {
              "Service": "lambda.amazonaws.com"
            }
          }
        ],
        "Version": "2012-10-17"
      },
      "ManagedPolicyArns": [
        {
          "Fn::Join": [
            "",
            [
              "arn:",
              {
                "Ref": "AWS::Partition"
              },
              ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
            ]
          ]
        }
      ]
    });
  });

  test('moveNewAccessLogsFnServiceRoleDefaultPolicy created', () => {
    expect(stack).toHaveResourceLike('AWS::IAM::Policy', {
      "PolicyDocument": {
        "Statement": [
          {
            "Action": [
              "s3:GetObject",
              "s3:DeleteObject"
            ],
            "Effect": "Allow",
            "Resource": {
              "Fn::Join": [
                "",
                [
                  {
                    "Ref": "referencetoParentStackLogBucket8290A4D1Arn"
                  },
                  "/new/*"
                ]
              ]
            }
          },
          {
            "Action": "s3:PutObject",
            "Effect": "Allow",
            "Resource": {
              "Fn::Join": [
                "",
                [
                  {
                    "Ref": "referencetoParentStackLogBucket8290A4D1Arn"
                  },
                  "/partitioned-gz/*"
                ]
              ]
            }
          }
        ],
        "Version": "2012-10-17"
      },
      "PolicyName": "moveNewAccessLogsFnServiceRoleDefaultPolicy0B4C6DBE",
      "Roles": [
        {
          "Ref": "moveNewAccessLogsFnServiceRole4C78CFB3"
        }
      ]
    });
  });

  test('moveNewAccessLogsFn created', () => {
    expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
      "Code": {
        "S3Bucket": {
          "Ref": "referencetoParentStackAssetParameters2701798aa8ab89b534cb48e7dba835aaaf846305bfc31d56e470d21afb52cfbdS3Bucket6F26A526Ref"
        },
        "S3Key": {
          "Fn::Join": [
            "",
            [
              {
                "Fn::Select": [
                  0,
                  {
                    "Fn::Split": [
                      "||",
                      {
                        "Ref": "referencetoParentStackAssetParameters2701798aa8ab89b534cb48e7dba835aaaf846305bfc31d56e470d21afb52cfbdS3VersionKeyE31AD7F2Ref"
                      }
                    ]
                  }
                ]
              },
              {
                "Fn::Select": [
                  1,
                  {
                    "Fn::Split": [
                      "||",
                      {
                        "Ref": "referencetoParentStackAssetParameters2701798aa8ab89b534cb48e7dba835aaaf846305bfc31d56e470d21afb52cfbdS3VersionKeyE31AD7F2Ref"
                      }
                    ]
                  }
                ]
              }
            ]
          ]
        }
      },
      "Handler": "moveAccessLogs.handler",
      "Role": {
        "Fn::GetAtt": [
          "moveNewAccessLogsFnServiceRole4C78CFB3",
          "Arn"
        ]
      },
      "Runtime": "nodejs12.x",
      "Environment": {
        "Variables": {
          "TARGET_KEY_PREFIX": "partitioned-gz/"
        }
      },
      "Timeout": 30
    });
  });

  test('moveNewAccessLogsFnAlarm created', () => {
    expect(stack).toHaveResourceLike('AWS::CloudWatch::Alarm', {
      "ComparisonOperator": "GreaterThanOrEqualToThreshold",
      "EvaluationPeriods": 3,
      "ActionsEnabled": true,
      "AlarmActions": [
        {
          "Ref": "referencetoParentStackTestTopicCEBA4F88Ref"
        }
      ],
      "AlarmDescription": "MoveNewAccessLogs Lambda Function Alarm.",
      "Dimensions": [
        {
          "Name": "FunctionName",
          "Value": {
            "Ref": "moveNewAccessLogsFn32F090FE"
          }
        }
      ],
      "MetricName": "Errors",
      "Namespace": "AWS/Lambda",
      "OKActions": [
        {
          "Ref": "referencetoParentStackTestTopicCEBA4F88Ref"
        }
      ],
      "Period": 3600,
      "Statistic": "Sum",
      "Threshold": 1,
      "TreatMissingData": "ignore"
    });
  });
});
