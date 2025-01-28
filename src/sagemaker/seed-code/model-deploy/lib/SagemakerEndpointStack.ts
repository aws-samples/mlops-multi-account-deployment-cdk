/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ModelExecutionRole } from './constructs/ModelExecutionRole';
import { ModelConfig } from '../config/ModelMetaData';

interface Props extends cdk.StackProps {
  modelMetaData: ModelConfig;
  /**
   * name of the SSM parameter that stores the KMS key arn in the deployment environment
   */
  kmsKeyArnParameterName: string;
  /**
   * key alias of the KMS key in EXP, used for IAM policy creation
   */
  kmsKeyAliasExp: string;
  /**
   * name of the SSM parameter that stores the vpc id used for model deployment
   */
  vpcIdParameterName: string;
  /**
   * name of the SSM parameter that stores the security group id used for model deployment
   */
  securityGroupIdParameterName: string;
}

export class SagemakerEndpointStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const modelExecutionRole = new ModelExecutionRole(this, 'ModelExecutionRole', {
      modelS3Arn: SagemakerEndpointStack.s3PathToArn(props.modelMetaData.s3ModelPath),
      ecrImageArn: SagemakerEndpointStack.getImageArnFromURI(props.modelMetaData.modelECRImage),
      kmsKeyArn: ssm.StringParameter.valueForStringParameter(this, props.kmsKeyArnParameterName),
      expAccountId: props.modelMetaData.buildAccount,
      kmsKeyAliasExp: props.kmsKeyAliasExp,
    });

    /**
     * VPC config for Sagemaker Model
     */
    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      vpcId: ssm.StringParameter.valueForStringParameter(this, props.vpcIdParameterName),
    });

    const securityGroupId = ssm.StringParameter.valueForStringParameter(
      this, props.securityGroupIdParameterName);

    const cfnModel = new sagemaker.CfnModel(this, 'Model', {
      executionRoleArn: modelExecutionRole.roleArn,
      modelName: `${props.modelMetaData.modelPackageGroupName}-${props.modelMetaData.modelVersion}`,
      containers: [{
        image: props.modelMetaData.modelECRImage,
        modelDataUrl: props.modelMetaData.s3ModelPath,
        mode: 'SingleModel',
      }],
      vpcConfig: {
        securityGroupIds: [securityGroupId],
        subnets: vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }).subnetIds,
      },
    });

    const productionVariantProperty: sagemaker.CfnEndpointConfig.ProductionVariantProperty = {
      initialVariantWeight: 1.0,
      modelName: `${props.modelMetaData.modelPackageGroupName}-${props.modelMetaData.modelVersion}`,
      variantName: 'AllTraffic',
      // the properties below are optional
      initialInstanceCount: 1,
      instanceType: props.modelMetaData.transformInstance,
    };

    const cfnEndpointConfig = new sagemaker.CfnEndpointConfig(this, 'EndpointConfig', {
      productionVariants: [productionVariantProperty],
      endpointConfigName: `${props.modelMetaData.modelPackageGroupName}-ec-${props.modelMetaData.modelVersion}`,
    });

    const cfnEndpoint = new sagemaker.CfnEndpoint(this, 'Endpoint', {
      endpointConfigName: cfnEndpointConfig.endpointConfigName!,
      endpointName: `${props.modelMetaData.modelPackageGroupName}-ep-${props.modelMetaData.modelVersion}`,
    });

    cfnEndpointConfig.addDependency(cfnModel);
    cfnEndpoint.addDependency(cfnEndpointConfig);

  };

  private static getImageArnFromURI(ecrImageUri: string): string {
    const arnRegex = /^(\d+).dkr.ecr.([a-z0-9\-]+).amazonaws.com\/([^@]+)(?:@([^:]+))?$/i;
    const match = ecrImageUri.match(arnRegex);

    if (!match) {
      throw Error('invalid Image URI provided');
    }
    const [, accountID, region, repositoryName, imageIdentifier] = match;
    return `arn:aws:ecr:${region}:${accountID}:repository/${repositoryName}`;
  }

  private static s3PathToArn(s3Path: string): string {
    const parts = s3Path.replace('s3://', '').split('/');
    const bucket = parts.shift();
    const key = parts.join('/');
    return `arn:aws:s3:::${bucket}/${key}`;
  }
};
