/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { IVpcStackConfig } from './VpcConfig';

export interface ICodeBuildEnvSettings {
  isPrivileged: boolean;
  buildImage: codebuild.IBuildImage;
}

export interface IProxyConfig {
  proxySecretArn: string;
  noProxy: string[];
  proxyTestUrl: string;
};

export interface IAppConfig {
  applicationName: string;
  applicationQualifier: string;
  deploymentAccounts: {[key in DEPLOYMENT_STAGE]: string};
  region: string;
  logRetentionInDays: string;
  codeBuildEnvSettings: ICodeBuildEnvSettings;
  /*
  vpc and proxy config for the RES account which will run the CDK pipeline
  */
  vpc: IVpcStackConfig;
  proxy?: IProxyConfig;
  repositoryConfig: IRepositoryConfig;
  complianceLogBucketName: IComplianceLogBucketNameConfig;
}

export enum STAGE {
  RES = 'RES',
  EXP = 'EXP',
  DEV = 'DEV',
  INT = 'INT',
  PROD = 'PROD'
}

export type IComplianceLogBucketNameConfig = {
  [key in DEPLOYMENT_STAGE]: string
}

export type DEPLOYMENT_STAGE = STAGE;
export type APP_STAGE = Exclude<DEPLOYMENT_STAGE, STAGE.RES | STAGE.EXP>;

export type RepositoryType = 'GITHUB' | 'CODECOMMIT'

export interface ICodeCommitConfig {
  name: string;
  description: string;
  branch: string;
  codeBuildConfig: ICodeBuildEnvSettings;
}

export interface ICodeStarConfig {
  name: string;
  codeStarConnectionArn: string;
  branch: string;
}

export interface IRepositoryConfig {
  selected: RepositoryType;
  CODECOMMIT: ICodeCommitConfig;
  GITHUB: ICodeStarConfig;
}
