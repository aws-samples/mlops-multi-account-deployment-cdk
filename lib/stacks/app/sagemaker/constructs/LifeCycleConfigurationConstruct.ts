/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3_asset from 'aws-cdk-lib/aws-s3-assets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { PythonCustomResourceConstruct } from '../../../core/constructs/PythonCustomResourceConstruct';

interface Props {
  studioDomainId: string;
  studioUserIAMRoleArnList: string[];
}

export class LifeCycleConfigurationConstruct extends PythonCustomResourceConstruct {
  constructor(scope: cdk.Stack, id: string, props: Props) {
    super(scope, id, {
      folderPath: 'src/lambda-functions/sagemaker-studio-lifecycle/',
      properties: {
        DOMAIN_ID: props.studioDomainId,
        LIFECYCLE_CONFIG_NAME: `shutdown-idle-kernels-${props.studioDomainId}`,
      },
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'sagemaker:CreateStudioLifecycleConfig',
            'sagemaker:DeleteStudioLifecycleConfig',
            'sagemaker:UpdateDomain',
            'sagemaker:ListStudioLifecycleConfigs',
          ],
          resources: [`arn:aws:sagemaker:${scope.region}:${scope.account}:*`],
        }),
      ],
    });

    // upload the script for automated-shutdown to s3 and save its path in SSM
    // NOTE: there is currently no option to pass the parameter name dynamically.
    // IF you change the parameter name, ensure it matches with the reference in the shutdown-idle-kernels.sh
    const asset = new s3_asset.Asset(scope, 'S3Asset', {
      path: 'src/sagemaker/sagemaker_studio_auto-shutdown-0.1.5.tar.gz',
    });

    const ssmParameter = new ssm.StringParameter(scope, 'ShutDownScriptParameter', {
      parameterName: '/sagemaker/auto-shutdown-script-s3-path',
      stringValue: asset.s3ObjectUrl,
    });

    // give every studio user permissions to load the shutdown script
    // permissions have to be given the each user's iam role
    props.studioUserIAMRoleArnList.forEach((arn: string, index: number) => {
      const role = iam.Role.fromRoleArn(scope, `IAMRole${index}`, arn);
      asset.grantRead(role);
      ssmParameter.grantRead(role);
    });
  }
}