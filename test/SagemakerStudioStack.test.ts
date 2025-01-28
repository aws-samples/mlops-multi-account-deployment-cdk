/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { TestAppConfig } from './TestConfig';
import { SAGEMAKER_STUDIO_USERS, SAGEMAKER_VPC_CONFIG } from '../config/MLOpsConfig';
import { STAGE } from '../config/Types';
import { SagemakerStudioStack } from '../lib/stacks/app/sagemaker/SagemakerStudioStack';
import { EncryptionStack } from '../lib/stacks/core/EncryptionStack';

describe('sagemaker-studio-stack-test', () => {
  const app = new cdk.App();

  const stage = new cdk.Stage(app, 'TestState', { env: { region: TestAppConfig.region, account: TestAppConfig.deploymentAccounts.EXP } });
  const encryptionStack = new EncryptionStack(stage, `${TestAppConfig.applicationName}EncryptionStack`, {
    stageName: STAGE.EXP,
    applicationName: TestAppConfig.applicationName,
    applicationQualifier: TestAppConfig.applicationQualifier,
  });

  const template = Template.fromStack( new SagemakerStudioStack(stage, `${TestAppConfig.applicationName}SagemakerStudioStack`, {
    env: { account: TestAppConfig.deploymentAccounts.DEV, region: TestAppConfig.region },
    kmsKey: encryptionStack.kmsKey,
    name: `SagemakerDomain-${TestAppConfig.applicationQualifier}`,
    vpcConfig: SAGEMAKER_VPC_CONFIG,
    roleConfig: SAGEMAKER_STUDIO_USERS,
  }));

  test('Check number of SageMaker::UserProfile', () => {
    template.resourceCountIs('AWS::SageMaker::UserProfile', SAGEMAKER_STUDIO_USERS.length);
  });

  test('Check SageMaker Domain Configuration', () => {
    template.resourceCountIs('AWS::SageMaker::Domain', 1);
    template.hasResourceProperties('AWS::SageMaker::Domain', {
      AppNetworkAccessType: 'VpcOnly',
      DomainName: `SagemakerDomain-${TestAppConfig.applicationQualifier}`,
      AuthMode: 'IAM',
      SubnetIds: Match.arrayEquals(SAGEMAKER_VPC_CONFIG.subnetIdList),
      VpcId: Match.stringLikeRegexp(SAGEMAKER_VPC_CONFIG.vpcId),
    });
  });
});