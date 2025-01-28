/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { CDKPipeline, PipelineProps } from './CDKPipeline';
import { APP_STAGE, DEPLOYMENT_STAGE, STAGE } from '../../../config/Types';
import { SSMParameterStack } from '../../stacks/core/SSMParameterStack';
import { AppStage } from '../app/AppStage';
import { ExpStage } from '../app/ExpStage';
import { ResStage } from '../app/ResStage';

export interface RepositoryProps extends codecommit.RepositoryProps {
  readonly connectionArn: string;
}

interface Props extends cdk.StackProps {
  applicationName: string;
  applicationQualifier: string;
  deployments: {[key in DEPLOYMENT_STAGE]: Environment};
  pipelineProps: PipelineProps;
}

interface Environment {
  account: string;
  region: string;
}
export class PipelineStack extends cdk.Stack {
  readonly codecommitRepositoryName: string;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const pipeline = new CDKPipeline(this, 'CdkPipeline', {
      ...props.pipelineProps,
      applicationQualifier: props.applicationQualifier,
      pipelineName: props.applicationName,
      rolePolicies: [
        ...(props.pipelineProps.vpcProps?.proxy?.proxySecretArn ?
          [new iam.PolicyStatement({
            actions: [
              'secretsmanager:GetSecretValue',
            ],
            resources: [props.pipelineProps.vpcProps.proxy.proxySecretArn],
          })] : []),
        SSMParameterStack.getGetParameterPolicyStatement(this.account, this.region, props.applicationQualifier),
      ],
    });

    //RES deployment
    pipeline.addStage(new ResStage(this, STAGE.RES, {
      env: props.deployments.RES,
    }));

    //EXP deployment
    pipeline.addStage(new ExpStage(this, STAGE.EXP, {
      env: props.deployments.EXP,
    }));

    //Application deployment
    const applicationStages: APP_STAGE[] = [
      STAGE.DEV,
      STAGE.INT,
    ];

    applicationStages.forEach((stageName: APP_STAGE) => {
      pipeline.addStage(new AppStage(this, stageName, {
        env: props.deployments[stageName],
        stage: stageName,
      }), {
        pre: [
          ...((stageName != STAGE.DEV) ?
            [
              new pipelines.ManualApprovalStep(`PromoteTo${stageName}`),
            ]
            : []
          ),
        ],
      });
    });

    pipeline.buildPipeline();

    NagSuppressions.addStackSuppressions(this, [{
      id: 'AwsSolutions-IAM5',
      reason: 'Suppress AwsSolutions-IAM5 on the known Action wildcards.',
      appliesTo: [
        {
          regex: '/(.*)(Action::kms:ReEncrypt|Action::s3:Abort|Action::s3:GetObject|Action::s3:DeleteObject|Action::s3:List|Action::s3:GetBucket|Action::kms:GenerateDataKey(.*)|Action::ec2messages:GetEndpoint|Action::ec2messages(.*)|Action::ssmmessages(.*)|Action::ssmmessages:OpenDataChannel)(.*)$/g',
        },
      ],
    },
    {
      id: 'AwsSolutions-IAM5',
      reason: 'Suppress AwsSolutions-IAM5 on the Resource wildcards.',
      appliesTo: [
        {
          regex: '/^Resource::(.*)/g',
        },
      ],
    }]);
  }
}
