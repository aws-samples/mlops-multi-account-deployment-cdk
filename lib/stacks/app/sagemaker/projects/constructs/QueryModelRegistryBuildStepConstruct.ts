/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ICodeBuildVpcConfig } from '../utils/VpcUtils';

export interface Props {
  projectName: string;
  codeBuildRoleArn: string;
  modelPackageGroupName: string;
  modelPackageGroupArn: string;
  modelBuildingEnvironment: {
    account: string;
    region: string;
  };
  vpcConfig: ICodeBuildVpcConfig;
}

export class QueryModelRegistryBuildStepConstruct extends Construct {
  public readonly project: codebuild.PipelineProject;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const codebuildRole = iam.Role.fromRoleArn(this, 'CodeBuildRole', props.codeBuildRoleArn);

    this.project = new codebuild.PipelineProject(this, 'CodeBuildProject', {
      description: 'Invokes the SM pipeline',
      role: codebuildRole,
      ...props.vpcConfig,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      environmentVariables: {
        MODEL_PACKAGE_GROUP_ARN: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.modelPackageGroupArn,
        },
        MODEL_PACKAGE_GROUP_NAME: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.modelPackageGroupName,
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            runtimeVersions: {
              python: '3.11',
            },
          },
          build: {
            commands: [
              //HINT: use single quotes when calling jq library
              'echo "MODEL_PACKAGE_GROUP_NAME=$MODEL_PACKAGE_GROUP_NAME" >> .env',
              // get MODEL_PACKAGES_LIST
              'MODEL_PACKAGES_LIST=$(aws sagemaker list-model-packages --model-package-group-name $MODEL_PACKAGE_GROUP_ARN)',
              'echo $MODEL_PACKAGES_LIST',
              // TODO: fail this if there is no "Approved" model
              'LATEST_APPROVED_MODEL_ARN=$(echo "$MODEL_PACKAGES_LIST" | jq -r \'.ModelPackageSummaryList | map(select(.ModelApprovalStatus == \"Approved\")) | max_by(.CreationTime) | .ModelPackageArn\')',
              'echo "Latest Approved Model Package ARN: $LATEST_APPROVED_MODEL_ARN"',
              // get MODEL_META_DATA
              'echo "Getting model meta data from latest approved model..."',
              'MODEL_META_DATA=$(aws sagemaker describe-model-package --model-package-name $LATEST_APPROVED_MODEL_ARN)',
              'echo "Model info $MODEL_META_DATA"',
              'echo "$MODEL_META_DATA" >> modelMetaData.json',
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