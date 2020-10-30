import { Handler } from 'aws-lambda';
const { SNS } = require("@aws-sdk/client-sns");

export type StageIAMCertChangedEventHandler = Handler<StageIAMCertChangedEvent, void>;

export interface StageIAMCertChangedEvent {
    type: string,
    certificateDomain: string,
    iamCertId: string,
    iamCertName: string,
    account: string,
    stage: string,
}

const topicARN = process.env.TOPIC_ARN;
if (!topicARN) {
    throw new Error('TOPIC_ARN is required.');
}
const sns = new SNS();

export const iamCertEventSender: StageIAMCertChangedEventHandler = async (event, _context, callback) => {
    console.info(`Receiving IAM cert changed event ${JSON.stringify(event, null, 2)}.`);

    try {
        const rt = await sns.publish({
            Message: JSON.stringify(event),
            TopicArn: topicARN,
        });

        console.debug(`The event is published with id '${rt.MessageId}'.`);

        callback(null);
    } catch (err) {
        console.error(err, err.stack);
        callback(err);
    }
}