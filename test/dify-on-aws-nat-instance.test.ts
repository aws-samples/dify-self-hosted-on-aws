import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { DifyOnAwsStack } from '../lib/dify-on-aws-stack';

test('Snapshot test (with NAT instance)', () => {
  // GIVEN
  const app = new cdk.App();

  // WHEN
  const main = new DifyOnAwsStack(app, 'TestStack', {
    env: { region: 'us-west-2', account: '123456789012' },
    useCloudFront: false,
    useNatInstance: true,
    difySandboxImageTag: '0.2.4',
  });

  // THEN
  const template = Template.fromStack(main);
  template.resourceCountIs('AWS::EC2::VPC', 1);
  const vpcId = Object.keys(template.findResources('AWS::EC2::VPC'))[0];
  template.hasResourceProperties('AWS::EC2::SecurityGroup', {
    GroupDescription: 'Security Group for NAT instances',
    SecurityGroupIngress: Match.arrayEquals([
      Match.objectLike({
        CidrIp: { 'Fn::GetAtt': [vpcId, 'CidrBlock'] },
        IpProtocol: '-1',
      }),
    ]),
    SecurityGroupEgress: Match.arrayEquals([Match.objectLike({ CidrIp: '0.0.0.0/0', IpProtocol: '-1' })]),
  });
  template.resourceCountIs('AWS::EC2::Instance', 1);
  template.resourceCountIs('AWS::EC2::NatGateway', 0);
  expect(template).toMatchSnapshot();
});
