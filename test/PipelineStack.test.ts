/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TestAppConfig } from './TestConfig';
import { PipelineStack } from '../lib/cdk-pipeline/core/PipelineStack';
import { RepositoryStack } from '../lib/stacks/core/RepositoryStack';

describe('pipeline-stack-test-codecommit', () => {
  const app = new cdk.App();

  const repository = new RepositoryStack(app, 'CodeCommitRepositoryStack', {
    env: { account: TestAppConfig.deploymentAccounts.RES, region: TestAppConfig.region },
    applicationName: TestAppConfig.applicationName,
    applicationQualifier: TestAppConfig.applicationQualifier,
    repositoryConfig: {
      ...TestAppConfig.repositoryConfig,
      selected: 'CODECOMMIT',
    },
  });

  const template = Template.fromStack(
    new PipelineStack(app, 'PipelineStack', {
      env: { account: TestAppConfig.deploymentAccounts.RES, region: TestAppConfig.region },
      applicationName: TestAppConfig.applicationName,
      applicationQualifier: TestAppConfig.applicationQualifier,
      deployments: {
        RES: { account: TestAppConfig.deploymentAccounts.RES, region: TestAppConfig.region },
        EXP: { account: TestAppConfig.deploymentAccounts.EXP, region: TestAppConfig.region },
        DEV: { account: TestAppConfig.deploymentAccounts.DEV, region: TestAppConfig.region },
        INT: { account: TestAppConfig.deploymentAccounts.INT, region: TestAppConfig.region },
        PROD: { account: TestAppConfig.deploymentAccounts.PROD, region: TestAppConfig.region },
      },
      pipelineProps: {
        repositoryInput: repository.pipelineInput,
        isDockerEnabledForSynth: TestAppConfig.codeBuildEnvSettings.isPrivileged,
        buildImage: TestAppConfig.codeBuildEnvSettings.buildImage,
        branch: repository.repositoryBranch,
        pipelineVariables: {
          ...repository.pipelineEnvVars,
          PROXY_SECRET_ARN: TestAppConfig.proxy?.proxySecretArn ?? '',
        },
      },
    }));

  test('Check if Events rule exists', () => {
    template.resourceCountIs('AWS::Events::Rule', 1);
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: {
        source: ['aws.codecommit'],
      },
      State: 'ENABLED',
    });
  });

  test('Check if Pipeline ENV variables exist', () => {
    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: {
        EnvironmentVariables: [{
          Name: 'CDK_QUALIFIER',
          Type: 'PLAINTEXT',
          Value: TestAppConfig.applicationQualifier,
        }, {
          Name: 'AWS_REGION',
          Type: 'PLAINTEXT',
          Value: TestAppConfig.region,
        }, {
          Name: 'PROXY_SECRET_ARN',
          Type: 'PLAINTEXT',
          Value: TestAppConfig.proxy?.proxySecretArn ?? '',
        }],
      },
    });
  });

  test('Check if CodePipeline Pipeline exists', () => {
    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: [
        {
          Name: 'Source',
        },
        {
          Name: 'Build',
        },
        {
          Name: 'UpdatePipeline',
        },
        {},
        {},
        {},
        {},
        {},
      ],
    });
  });
});

describe('pipeline-stack-test-codestar', () => {
  const app = new cdk.App();

  const repository = new RepositoryStack(app, 'CodeCommitRepositoryStack', {
    env: { account: TestAppConfig.deploymentAccounts.RES, region: TestAppConfig.region },
    applicationName: TestAppConfig.applicationName,
    applicationQualifier: TestAppConfig.applicationQualifier,
    repositoryConfig: {
      ...TestAppConfig.repositoryConfig,
      selected: 'GITHUB',
    },
  });

  const template = Template.fromStack(
    new PipelineStack(app, 'PipelineStack', {
      env: { account: TestAppConfig.deploymentAccounts.RES, region: TestAppConfig.region },
      applicationName: TestAppConfig.applicationName,
      applicationQualifier: TestAppConfig.applicationQualifier,
      deployments: {
        RES: { account: TestAppConfig.deploymentAccounts.RES, region: TestAppConfig.region },
        EXP: { account: TestAppConfig.deploymentAccounts.EXP, region: TestAppConfig.region },
        DEV: { account: TestAppConfig.deploymentAccounts.DEV, region: TestAppConfig.region },
        INT: { account: TestAppConfig.deploymentAccounts.INT, region: TestAppConfig.region },
        PROD: { account: TestAppConfig.deploymentAccounts.PROD, region: TestAppConfig.region },
      },
      pipelineProps: {
        repositoryInput: repository.pipelineInput,
        isDockerEnabledForSynth: TestAppConfig.codeBuildEnvSettings.isPrivileged,
        buildImage: TestAppConfig.codeBuildEnvSettings.buildImage,
        branch: repository.repositoryBranch,
        pipelineVariables: {
          ...repository.pipelineEnvVars,
          PROXY_SECRET_ARN: TestAppConfig.proxy?.proxySecretArn ?? '',
        },
      },
    }));

  test('Check if Pipeline ENV variables exist', () => {
    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: {
        EnvironmentVariables: [{
          Name: 'CDK_QUALIFIER',
          Type: 'PLAINTEXT',
          Value: TestAppConfig.applicationQualifier,
        }, {
          Name: 'AWS_REGION',
          Type: 'PLAINTEXT',
          Value: TestAppConfig.region,
        }, {
          Name: 'CODESTAR_CONNECTION_ARN',
          Type: 'PLAINTEXT',
          Value: TestAppConfig.repositoryConfig.GITHUB.codeStarConnectionArn,
        }, {
          Name: 'PROXY_SECRET_ARN',
          Type: 'PLAINTEXT',
          Value: TestAppConfig.proxy?.proxySecretArn ?? '',
        }],
      },
    });
  });

  test('Check if CodePipeline Pipeline exists', () => {
    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: [
        {
          Name: 'Source',
        },
        {
          Name: 'Build',
        },
        {
          Name: 'UpdatePipeline',
        },
        {},
        {},
        {},
        {},
        {},
      ],
    });
  });
});
