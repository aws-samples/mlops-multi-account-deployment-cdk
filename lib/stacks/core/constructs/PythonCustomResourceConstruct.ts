/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';

interface Props {
  initialPolicy: iam.PolicyStatement[];
  folderPath: string;
  properties?: {[key in string]: string};
}

export class PythonCustomResourceConstruct extends Construct {
  constructor(scope: cdk.Stack, id: string, props: Props ) {
    super(scope, id);

    const lambdaFunction = new lambda.Function(this, 'LambdaFunction', {
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(props.folderPath),
      timeout: cdk.Duration.minutes(1),
      initialPolicy: [
        ...props.initialPolicy,
      ],
    });

    const provider = new cr.Provider(this, 'Provider', {
      onEventHandler: lambdaFunction,
      logRetention: logs.RetentionDays.ONE_DAY,
    });

    new cdk.CustomResource(this, 'CustomResource', {
      serviceToken: provider.serviceToken,
      properties: {
        ...(props.properties ?? {}),
        lambdaVersion: lambdaFunction.currentVersion.version,
      },
    });

    nag.NagSuppressions.addResourceSuppressions(provider, [
      { id: 'AwsSolutions-L1', reason: 'resource provider framework Lambda function is not configured to use the latest runtime version.' },
    ], true);
  }
}