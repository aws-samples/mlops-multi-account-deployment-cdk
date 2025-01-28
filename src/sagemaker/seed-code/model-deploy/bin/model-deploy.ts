#!/usr/bin/env node
/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as nag from 'cdk-nag';
import { ModelMetaData, ModelConfig } from '../config/ModelMetaData';
import { Environment } from '../config/Utils';
import { SagemakerEndpointStack } from '../lib/SagemakerEndpointStack';

const modelMetaData: ModelConfig = ModelMetaData.loadJSON('modelMetaData.json');
const app = new cdk.App();

new SagemakerEndpointStack(app, `${modelMetaData.modelPackageGroupName}-Endpoint`, {
  env: { account: Environment.getEnvVar('DEPLOYMENT_ACCOUNT'), region: Environment.getEnvVar('DEPLOYMENT_REGION') },
  kmsKeyArnParameterName: Environment.getEnvVar('KMS_KEY_ARN_PARAMETER'),
  kmsKeyAliasExp: Environment.getEnvVar('KMS_KEY_ALIAS_EXP'),
  vpcIdParameterName: Environment.getEnvVar('VPC_ID_PARAMETER'),
  securityGroupIdParameterName: Environment.getEnvVar('SECURITY_GROUP_ID_PARAMETER'),
  modelMetaData,
});

cdk.Aspects.of(app).add(new nag.AwsSolutionsChecks({ verbose: false }));