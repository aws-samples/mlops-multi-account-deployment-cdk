/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';
import { LifeCycleConfigurationConstruct } from './constructs/LifeCycleConfigurationConstruct';
import { SagemakerStudioRoles } from './constructs/SagemakerStudioRoles';
import { SagemakerNetworkingStack } from './SagemakerNetworkingStack';
import { ISagemakerNetworkingConfig, ISagemakerStudioUser, SAGEMAKER_STUDIO_USER_GROUP } from '../../../../config/MLOpsConfig';

interface Props extends cdk.StackProps {
  name: string;
  vpcConfig: ISagemakerNetworkingConfig;
  roleConfig: ISagemakerStudioUser[];
  kmsKey: kms.Key;
}

export class SagemakerStudioStack extends cdk.Stack {
  public readonly leadDataScientistRoleArnList: string[] = [];

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    /*
    * add the Studio Domain
    */
    const sagemakerDomain = new sagemaker.CfnDomain(this, 'SagemakerDomain', {
      authMode: 'IAM',
      domainName: props.name,
      kmsKeyId: props.kmsKey.keyId,
      defaultUserSettings: {
        executionRole: SagemakerStudioRoles.ExecutionRole({
          scope: this,
          name: props.name,
        }).roleArn,
      },
      appNetworkAccessType: 'VpcOnly',
      subnetIds: props.vpcConfig.subnetIdList,
      vpcId: props.vpcConfig.vpcId,
    });

    /*
    ** add sagemaker studio users
    */
    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      vpcId: props.vpcConfig.vpcId,
    });

    // list of user's iam role arns, required for the lifecycle config script
    const studioUserIAMRoleArnList: string[] = [];

    props.roleConfig.forEach((user: ISagemakerStudioUser) => {
      // create dedicated SecurityGroup per user
      const securityGroup = SagemakerNetworkingStack.DomainUserSecurityGroup(this, `SecurityGroup${user.name}`, {
        vpc,
        description: 'Allow traffic to Sagemaker services and AWS Service VPC Endpoints',
        securityGroupName: `SecurityGroup for SagemakerStudio user ${user.name}`,
      });
      // create dedicated IAM role per user
      const executionRoleArn = SagemakerStudioRoles.StudioUserRole({
        scope: this,
        name: user.name,
      }, user.userGroup).roleArn;
      studioUserIAMRoleArnList.push(executionRoleArn);

      if (user.userGroup == SAGEMAKER_STUDIO_USER_GROUP.LEAD_DATA_SCIENTIST) {
        this.leadDataScientistRoleArnList.push(executionRoleArn);
      }

      new sagemaker.CfnUserProfile(this, `UserProfile${user.name}`, {
        domainId: sagemakerDomain.attrDomainId,
        userProfileName: user.name,
        userSettings: {
          executionRole: executionRoleArn,
          securityGroups: [
            securityGroup.securityGroupId,
          ],
        },
      });
    });

    /*
    ** add custom resource to apply LC config on the studio domain
    */
    new LifeCycleConfigurationConstruct(this, 'LifeCycleConfiguration', {
      studioDomainId: sagemakerDomain.attrDomainId,
      studioUserIAMRoleArnList,
    });

    nag.NagSuppressions.addStackSuppressions(this, [
      { id: 'AwsSolutions-IAM4', reason: 'AWS managed policies' },
    ]);

    nag.NagSuppressions.addStackSuppressions(this, [
      { id: 'AwsSolutions-IAM5', reason: 'Wildcard permissions' },
    ]);
  }
}