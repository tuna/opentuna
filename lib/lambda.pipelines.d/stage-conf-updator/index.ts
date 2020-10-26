import { SNSHandler } from 'aws-lambda';
import { Stage } from '../../pipeline-stack';
const { SSM } = require("@aws-sdk/client-ssm");

export type StageIAMCertChangedEventHandler = SNSHandler;

export interface StageIAMCertChangedEvent {
    type: string,
    certificateDomain: string,
    iamCertId: string,
    iamCertName: string,
    account: string,
    stage: string,
}

const CONF_PREFIX = process.env.CONF_PREFIX || '/opentuna/pipeline/stage/';
const ssm = new SSM();

export const certChangedEvent: StageIAMCertChangedEventHandler = async (event, _context, callback) => {
    console.info(`Receiving IAM cert changed event ${JSON.stringify(event, null, 2)} for pipeline stage.`);

    const iamEvent = <StageIAMCertChangedEvent>JSON.parse(event.Records[0].Sns.Message)

    console.debug(`Got parsed iam changed event ${JSON.stringify(iamEvent, null, 2)}.`);

    const confKey = `${CONF_PREFIX}${iamEvent.stage}`;

    try {
        console.debug(`Getting stage conf with key '${confKey}'.`)
        const conf = await ssm.getParameter({ Name: confKey, });
        console.debug(`Got stage conf content '${conf.Parameter.Value}'.`);
        const stageConf = <Stage>JSON.parse(conf.Parameter.Value);
        if (stageConf.assumeRoleContexts.account != iamEvent.account)
            throw new Error(`The account '${stageConf.assumeRoleContexts.account}' of stage conf '${iamEvent.stage}' does NOT match event account '${iamEvent.account}'.`);

        console.log(`Got the conf for stage '${iamEvent.stage}'.`);

        const newDeployContexts = Object.assign(stageConf.deployContexts, {
            iamCertId: iamEvent.iamCertId,
        });
        const newStageConf = Object.assign(stageConf, {
            deployContexts: newDeployContexts,
        });

        const putRT = await ssm.putParameter({
            Name: confKey,
            Value: JSON.stringify(newStageConf),
            Overwrite: true,
            Type: 'String',
        });

        console.info(`Successfully updated stage '${iamEvent.stage}' to version ${putRT.Version} with iam certid '${newStageConf.deployContexts.iamCertId}'.`);

        callback(null);
    } catch (err) {
        console.error(err, err.stack);
        callback(err);
    }
}