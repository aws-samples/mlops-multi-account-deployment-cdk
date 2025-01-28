/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { IAppConfig, ICodeBuildEnvSettings } from '../config/Types';
import { VpcConfig } from '../config/VpcConfig';

const codeBuildEnvSettings: ICodeBuildEnvSettings = {
  isPrivileged: true,
  buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
};

export const TestAppConfig: IAppConfig = {
  applicationName: 'VanillaPipeline',
  deploymentAccounts: {
    RES: '123456789012',
    EXP: '123456789012',
    DEV: '123456789012',
    INT: '123456789012',
    PROD: '123456789012',
  },
  applicationQualifier: 'test',
  region: 'eu-west-1',
  logRetentionInDays: '365',
  codeBuildEnvSettings: codeBuildEnvSettings,
  vpc: VpcConfig.NO_VPC,
  repositoryConfig: {
    selected: 'GITHUB',
    GITHUB: {
      name: 'owner/vanilla-pipeline',
      codeStarConnectionArn: 'arn:aws:codestar-connections:eu-west-1:123456789123:host/abc123-example',
      branch: 'main',
    },
    CODECOMMIT: {
      name: 'owner/vanilla-pipeline',
      description: 'CodeCommit repository used for the CI/CD pipeline',
      branch: 'main',
      codeBuildConfig: codeBuildEnvSettings,
    },
  },
  complianceLogBucketName: {
    RES: 'bucket-res',
    EXP: 'bucket-exp',
    DEV: 'bucket-dev',
    INT: 'bucket-int',
    PROD: 'bucket-prod',
  },
};