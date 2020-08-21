// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
const util = require('./util');

// AWS Glue Data Catalog database and table
const table = process.env.TABLE;
const database = process.env.DATABASE;

// creates partitions for the hour after the current hour
exports.handler = async (event, context, callback) => {
  var nextHour = new Date(Date.now() + 60 * 60 * 1000);
  var year = nextHour.getUTCFullYear();
  var month = (nextHour.getUTCMonth() + 1).toString().padStart(2, '0');
  var day = nextHour.getUTCDate().toString().padStart(2, '0');
  var hour = nextHour.getUTCHours().toString().padStart(2, '0');
  console.log('Creating Partition', { year, month, day, hour });

  var createPartitionStatement = `
    ALTER TABLE ${database}.${table}
    ADD IF NOT EXISTS 
    PARTITION (
        year = '${year}',
        month = '${month}',
        day = '${day}',
        hour = '${hour}' );`;

  await util.runQuery(createPartitionStatement);
}
