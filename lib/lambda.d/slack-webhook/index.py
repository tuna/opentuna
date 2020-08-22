#!/usr/bin/python3

# it's modified from https://github.com/jialechan/cdk-elasticache-monitor that is under Apache 2.0 license
from os import environ
import json
import time
import urllib.parse
import urllib.request

slack_webhook_url = environ['SLACK_WEBHOOK_URL']
channel = "opentuna" if 'CHANNEL' not in environ else environ.get('CHANNEL')
username = "CloudWatch Alarm" if 'USERNAME' not in environ else environ.get('USERNAME')
icon_emoji = ":scream:" if 'ICON_EMOJI' not in environ else environ.get('ICON_EMOJI')
region = environ['AWS_REGION']

def handler(event, context):
    """
    alarm to slack
    """

    print(json.dumps(event))

    for record in event.get("Records"):

        message = json.loads(record.get("Sns").get("Message"))

        title = message.get("AlarmName")
        info = message.get("AlarmDescription")
        awsAccount = message.get("AWSAccountId")
        newState = message.get("NewStateValue")
        newStateReason = message.get("NewStateReason")

        if title is not None:
            log = f"https://{region}.console.{'amazonaws.cn' if region.startswith('cn-') else 'aws.amazon.com'}/cloudwatch/home?region={region}#alarmsV2:alarm/{title}?~(alarmStateFilter~'ALARM)"

            values = {
                "channel": channel,
                "username": username,
                "text": f"{title}\n{info}\nAccount: {awsAccount}\n{newStateReason}\n<{log}|AlarmState>",
                "icon_emoji": icon_emoji if newState == "ALARM" else ":relaxed:"
            }

            params = json.dumps(values).encode('utf8')
            req = urllib.request.Request(slack_webhook_url, data=params, headers={
                                        'content-type': 'application/json'})
            response = urllib.request.urlopen(req)

            print(response.read())
        else:
            print(f"Ignore non-alarm message.")
