/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { SagemakerNetworkingStack } from '../../../SagemakerNetworkingStack';

interface Props {
  sagemakerPipelineName: string;
  sagemakerProjectName: string;
  sagemakerExecutionRoleArn: string;
}

/**
 * IAM role that is used by the CodeBuildStep in BuildPipelineConstruct to create the
 * Sagemaker Pipeline
 */

export class SagemakerPipelineCodeBuildRole extends iam.Role {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      inlinePolicies: {
        PassRoleToSagemakerPipeline: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'iam:PassRole',
              ],
              resources: [
                props.sagemakerExecutionRoleArn,
              ],
            }),
          ],
        }),
        CreateUpdateSagemakerPipeline: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sagemaker:UpdatePipeline',
                'sagemaker:StartPipelineExecution',
                'sagemaker:CreatePipeline',
                'sagemaker:DescribePipeline',
                'sagemaker:ListTags',
                'sagemaker:AddTags',
              ],
              resources: [
                `arn:aws:sagemaker:${cdk.Stack.of(scope).region}:${cdk.Stack.of(scope).account}:pipeline/${props.sagemakerPipelineName}`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sagemaker:DescribeProject',
              ],
              resources: [
                `arn:aws:sagemaker:${cdk.Stack.of(scope).region}:${cdk.Stack.of(scope).account}:project/${props.sagemakerProjectName}`,
              ],
            }),
          ],
        }),
        ReferenceSagemakerPipelineOutputBucket: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:CreateBucket',
              ],
              resources: [
                'arn:aws:s3:::*',
              ],
            }),
          ],
        }),
        STSPermissions: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sts:GetServiceBearerToken',
              ],
              resources: [
                '*',
              ],
            }),
          ],
        }),
        CodeArtifactAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'codeartifact:DescribePackageVersion',
                'codeartifact:DescribeRepository',
                'codeartifact:GetPackageVersionReadme',
                'codeartifact:GetRepositoryEndpoint',
                'codeartifact:ListPackageVersionAssets',
                'codeartifact:ListPackageVersionDependencies',
                'codeartifact:ListPackageVersions',
                'codeartifact:ListPackages',
                'codeartifact:ReadFromRepository',
                'codeartifact:GetAuthorizationToken',
              ],
              resources: [
                `arn:aws:codeartifact:${cdk.Stack.of(scope).region}:${cdk.Stack.of(scope).account}:domain/${SagemakerNetworkingStack.codeArtefactDomainName}`,
                `arn:aws:codeartifact:${cdk.Stack.of(scope).region}:${cdk.Stack.of(scope).account}:repository/${SagemakerNetworkingStack.codeArtefactDomainName}/${SagemakerNetworkingStack.codeArtefactRepositoryName}`,
              ],
            }),
          ],
        }),
        AllowVPCOperations: new iam.PolicyDocument({
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
  }
}