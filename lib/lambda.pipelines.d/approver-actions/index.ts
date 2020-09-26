import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import * as aws from 'aws-sdk';

const stepfunctions = new aws.StepFunctions();

export const pipelineApprovalAction: APIGatewayProxyHandlerV2 = async (event, _context, callback) => {
    console.info(`Receiving pipeline approval action event ${JSON.stringify(event, null, 2)}.`);

    // workaround to disable slack link auto preview
    // https://slack.com/help/articles/204399343-Share-links-and-set-preview-preferences
    if (event.requestContext.http.userAgent.indexOf('Slackbot') > -1) {
        return {
            statusCode: 401,
            body: `This url does not support Slack LinkExpanding.`,
        };
    }

    var message = {};

    const action = event.queryStringParameters?.action;

    if (action === "approve") {
        message = { "Status": "Approved" };
    } else if (action === "reject") {
        message = { "Status": "Rejected" };
    } else {
        console.error(`Unrecognized action "${action}". Expected: approve, reject.`);
        return {
            statusCode: 400,
            body: `Failed to process the request. Unrecognized Action "${action}".`,
        };
    }

    const taskToken = event.queryStringParameters!.taskToken;
    const statemachineName = event.queryStringParameters!.sm;
    const executionName = event.queryStringParameters!.ex;

    try {
        await stepfunctions.sendTaskSuccess({
            output: JSON.stringify(message),
            taskToken: taskToken,
        }).promise();
    } catch (err) {
        console.error(err, err.stack);
        return {
            statusCode: 500,
            body: err.message,
        }
    }
      
    return { 
        statusCode: 200,
        body: `Deployment pipeline "${statemachineName}" with execution "${executionName}" is ${action === 'approve' ? 'approved' : 'rejected'}.`,
    };
}
