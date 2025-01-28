#!/usr/bin/env node

/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as nag from 'cdk-nag';
import { SecurityControls } from './aspects';
import { AppConfig } from '../config/AppConfig';
import { STAGE } from '../config/Types';
import { PipelineStack } from '../lib/cdk-pipeline/core/PipelineStack';
import { EncryptionStack } from '../lib/stacks/core/EncryptionStack';
import { RepositoryStack } from '../lib/stacks/core/RepositoryStack';
import { SSMParameterStack } from '../lib/stacks/core/SSMParameterStack';
import { VPCStack } from '../lib/stacks/core/VPCStack';

const app = new cdk.App();

const repositoryStack = new RepositoryStack(app, `${AppConfig.applicationName}Repository`, {
  env: { account: AppConfig.deploymentAccounts.RES, region: AppConfig.region },
  applicationName: AppConfig.applicationName,
  applicationQualifier: AppConfig.applicationQualifier,
  repositoryConfig: AppConfig.repositoryConfig,
});

new SSMParameterStack(app, `${AppConfig.applicationName}SSMParameterStack`, {
  env: { account: AppConfig.deploymentAccounts.RES, region: AppConfig.region },
  applicationQualifier: AppConfig.applicationQualifier,
  parameter: {
    AccountRes: AppConfig.deploymentAccounts.RES,
    AccountExp: AppConfig.deploymentAccounts.EXP,
    AccountDev: AppConfig.deploymentAccounts.DEV,
    AccountInt: AppConfig.deploymentAccounts.INT,
  },
});

const vpcStack = new VPCStack(app, `${AppConfig.applicationName}VPCStack`, {
  env: { account: AppConfig.deploymentAccounts.RES, region: AppConfig.region },
  vpcConfig: AppConfig.vpc,
  flowLogsBucketName: AppConfig.complianceLogBucketName.RES,
  applicationQualifier: AppConfig.applicationQualifier,
});

new EncryptionStack(app, `${AppConfig.applicationName}EncryptionStack`, {
  env: { account: AppConfig.deploymentAccounts.RES, region: AppConfig.region },
  stageName: STAGE.RES,
  applicationQualifier: AppConfig.applicationQualifier,
  applicationName: AppConfig.applicationName,
});

new PipelineStack(app, `${AppConfig.applicationName}PipelineStack`, {
  env: { account: AppConfig.deploymentAccounts.RES, region: AppConfig.region },
  applicationName: AppConfig.applicationName,
  applicationQualifier: AppConfig.applicationQualifier,
  deployments: {
    RES: { account: AppConfig.deploymentAccounts.RES, region: AppConfig.region },
    EXP: { account: AppConfig.deploymentAccounts.EXP, region: AppConfig.region },
    DEV: { account: AppConfig.deploymentAccounts.DEV, region: AppConfig.region },
    INT: { account: AppConfig.deploymentAccounts.INT, region: AppConfig.region },
    PROD: { account: AppConfig.deploymentAccounts.PROD, region: AppConfig.region },
  },
  pipelineProps: {
    repositoryInput: repositoryStack.pipelineInput,
    isDockerEnabledForSynth: AppConfig.codeBuildEnvSettings.isPrivileged,
    buildImage: AppConfig.codeBuildEnvSettings.buildImage,
    branch: repositoryStack.repositoryBranch,
    pipelineVariables: {
      ...repositoryStack.pipelineEnvVars,
      PROXY_SECRET_ARN: AppConfig.proxy?.proxySecretArn ?? '',
    },
    vpcProps: (vpcStack.vpc ? {
      vpc: vpcStack.vpc,
      proxy: AppConfig.proxy,
    } : undefined),
  },
});

cdk.Tags.of(app).add('Application', `${AppConfig.applicationName}`);
cdk.Aspects.of(app).add(new SecurityControls(STAGE.RES));
cdk.Aspects.of(app).add(new nag.AwsSolutionsChecks({ verbose: false }));
