#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DifyOnAwsStack } from '../lib/dify-on-aws-stack';

const app = new cdk.App();
new DifyOnAwsStack(app, 'DifyOnAwsStack', {
  env: {
    region: 'us-west-2',
    // You need to explicitly set AWS account ID when you look up an existing VPC.
    // account: '123456789012'
  },
  // Allow access from the Internet. Narrow this down if you want further security.
  allowedIPv4Cidrs: ['0.0.0.0/0'],
  allowedIPv6Cidrs: ['::/0'],
  // Set Dify version
  difyImageTag: '0.14.2',

  // uncomment the below for cheap configuration:
  // isRedisMultiAz: false,
  // cheapVpc: true,
  // enableAuroraScalesToZero: true,

  // Please see DifyOnAwsStackProps in lib/dify-on-aws-stack.ts for all the available properties
});
