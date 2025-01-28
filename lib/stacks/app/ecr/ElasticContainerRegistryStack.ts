/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { IECRConfig, IECRRepositoryConfig } from '../../../../config/MLOpsConfig';
import { APP_STAGE, STAGE } from '../../../../config/Types';

interface Props extends cdk.StackProps {
  imageBuildAccountPrincipal: string;
  imagePullAccountPrincipals: {
    [key in APP_STAGE | STAGE.EXP]: string;
  };
  repositoryConfig: IECRConfig;
}

export class ElasticContainerRegistryStack extends cdk.Stack {
  /*
  Stack containing all ECR repositories to be used for container images used during the ML LC
  */
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    props.repositoryConfig.repositories.forEach((repositoryConfig: IECRRepositoryConfig) => {
      const repository = new ecr.Repository(this, `${repositoryConfig.repositoryName}-ECRRepository`, {
        repositoryName: repositoryConfig.repositoryName,
        lifecycleRules: [{
          rulePriority: 1,
          description: 'Expire untagged images after 7 days',
          tagStatus: ecr.TagStatus.UNTAGGED,
          maxImageAge: cdk.Duration.days(7),
        }],
      });

      // Grant push permissions to the EXP account, building the images
      repository.grantPush(new iam.AccountPrincipal(props.imageBuildAccountPrincipal));

      // Grant pull permissions to the EXP, DEV, INT, PROD accounts, using the images
      Object.values(props.imagePullAccountPrincipals).forEach((accountId: string) => {
        repository.grantPull(new iam.AccountPrincipal(`${accountId}`));
      });
    });
  }
}
