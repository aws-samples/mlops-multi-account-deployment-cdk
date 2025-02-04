/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Construct } from 'constructs';
import { DeployModelCodeBuildRole } from './iam-roles/DeployModelCodeBuildRole';
import { IProxyConfig, STAGE } from '../../../../../../config/Types';
import { CDKPipeline } from '../../../../../cdk-pipeline/core/CDKPipeline';
import { EncryptionStack } from '../../../../core/EncryptionStack';
import { SSMParameterStack } from '../../../../core/SSMParameterStack';
import { ICodeBuildVpcConfig } from '../utils/VpcUtils';

export interface Props {
  stageName: STAGE;
  applicationName: string;
  applicationQualifier: string;
  projectName: string;
  modelPackageGroupName: string;
  targetDeploymentEnvironment: {
    account: string;
    region: string;
  };
  vpcConfig: ICodeBuildVpcConfig;
  proxyConfig?: IProxyConfig;
}

export class DeployModelBuildStepConstruct extends Construct {
  public readonly project: codebuild.PipelineProject;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const codebuildRole = new DeployModelCodeBuildRole(this, 'CodeBuildRole', {
      modelPackageGroupName: props.modelPackageGroupName,
      targetDeploymentEnvironment: props.targetDeploymentEnvironment,
      applicationQualifier: props.applicationQualifier,
      proxySecretArn: props.proxyConfig?.proxySecretArn,
    });

    this.project = new codebuild.PipelineProject(this, 'CodeBuildProject', {
      description: `Deploys the Model ${props.modelPackageGroupName}`,
      role: codebuildRole,
      ...props.vpcConfig,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      environmentVariables: {
        DEPLOYMENT_ACCOUNT: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.targetDeploymentEnvironment.account,
        },
        DEPLOYMENT_REGION: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.targetDeploymentEnvironment.region,
        },
        KMS_KEY_ARN_PARAMETER: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: SSMParameterStack.getParameterName(props.applicationQualifier, EncryptionStack.ssmParameterName),
        },
        STAGE_NAME: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.stageName.toLowerCase(),
        },
        KMS_KEY_ALIAS_EXP: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: EncryptionStack.getKmsKeyAlias(props.applicationName, STAGE.EXP),
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
              'npm i',
            ],
          },
          build: {
            commands: [
              'ls -l',
              'npm run cdk deploy "*"',
            ],
          },
        },
        artifacts: {
          files: ['**/*'],
        },
      },
      ),
    });
  }
}