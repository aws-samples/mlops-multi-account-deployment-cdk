/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as events from 'aws-cdk-lib/aws-events';
import * as event_targets from 'aws-cdk-lib/aws-events-targets';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import * as service_catalog from 'aws-cdk-lib/aws-servicecatalog';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';
import { DeployModelBuildStepConstruct } from './constructs/DeployModelBuildStepConstruct';
import { QueryModelRegistryCodeBuildRole } from './constructs/iam-roles/QueryModelRegistryCodeBuildRole';
import { QueryModelRegistryBuildStepConstruct } from './constructs/QueryModelRegistryBuildStepConstruct';
import { ICodeBuildVpcConfig } from './utils/VpcUtils';
import { APP_STAGE, IProxyConfig, STAGE } from '../../../../../config/Types';
import { S3Bucket } from '../../../../cdk-pipeline/core/S3Bucket';
import { EncryptionStack } from '../../../core/EncryptionStack';
import { CodeCommitRepository } from '../../codecommit/constructs/CodeCommitRepository';

interface Props extends service_catalog.ProductStackProps {
  stageName: STAGE;
  applicationName: string;
  applicationQualifier: string;
  productsLaunchRoleARN: string;
  modelDeployEnvironments: IModelDeployEnvironments;
  modelBuildEnvironment: IModelBuildEnvironment;
  vpcConfig: ICodeBuildVpcConfig;
  proxyConfig?: IProxyConfig;
}

export type IModelDeployEnvironments = {
  [key in APP_STAGE]: {
    account: string;
    region: string;
  }
}

export type IModelBuildEnvironment = {
  account: string;
  region: string;
}

export class ModelDeploymentProductStack extends service_catalog.ProductStack {
  static readonly TEMPLATE_NAME: string = 'MLOps model deployment cross-account pipeline';
  static readonly DESCRIPTION: string = 'deploys CodeCommit, CodePipeline for cross account Sagemaker endpoint deployment';

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const projectName = new cdk.CfnParameter(this, 'SageMakerProjectName', {
      type: 'String',
      description: 'Project Name',
      maxLength: 25,
    }).valueAsString;

    const modelPackageGroupName = new cdk.CfnParameter(this, 'ModelPackageGroupName', {
      type: 'String',
      description: 'Model Package Groupe Name',
    }).valueAsString;

    const modelPackageGroupArn = `arn:aws:sagemaker:${props.modelBuildEnvironment.region}:${props.modelBuildEnvironment.account}:model-package-group/${modelPackageGroupName}`;

    //HINT: use 'scope' as construct scope to have assets uploaded with ServiceCatalogProduct creation, not at launch time
    const deployPipelineCodeAssets = new s3_assets.Asset(scope, 'BundledAsset', {
      path: 'src/sagemaker/seed-code/model-deploy.zip',
    });
    const queryModelRegistryCodeBuildRole = new QueryModelRegistryCodeBuildRole(scope, 'QueryModelRegistryCodeBuildRole', {
      modelBuildingEnvironment: props.modelBuildEnvironment,
    });

    const repository = new CodeCommitRepository(this, 'ModelDeployRepository', {
      repositoryName: `${projectName}-deploy-repository`,
      description: 'Source repository for model deployment IaC code',
      code: codecommit.Code.fromAsset(deployPipelineCodeAssets),
    });

    // Code Pipeline for Model Deployment
    const kmsKeyArn = cdk.Fn.importValue(EncryptionStack.getKmsKeyArnExportName(props.applicationName, props.stageName));
    const pipelineArtifactBucket = new S3Bucket(this, 'ArtefactBucket', {
      stageName: props.stageName,
      bucketName: `${projectName}-deploy-pipeline`,
      encryptionKey: kms.Key.fromKeyArn(this, 'KmsKey', kmsKeyArn),
    });

    const sourceArtifact = new codepipeline.Artifact();
    const outputArtifact = new codepipeline.Artifact();

    const deployPipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `${projectName}-Deploy-Pipeline`,
      stages: [{
        stageName: 'Source',
        actions: [
          new codepipelineActions.CodeCommitSourceAction({
            actionName: 'Source',
            repository,
            branch: 'main',
            output: sourceArtifact,
          }),
        ],
      }],
      artifactBucket: pipelineArtifactBucket,
    });

    deployPipeline.addStage({
      stageName: 'PREP',
      actions: [
        new codepipelineActions.CodeBuildAction({
          actionName: 'QueryModelRegistry',
          project: new QueryModelRegistryBuildStepConstruct( this, 'RegistryQueryCodeBuildStep', {
            codeBuildRoleArn: queryModelRegistryCodeBuildRole.roleArn,
            projectName,
            modelPackageGroupName,
            modelPackageGroupArn,
            modelBuildingEnvironment: props.modelBuildEnvironment,
            vpcConfig: props.vpcConfig,
          }).project,
          input: sourceArtifact,
          outputs: [
            outputArtifact,
          ],
        }),
      ],
    });

    Object.entries(props.modelDeployEnvironments).forEach(([stageName, deploymentEnvironment]) => {
      // add manual approval steps for all stages except DEV
      if (stageName != STAGE.DEV) {
        deployPipeline.addStage({
          stageName: `Promote-to-${stageName}`,
          actions: [
            new codepipelineActions.ManualApprovalAction({
              actionName: 'Approve',
            }),
          ],
        });
      }

      deployPipeline.addStage({
        stageName: stageName,
        actions: [
          new codepipelineActions.CodeBuildAction({
            actionName: `Deploy-${stageName}`,
            project: new DeployModelBuildStepConstruct( this, `DeployCodeBuildStep-${stageName}`, {
              stageName: stageName as STAGE,
              applicationName: props.applicationName,
              applicationQualifier: props.applicationQualifier,
              projectName,
              modelPackageGroupName,
              targetDeploymentEnvironment: deploymentEnvironment,
              vpcConfig: props.vpcConfig,
              proxyConfig: props.proxyConfig,
            }).project,
            input: outputArtifact,
          }),
        ],
      });
    });

    // Event Rule to Trigger the Model Deploy Pipeline Execution
    new events.Rule(this, 'ModelEventRule', {
      eventPattern: {
        source: ['aws.sagemaker'],
        detailType: ['SageMaker Model Package State Change'],
        detail: {
          ModelPackageGroupName: [modelPackageGroupName],
          ModelApprovalStatus: ['Approved'],
        },
      },
      targets: [
        new event_targets.CodePipeline(deployPipeline),
      ],
    });

    nag.NagSuppressions.addResourceSuppressions(deployPipeline, [
      { id: 'AwsSolutions-IAM5', reason: 'Wildcard permissions created by codepipeline.Pipeline Construct' },
    ]);
  }
}
