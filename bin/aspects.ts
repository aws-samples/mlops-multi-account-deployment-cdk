/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import { aws_kms, IAspect, Names, RemovalPolicy } from 'aws-cdk-lib';
import { CfnSubnet } from 'aws-cdk-lib/aws-ec2';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CfnKey, Key } from 'aws-cdk-lib/aws-kms';
import { CfnLogGroup } from 'aws-cdk-lib/aws-logs';
import { Bucket, CfnBucket } from 'aws-cdk-lib/aws-s3';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { IConstruct } from 'constructs';
import { AppConfig } from '../config/AppConfig';
import { DEPLOYMENT_STAGE, STAGE } from '../config/Types';
import { EncryptionStack } from '../lib/stacks/core/EncryptionStack';

export class SecurityControls implements IAspect {
  private encryptionKeyArn: string;
  private readonly stage: STAGE;
  private readonly logRetentionInDays: string;
  private readonly complianceLogBucketName: string;


  constructor(stage: DEPLOYMENT_STAGE) {
    this.encryptionKeyArn = cdk.Fn.importValue(EncryptionStack.getKmsKeyArnExportName(AppConfig.applicationName, stage));
    this.stage = stage;
    this.logRetentionInDays = AppConfig.logRetentionInDays;
    this.complianceLogBucketName = AppConfig.complianceLogBucketName[stage];
  }

  public visit(node: IConstruct): void {
    if (node instanceof CfnLogGroup) {
      if (node.retentionInDays === undefined) {
        node.retentionInDays = Number(this.logRetentionInDays);
        node.kmsKeyId = this.encryptionKeyArn;
      }
    } else if (node instanceof CfnBucket) {
      node.loggingConfiguration = {
        destinationBucketName: this.complianceLogBucketName,
        logFilePrefix: Names.uniqueId(node),
      };
    } else if (node instanceof Key) {
    } else if (node instanceof CfnKey) {
      node.enableKeyRotation = true;
    } else if (node instanceof CfnSubnet) {
      node.mapPublicIpOnLaunch = false;
    } else if (node instanceof Bucket) {
      if (this.stage !== STAGE.PROD) {
        node.applyRemovalPolicy(RemovalPolicy.DESTROY);
      }
      node.addToResourcePolicy(
        new PolicyStatement({
          sid: 'DenyHTTP',
          effect: Effect.DENY,
          principals: [new AnyPrincipal()],
          actions: ['s3:PutObject'],
          resources: [`${node.bucketArn}/*`],
          conditions: {
            Bool: {
              'aws:SecureTransport': 'false',
            },
          },
        }),
      );
    } else if (node instanceof Topic) {
      // Apply Topic policy to enforce encryption of data in transit
      node.addToResourcePolicy(
        new PolicyStatement({
          sid: 'NoHTTPSubscriptions',
          resources: [`${node.topicArn}`],
          principals: [new AnyPrincipal()],
          effect: Effect.DENY,
          actions: [
            'SNS:Subscribe',
            'SNS:Receive',
          ],
          conditions: {
            StringEquals: {
              'SNS:Protocol': 'http',
            },
          },
        }),
      );
      node.addToResourcePolicy(
        new PolicyStatement({
          sid: 'HttpsOnly',
          resources: [`${node.topicArn}`],
          actions: [
            'SNS:Publish',
            'SNS:RemovePermission',
            'SNS:SetTopicAttributes',
            'SNS:DeleteTopic',
            'SNS:ListSubscriptionsByTopic',
            'SNS:GetTopicAttributes',
            'SNS:Receive',
            'SNS:AddPermission',
            'SNS:Subscribe',
          ],
          principals: [new AnyPrincipal()],
          effect: Effect.DENY,
          conditions: {
            Bool: {
              'aws:SecureTransport': 'false',
            },
          },
        }),
      );
    }
  }
}

