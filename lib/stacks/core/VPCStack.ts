/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { SSMParameterStack } from './SSMParameterStack';
import { IVpcStackConfig } from '../../../config/VpcConfig';

interface Props extends cdk.StackProps {
  vpcConfig: IVpcStackConfig;
  flowLogsBucketName: string;
  applicationQualifier: string;
}

export class VPCStack extends cdk.Stack {
  static readonly vpcIdParameterName: string = 'res/vpc/id';
  static readonly securityGroupIdParameterName: string = 'res/vpc/security-group/id';
  readonly vpc: ec2.IVpc | undefined;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    switch (props.vpcConfig.type) {
      case 'VPC_FROM_LOOK_UP':
        this.vpc = ec2.Vpc.fromLookup(this, 'vpc', {
          vpcId: props.vpcConfig.vpcId,
        });
        VPCStack.SecurityGroup(this, 'SecurityGroup', this.vpc, props.applicationQualifier);
        break;

      case 'VPC':
        this.vpc = new ec2.Vpc(this, 'vpc', {
          ipAddresses: ec2.IpAddresses.cidr(props.vpcConfig.cidrBlock),
          availabilityZones: [`${this.region}a`, `${this.region}b`],
          restrictDefaultSecurityGroup: true,
          subnetConfiguration: [{
            cidrMask: props.vpcConfig.subnetCidrMask,
            name: 'private',
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          }],
          flowLogs: {
            vpcFlowLogs: {
              destination: ec2.FlowLogDestination.toS3(
                s3.Bucket.fromBucketName(this, 'VpcFlowLogsBucket', props.flowLogsBucketName),
              ),
              trafficType: ec2.FlowLogTrafficType.ALL,
            },
          },
        });

        const securityGroup = VPCStack.SecurityGroup(this, 'SecurityGroup', this.vpc, props.applicationQualifier);
        [ //VpcEndpoints
          ec2.InterfaceVpcEndpointAwsService.SSM,
          ec2.InterfaceVpcEndpointAwsService.STS,
          ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
          ec2.InterfaceVpcEndpointAwsService.CLOUDFORMATION,
          ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
          ec2.InterfaceVpcEndpointAwsService.ECR,
          ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        ].forEach((service: ec2.InterfaceVpcEndpointAwsService) => {
          this.vpc!.addInterfaceEndpoint(`VpcEndpoint${service.shortName}`, {
            service,
            open: false,
            securityGroups: [securityGroup],
          });
        });

        // VPCGatewayEndpoints
        this.vpc.addGatewayEndpoint('VpcGatewayS3', {
          service: ec2.GatewayVpcEndpointAwsService.S3,
        });
        break;
      default:
        throw Error('VPC config for CDK Pipeline is not provided');
    }
  }

  private static SecurityGroup(scope: Construct, id: string, vpc: ec2.IVpc, applicationQualifier: string): ec2.SecurityGroup {
    const securityGroup = new ec2.SecurityGroup(scope, id, {
      vpc,
      description: 'Allow traffic between CodeBuildStep and AWS Service VPC Endpoints',
      securityGroupName: 'Security Group for AWS Service VPC Endpoints',
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(443), 'HTTPS Traffic');
    SSMParameterStack.createParameter(scope, applicationQualifier, VPCStack.vpcIdParameterName, vpc.vpcId);
    SSMParameterStack.createParameter(scope, applicationQualifier, VPCStack.securityGroupIdParameterName, securityGroup.securityGroupId);
    return securityGroup;
  }
}
