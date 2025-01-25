#!/bin/bash
set -e

# # the stack name must be unique enough
STACK_NAME="DifySimpleDeployStack"
ZIP_FILE_NAME="dify-on-aws-files.zip"

echo "Preparing CloudFormation stack $STACK_NAME..."

npm ci
npm run synth
aws cloudformation deploy --stack-name $STACK_NAME --template-file deploy.yaml --capabilities CAPABILITY_IAM
describeStack=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --output json)
bucketName=$(echo $describeStack | jq -r '.Stacks[0].Outputs[] | select(.OutputKey == "BucketName") | .OutputValue')
projectName=$(echo $describeStack | jq -r '.Stacks[0].Outputs[] | select(.OutputKey == "ProjectName") | .OutputValue')
progressUrlBase=$(echo $describeStack | jq -r '.Stacks[0].Outputs[] | select(.OutputKey == "ProgressUrlBase") | .OutputValue')
logGroupName=$(echo $describeStack | jq -r '.Stacks[0].Outputs[] | select(.OutputKey == "LogGroupName") | .OutputValue')

echo "Found S3 bucket: ${bucketName}, CodeBuild project: ${projectName}"
echo 
echo "Preparation completed. Now proceed to deploy Dify on AWS."
echo yes

REPLY="no"

while [ "$REPLY" != "yes" ]
do
  # prompt user to confirm if the configuration is ready
  echo "Are you sure you want to deploy? Please check the configuration parameters in bin/cdk.ts."
  read -p "If you are ready, type 'yes': " -r
  echo 
done

echo "Staging files..."

# create archive of current files
rm -f "/tmp/$ZIP_FILE_NAME"
git ls-files | xargs zip -q "/tmp/$ZIP_FILE_NAME"
aws s3 cp "/tmp/$ZIP_FILE_NAME" s3://${bucketName}/code.zip

echo "Starting deployment..."

buildId=$(aws codebuild start-build --project-name $projectName --query 'build.id' --output text)

if [[ -z "$buildId" ]]; then
    echo "Failed to start CodeBuild project"
    exit 1
fi

echo "Waiting for the CodeBuild project to complete..."
echo "You can check the progress here:"
echo "$progressUrlBase/$buildId"
echo 

aws logs tail --follow $logGroupName --format short--since 30s
while true; do
    buildStatus=$(aws codebuild batch-get-builds --ids $buildId --query 'builds[0].buildStatus' --output text)
    if [[ "$buildStatus" == "SUCCEEDED" || "$buildStatus" == "FAILED" || "$buildStatus" == "STOPPED" ]]; then
        break
    fi
    sleep 10
done
echo "CodeBuild project completed with status: $buildStatus"
echo 

buildDetail=$(aws codebuild batch-get-builds --ids $buildId --output json)
logGroupName=$(echo $buildDetail | jq -r '.builds[0].logs.groupName')
logStreamName=$(echo $buildDetail | jq -r '.builds[0].logs.streamName')
logs=$(aws logs get-log-events --log-group-name $logGroupName --log-stream-name $logStreamName)
frontendUrl=$(echo "$logs" | grep -o 'DifyUrl = [^ ]*' | cut -d' ' -f3 | tr -d '\n' | tr -d '\n,')

echo "Frontend URL: $frontendUrl"
