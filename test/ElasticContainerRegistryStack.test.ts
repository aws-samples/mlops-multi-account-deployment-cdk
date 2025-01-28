/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TestAppConfig } from './TestConfig';
import { IECRConfig, IECRRepositoryConfig } from '../config/MLOpsConfig';
import { STAGE } from '../config/Types';
import { ElasticContainerRegistryStack } from '../lib/stacks/app/ecr/ElasticContainerRegistryStack';

describe('image-build-pipeline-stack-test', () => {
  const app = new cdk.App();

  const repositoryConfig: IECRConfig = {
    codeCommitSource: {
      type: 'CODECOMMIT_FROM_LOOKUP',
      name: '',
      branch: 'main',
    },
    repositories: [{
      repositoryName: 'test/repository',
      sourceFolder: 'sourceFolder',
    }],
  };

  const template = Template.fromStack(
    new ElasticContainerRegistryStack(app, 'ElasticContainerRegistryStack', {
      imageBuildAccountPrincipal: TestAppConfig.deploymentAccounts.EXP,
      imagePullAccountPrincipals: {
        [STAGE.EXP]: TestAppConfig.deploymentAccounts.EXP,
        [STAGE.DEV]: TestAppConfig.deploymentAccounts.DEV,
        [STAGE.INT]: TestAppConfig.deploymentAccounts.INT,
        [STAGE.PROD]: TestAppConfig.deploymentAccounts.PROD,
      },
      repositoryConfig,
    }));

  const lifecyclePolicyObject = {
    rules: [
      {
        rulePriority: 1,
        description: 'Expire untagged images after 7 days',
        selection: {
          tagStatus: 'untagged',
          countType: 'sinceImagePushed',
          countNumber: 7,
          countUnit: 'days',
        },
        action: {
          type: 'expire',
        },
      },
    ],
  };

  test('Check ECR and config exists', () => {
    template.resourceCountIs('AWS::ECR::Repository', 1);

    repositoryConfig.repositories.forEach((config: IECRRepositoryConfig) => {
      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: config.repositoryName,
        LifecyclePolicy: {
          LifecyclePolicyText: JSON.stringify(lifecyclePolicyObject),
        },
      });
    });
  });
});