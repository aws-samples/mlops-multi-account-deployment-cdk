/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TestAppConfig } from './TestConfig';
import { STAGE } from '../config/Types';
import { ModelDeployServiceCatalogStack } from '../lib/stacks/app/sagemaker/ModelDeployServiceCatalogStack';
import { ModelDeploymentProductStack } from '../lib/stacks/app/sagemaker/projects/ModelDeploymentProductStack';

describe('sagemaker-studio-stack-test', () => {
  const app = new cdk.App();
  const stage = new cdk.Stage(app, 'TestState', { env: { region: TestAppConfig.region, account: TestAppConfig.deploymentAccounts.RES } });

  const testStack = new cdk.Stack(stage, 'RoleStack');

  const template = Template.fromStack(new ModelDeployServiceCatalogStack(stage, 'ModelDeployServiceCatalogStack', {
    stageName: STAGE.RES,
    applicationName: TestAppConfig.applicationName,
    applicationQualifier: TestAppConfig.applicationQualifier,
    productLaunchIAMRoleArn: `arn:aws:iam::${TestAppConfig.deploymentAccounts.RES}:role/PA_DEVELOPER`,
    modelDeployEnvironments: {
      [STAGE.DEV]: {
        account: TestAppConfig.deploymentAccounts.DEV,
        region: TestAppConfig.region,
      },
      [STAGE.INT]: {
        account: TestAppConfig.deploymentAccounts.INT,
        region: TestAppConfig.region,
      },
      [STAGE.PROD]: {
        account: TestAppConfig.deploymentAccounts.PROD,
        region: TestAppConfig.region,
      },
    },
    modelBuildEnvironment: {
      account: TestAppConfig.deploymentAccounts.DEV,
      region: TestAppConfig.region,
    },
  }));

  test('Check Launch IAM role exists', () => {
    template.hasResource('AWS::IAM::Role', 2);
  });

  test('Check Service Catalog Portfolio exists', () => {
    template.resourceCountIs('AWS::ServiceCatalog::Portfolio', 1);
  });

  test('Check Service Catalog Product exists', () => {
    template.resourceCountIs('AWS::ServiceCatalog::CloudFormationProduct', 1);
    template.hasResourceProperties('AWS::ServiceCatalog::CloudFormationProduct', {
      Description: ModelDeploymentProductStack.DESCRIPTION,
      Name: ModelDeploymentProductStack.TEMPLATE_NAME,
    });
  });

  test('Check Service Catalog Product S3 Assets exists', () => {
    template.resourceCountIs('AWS::S3::Bucket', 1);
  });

  test('Check Service Catalog LaunchRoleConstraint exists', () => {
    template.resourceCountIs('AWS::ServiceCatalog::LaunchRoleConstraint', 1);
  });

  test('Check Event Bus Policy Existence', () => {
    template.resourceCountIs('AWS::Events::EventBusPolicy', 1);
  });

  test('Check Event Bus Policy Conformity', () => {
    template.hasResourceProperties('AWS::Events::EventBusPolicy', {
      EventBusName: 'default',
      Principal: TestAppConfig.deploymentAccounts.DEV,
    });
  });

});