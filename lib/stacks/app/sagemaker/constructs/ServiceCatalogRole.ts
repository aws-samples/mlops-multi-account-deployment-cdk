/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as nag from 'cdk-nag';

export class ServiceCatalogRole extends iam.Role {
  constructor(scope: cdk.Stack, id: string) {
    super(scope, id, {
      assumedBy: new iam.ServicePrincipal('servicecatalog.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerAdmin-ServiceCatalogProductsServiceRolePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEventBridgeFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSKeyManagementServicePowerUser'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('IAMFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeCommitFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeBuildAdminAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodePipeline_FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMReadOnlyAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryFullAccess'),
      ],
      inlinePolicies: {
        CodeReviewerPermission:
        new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['codeguru-reviewer:*'],
              resources: [`arn:aws:codeguru-reviewer:${scope.region}:${scope.account}:association*`],
            }),
          ],
        }),
        PassRolePermission:
            new iam.PolicyDocument({
              statements: [
                new iam.PolicyStatement({
                  actions: ['iam:PassRole'],
                  effect: iam.Effect.ALLOW,
                  resources: [`arn:aws:iam::${scope.account}:role/*`],
                }),
              ],
            }),
        KmsPermissions:
          new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: [
                  'kms:Create*',
                  'kms:Describe*',
                  'kms:Enable*',
                  'kms:List*',
                  'kms:Put*',
                  'kms:Update*',
                  'kms:Revoke*',
                  'kms:Disable*',
                  'kms:Get*',
                  'kms:Delete*',
                  'kms:ScheduleKeyDeletion',
                  'kms:CancelKeyDeletion',
                  'kms:Decrypt',
                  'kms:GenerateDataKey',
                ],
                effect: iam.Effect.ALLOW,
                resources: [`arn:aws:kms:${scope.region}:${scope.account}:*`],
              }),
            ],
          }),
        SagemakerPermissions:
          new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ['sagemaker:*'],
                effect: iam.Effect.ALLOW,
                resources: [`arn:aws:sagemaker:*:${scope.account}:model-package-group/*`],
              }),
            ],
          }),
      },
    });

    nag.NagSuppressions.addResourceSuppressions(this, [
      { id: 'AwsSolutions-IAM4', reason: 'AWS managed policies' },
      { id: 'AwsSolutions-IAM5', reason: 'Wildcard permissions' },
    ]);
  }
}