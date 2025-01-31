#!/bin/bash

set -e

DOCKER_HUB_IMAGES=(
    "dify-web:0.14.2"
    "dify-api:0.14.2"
    "dify-sandbox:latest"
    "dify-plugin-daemon:main-local"
)

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
if [ -z "${AWS_REGION}" ]; then
  AWS_REGION=$(aws configure get region)
fi

ECR_REPOSITORY_NAME="dify-images"

log() {
    echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')]: $@"
}

error_handler() {
    log "Error occurred in script at line: ${1}"
    exit 1
}

trap 'error_handler ${LINENO}' ERR

main() {
    log "Starting image transfer process"

    log "Logging in to ECR"
    aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

    for DOCKER_HUB_IMAGE in "${DOCKER_HUB_IMAGES[@]}"; do
        log "Processing image: ${DOCKER_HUB_IMAGE}"
        
        TARGET_IMAGE="langgenius/${DOCKER_HUB_IMAGE}"
        
        # We use a shared repository for all dify image types.
        # To refer to image type, we use tag in format like "dify-api_0.14.2", "dify-sandbox_latest", etc.
        # the tag string cannot contain colons: https://docs.docker.com/reference/cli/docker/image/tag/
        ECR_IMAGE_TAG=$(echo $DOCKER_HUB_IMAGE | tr ':' '_')
        ECR_IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY_NAME}:${ECR_IMAGE_TAG}"
        
        # ECRリポジトリの存在確認と作成
        if ! aws ecr describe-repositories --repository-names "${ECR_REPOSITORY_NAME}" --region ${AWS_REGION} 2>/dev/null; then
            log "Creating ECR repository: ${ECR_REPOSITORY_NAME}"
            aws ecr create-repository --repository-name "${ECR_REPOSITORY_NAME}" --region ${AWS_REGION}
        fi

        docker buildx imagetools create --tag "$ECR_IMAGE_URI" "$TARGET_IMAGE"
        log "Successfully processed image: ${TARGET_IMAGE}"
    done

    log "All images have been processed successfully!"
}

main "$@"
