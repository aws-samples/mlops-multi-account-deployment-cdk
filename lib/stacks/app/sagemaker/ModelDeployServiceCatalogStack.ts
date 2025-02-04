/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as service_catalog from 'aws-cdk-lib/aws-servicecatalog';
import { Construct } from 'constructs';
import { ServiceCatalogRole } from './constructs/ServiceCatalogRole';
import { IModelBuildEnvironment, IModelDeployEnvironments, ModelDeploymentProductStack } from './projects/ModelDeploymentProductStack';
import { VpcUtils } from './projects/utils/VpcUtils';
import { IProxyConfig, STAGE } from '../../../../config/Types';
import { S3Bucket } from '../../../cdk-pipeline/core/S3Bucket';
import { EncryptionStack } from '../../core/EncryptionStack';
import { VPCStack } from '../../core/VPCStack';

interface Props extends cdk.StackProps {
  stageName: STAGE;
  applicationName: string;
  applicationQualifier: string;
  productLaunchIAMRoleArn: string;
  modelDeployEnvironments: IModelDeployEnvironments;
  modelBuildEnvironment: IModelBuildEnvironment;
  proxyConfig?: IProxyConfig;
}

export class ModelDeployServiceCatalogStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const portfolioName: string = 'MLOPs Model Deploy Pipeline';
    const portfolioOwner: string = 'aws-sample';
    const productVersion: string = '1.0';

    const productsLaunchRole = new ServiceCatalogRole(this, 'LaunchRole');

    const portfolio = new service_catalog.Portfolio(this, 'Portfolio', {
      displayName: portfolioName,
      providerName: portfolioOwner,
      description: 'MLOPs deploy templates',
    });

    const portfolioAssociation = new service_catalog.CfnPortfolioPrincipalAssociation(this, 'PortfolioPrincipalAssociation', {
      portfolioId: portfolio.portfolioId,
      principalArn: props.productLaunchIAMRoleArn,
      principalType: 'IAM',
    });

    const kmsKeyArn = cdk.Fn.importValue(EncryptionStack.getKmsKeyArnExportName(props.applicationName, props.stageName));

    const assetBucket = new S3Bucket(this, 'AssetBucket', {
      stageName: props.stageName,
      bucketName: 'model-deploy-service-catalog-assets',
      encryptionKey: kms.Key.fromKeyArn(this, 'Key', kmsKeyArn),
    });

    const defaultBus = events.EventBus.fromEventBusName(this, 'default-bus', 'default');
    new events.CfnEventBusPolicy(this, 'EXPAccount-policy', {
      statementId: 'AllowEXPAccountPushEvents',
      action: 'events:PutEvents',
      eventBusName: defaultBus.eventBusName,
      principal: props.modelBuildEnvironment.account,
    });

    const product = new service_catalog.CloudFormationProduct(this, `MLOpsBuildApp-${props.stageName}`, {
      owner: portfolioOwner,
      productName: ModelDeploymentProductStack.TEMPLATE_NAME,
      description: ModelDeploymentProductStack.DESCRIPTION,
      productVersions: [{
        cloudFormationTemplate: service_catalog.CloudFormationTemplate.fromProductStack(
          new ModelDeploymentProductStack(this, 'ModelDeploymentProductStack', {
            stageName: STAGE.RES,
            applicationName: props.applicationName,
            applicationQualifier: props.applicationQualifier,
            productsLaunchRoleARN: productsLaunchRole.roleArn,
            modelDeployEnvironments: props.modelDeployEnvironments,
            modelBuildEnvironment: props.modelBuildEnvironment,
            assetBucket,
            vpcConfig: VpcUtils.getCodeBuildVpcConfig(this, {
              applicationQualifier: props.applicationQualifier,
              vpcIdParameterName: VPCStack.vpcIdParameterName,
              securityGroupIdParameterName: VPCStack.securityGroupIdParameterName,
            }),
            proxyConfig: props.proxyConfig,
          }),
        ),
        productVersionName: productVersion,
      }],
    });

    new service_catalog.CfnLaunchRoleConstraint(this, 'LaunchRoleConstraint', {
      portfolioId: portfolio.portfolioId,
      productId: product.productId,
      roleArn: productsLaunchRole.roleArn,
      description: `Launch as ${productsLaunchRole.roleArn}`,
    }).node.addDependency(portfolioAssociation);

    product.node.addDependency(assetBucket);
    portfolioAssociation.node.addDependency(product);
    portfolio.addProduct(product);
  }
}