#!/bin/bash
set -e

# Configuration
IMAGE_NAME="nuclearcat/k8swebview"
TAG="${1:-latest}"
FULL_IMAGE="${IMAGE_NAME}:${TAG}"

echo "Building Docker image: ${FULL_IMAGE}"

# Build the Docker image
sudo docker build -t ${FULL_IMAGE} .

# Tag as latest if not already
if [ "${TAG}" != "latest" ]; then
    sudo docker tag ${FULL_IMAGE} ${IMAGE_NAME}:latest
fi

echo "Successfully built: ${FULL_IMAGE}"

# Push to Docker Hub
echo "Pushing image to Docker Hub..."
sudo docker push ${FULL_IMAGE}

if [ "${TAG}" != "latest" ]; then
    sudo docker push ${IMAGE_NAME}:latest
fi

echo "Successfully pushed: ${FULL_IMAGE}"
echo "Image is now available at: https://hub.docker.com/r/${IMAGE_NAME}"