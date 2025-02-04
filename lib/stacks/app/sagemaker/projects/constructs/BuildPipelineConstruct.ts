/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';
import { SagemakerPipelineCodeBuildRole } from './iam-roles/SagemakerPipelineCodeBuildRole';
import { SagemakerPipelineExecutionRole } from './iam-roles/SagemakerPipelineExecutionRole';
import { CodeCommitRepository } from '../../../codecommit/constructs/CodeCommitRepository';
import { SagemakerNetworkingStack } from '../../SagemakerNetworkingStack';
import { ICodeBuildVpcConfig } from '../utils/VpcUtils';

interface Props {
  applicationQualifier: string;
  pipelineArtifactBucket: s3.Bucket;
  sagemakerProjectName: string;
  sagemakerProjectId: string;
  modelPackageGroupName: string;
  codeAsset: s3_assets.Asset;
  kmsKeyArn: string;
  sagemakerPipelineBucket: s3.Bucket;
  /**
   * Id of the security Group used by sagemaker jobs
   */
  sagemakerSecurityGroupId: string;
  /**
   * account and region that hosts the custom sagemaker images
   * (i.e. deployment env of ElasticContainerRegistryStack)
   */
  toolingEnvironment: {
    account: string;
    region: string;
  };
  vpcConfig: ICodeBuildVpcConfig;
}

export class BuildPipelineConstruct extends Construct {
  constructor(scope: cdk.Stack, id: string, props: Props) {
    super(scope, id);

    const sagemakerPipelineName = `${props.modelPackageGroupName}-model-build`;

    const repository = new CodeCommitRepository(this, 'BuildAppCodeRepo', {
      repositoryName: `${sagemakerPipelineName}-model-build`,
      description: `code base for the ${props.sagemakerProjectName} model building with Sagemaker Pipeline`,
      code: codecommit.Code.fromAsset(props.codeAsset),
    });

    const sagemakerExecutionRole = new SagemakerPipelineExecutionRole(this, 'SagemakerRole', {
      sagemakerPipelineName,
      sagemakerProjectName: props.sagemakerProjectName,
      kmsKeyArn: props.kmsKeyArn,
      toolingEnvironment: props.toolingEnvironment,
    });

    const codeBuildRole = new SagemakerPipelineCodeBuildRole(this, 'CodeBuildRole', {
      sagemakerPipelineName,
      sagemakerProjectName: props.sagemakerProjectName,
      sagemakerExecutionRoleArn: sagemakerExecutionRole.roleArn,
    });
    // allow code build role to upload script files to models bucket
    props.sagemakerPipelineBucket.grantReadWrite(codeBuildRole);
    //allow sagemaker pipeline to read write to the models s3-bucket
    props.sagemakerPipelineBucket.grantReadWrite(sagemakerExecutionRole);

    const smPipelineBuild = new codebuild.PipelineProject(this, 'SMPipelineBuild', {
      projectName: `Run-${sagemakerPipelineName}-sagemaker-pipeline`,
      role: codeBuildRole,
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
      ...props.vpcConfig,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        environmentVariables: {
          SAGEMAKER_PROJECT_NAME: { value: props.sagemakerProjectName },
          SAGEMAKER_PROJECT_ID: { value: props.sagemakerProjectId },
          MODEL_PACKAGE_GROUP_NAME: { value: props.modelPackageGroupName },
          AWS_REGION: { value: cdk.Aws.REGION },
          ACCOUNT_ID: { value: cdk.Aws.ACCOUNT_ID },
          SAGEMAKER_PIPELINE_NAME: { value: sagemakerPipelineName },
          SAGEMAKER_PIPELINE_ROLE_ARN: { value: sagemakerExecutionRole.roleArn },
          ARTIFACT_BUCKET: { value: props.sagemakerPipelineBucket.bucketName },
          KMS_KEY_ID: { value: props.pipelineArtifactBucket.encryptionKey!.keyId },
          SECURITY_GROUP_ID_LIST: { value: `[\"${props.sagemakerSecurityGroupId}\"]` },
          SUBNET_ID_LIST: {
            value: `[\"${props.vpcConfig.vpc.isolatedSubnets[0].subnetId}\", \"${props.vpcConfig.vpc.isolatedSubnets[1].subnetId}\"]`,
          },
          CODE_ARTEFACT_REPO_NAME: { value: SagemakerNetworkingStack.codeArtefactRepositoryName },
          CODE_ARTEFACT_DOMAIN_NAME: { value: SagemakerNetworkingStack.codeArtefactDomainName },
        },
      },
    });

    const sourceArtifact = new codepipeline.Artifact('GitSource');
    const buildPipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `${sagemakerPipelineName}-model-build-pipeline`,
      artifactBucket: props.pipelineArtifactBucket,
    });

    // add a source stage
    const sourceStage = buildPipeline.addStage({ stageName: 'Source' });
    sourceStage.addAction(
      new codepipelineActions.CodeCommitSourceAction({
        actionName: 'Source',
        output: sourceArtifact,
        repository,
        branch: 'main',
      }),
    );

    // add a build stage
    const buildStage = buildPipeline.addStage({ stageName: 'Build' });
    buildStage.addAction(
      new codepipelineActions.CodeBuildAction({
        actionName: 'SMPipeline',
        input: sourceArtifact,
        project: smPipelineBuild,
      }),
    );
  }
}
