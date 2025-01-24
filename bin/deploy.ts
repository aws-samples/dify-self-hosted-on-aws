import * as cdk from 'aws-cdk-lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BuildSpec, LinuxBuildImage, Project, Source } from 'aws-cdk-lib/aws-codebuild';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';

const app = new cdk.App();
const stack = new cdk.Stack(app, 'DeployStack', {
  description: 'A stack to deploy Dify-on-AWS resources from CloudShell.',
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});
const bucket = new Bucket(stack, 'SourceBucket');
const project = new Project(stack, 'Project', {
  environment: {
    buildImage: LinuxBuildImage.STANDARD_7_0,
  },
  source: Source.s3({
    bucket: bucket,
    path: 'code.zip',
  }),
  buildSpec: BuildSpec.fromSourceFilename('buildspec.yml'),
});
project.role!.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

new cdk.CfnOutput(stack, 'BucketName', {
  value: bucket.bucketName,
});
new cdk.CfnOutput(stack, 'ProjectName', {
  value: project.projectName,
});
