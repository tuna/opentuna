#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { OpentunaStack } from '../lib/opentuna-stack';

const app = new cdk.App();
new OpentunaStack(app, 'OpentunaStack');
