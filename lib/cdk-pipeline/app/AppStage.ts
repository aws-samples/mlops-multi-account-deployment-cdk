/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';
import { SecurityControls } from '../../../bin/aspects';
import { AppConfig } from '../../../config/AppConfig';
import { APP_STAGE } from '../../../config/Types';
import { EncryptionStack } from '../../stacks/core/EncryptionStack';

interface Props extends cdk.StageProps {
  stage: APP_STAGE;
}

export class AppStage extends cdk.Stage {

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    new EncryptionStack(this, `${AppConfig.applicationName}EncryptionStack`, {
      stageName: props.stage,
      applicationQualifier: AppConfig.applicationQualifier,
      applicationName: AppConfig.applicationName,
    });

    cdk.Aspects.of(this).add(new SecurityControls(props.stage));
    cdk.Aspects.of(this).add(new nag.AwsSolutionsChecks({ verbose: false }));
  }
}