/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface Props {
  modelPackageGroupName: string;
  targetDeploymentEnvironment: {
    account: string;
    region: string;
  };
  applicationQualifier: string;
  proxySecretArn?: string;
}

export class DeployModelCodeBuildRole extends iam.Role {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      inlinePolicies: {
        CrossAccountDeployment: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: 'CrossAccountCDK',
              effect: iam.Effect.ALLOW,
              actions: [
                'sts:AssumeRole',
              ],
              resources: [
                `arn:aws:iam::${props.targetDeploymentEnvironment.account}:role/cdk-${props.applicationQualifier}-deploy-role-${props.targetDeploymentEnvironment.account}-${props.targetDeploymentEnvironment.region}`,
                `arn:aws:iam::${props.targetDeploymentEnvironment.account}:role/cdk-${props.applicationQualifier}-file-publishing-role-${props.targetDeploymentEnvironment.account}-${props.targetDeploymentEnvironment.region}`,
                //image-publishing-role used for publishing lambda image in the target deployment account
                `arn:aws:iam::${props.targetDeploymentEnvironment.account}:role/cdk-${props.applicationQualifier}-image-publishing-role-${props.targetDeploymentEnvironment.account}-${props.targetDeploymentEnvironment.region}`,
                `arn:aws:iam::${props.targetDeploymentEnvironment.account}:role/cdk-${props.applicationQualifier}-lookup-role-${props.targetDeploymentEnvironment.account}-${props.targetDeploymentEnvironment.region}`,
              ],
            }),
          ],
        }),
        ...(
          props.proxySecretArn ?
            {
              GetProxySecret: new iam.PolicyDocument({
                statements: [
                  new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                      'secretsmanager:GetSecretValue',
                    ],
                    resources: [
                      props.proxySecretArn,
                    ],
                  }),
                ],
              }),
            } : {}
        ),
      },
    });
  }
}