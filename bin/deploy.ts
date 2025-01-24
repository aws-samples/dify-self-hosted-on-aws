import * as cdk from 'aws-cdk-lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BuildSpec, Project, Source } from 'aws-cdk-lib/aws-codebuild';

const app = new cdk.App();
const stack = new cdk.Stack(app, 'DeployStack', {});
const bucket = new Bucket(stack, 'SourceBucket');
const project = new Project(stack, 'Project', {
  source: Source.s3({
    bucket: bucket,
    path: 'code.zip',
  }),
  buildSpec: BuildSpec.fromSourceFilename('buildspec.yml'),
});

new cdk.CfnOutput(stack, 'BucketName', {
  value: bucket.bucketName,
});
new cdk.CfnOutput(stack, 'ProjectName', {
  value: project.projectName,
});
