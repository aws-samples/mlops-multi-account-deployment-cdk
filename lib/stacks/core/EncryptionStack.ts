/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { SSMParameterStack } from './SSMParameterStack';

interface Props extends cdk.StackProps {
  applicationQualifier: string;
  applicationName: string;
  stageName: string;
}

export class EncryptionStack extends cdk.Stack {
  static readonly ssmParameterName: string = 'kms/key/arn';
  public readonly kmsKey: kms.Key;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    this.kmsKey = new kms.Key(this, 'Key', {
      enableKeyRotation: true,
      alias: `${props.applicationName}-${props.stageName}-key`,
    });
    this.kmsKey.grantEncryptDecrypt(new iam.ServicePrincipal(`logs.${this.region}.amazonaws.com`));

    new cdk.CfnOutput(this, 'KeyArnCfnOutput', {
      value: this.kmsKey.keyArn,
      description: 'The id of the main kms key',
      exportName: EncryptionStack.getKmsKeyArnExportName(props.applicationName, props.stageName),
    });

    SSMParameterStack.createParameter(
      this,
      props.applicationQualifier,
      EncryptionStack.ssmParameterName,
      this.kmsKey.keyArn,
    );
  }

  static getKmsKeyArnExportName(applicationName: string, stageName: string): string {
    return `${applicationName}-${stageName}-kms-key-arn`;
  }

  static getKmsKeyAlias(applicationName: string, stageName: string): string {
    return `alias/${applicationName}-${stageName}-key`;
  }
}