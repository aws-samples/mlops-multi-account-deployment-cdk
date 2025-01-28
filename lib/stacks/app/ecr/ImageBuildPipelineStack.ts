/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { BuildImageConstruct } from './constructs/BuildImageConstruct';
import { IECRConfig, IECRRepositoryConfig } from '../../../../config/MLOpsConfig';
import { IProxyConfig, STAGE } from '../../../../config/Types';
import { S3Bucket } from '../../../cdk-pipeline/core/S3Bucket';
import { CodeCommitRepository } from '../codecommit/constructs/CodeCommitRepository';
import { ICodeBuildVpcConfig } from '../sagemaker/projects/utils/VpcUtils';

interface Props extends cdk.StackProps {
  stageName: STAGE;
  encryptionKey: kms.IKey;
  ecrRepositoryAccountId: string;
  ecrConfig: IECRConfig;
  vpcConfig: ICodeBuildVpcConfig;
  proxyConfig?: IProxyConfig;
}

export class ImageBuildPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    // If no repositoryConfig is provided, do not add empty stages to the pipeline
    if (!props.ecrConfig.repositories.length) {
      return;
    }

    // CodeCommit Source
    const codeCommitRepository: codecommit.IRepository =
      props.ecrConfig.codeCommitSource.type == 'CODECOMMIT_FROM_LOOKUP'
        ? codecommit.Repository.fromRepositoryName(
          this,
          'CodeBuildSourceRepo',
          props.ecrConfig.codeCommitSource.name,
        )
        : new CodeCommitRepository(this, 'CodeBuildSourceRepo', {
          repositoryName: props.ecrConfig.codeCommitSource.name,
          description: 'Source repository for custom Sagemaker containers',
        });

    // Code Pipeline
    const sourceArtifactImageBuild = new codepipeline.Artifact();
    const artifactBucket = new S3Bucket(this, 'CodePipelineArtifactBucket', {
      stageName: props.stageName,
      encryptionKey: props.encryptionKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      bucketName: 'image-build-pipeline',
    });

    const codePipeline = new codepipeline.Pipeline(this, 'CodePipeline', {
      pipelineName: 'Image-Build-Pipeline',
      artifactBucket,
      stages: [{
        stageName: 'Source',
        actions: [
          new codepipelineActions.CodeCommitSourceAction({
            actionName: 'Source',
            repository: codeCommitRepository,
            branch: props.ecrConfig.codeCommitSource.branch,
            output: sourceArtifactImageBuild,
          }),
        ],
      }],
    });

    [
      STAGE.DEV,
      STAGE.INT,
      STAGE.PROD,
    ].forEach((deploymentStage) => {

      // add manual approval steps for all stages except DEV
      if (deploymentStage != STAGE.DEV) {
        codePipeline.addStage({
          stageName: `Promote-to-${deploymentStage}`,
          actions: [
            new codepipelineActions.ManualApprovalAction({
              actionName: 'Approve',
            }),
          ],
        });
      }

      const codeBuildStage = codePipeline.addStage({
        stageName: `Build-${deploymentStage}-Images`,
      });

      props.ecrConfig.repositories.forEach((repositoryConfig: IECRRepositoryConfig) => {
        codeBuildStage.addAction(
          new codepipelineActions.CodeBuildAction({
            actionName: `Build-${repositoryConfig.repositoryName}`,
            project: new BuildImageConstruct(this, `BuildImageConstruct-${repositoryConfig.repositoryName}-${deploymentStage}`, {
              ecrRepositoryName: repositoryConfig.repositoryName,
              ecrRepositoryAccountId: props.ecrRepositoryAccountId,
              imageTag: deploymentStage.toLowerCase(),
              codeCommitRepositoryArn: codeCommitRepository.repositoryArn,
              imageBuildSourceFolder: repositoryConfig.sourceFolder,
              vpcConfig: props.vpcConfig,
              proxyConfig: props.proxyConfig,
            }).project,
            input: sourceArtifactImageBuild,
          }),
        );
      });

    });
  }
}
