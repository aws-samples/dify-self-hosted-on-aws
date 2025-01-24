#!/bin/bash
set -e

# # the stack name must be unique enough
STACK_NAME="DifySimpleDeployStack"
ZIP_FILE_NAME="dify-on-aws-files.zip"

echo "Preparing CloudFormation stack $STACK_NAME..."

# npm ci
npm run synth
aws cloudformation deploy --stack-name $STACK_NAME --template-file deploy.yaml --capabilities CAPABILITY_IAM
BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue | [0]' --output text)
PROJECT_NAME=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`ProjectName`].OutputValue | [0]' --output text)

echo "Found S3 bucket ${BUCKET_NAME}, CodeBuild project ${PROJECT_NAME}"
echo 

# REPLY="no"

# while [ $REPLY != "yes" ]
# do
#   # prompt user to confirm if the configuration is ready
#   echo "Are you sure you want to deploy? Please check the configuration parameters in bin/cdk.ts."
#   read -p "If you are ready, type 'yes': " -r
#   echo 
# done

echo "Staging files..."

# create archive of current files
git ls-files | xargs zip -q /tmp/$ZIP_FILE_NAME
aws s3 cp /tmp/$ZIP_FILE_NAME s3://${BUCKET_NAME}/code.zip

echo "Starting deployment..."

buildId=$(aws codebuild start-build --project-name $PROJECT_NAME --query 'build.id' --output text)

if [[ -z "$buildId" ]]; then
    echo "Failed to start CodeBuild project"
    exit 1
fi

echo "Waiting for the CodeBuild project to complete..."
while true; do
    buildStatus=$(aws codebuild batch-get-builds --ids $buildId --query 'builds[0].buildStatus' --output text)
    if [[ "$buildStatus" == "SUCCEEDED" || "$buildStatus" == "FAILED" || "$buildStatus" == "STOPPED" ]]; then
        break
    fi
    sleep 10
done
echo "CodeBuild project completed with status: $buildStatus"
