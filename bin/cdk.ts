#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DifyOnAwsStack } from '../lib/dify-on-aws-stack';
import { UsEast1Stack } from '../lib/us-east-1-stack';
import { EnvironmentProps } from '../lib/environment-props';

const props: EnvironmentProps = {
  awsRegion: 'ap-northeast-1',
  // Set Dify version
  difyImageTag: '0.14.2',

  // uncomment the below for cheap configuration:
  // isRedisMultiAz: false,
  // cheapVpc: true,
  // enableAuroraScalesToZero: true,

  // Please see DifyOnAwsStackProps in lib/dify-on-aws-stack.ts for all the available properties
  allowAnySyscalls: true,
  isRedisMultiAz: false,
  cheapVpc: true,
  enableAuroraScalesToZero: true,
};

const app = new cdk.App();

let virginia: UsEast1Stack | undefined = undefined;
if (props.useCloudFront ?? (true && (props.domainName || props.allowedIPv4Cidrs || props.allowedIPv6Cidrs))) {
  virginia = new UsEast1Stack(app, 'DifyOnAwsUsEast1Stack', {
    env: { region: 'us-east-1', account: props.awsAccount },
    domainName: props.domainName,
    allowedIpV4AddressRanges: props.allowedIPv4Cidrs,
    allowedIpV6AddressRanges: props.allowedIPv6Cidrs,
  });
}

new DifyOnAwsStack(app, 'DifyOnAwsStack', {
  env: { region: props.awsRegion, account: props.awsAccount },
  ...props,
  cloudFrontCertificate: virginia?.certificate,
  cloudFrontWebAclArn: virginia?.webAclArn,
});
