/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { STAGE } from '../../../../../../../config/Types';
import { S3Bucket } from '../../../../../../cdk-pipeline/core/S3Bucket';

interface Props {
  sagemakerPipelineName: string;
  sagemakerProjectName: string;
  kmsKeyArn: string;
  /**
   * account and region that hosts the custom sagemaker images
   * (i.e. deployment env of ElasticContainerRegistryStack)
   */
  toolingEnvironment: {
    account: string;
    region: string;
  };
}
/**
 * IAM role used by the sagemaker jobs within the Sagemaker Pipeline
 */
export class SagemakerPipelineExecutionRole extends iam.Role {
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
        LaunchSagemakerJobs: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sagemaker:CreateProcessingJob',
                'sagemaker:DescribeProcessingJob',
                'sagemaker:ListProcessingJobs',
                'sagemaker:StopProcessingJob',
                'sagemaker:CreateAutoMLJobV2',
                'sagemaker:DescribeAutoMLJobV2',
                'sagemaker:ListAutoMLJobs',
                'sagemaker:StopAutoMLJob',
                'sagemaker:DescribeAutoMLJob',
                'sagemaker:CreateModel',
                'sagemaker:DescribeModel',
                'sagemaker:ListModels',
                'sagemaker:CreateModelPackage',
                'sagemaker:DescribeModelPackage',
                'sagemaker:CreateModelPackageGroup',
                'sagemaker:DescribeModelPackageGroup',
                'sagemaker:ListModelPackages',
                'sagemaker:DescribePipeline',
                'sagemaker:ListPipelines',
                'sagemaker:UpdatePipeline',
                'sagemaker:CreateTrainingJob',
                'sagemaker:DescribeTrainingJob',
                'sagemaker:DescribePipelineExecution',
                'sagemaker:ListPipelineExecutions',
                'sagemaker:StopPipelineExecution',
                'sagemaker:AddTags',
                'sagemaker:CreateHyperParameterTuningJob',
                'sagemaker:DescribeHyperParameterTuningJob',
                'sagemaker:ListTrainingJobsForHyperParameterTuningJob',
              ],
              resources: [
                '*',
              ],
            }),
          ],
        }),
        AccessToSagemakerBuckets: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetBucket*',
                's3:GetObject*',
                's3:List*',
              ],
              resources: [
                'arn:aws:s3:::sagemaker*',
                `arn:aws:s3:::jumpstart-cache-prod-${cdk.Stack.of(scope).region}/*`,
              ],
            }),
          ],
        }),
        ReadWriteIntoDataBuckets: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:AbortMultipartUpload',
                's3:DeleteObject',
                's3:GetBucket*',
                's3:GetObject*',
                's3:List*',
                's3:PutObject*',
                's3:Create*',
              ],
              resources: [
                `arn:aws:s3:::${S3Bucket.getS3BucketName('*', STAGE.EXP, cdk.Stack.of(scope).region, cdk.Stack.of(scope).account)}`,
              ],
              conditions: {
                StringEquals: {
                  'aws:ResourceAccount': `${cdk.Stack.of(scope).account}`,
                },
              },
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'kms:Encrypt',
                'kms:ReEncrypt*',
                'kms:GenerateDataKey*',
                'kms:Decrypt',
                'kms:DescribeKey',
                'kms:CreateGrant',
              ],
              resources: [
                props.kmsKeyArn,
              ],
            }),
          ],
        }),
        AllowModelBuildPipelineForECR: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ecr:BatchGetImage',
                'ecr:GetDownloadUrlForLayer',
                'ecr:BatchCheckLayerAvailability',
              ],
              resources: [
                `arn:aws:ecr:${props.toolingEnvironment.region}:${props.toolingEnvironment.account}:*`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ecr:GetAuthorizationToken',
              ],
              resources: [
                '*',
              ],
            }),
          ],
        }),
        LogPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: 'logRolePolicy',
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: [`arn:aws:logs:${cdk.Stack.of(scope).region}:${cdk.Stack.of(scope).account}:*`],
            }),
          ],
        }),
        AllowVPCOperations: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ec2:CreateNetworkInterfacePermission',
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
        // Security Guardrails
        // see: https://docs.aws.amazon.com/whitepapers/latest/build-secure-enterprise-ml-platform/governance-and-control.html
        SecurityGuardRails: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: 'SageMakerEnforceVPCDeployment',
              effect: iam.Effect.DENY,
              actions: [
                'sagemaker:CreateModel',
                'sagemaker:CreateNotebookInstance',
                'sagemaker:CreateProcessingJob',
              ],
              resources: ['*'],
              conditions: {
                Null: {
                  'sagemaker:VpcSubnets': 'true',
                  'sagemaker:VpcSecurityGroupIds': 'true',
                },
              },
            }),
            new iam.PolicyStatement({
              sid: 'SageMakerEnforceNetworkingTrainingJob',
              effect: iam.Effect.DENY,
              actions: [
                'sagemaker:CreateHyperParameterTuningJob',
                'sagemaker:CreateTrainingJob',
              ],
              resources: ['*'],
              conditions: {
                Null: {
                  'sagemaker:VpcSubnets': 'true',
                  'sagemaker:VpcSecurityGroupIds': 'true',
                },
                Bool: {
                  'sagemaker:NetworkIsolation': 'false',
                },
              },
            }),
            new iam.PolicyStatement({
              sid: 'SageMakerEnforceInterContainerTrafficEncryption',
              effect: iam.Effect.DENY,
              actions: [
                'sagemaker:CreateHyperParameterTuningJob',
                'sagemaker:CreateTrainingJob',
              ],
              resources: ['*'],
              conditions: {
                Bool: {
                  'sagemaker:InterContainerTrafficEncryption': 'false',
                },
              },
            }),
            new iam.PolicyStatement({
              sid: 'SageMakerJobEnforceEncryption',
              effect: iam.Effect.DENY,
              actions: [
                'sagemaker:CreateHyperParameterTuningJob',
                'sagemaker:CreateProcessingJob',
                'sagemaker:CreateTrainingJob',
                'sagemaker:CreateTransformJob',
              ],
              resources: ['*'],
              conditions: {
                Null: {
                  'sagemaker:VolumeKmsKey': 'true',
                },
              },
            }),
          ],
        }),
      },
    });

    new iam.Policy(this, 'CodeBuildPolicy', {
      policyName: 'PassSelfToSagemakerPipeline',
      roles: [
        this,
      ],
      statements: [
        new iam.PolicyStatement({
          sid: 'PassRoleToSagemakerPipeline',
          effect: iam.Effect.ALLOW,
          actions: [
            'iam:PassRole',
          ],
          resources: [
            this.roleArn,
          ],
        }),
      ],
    });
  }
}