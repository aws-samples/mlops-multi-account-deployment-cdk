/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { SAGEMAKER_STUDIO_USER_GROUP } from '../../../../../config/MLOpsConfig';
import { SagemakerNetworkingStack } from '../SagemakerNetworkingStack';

interface RoleProps {
  scope: cdk.Stack;
  name: string;
}

/**
 * abstract class to used for creation of the Sagemaker Studio roles.
 * This class allows to create three role types:
 * - default Execution Role: required for creation of the Studio Domain
 * - LeadDataScientistRole: Role to be assumed by the SagemakerStudio user when logging into the Studio Domain
 * - DataScientistRole: same as LeadDataScientistRole, but with additional deny policy to limit permissions
 */

export class SagemakerStudioRoles {

  public static ExecutionRole(props: RoleProps): iam.Role {
    return new iam.Role(props.scope, `${props.name}SagemakerStudioRole`, {
      roleName: `${props.name}-SagemakerStudioRole`,
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com', {
        conditions: {
          StringEquals: {
            'aws:SourceAccount': cdk.Stack.of(props.scope).account,
          },
        },
      }),
      inlinePolicies: {
        'sagemaker-studio': SagemakerStudioRoles.SagemakerStudioPolicyDocument(props.scope),
        'sagemaker-guardrails': SagemakerStudioRoles.SagemakerGuardrailPolicyDocument(),
      },
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
      ],
    });
  }

  public static StudioUserRole(props: RoleProps, userGroup: SAGEMAKER_STUDIO_USER_GROUP): iam.Role {
    switch (userGroup) {
      case SAGEMAKER_STUDIO_USER_GROUP.LEAD_DATA_SCIENTIST:
        return SagemakerStudioRoles.LeadDataScientistRole(props);
      case SAGEMAKER_STUDIO_USER_GROUP.DATA_SCIENTIST:
        return SagemakerStudioRoles.DataScientistRole(props);
      default:
        throw new Error (`User Group ${userGroup} is not defined. Choose a valid Sagemaker Studio user Group`);
    }
  }

  private static LeadDataScientistRole(props: RoleProps): iam.Role {
    return new iam.Role(props.scope, `${props.name}LeadDataScientistRole`, {
      roleName: `${props.name}-LeadDataScientistRole`,
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com', {
        conditions: {
          StringEquals: {
            'aws:SourceAccount': cdk.Stack.of(props.scope).account,
          },
        },
      }),
      inlinePolicies: {
        'sagemaker-studio': SagemakerStudioRoles.SagemakerStudioPolicyDocument(props.scope),
        'sagemaker-guardrails': SagemakerStudioRoles.SagemakerGuardrailPolicyDocument(),
      },
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
      ],
    });
  }

  private static DataScientistRole(props: RoleProps): iam.Role {
    return new iam.Role(props.scope, `${props.name}DataScientistRole`, {
      roleName: `${props.name}-DataScientistRole`,
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com', {
        conditions: {
          StringEquals: {
            'aws:SourceAccount': cdk.Stack.of(props.scope).account,
          },
        },
      }),
      inlinePolicies: {
        'sagemaker-studio': SagemakerStudioRoles.SagemakerStudioPolicyDocument(props.scope),
        'sagemaker-guardrails': SagemakerStudioRoles.SagemakerGuardrailPolicyDocument(),
        'sagemaker-deny': SagemakerStudioRoles.DataScientistDenyPolicyDocument(props.scope),
      },
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
      ],
    });
  }

  private static SagemakerStudioPolicyDocument(scope: cdk.Stack): iam.PolicyDocument {
    return new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:AbortMultipartUpload',
            's3:DeleteObject',
            's3:Describe*',
            's3:GetObject',
            's3:PutBucket*',
            's3:PutObject',
            's3:PutObjectAcl',
            's3:GetBucketAcl',
          ],
          resources: ['arn:aws:s3:::*'],
          conditions: {
            StringEquals: {
              'aws:ResourceAccount': `${scope.account}`,
            },
          },
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'kms:CreateGrant',
            'kms:Decrypt',
            'kms:DescribeKey',
            'kms:Encrypt',
            'kms:ReEncrypt',
            'kms:GenerateDataKey',
          ],
          resources: [`arn:aws:kms:${scope.region}:${scope.account}:key/*`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sagemaker:ListTags'],
          resources: [`arn:aws:sagemaker:${scope.region}:${scope.account}:*`],
        }),
        //CodeArtefact Permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'codeartifact:DescribePackageVersion',
            'codeartifact:DescribeRepository',
            'codeartifact:GetPackageVersionReadme',
            'codeartifact:GetRepositoryEndpoint',
            'codeartifact:ListPackageVersionAssets',
            'codeartifact:ListPackageVersionDependencies',
            'codeartifact:ListPackageVersions',
            'codeartifact:ListPackages',
            'codeartifact:ReadFromRepository',
            'codeartifact:GetAuthorizationToken',
          ],
          resources: [
            `arn:aws:codeartifact:${scope.region}:${scope.account}:domain/${SagemakerNetworkingStack.codeArtefactDomainName}`,
            `arn:aws:codeartifact:${scope.region}:${scope.account}:repository/${SagemakerNetworkingStack.codeArtefactDomainName}/${SagemakerNetworkingStack.codeArtefactRepositoryName}`,
          ],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:GetServiceBearerToken'],
          resources: ['*'],
        }),

        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'codecommit:GitPull',
            'codecommit:GitPush',
            'codecommit:*Branch*',
            'codecommit:*PullRequest*',
            'codecommit:*Commit*',
            'codecommit:GetDifferences',
            'codecommit:GetReferences',
            'codecommit:GetMerge*',
            'codecommit:Merge*',
            'codecommit:DescribeMergeConflicts',
            'codecommit:*Comment*',
            'codecommit:*File',
            'codecommit:GetFolder',
            'codecommit:GetBlob',
          ],
          resources: [`arn:aws:codecommit:${scope.region}:${scope.account}:*`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'sagemaker:EnableSagemakerServicecatalogPortfolio',
            'servicecatalog:AssociatePrincipalWithPortfolio',
            'servicecatalog:AcceptPortfolioShare',
            'iam:GetRole',
          ],
          resources: [
            `arn:aws:catalog:${scope.region}:${scope.account}:portfolio/*`,
            `arn:aws:iam::${scope.account}:role/*`,
          ],
          conditions: {
            StringEquals: {
              'aws:ResourceAccount': `${scope.account}`,
            },
          },
        }),
      ],
    });
  }

  private static SagemakerGuardrailPolicyDocument(): iam.PolicyDocument {
    // Security Guardrails policy
    // adding security guardrails https://docs.aws.amazon.com/whitepapers/latest/build-secure-enterprise-ml-platform/governance-and-control.html
    // restricting permissions given by AmazonSageMakerFullAccess managed Policy
    return new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          sid: 'SageMakerEnforceVPCDeployment',
          effect: iam.Effect.DENY,
          actions: [
            'sagemaker:CreateModel',
            'sagemaker:CreateNotebookInstance',
            'sagemaker:CreateProcessingJob',
          ],
          resources: ['*'],
          conditions: {
            Null: {
              'sagemaker:VpcSubnets': 'true',
              'sagemaker:VpcSecurityGroupIds': 'true',
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'SageMakerEnforceNetworkingTrainingJob',
          effect: iam.Effect.DENY,
          actions: [
            'sagemaker:CreateHyperParameterTuningJob',
            'sagemaker:CreateTrainingJob',
          ],
          resources: ['*'],
          conditions: {
            Null: {
              'sagemaker:VpcSubnets': 'true',
              'sagemaker:VpcSecurityGroupIds': 'true',
            },
            Bool: {
              'sagemaker:NetworkIsolation': 'false',
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'SageMakerEnforceInterContainerTrafficEncryption',
          effect: iam.Effect.DENY,
          actions: [
            'sagemaker:CreateHyperParameterTuningJob',
            'sagemaker:CreateTrainingJob',
          ],
          resources: ['*'],
          conditions: {
            Bool: {
              'sagemaker:InterContainerTrafficEncryption': 'false',
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'SageMakerJobEnforceEncryption',
          effect: iam.Effect.DENY,
          actions: [
            'sagemaker:CreateHyperParameterTuningJob',
            'sagemaker:CreateProcessingJob',
            'sagemaker:CreateTrainingJob',
            'sagemaker:CreateTransformJob',
          ],
          resources: ['*'],
          conditions: {
            Null: {
              'sagemaker:VolumeKmsKey': 'true',
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'RestrictFullAccessPermissions',
          effect: iam.Effect.DENY,
          actions: [
            'redshift-data:*',
            's3express:*',
            'cognito-idp:*',
            'robomaker:*',
            's3:CreateBucket',
            'ecr:CreateRepository',
            'codecommit:CreateRepository',
          ],
          resources: ['*'],
        }),
      ],
    });
  }

  private static DataScientistDenyPolicyDocument(scope: cdk.Stack): iam.PolicyDocument {
    return new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          actions: ['sagemaker:CreateProject'],
          resources: [`arn:aws:sagemaker:${scope.region}:${scope.account}:project/*`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          actions: ['sagemaker:UpdateModelPackage'],
          resources: [`arn:aws:sagemaker:${scope.region}:${scope.account}:model-package/*`],
        }),
      ],
    });
  }
}