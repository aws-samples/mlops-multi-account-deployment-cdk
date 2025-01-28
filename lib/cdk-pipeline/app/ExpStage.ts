/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';
import { SecurityControls } from '../../../bin/aspects';
import { AppConfig } from '../../../config/AppConfig';
import { ECR_CONFIG, SAGEMAKER_STUDIO_USERS, SAGEMAKER_VPC_CONFIG } from '../../../config/MLOpsConfig';
import { STAGE } from '../../../config/Types';
import { ImageBuildPipelineStack } from '../../stacks/app/ecr/ImageBuildPipelineStack';
import { ModelBuildServiceCatalogStack } from '../../stacks/app/sagemaker/ModelBuildServiceCatalogStack';
import { SagemakerNetworkingStack } from '../../stacks/app/sagemaker/SagemakerNetworkingStack';
import { SagemakerStudioStack } from '../../stacks/app/sagemaker/SagemakerStudioStack';
import { EncryptionStack } from '../../stacks/core/EncryptionStack';

interface Props extends cdk.StageProps {
}

export class ExpStage extends cdk.Stage {

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const stageName = STAGE.EXP;

    const encryptionStack = new EncryptionStack(this, `${AppConfig.applicationName}EncryptionStack`, {
      stageName,
      applicationQualifier: AppConfig.applicationQualifier,
      applicationName: AppConfig.applicationName,
    });

    const sagemakerNetworkStack = new SagemakerNetworkingStack(this, `${AppConfig.applicationName}SagemakerStudioNetworkingStack`, {
      vpcConfig: SAGEMAKER_VPC_CONFIG,
      applicationQualifier: AppConfig.applicationQualifier,
    });

    const sagemakerStudioStack = new SagemakerStudioStack(this, `${AppConfig.applicationName}SagemakerStudioStack`, {
      name: `SagemakerDomain-${AppConfig.applicationQualifier}`,
      kmsKey: encryptionStack.kmsKey,
      vpcConfig: SAGEMAKER_VPC_CONFIG,
      roleConfig: SAGEMAKER_STUDIO_USERS,
    });

    new ModelBuildServiceCatalogStack(this, `${AppConfig.applicationName}ModelBuildServiceCatalogStack`, {
      stageName,
      applicationName: AppConfig.applicationName,
      applicationQualifier: AppConfig.applicationQualifier,
      encryptionKey: encryptionStack.kmsKey,
      productLaunchIAMRoleArnList: sagemakerStudioStack.leadDataScientistRoleArnList,
      deploymentPipelineEnvironment: {
        account: AppConfig.deploymentAccounts.RES,
        region: AppConfig.region,
      },
      deploymentTargetAccounts: {
        [STAGE.DEV]: AppConfig.deploymentAccounts.DEV,
        [STAGE.INT]: AppConfig.deploymentAccounts.INT,
        [STAGE.PROD]: AppConfig.deploymentAccounts.PROD,
      },
    });

    new ImageBuildPipelineStack(this, `${AppConfig.applicationName}ImageBuildPipelineStack`, {
      stageName,
      encryptionKey: encryptionStack.kmsKey,
      ecrRepositoryAccountId: AppConfig.deploymentAccounts.RES,
      ecrConfig: ECR_CONFIG,
      vpcConfig: sagemakerNetworkStack.codeBuildVpcConfig,
      proxyConfig: SAGEMAKER_VPC_CONFIG.proxy,
    });

    cdk.Aspects.of(this).add(new SecurityControls(stageName));
    cdk.Aspects.of(this).add(new nag.AwsSolutionsChecks({ verbose: false }));
  }
}