/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as event_targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import * as service_catalog from 'aws-cdk-lib/aws-servicecatalog';
import { Construct } from 'constructs';
import { BuildPipelineConstruct } from './constructs/BuildPipelineConstruct';
import { QueryModelRegistryCodeBuildRole } from './constructs/iam-roles/QueryModelRegistryCodeBuildRole';
import { ICodeBuildVpcConfig } from './utils/VpcUtils';
import { STAGE } from '../../../../../config/Types';
import { S3Bucket } from '../../../../cdk-pipeline/core/S3Bucket';
import { EncryptionStack } from '../../../core/EncryptionStack';

interface Props extends service_catalog.ProductStackProps {
  stageName: STAGE;
  applicationName: string;
  applicationQualifier: string;
  productsLaunchRole: iam.Role;
  deploymentPipelineEnvironment: {
    account: string;
    region: string;
  };
  deploymentTargetAccounts: string[];
  vpcConfig: ICodeBuildVpcConfig;
  sagemakerSecurityGroupId: string;
}

export class ModelBuildingProductStack extends service_catalog.ProductStack {
  static readonly TEMPLATE_NAME: string = 'Basic MLOps template for model building';
  static readonly DESCRIPTION: string = 'Building pipeline to pre-process, train, evaluate and register a model';

  constructor( scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const sagemakerProjectName = new cdk.CfnParameter(this, 'SageMakerProjectName', {
      default: `${props.applicationQualifier}-build-pipeline`,
      maxLength: 25,
    }).valueAsString;

    const sagemakerProjectId = new cdk.CfnParameter(this, 'SageMakerProjectId', {
      default: `${props.applicationQualifier}-build-id`,
    }).valueAsString;

    const modelPackageGroupName = new cdk.CfnParameter(this, 'ModelPackageGroupName', {
      default: `${props.applicationQualifier}-model-packagegroup-name`,
    }).valueAsString;

    cdk.Tags.of(this).add('sagemaker:project-id', sagemakerProjectId);
    cdk.Tags.of(this).add('sagemaker:project-name', sagemakerProjectName);

    new sagemaker.CfnModelPackageGroup(this, 'ModelPackageGroup', {
      modelPackageGroupName: modelPackageGroupName,
      modelPackageGroupDescription: `Model Package Group for ${sagemakerProjectName}`,
      modelPackageGroupPolicy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            sid: 'AllowModelPackageGroupRead',
            actions: [
              'sagemaker:ListModelPackages',
              'sagemaker:DescribeModelPackageGroup',
              'sagemaker:DescribeModelPackage',
            ],
            resources: [
              `arn:aws:sagemaker:${this.region}:${this.account}:model-package/${modelPackageGroupName}/*`,
              `arn:aws:sagemaker:${this.region}:${this.account}:model-package-group/${modelPackageGroupName}`,
            ],
            principals: [
              new iam.AccountRootPrincipal(),
              //cross account permission for model deployment
              new iam.ArnPrincipal(
                QueryModelRegistryCodeBuildRole.getCodeBuildRoleArn(props.deploymentPipelineEnvironment.account, {
                  region: this.region,
                  account: this.account,
                }),
              ),
            ],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            sid: 'AllowModelPackageGroupUpdate',
            actions: [
              'sagemaker:UpdateModelPackage',
            ],
            resources: [
              `arn:aws:sagemaker:${this.region}:${this.account}:model-package/${modelPackageGroupName}/*`,
            ],
            principals: [
              new iam.AccountRootPrincipal(),
            ],
            conditions: {
              ArnEquals: {
                'aws:PrincipalArn': `arn:aws:iam::${this.account}:user/*LeadDataScientistRole`,
              },
            },
          }),
        ],
      }).toJSON(),
    });

    // cross account EventBridge invocation on model approval, sent to default EventBridgeBus
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
        new event_targets.EventBus(events.EventBus.fromEventBusArn(this, 'DefaultEventBus',
          `arn:aws:events:${props.deploymentPipelineEnvironment.region}:${props.deploymentPipelineEnvironment.account}:event-bus/default`)),
      ],
    });

    //HINT: use 'scope' as construct scope to have assets uploaded with ServiceCatalogProduct creation
    const buildPipelineCodeAssets = new s3_assets.Asset(scope, 'BundledAsset', {
      path: 'src/sagemaker/seed-code/model-building.zip',
    });
    buildPipelineCodeAssets.grantRead(props.productsLaunchRole);

    // dedicated s3 bucket for pipeline assets
    const kmsKeyArn = cdk.Fn.importValue(EncryptionStack.getKmsKeyArnExportName(props.applicationName, props.stageName));
    const encryptionKey = kms.Key.fromKeyArn(this, 'KmsKey', kmsKeyArn);
    const pipelineArtifactBucket = new S3Bucket(this, 'PipelineArtefactBucket', {
      stageName: props.stageName,
      bucketName: `${sagemakerProjectName}-pipeline`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: false,
      encryptionKey,
    });

    // dedicated s3 bucket for pipeline assets
    const sagemakerPipelineBucket = new S3Bucket(this, 'SagemakerModelsBucket', {
      stageName: props.stageName,
      bucketName: `${sagemakerProjectName}-models`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      encryptionKey,
    });

    // grant deployment environment access to model artifacts
    props.deploymentTargetAccounts.forEach((accountId: string) => {
      sagemakerPipelineBucket.grantRead(
        new iam.AccountPrincipal(`${accountId}`),
      );
    });

    new BuildPipelineConstruct(this, 'build', {
      applicationQualifier: props.applicationQualifier,
      pipelineArtifactBucket,
      sagemakerProjectName,
      sagemakerProjectId,
      modelPackageGroupName,
      codeAsset: buildPipelineCodeAssets,
      kmsKeyArn,
      sagemakerPipelineBucket,
      toolingEnvironment: props.deploymentPipelineEnvironment,
      vpcConfig: props.vpcConfig,
      sagemakerSecurityGroupId: props.sagemakerSecurityGroupId,
    });
  }
}


