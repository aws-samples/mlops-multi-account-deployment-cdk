/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as service_catalog from 'aws-cdk-lib/aws-servicecatalog';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';
import { ServiceCatalogRole } from './constructs/ServiceCatalogRole';
import { ModelBuildingProductStack } from './projects/ModelBuildingProductStack';
import { VpcUtils } from './projects/utils/VpcUtils';
import { SagemakerNetworkingStack } from './SagemakerNetworkingStack';
import { APP_STAGE, STAGE } from '../../../../config/Types';
import { S3Bucket } from '../../../cdk-pipeline/core/S3Bucket';
import { SSMParameterStack } from '../../core/SSMParameterStack';

interface Props extends cdk.StackProps {
  stageName: STAGE;
  applicationName: string;
  applicationQualifier: string;
  encryptionKey: kms.Key;
  productLaunchIAMRoleArnList: string[];
  deploymentPipelineEnvironment: {
    account: string;
    region: string;
  };
  deploymentTargetAccounts: {
    [key in APP_STAGE]: string;
  };
}

export class ModelBuildServiceCatalogStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const portfolioName: string = 'SageMaker Projects Templates';
    const portfolioOwner: string = 'aws-sample';
    const productVersion: string = '1.0';

    const productsLaunchRole = new ServiceCatalogRole(this, 'LaunchRole');

    const portfolio = new service_catalog.Portfolio(this, 'Portfolio', {
      displayName: portfolioName,
      providerName: portfolioOwner,
      description: 'Custom multi-account SageMaker Project templates for your organization',
    });

    const portfolioPrincipalAssociationList: service_catalog.CfnPortfolioPrincipalAssociation[] =
      props.productLaunchIAMRoleArnList.map((principalArn, idx) => {
        return new service_catalog.CfnPortfolioPrincipalAssociation(this, `PortfolioPrincipalAssociation-${idx}`, {
          portfolioId: portfolio.portfolioId,
          principalArn,
          principalType: 'IAM',
        });
      });

    const assetBucket = new S3Bucket(this, 'AssetBucket', {
      stageName: props.stageName,
      bucketName: 'model-build-service-catalog-assets',
      encryptionKey: props.encryptionKey,
    });

    // grant cross account access to the KMS key to allow deploymentTargetAccounts to load the model artefacts
    Object.values(props.deploymentTargetAccounts).forEach((accountId: string) => {
      props.encryptionKey.grantDecrypt(new iam.AccountPrincipal(accountId));
    });

    const product = new service_catalog.CloudFormationProduct(this, `MLOpsBuildApp-${props.stageName}`, {
      owner: portfolioOwner,
      productName: ModelBuildingProductStack.TEMPLATE_NAME,
      description: ModelBuildingProductStack.DESCRIPTION,
      productVersions: [
        {
          cloudFormationTemplate: service_catalog.CloudFormationTemplate.fromProductStack(new ModelBuildingProductStack(this, 'ModelBuildingProductStack', {
            stageName: props.stageName,
            applicationName: props.applicationName,
            applicationQualifier: props.applicationQualifier,
            assetBucket,
            productsLaunchRole: productsLaunchRole,
            deploymentPipelineEnvironment: props.deploymentPipelineEnvironment,
            deploymentTargetAccounts: Object.values(props.deploymentTargetAccounts),
            vpcConfig: VpcUtils.getCodeBuildVpcConfig(this, {
              applicationQualifier: props.applicationQualifier,
              vpcIdParameterName: SagemakerNetworkingStack.vpcIdParameterName,
              securityGroupIdParameterName: SagemakerNetworkingStack.securityGroupIdParameterName,
            }),
            sagemakerSecurityGroupId: SSMParameterStack.getParameterValue(
              this,
              props.applicationQualifier,
              SagemakerNetworkingStack.sagemakerSecurityGroupIdParameterName,
            ),
          })),
          productVersionName: productVersion,
        },
      ],
    });

    const launchConstraint = new service_catalog.CfnLaunchRoleConstraint(this, 'LaunchRoleConstraint', {
      portfolioId: portfolio.portfolioId,
      productId: product.productId,
      roleArn: productsLaunchRole.roleArn,
      description: `Launch as ${productsLaunchRole.roleArn}`,
    });

    if (portfolioPrincipalAssociationList.length) {
      launchConstraint.node.addDependency(portfolioPrincipalAssociationList[portfolioPrincipalAssociationList.length - 1]);
      portfolioPrincipalAssociationList[portfolioPrincipalAssociationList.length - 1].node.addDependency(product);
    }
    product.node.addDependency(assetBucket);
    portfolio.addProduct(product);

    // add sagemaker:studio-visibility: true tag to product to enable it for SagemakerStudio
    cdk.Tags.of(product).add('sagemaker:studio-visibility', 'true');

    nag.NagSuppressions.addResourceSuppressions(productsLaunchRole, [
      { id: 'AwsSolutions-IAM5', reason: 'Wildcard permissions added by Service Catalog' },
    ], true);
  }
}
