import json
import urllib3
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)
http = urllib3.PoolManager()
tunasync_manager_url = os.environ['TUNASYNC_MANAGER_URL']

def handler(event, context):
    logger.info(event)
    requestUrl = tunasync_manager_url + '/cmd'

    requestBody = {}
    requestBody['cmd'] = 'start'
    requestBody['worker_id'] = 'tunasync-worker'
    requestBody['mirror_id'] = event['repo']

    body = json.dumps(requestBody)
    logger.info("Request body:\n" + body)

    headers = {
        'content-type' : 'application/json',
        'content-length' : str(len(body))
    }

    try:
        response = http.request('POST',
                                requestUrl,
                                body=body,
                                headers=headers,
                                retries=False)
        logger.info("Status code: " + str(response.status))
    except Exception as e:
        logger.error("Unable to send request to Tunasync manager")
        logger.exception(e)
