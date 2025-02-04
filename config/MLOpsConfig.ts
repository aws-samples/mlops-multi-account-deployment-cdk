/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import { IProxyConfig } from './Types';


// User Configuration
export enum SAGEMAKER_STUDIO_USER_GROUP {
  DATA_SCIENTIST= 'DATA_SCIENTIST',
  LEAD_DATA_SCIENTIST= 'LEAD_DATA_SCIENTIST'
}

export interface ISagemakerStudioUser {
  name: string;
  userGroup: SAGEMAKER_STUDIO_USER_GROUP;
}

export interface ISagemakerNetworkingConfig {
  vpcId: string;
  subnetIdList: string[];
  proxy?: IProxyConfig;
}

export const SAGEMAKER_STUDIO_USERS: ISagemakerStudioUser[] = [
  {
    name: 'EXAMPLE_USER_1',
    userGroup: SAGEMAKER_STUDIO_USER_GROUP.LEAD_DATA_SCIENTIST,
  },
];

/**
 * VPC configuration for the Sagemaker Studio Domain, this VPC must be located in your EXP account
 */
export const SAGEMAKER_VPC_CONFIG: ISagemakerNetworkingConfig = {
  vpcId: 'vpc-01abc34567d890e1',
  subnetIdList: ['subnet-01ab23456c7de8fgh', 'subnet-01ab23456c7de8fhg'],
  /*
  proxy config is optional.
  If defined, it will by used by the image building pipeline in the EXP account, defined in ImageBuildPipelineStack.ts
  */
  proxy: {
    proxySecretArn: 'YOUR_SECRET_ARN',
    noProxy: ['eu-west-1.amazonaws.com'],
    proxyTestUrl: 'https://aws.amazon.com/',
  },
};

/*
 Config for docker image creation
*/
export interface IECRConfig {
  /**
   * definition of the CodeCommit source (required by ImageBuildPipelineStack.ts)
   */
  codeCommitSource: ICodeCommitConfig;
  /**
   * the ECR repositories that are created in RES as part of the deployment
   */
  repositories: IECRRepositoryConfig[];
}

interface ICodeCommitConfig {
  /**
   * type of the CodeCommit repository, users can choose to either create a new repository 'CODECOMMIT'
   * or reference and existing repository 'CODECOMMIT_FROM_LOOKUP'
   */
  type: 'CODECOMMIT' | 'CODECOMMIT_FROM_LOOKUP';
  /**
   * name of the repository to be created/ looked up
   */
  name: string;
  /**
   * name of the branch connected to the CodePipeline
   */
  branch: string;
}

export interface IECRRepositoryConfig {
  /**
   * name of the to be created ECR repository
   */
  repositoryName: string;
  /**
   * name of the source folder in the CodeCommit repo used as source for image creation (required by ImageBuildPipelineStack.ts)
   */
  sourceFolder: string;
}

export const ECR_CONFIG: IECRConfig = {
  codeCommitSource: {
    type: 'CODECOMMIT_FROM_LOOKUP',
    name: '',
    branch: 'main',
  },
  /**
   * CONFIGURE: ECR repositories to be created
   */
  repositories: [],

};
