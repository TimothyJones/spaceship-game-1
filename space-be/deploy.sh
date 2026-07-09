#!/usr/bin/env bash
# Deploy the spaceship backend (Lambda + HTTP API + DynamoDB) with AWS CDK.
#
# Usage:
#   ./deploy.sh                 # synth + deploy to the default AWS account/region
#   ./deploy.sh --hotswap       # fast Lambda-only redeploy during development
#   STACK_NAME=space-be-dev ./deploy.sh
#
# Requires AWS credentials (e.g. `aws sso login`) and a one-time
# `npx cdk bootstrap` per account/region. The printed ApiUrl output is what
# the frontend's VITE_API_URL should point at (append /api).
set -euo pipefail

cd "$(dirname "$0")"

# The workspace is linked from the repo root, so deps must be installed there.
if [ ! -d node_modules ] && [ ! -d ../node_modules/aws-cdk-lib ]; then
  echo "Installing dependencies..."
  (cd .. && npm install)
fi

# Bootstrap the environment on first use; harmless (and quick) if already done.
if [ "${SKIP_BOOTSTRAP:-}" != "1" ]; then
  npx cdk bootstrap
fi

npx cdk deploy --require-approval never "$@"
