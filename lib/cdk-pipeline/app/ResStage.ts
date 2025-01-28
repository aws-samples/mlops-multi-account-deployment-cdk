/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';
import { SecurityControls } from '../../../bin/aspects';
import { AppConfig } from '../../../config/AppConfig';
import { ECR_CONFIG } from '../../../config/MLOpsConfig';
import { STAGE } from '../../../config/Types';
import { ElasticContainerRegistryStack } from '../../stacks/app/ecr/ElasticContainerRegistryStack';
import { ModelDeployServiceCatalogStack } from '../../stacks/app/sagemaker/ModelDeployServiceCatalogStack';

interface Props extends cdk.StageProps {
}

export class ResStage extends cdk.Stage {

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const stageName = STAGE.RES;

    new ModelDeployServiceCatalogStack(this, `${AppConfig.applicationName}ModelDeployServiceCatalogStack`, {
      stageName,
      applicationName: AppConfig.applicationName,
      applicationQualifier: AppConfig.applicationQualifier,
      productLaunchIAMRoleArn: `arn:aws:iam::${AppConfig.deploymentAccounts.RES}:role/PA_DEVELOPER`,
      proxyConfig: AppConfig.proxy,
      modelDeployEnvironments: {
        [STAGE.DEV]: {
          account: AppConfig.deploymentAccounts.DEV,
          region: AppConfig.region,
        },
        [STAGE.INT]: {
          account: AppConfig.deploymentAccounts.INT,
          region: AppConfig.region,
        },
        [STAGE.PROD]: {
          account: AppConfig.deploymentAccounts.PROD,
          region: AppConfig.region,
        },
      },
      modelBuildEnvironment: {
        account: AppConfig.deploymentAccounts.EXP,
        region: AppConfig.region,
      },
    });

    new ElasticContainerRegistryStack(this, `${AppConfig.applicationName}ElasticContainerRegistryStack`, {
      imageBuildAccountPrincipal: AppConfig.deploymentAccounts.EXP,
      imagePullAccountPrincipals: {
        [STAGE.EXP]: AppConfig.deploymentAccounts.EXP,
        [STAGE.DEV]: AppConfig.deploymentAccounts.DEV,
        [STAGE.INT]: AppConfig.deploymentAccounts.INT,
        [STAGE.PROD]: AppConfig.deploymentAccounts.PROD,
      },
      repositoryConfig: ECR_CONFIG,
    });

    cdk.Aspects.of(this).add(new SecurityControls(stageName));
    cdk.Aspects.of(this).add(new nag.AwsSolutionsChecks({ verbose: false }));
  }
}