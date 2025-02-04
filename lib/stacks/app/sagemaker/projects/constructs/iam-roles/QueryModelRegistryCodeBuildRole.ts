/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as iam from 'aws-cdk-lib/aws-iam';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';
import { IModelBuildEnvironment } from '../../ModelDeploymentProductStack';

interface Props {
  modelBuildingEnvironment: IModelBuildEnvironment;
}

export class QueryModelRegistryCodeBuildRole extends iam.Role {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, {
      roleName: QueryModelRegistryCodeBuildRole.getCodeBuildRoleName(props.modelBuildingEnvironment),
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      inlinePolicies: {
        CrossAccountModelRegistryRead: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'sagemaker:DescribeModelPackage',
                'sagemaker:ListModelPackages',
                'sagemaker:ListModelPackageGroups',
              ],
              resources: [
                `arn:aws:sagemaker:${props.modelBuildingEnvironment.region}:${props.modelBuildingEnvironment.account}:model-package/*`,
                `arn:aws:sagemaker:${props.modelBuildingEnvironment.region}:${props.modelBuildingEnvironment.account}:model-package-group/*`,
              ],
            }),
          ],
        }),
      },
    });

    nag.NagSuppressions.addResourceSuppressions(this, [
      { id: 'AwsSolutions-IAM5', reason: 'Wildcard permissions required for role permissions to resolve circular dependency between SC products' },
    ]);
  }

  static getCodeBuildRoleName(modelBuildingEnvironment: IModelBuildEnvironment): string {
    return `query-model-registry-${modelBuildingEnvironment.account}-${modelBuildingEnvironment.region}`;
  }

  static getCodeBuildRoleArn(modelDeployAccountId: string, modelBuildingEnvironment: IModelBuildEnvironment): string {
    return `arn:aws:iam::${modelDeployAccountId}:role/${QueryModelRegistryCodeBuildRole.getCodeBuildRoleName(modelBuildingEnvironment)}`;
  }
}