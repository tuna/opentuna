// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
const aws = require('aws-sdk');
const athena = new aws.Athena({ apiVersion: '2017-05-18' });

// s3 URL of the query results (without trailing slash)
const athenaQueryResultsLocation = process.env.ATHENA_QUERY_RESULTS_LOCATION;

async function waitForQueryExecution(queryExecutionId) {
    while (true) {
        var data = await athena.getQueryExecution({
            QueryExecutionId: queryExecutionId
        }).promise();
        const state = data.QueryExecution.Status.State;
        if (state === 'SUCCEEDED') {
            return;
        } else if (state === 'FAILED' || state === 'CANCELLED') {
            throw Error(`Query ${queryExecutionId} failed: ${data.QueryExecution.Status.StateChangeReason}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

exports.runQuery = async (query) => {
    var params = {
        QueryString: query,
        ResultConfiguration: {
            OutputLocation: athenaQueryResultsLocation
        }
    };
    return athena.startQueryExecution(params).promise()
        .then(data => waitForQueryExecution(data.QueryExecutionId));
}