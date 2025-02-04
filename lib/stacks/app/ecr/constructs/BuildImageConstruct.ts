/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';
import { IProxyConfig } from '../../../../../config/Types';
import { CDKPipeline } from '../../../../cdk-pipeline/core/CDKPipeline';
import { ICodeBuildVpcConfig } from '../../sagemaker/projects/utils/VpcUtils';

interface Props extends cdk.StackProps {
  ecrRepositoryName:string;
  ecrRepositoryAccountId:string;
  imageTag:string;
  codeCommitRepositoryArn:string;
  imageBuildSourceFolder: string;
  vpcConfig: ICodeBuildVpcConfig;
  proxyConfig?: IProxyConfig;
}

export class BuildImageConstruct extends Construct {
  readonly project: codebuild.PipelineProject;

  constructor(scope: cdk.Stack, id: string, props: Props) {
    super(scope, id);

    const role = new iam.Role(this, 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      inlinePolicies: {
        CodeCommitPull: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: 'PullRepoPolicy',
              actions: [
                'codecommit:GitPull',
              ],
              effect: iam.Effect.ALLOW,
              resources: [props.codeCommitRepositoryArn],
            }),
          ],
        }),
        PushECRImage: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: 'BuildPolicies',
              actions: [
                'ecr:BatchCheckLayerAvailability',
                'ecr:CompleteLayerUpload',
                'ecr:InitiateLayerUpload',
                'ecr:PutImage',
                'ecr:UploadLayerPart',
                'ecr:GetAuthorizationToken',
              ],
              effect: iam.Effect.ALLOW,
              resources: [`arn:aws:ecr:${scope.region}:${props.ecrRepositoryAccountId}:repository/${props.ecrRepositoryName}`],
            }),
            new iam.PolicyStatement({
              sid: 'LoginToECR',
              actions: [
                'ecr:GetAuthorizationToken',
              ],
              effect: iam.Effect.ALLOW,
              resources: ['*'],
            }),
          ],
        }),
        CreateCWLogs: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: 'LogsPolicies',
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              effect: iam.Effect.ALLOW,
              resources: [`arn:aws:logs:${scope.region}:${scope.account}:log-group:/aws/codebuild/*`],
            }),
          ],
        }),
        ...(
          props.proxyConfig ?
            {
              GetProxySecret: new iam.PolicyDocument({
                statements: [
                  new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                      'secretsmanager:GetSecretValue',
                    ],
                    resources: [
                      props.proxyConfig.proxySecretArn,
                    ],
                  }),
                ],
              }),
            } : {}
        ),
      },
    });

    this.project = new codebuild.PipelineProject(this, 'CodeBuildProject', {
      description: 'Build Image',
      role,
      ...props.vpcConfig,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      environmentVariables: {
        ECR_REPOSITORY_ACCOUNT_ID: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.ecrRepositoryAccountId,
        },
        ECR_REPOSITORY_NAME: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.ecrRepositoryName,
        },
        IMAGE_TAG: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.imageTag,
        },
        SOURCE_FOLDER: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.imageBuildSourceFolder,
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        env: (
          props.proxyConfig ?
            {
              'variables': {
                NO_PROXY: props.proxyConfig.noProxy.join(','),
                AWS_STS_REGIONAL_ENDPOINTS: 'regional',
              },
              'secrets-manager': {
                PROXY_USERNAME: props.proxyConfig.proxySecretArn.concat(':username'),
                PROXY_PASSWORD: props.proxyConfig.proxySecretArn.concat(':password'),
                HTTP_PROXY_PORT: props.proxyConfig.proxySecretArn.concat(':http_proxy_port'),
                HTTPS_PROXY_PORT: props.proxyConfig.proxySecretArn.concat(':https_proxy_port'),
                PROXY_DOMAIN: props.proxyConfig.proxySecretArn.concat(':proxy_domain'),
              },
            } : {}
        ),
        phases: {
          install: {
            commands: [
              props.proxyConfig ?
                CDKPipeline.getInstallCommands(props.proxyConfig.proxyTestUrl)
                : '',
            ],
          },
          pre_build: {
            commands: [
              'echo Logging into Amazon ECR...',
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
            ],
          },
          build: {
            commands: [
              'cd $SOURCE_FOLDER',
              'echo Building Docker image...',
              'docker build -t $ECR_REPOSITORY_NAME:$IMAGE_TAG .',
              'docker tag $ECR_REPOSITORY_NAME:$IMAGE_TAG $ECR_REPOSITORY_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$ECR_REPOSITORY_NAME:$IMAGE_TAG',
            ],
          },
          post_build: {
            commands: [,
              'echo Pushing the Docker image...',
              'docker push $ECR_REPOSITORY_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$ECR_REPOSITORY_NAME:$IMAGE_TAG',
              'echo Image Push complete'],
          },
        },
      }),
    });

    nag.NagSuppressions.addStackSuppressions(cdk.Stack.of(this), [
      { id: 'AwsSolutions-IAM5', reason: 'Wildcard permissions' },
    ]);
  }
}