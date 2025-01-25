import * as cdk from 'aws-cdk-lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BuildSpec, LinuxBuildImage, Project, Source } from 'aws-cdk-lib/aws-codebuild';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';

const app = new cdk.App();
const stack = new cdk.Stack(app, 'DeployStack', {
  description: 'A stack to deploy Dify-on-AWS resources from CloudShell.',
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});
const bucket = new Bucket(stack, 'SourceBucket');
const logGroup = new LogGroup(stack, 'LogGroup', {
  retention: RetentionDays.THREE_MONTHS,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
const project = new Project(stack, 'Project', {
  environment: {
    buildImage: LinuxBuildImage.STANDARD_7_0,
  },
  source: Source.s3({
    bucket: bucket,
    path: 'code.zip',
  }),
  buildSpec: BuildSpec.fromSourceFilename('buildspec.yml'),
  logging: {
    cloudWatch: {
      logGroup,
    },
  },
});
project.role!.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

new cdk.CfnOutput(stack, 'BucketName', {
  value: bucket.bucketName,
});
new cdk.CfnOutput(stack, 'ProjectName', {
  value: project.projectName,
});
new cdk.CfnOutput(stack, 'ProgressUrlBase', {
  value: `https://${cdk.Stack.of(stack).region}.console.aws.amazon.com/codesuite/codebuild/${cdk.Stack.of(stack).account}/projects/${project.projectName}/build`,
});
new cdk.CfnOutput(stack, 'LogGroupName', {
  value: logGroup.logGroupName,
});
