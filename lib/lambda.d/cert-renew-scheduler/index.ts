import { Handler } from 'aws-lambda';
const { EventBridge } = require("@aws-sdk/client-eventbridge");

export type StageIAMCertChangedEventHandler = Handler<StageIAMCertChangedEvent, void>;

export interface StageIAMCertChangedEvent {
    certificateProjectARN: string,
    ruleName: string,
    interval: number,
    ruleRole: string,
}

const client = new EventBridge();

export const certRenewScheduler: StageIAMCertChangedEventHandler = async (event, _context, callback) => {
    console.info(`Receiving IAM cert changed event ${JSON.stringify(event, null, 2)}.`);

    try {
        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + event.interval);

        console.debug(`Will schedule next cert renew at ${scheduledDate}.`);

        const ruleName = event.ruleName;
        const putRuleParams = {
            Name: ruleName,
            Description: 'Schedule starting certificate renew build',
            RoleArn: event.ruleRole,
            ScheduleExpression: `cron(0 1 ${scheduledDate.getUTCDate()} ${scheduledDate.getUTCMonth() + 1} ? ${scheduledDate.getUTCFullYear()})`,
            State: 'ENABLED',
        };
        console.debug(`Creating/updating rule of EventBridge as ${JSON.stringify(putRuleParams, null, 2)}.`);

        const rt = await client.putRule(putRuleParams);

        console.debug(`Rule ${rt.RuleArn} was updated/created.`);

        const putTargetParams = {
            Rule: ruleName,
            Targets: [ 
                {
                    Id: 'certificate-renew-codebuild-target',
                    Arn: event.certificateProjectARN,
                    RoleArn: event.ruleRole,
                },
            ],
        };
        console.debug(`Putting targets '${JSON.stringify(putTargetParams, null, 2)}' to rule '${ruleName}'.`);
        const putTargetRt = await client.putTargets(putTargetParams);
        console.debug(`Put targets to rule '${ruleName}' with result '${JSON.stringify(putTargetRt, null, 2)}'.`);

        if (putTargetRt.FailedEntryCount > 0) {
            throw new Error(`Failed to put targets to rule '${ruleName}'.`);
        }

        callback(null);
    } catch (err) {
        console.error(err, err.stack);
        callback(err);
    }
}