#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DifyOnAwsStack } from '../lib/dify-on-aws-stack';
import { UsEast1Stack } from '../lib/us-east-1-stack';
import { EnvironmentProps } from '../lib/environment-props';

// 環境変数からIPアドレスを読み取る関数
const parseIpAddresses = (envVar: string | undefined): string[] | undefined => {
  if (!envVar) return undefined;
  return envVar.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
};

export const props: EnvironmentProps = {
  awsRegion: 'us-west-2',
  awsAccount: process.env.CDK_DEFAULT_ACCOUNT!,
  // Set Dify version
  difyImageTag: '1.4.3',
  // Set plugin-daemon version to stable release
  difyPluginDaemonImageTag: '0.1.2-local',

  // WAF設定 - 環境変数からIPアドレスを読み取り
  // 環境変数が設定されていない場合は、すべてのIPアドレスを許可（デフォルト）
  allowedIPv4Cidrs: parseIpAddresses(process.env.ALLOWED_IPV4_CIDRS),
  allowedIPv6Cidrs: parseIpAddresses(process.env.ALLOWED_IPV6_CIDRS),
  allowedCountryCodes: parseIpAddresses(process.env.ALLOWED_COUNTRY_CODES),

  // uncomment the below options for less expensive configuration:
  // isRedisMultiAz: false,
  // useNatInstance: true,
  // enableAuroraScalesToZero: true,
  // useFargateSpot: true,

  // Please see EnvironmentProps in lib/environment-props.ts for all the available properties
};

const app = new cdk.App();

let virginia: UsEast1Stack | undefined = undefined;
if ((props.useCloudFront ?? true) && (props.domainName || props.allowedIPv4Cidrs || props.allowedIPv6Cidrs || props.allowedCountryCodes)) {
  // add a unique suffix to prevent collision with different Dify instances in the same account.
  virginia = new UsEast1Stack(app, `DifyOnAwsUsEast1Stack${props.subDomain ? `-${props.subDomain}` : ''}`, {
    env: { region: 'us-east-1', account: props.awsAccount },
    crossRegionReferences: true,
    domainName: props.domainName,
    allowedIpV4AddressRanges: props.allowedIPv4Cidrs,
    allowedIpV6AddressRanges: props.allowedIPv6Cidrs,
    allowedCountryCodes: props.allowedCountryCodes,
  });
}

new DifyOnAwsStack(app, 'DifyOnAwsStack', {
  env: { region: props.awsRegion, account: props.awsAccount },
  crossRegionReferences: true,
  ...props,
  cloudFrontCertificate: virginia?.certificate,
  cloudFrontWebAclArn: virginia?.webAclArn,
});
