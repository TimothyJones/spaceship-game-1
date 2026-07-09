#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { SpaceBeStack } from "./space-be-stack.js";

// CDK entry point. The stack name can be overridden with STACK_NAME so you
// can stand up throwaway environments (e.g. STACK_NAME=space-be-dev).
const app = new App();
new SpaceBeStack(app, process.env.STACK_NAME ?? "SpaceBeStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
