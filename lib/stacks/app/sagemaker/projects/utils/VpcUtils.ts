/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { SSMParameterStack } from '../../../../core/SSMParameterStack';

export interface ICodeBuildVpcConfig {
  vpc: ec2.IVpc;
  subnetSelection: ec2.SubnetSelection;
  securityGroups: ec2.ISecurityGroup[];
}

interface Props {
  applicationQualifier: string;
  vpcIdParameterName: string;
  securityGroupIdParameterName: string;
}

export class VpcUtils {

  static getCodeBuildVpcConfig(scope: Construct, props: Props): ICodeBuildVpcConfig {
    const vpcId = SSMParameterStack.getParameterValue(scope, props.applicationQualifier, props.vpcIdParameterName);
    const securityGroupId = SSMParameterStack.getParameterValue(scope, props.applicationQualifier, props.securityGroupIdParameterName);
    const vpc = ec2.Vpc.fromLookup(scope, 'Vpc', { vpcId });
    return {
      vpc,
      subnetSelection: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [
        ec2.SecurityGroup.fromLookupById(scope, 'SecurityGroup', securityGroupId),
      ],
    };
  }
}