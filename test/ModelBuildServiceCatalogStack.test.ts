/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TestAppConfig } from './TestConfig';
import { STAGE } from '../config/Types';
import { ModelBuildServiceCatalogStack } from '../lib/stacks/app/sagemaker/ModelBuildServiceCatalogStack';
import { ModelBuildingProductStack } from '../lib/stacks/app/sagemaker/projects/ModelBuildingProductStack';
import { EncryptionStack } from '../lib/stacks/core/EncryptionStack';

describe('sagemaker-studio-stack-test', () => {
  const app = new cdk.App();
  const stage = new cdk.Stage(app, 'TestState', { env: { region: TestAppConfig.region, account: TestAppConfig.deploymentAccounts.EXP } });
  const encryptionStack = new EncryptionStack(stage, `${TestAppConfig.applicationName}EncryptionStack`, {
    stageName: STAGE.EXP,
    applicationName: TestAppConfig.applicationName,
    applicationQualifier: TestAppConfig.applicationQualifier,
  });

  const template = Template.fromStack(new ModelBuildServiceCatalogStack(stage, `${TestAppConfig.applicationName}ServiceCatalogStack`, {
    stageName: STAGE.DEV,
    applicationName: TestAppConfig.applicationName,
    applicationQualifier: TestAppConfig.applicationQualifier,
    encryptionKey: encryptionStack.kmsKey,
    productLaunchIAMRoleArnList: ['arn:aws:iam::123456789012:role/LeadDataScientistRole'],
    deploymentPipelineEnvironment: {
      account: TestAppConfig.deploymentAccounts.DEV,
      region: TestAppConfig.region,
    },
    deploymentTargetAccounts: {
      [STAGE.DEV]: TestAppConfig.deploymentAccounts.DEV,
      [STAGE.INT]: TestAppConfig.deploymentAccounts.INT,
      [STAGE.PROD]: TestAppConfig.deploymentAccounts.PROD,
    },
  }));

  test('Check Launch IAM role exists', () => {
    template.hasResource('AWS::IAM::Role', 1);
  });

  test('Check Service Catalog Portfolio exists', () => {
    template.resourceCountIs('AWS::ServiceCatalog::Portfolio', 1);
  });

  test('Check Service Catalog Product exists', () => {
    template.resourceCountIs('AWS::ServiceCatalog::CloudFormationProduct', 1);
    template.hasResourceProperties('AWS::ServiceCatalog::CloudFormationProduct', {
      Description: ModelBuildingProductStack.DESCRIPTION,
      Name: ModelBuildingProductStack.TEMPLATE_NAME,
    });
  });

  test('Check Service Catalog Product S3 Assets exists', () => {
    template.resourceCountIs('AWS::S3::Bucket', 1);
  });

  test('Check Service Catalog LaunchRoleConstraint exists', () => {
    template.resourceCountIs('AWS::ServiceCatalog::LaunchRoleConstraint', 1);
  });

});