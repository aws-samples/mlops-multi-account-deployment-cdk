/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';

interface Props {
  /**
     * arn of the model artifacts stored in S3
     */
  modelS3Arn: string;
  /**
     * arn of the ECR image to be used for inference
     */
  ecrImageArn: string;
  /**
     * arn of the kms key used to encrypt data stored in S3
     */
  kmsKeyArn: string;
  /**
   * account id of the exp account, used to reference the exp kms key
   */
  expAccountId: string;
  /**
   * alias of the KMS key in EXP
   */
  kmsKeyAliasExp: string;
}

export class ModelExecutionRole extends iam.Role {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, {
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com', {
        conditions: {
          StringEquals: {
            'aws:SourceAccount': cdk.Stack.of(scope).account,
          },
        },
      }),
      inlinePolicies: {
        modelArtefactAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: 'loadModelArtifacts',
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
              ],
              resources: [
                props.modelS3Arn,
              ],
            }),
            new iam.PolicyStatement({
              sid: 'kmsDecryptStage',
              effect: iam.Effect.ALLOW,
              actions: [
                'kms:Decrypt',
              ],
              resources: [
                props.kmsKeyArn,
              ],
            }),
            new iam.PolicyStatement({
              sid: 'kmsDecryptEXP',
              effect: iam.Effect.ALLOW,
              actions: [
                'kms:Decrypt',
              ],
              resources: [
                `arn:aws:kms:${cdk.Stack.of(scope).region}:${props.expAccountId}:key/*`,
              ],
              conditions: {
                'ForAnyValue:StringEquals': {
                  'kms:ResourceAliases': props.kmsKeyAliasExp,
                },
              },
            }),
          ],
        }),
        ecrAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: 'ecrPullImage',
              effect: iam.Effect.ALLOW,
              actions: [
                'ecr:BatchGetImage',
                'ecr:GetDownloadUrlForLayer',
              ],
              resources: [
                props.ecrImageArn,
              ],
            }),
            new iam.PolicyStatement({
              sid: 'ecrLogin',
              effect: iam.Effect.ALLOW,
              actions: [
                'ecr:GetAuthorizationToken',
              ],
              resources: ['*'],
            }),
          ],
        }),
        logPermissions: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: 'writeToCloudWatch',
              effect: iam.Effect.ALLOW,
              actions: [
                'cloudwatch:PutMetricData',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'logs:CreateLogGroup',
                'logs:DescribeLogStreams',
              ],
              resources: ['*'],
            }),
          ],
        }),
        vpcPermissions: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ec2:CreateNetworkInterface',
                'ec2:DeleteNetworkInterface',
                'ec2:DescribeNetworkInterfaces',
                'ec2:DescribeVpcs',
                'ec2:DescribeSubnets',
                'ec2:DescribeDhcpOptions',
                'ec2:DescribeSecurityGroups',
              ],
              resources: [
                '*',
              ],
            }),
          ],
        }),
      },
    });
    nag.NagSuppressions.addResourceSuppressions(this, [
      { id: 'AwsSolutions-IAM5', reason: 'Wildcard permissions required on logs: and ecr:GetAuthorizationToken policies' },
    ]);
  }
}