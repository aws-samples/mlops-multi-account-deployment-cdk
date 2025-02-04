/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as codeartifact from 'aws-cdk-lib/aws-codeartifact';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { ICodeBuildVpcConfig } from './projects/utils/VpcUtils';
import { ISagemakerNetworkingConfig } from '../../../../config/MLOpsConfig';
import { SSMParameterStack } from '../../core/SSMParameterStack';

interface Props extends cdk.StackProps {
  vpcConfig: ISagemakerNetworkingConfig;
  applicationQualifier: string;
}

export class SagemakerNetworkingStack extends cdk.Stack {
  static readonly vpcIdParameterName: string = 'exp/vpc/id';
  static readonly securityGroupIdParameterName: string = 'exp/vpc/security-group/id';
  static readonly sagemakerSecurityGroupIdParameterName: string = 'exp/vpc/security-group/sagemaker/id';
  static readonly codeArtefactDomainName: string = 'sagemaker-codeartifact-domain';
  static readonly codeArtefactRepositoryName: string = 'sm-private-pypi';
  readonly codeBuildVpcConfig: ICodeBuildVpcConfig;

  constructor(scope: Construct, id: string, props:Props) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      vpcId: props.vpcConfig.vpcId,
    });

    const securityGroup = SagemakerNetworkingStack.ServiceEndpointSecurityGroup(this, 'EndpointSecurityGroup', {
      vpc,
      description: 'Allow traffic between to AWS Service VPC Endpoints',
      securityGroupName: 'Security Group for Sagemaker related Service VPC Endpoints',
    });

    // export VPCId and SG id to SSM, used by Model Build Pipeline
    SSMParameterStack.createParameter(this, props.applicationQualifier,
      SagemakerNetworkingStack.securityGroupIdParameterName,
      securityGroup.securityGroupId,
    );
    SSMParameterStack.createParameter(this, props.applicationQualifier,
      SagemakerNetworkingStack.vpcIdParameterName,
      vpc.vpcId,
    );

    // codeBuildVpcConfig for ImageBuilding Pipeline
    this.codeBuildVpcConfig = {
      vpc,
      subnetSelection: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [
        securityGroup,
      ],
    };

    // create Security Group for Sagemaker Jobs (Processing/ Training)
    const sagemakerSecurityGroup = SagemakerNetworkingStack.SagemakerSecurityGroup(this, 'SagemakerSecurityGroup', {
      vpc,
      description: 'Allow traffic to AWS Service VPC Endpoints',
      securityGroupName: 'Security Group for Sagemaker Processing and Training Jobs',
    });
    SSMParameterStack.createParameter(this, props.applicationQualifier,
      SagemakerNetworkingStack.sagemakerSecurityGroupIdParameterName,
      sagemakerSecurityGroup.securityGroupId,
    );

    // add vpc service endpoints that are required and are not yet present in the VPC
    // reference: https://docs.aws.amazon.com/sagemaker/latest/dg/studio-updated-and-internet-access.html#studio-notebooks-and-internet-access-vpc-requirements
    const subnetList = props.vpcConfig.subnetIdList.map((subnetID: string) => ec2.Subnet.fromSubnetId(this, `Subnet-${subnetID}`, subnetID));
    [
      ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      ec2.InterfaceVpcEndpointAwsService.ECR,
      ec2.InterfaceVpcEndpointAwsService.SAGEMAKER_API,
      ec2.InterfaceVpcEndpointAwsService.SAGEMAKER_RUNTIME,
      ec2.InterfaceVpcEndpointAwsService.SAGEMAKER_STUDIO,
      ec2.InterfaceVpcEndpointAwsService.CODECOMMIT,
      ec2.InterfaceVpcEndpointAwsService.CODECOMMIT_GIT,
      ec2.InterfaceVpcEndpointAwsService.CODEARTIFACT_API,
      ec2.InterfaceVpcEndpointAwsService.CODEARTIFACT_REPOSITORIES,
      ec2.InterfaceVpcEndpointAwsService.SERVICE_CATALOG,
      ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      ec2.InterfaceVpcEndpointAwsService.ATHENA,
      ec2.InterfaceVpcEndpointAwsService.EVENTBRIDGE,
    ].forEach((service: ec2.InterfaceVpcEndpointAwsService) => {
      vpc.addInterfaceEndpoint(`VpcEndpoint${service.shortName}`, {
        service,
        subnets: {
          subnets: subnetList,
        },
        securityGroups: [
          securityGroup,
        ],
      });
    });

    /*
    * add codeArtifact for PyPi packages
    */
    const codeArtifactDomain = new codeartifact.CfnDomain(this, 'CodeArtifactDomain', {
      domainName: SagemakerNetworkingStack.codeArtefactDomainName,
    });

    new codeartifact.CfnRepository(this, 'CodeArtifactRepository', {
      domainName: codeArtifactDomain.attrName,
      repositoryName: SagemakerNetworkingStack.codeArtefactRepositoryName,
      description: 'CodeArtifact repository for Pypi packages',
      externalConnections: [
        'public:pypi',
      ],
    });

  }

  static DomainUserSecurityGroup(scope: Construct, id: string, securityGroupProps: ec2.SecurityGroupProps): ec2.SecurityGroup {
    // reference: https://docs.aws.amazon.com/sagemaker/latest/dg/studio-updated-and-internet-access.html#studio-notebooks-and-internet-access-vpc-requirements
    const securityGroup = new ec2.SecurityGroup(scope, id, {
      ...securityGroupProps,
      allowAllOutbound: true,
    });

    securityGroup.addIngressRule(
      ec2.Peer.ipv4(securityGroupProps.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow TCP ingress from VPC Endpoints',
    );

    securityGroup.addIngressRule(
      ec2.Peer.ipv4(securityGroupProps.vpc.vpcCidrBlock),
      ec2.Port.tcp(2049),
      'Allow TCP traffic from EFS',
    );

    securityGroup.addIngressRule(
      securityGroup,
      ec2.Port.tcpRange(8192, 65535),
      'Allow TCP traffic between the Jupyter Server application and the Kernel Gateway applications',
    );
    return securityGroup;
  }

  private static ServiceEndpointSecurityGroup(scope: Construct, id: string, securityGroupProps: ec2.SecurityGroupProps): ec2.SecurityGroup {
    // security group for Service VPC Endpoints
    const securityGroup = new ec2.SecurityGroup(scope, id, {
      ...securityGroupProps,
      allowAllOutbound: true,
    });

    securityGroup.addIngressRule(
      ec2.Peer.ipv4(securityGroupProps.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow TCP ingress from same network',
    );
    return securityGroup;
  }

  private static SagemakerSecurityGroup(scope: Construct, id: string, securityGroupProps: ec2.SecurityGroupProps): ec2.SecurityGroup {
    // security group for Sagemaker Processing and training jobs
    const securityGroup = new ec2.SecurityGroup(scope, id, {
      ...securityGroupProps,
      allowAllOutbound: true,
    });

    securityGroup.addIngressRule(
      securityGroup,
      ec2.Port.allTraffic(),
      'Allow all inbound traffic from same Security Group for Distributed Training Jobs',
    );

    return securityGroup;
  }
}