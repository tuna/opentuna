import { Handler } from 'aws-lambda';
import { SNS } from 'aws-sdk';

export type PipelineApprovalNotificationHandler = Handler<PipelineApprovalNotificationEvent, void>;

export interface StepFunctionEvent {
    Execution: {
        Id: string,
        Input: { [name: string]: string },
        Name: string,
        RoleArn: string,
        StartTime: string,
    },
    State: {
        EnteredTime: string,
        Name: string,
        RetryCount: number,
    },
    StateMachine: {
        Id: string,
        Name: string,
    },
    Task: {
        Token: string,
    }
}

export interface PipelineApprovalNotificationEvent {
    ExecutionContext: StepFunctionEvent,
    ActionEndpoint: string,
    SNSTopicArn: string,
    Commit: string,
    Stage: string,
    Timeout: number,
}

const sns = new SNS();

export const pipelineApproverNotification: PipelineApprovalNotificationHandler = async (event, _context, callback) => {
    console.info(`Receiving step function event ${JSON.stringify(event, null, 2)} for pipeline approval.`);

    const approvalEvent = {
        executionName: event.ExecutionContext.Execution.Name,
        stateMachineName: event.ExecutionContext.StateMachine.Name,
        approveAction: `${event.ActionEndpoint}/approval?action=approve&ex=${event.ExecutionContext.Execution.Name}&sm=${event.ExecutionContext.StateMachine.Name}&taskToken=${encodeURIComponent(event.ExecutionContext.Task.Token)}`,
        rejectAction: `${event.ActionEndpoint}/approval?action=reject&ex=${event.ExecutionContext.Execution.Name}&sm=${event.ExecutionContext.StateMachine.Name}&taskToken=${encodeURIComponent(event.ExecutionContext.Task.Token)}`,
        timeout: event.Timeout,
        commit: event.Commit,
        type: 'pipeline',
        stage: 'approval',
        nextStage: event.Stage,
    }

    var params = {
        Message: JSON.stringify(approvalEvent),
        Subject: `Pls approve OpenTUNA stage "${event.Stage}" on commit "${event.Commit}". The approval will be timeout in ${event.Timeout} minutes.".`.slice(0, 95).concat('...'),
        TopicArn: event.SNSTopicArn,
    };

    try {
        const rt = await sns.publish(params).promise();
        console.log("MessageID is " + rt.MessageId);
        callback(null);
    } catch (err) {
        console.error(err, err.stack);
        callback(err);
    }
}