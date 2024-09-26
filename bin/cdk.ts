#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DifyOnAwsStack } from '../lib/dify-on-aws-stack';

const app = new cdk.App();
new DifyOnAwsStack(app, 'DifyOnAwsStack', {
  env: {
    region: 'ap-northeast-1',
    // You need to explicitly set AWS account ID when you look up an existing VPC.
    // account: '123456789012'
  },
  // Allow access from the Internet. Narrow this down if you want further security.
  allowedCidrs: ['0.0.0.0/0'],
  difyImageTag: '0.8.3',
});
