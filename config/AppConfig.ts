/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { IAppConfig, ICodeBuildEnvSettings, RepositoryType } from './Types';
import { Environment } from './Utils';
import { VpcConfig } from './VpcConfig';

export const codeBuildEnvSettings: ICodeBuildEnvSettings = {
  isPrivileged: true,
  buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
};

const region: string = Environment.getEnvVar('AWS_REGION');
const deploymentAccounts = {
  RES: Environment.getEnvVar('ACCOUNT_RES'),
  EXP: Environment.getEnvVar('ACCOUNT_EXP'),
  DEV: Environment.getEnvVar('ACCOUNT_DEV'),
  INT: Environment.getEnvVar('ACCOUNT_INT'),
  PROD: Environment.getEnvVar('ACCOUNT_PROD'),
};

export const AppConfig: IAppConfig = {
  applicationName: Environment.getEnvVar('npm_package_config_applicationName'),
  deploymentAccounts: deploymentAccounts,
  applicationQualifier: Environment.getEnvVar('npm_package_config_cdkQualifier'),
  region: region,
  logRetentionInDays: '365',
  codeBuildEnvSettings: codeBuildEnvSettings,
  vpc: VpcConfig.VPC,
  /*
  proxy config is optional and applies only to the CDK pipeline deployed in RES.
  If no proxy is used, remove its entry from the config
  */
  proxy: {
    proxySecretArn: Environment.getEnvVar('PROXY_SECRET_ARN', ''),
    noProxy: [`${region}.amazonaws.com`],
    proxyTestUrl: 'https://aws.amazon.com/',
  },
  repositoryConfig: {
    selected: Environment.getEnvVar('npm_package_config_repositoryType') as RepositoryType,
    GITHUB: {
      name: Environment.getEnvVar('npm_package_config_repositoryName'),
      codeStarConnectionArn: Environment.getEnvVar('CODESTAR_CONNECTION_ARN', ''),
      branch: 'main',
    },
    CODECOMMIT: {
      name: Environment.getEnvVar('npm_package_config_repositoryName'),
      description: 'CodeCommit repository used for the CI/CD pipeline',
      branch: 'main',
      codeBuildConfig: codeBuildEnvSettings,
    },
  },
  complianceLogBucketName: {
    RES: `compliance-log-${deploymentAccounts.RES}-${region}`,
    EXP: `compliance-log-${deploymentAccounts.EXP}-${region}`,
    DEV: `compliance-log-${deploymentAccounts.DEV}-${region}`,
    INT: `compliance-log-${deploymentAccounts.INT}-${region}`,
    PROD: `compliance-log-${deploymentAccounts.PROD}-${region}`,
  },
};
