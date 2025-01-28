/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TestAppConfig } from './TestConfig';
import { IVpcConfigNewVpc, IVpcConfigNoVpc } from '../config/VpcConfig';
import { VPCStack } from '../lib/stacks/core/VPCStack';

describe('vpc-stack-test', () => {
  const app = new cdk.App();

  const vpcConfig: IVpcConfigNewVpc = {
    type: 'VPC',
    cidrBlock: '172.31.0.0/23',
    subnetCidrMask: 24,
  };

  const vpcStack = new VPCStack(app, 'VPCStack', {
    env: { account: TestAppConfig.deploymentAccounts.RES, region: TestAppConfig.region },
    vpcConfig: vpcConfig,
    flowLogsBucketName: TestAppConfig.complianceLogBucketName.RES,
    applicationQualifier: TestAppConfig.applicationQualifier,
  });

  const template = Template.fromStack(vpcStack);

  test('Check if VPC exists', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: vpcConfig.cidrBlock,
    });
  });

  test('Check if Subnets exist', () => {
    template.resourceCountIs('AWS::EC2::Subnet', 2);
    template.hasResourceProperties('AWS::EC2::Subnet', {
      CidrBlock: `${vpcConfig.cidrBlock.substring(0, 11)}${vpcConfig.subnetCidrMask}`,
    });
  });

  test('Check if VPC Endpoints exist', () => {
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 8);
    [
      'ssm',
      'sts',
      'logs',
      'cloudformation',
      'secretsmanager',
      'ecr.api',
      'ecr.dkr',
    ].forEach(service => {
      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        ServiceName: `com.amazonaws.${TestAppConfig.region}.${service}`,
      });
    });
  });

  test('Check if SecurityGroup exists', () => {
    template.resourceCountIs('AWS::EC2::SecurityGroup', 1);
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      SecurityGroupEgress: [{
        CidrIp: '0.0.0.0/0',
      }],
    });
  });

  test('Check if SSM Parameters are created', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: `/${TestAppConfig.applicationQualifier}/${VPCStack.vpcIdParameterName}`,
      Type: 'String',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: `/${TestAppConfig.applicationQualifier}/${VPCStack.securityGroupIdParameterName}`,
      Type: 'String',
    });
  });
});

describe('vpc-stack-test-omission', () => {
  const app = new cdk.App();
  const vpcConfig: IVpcConfigNoVpc = {
    type: 'NO_VPC',
  };

  test('Check if VPC is omitted', () => {
    expect(() =>
      new VPCStack(app, 'VPCStack', {
        env: { account: TestAppConfig.deploymentAccounts.RES, region: TestAppConfig.region },
        vpcConfig,
        flowLogsBucketName: TestAppConfig.complianceLogBucketName.RES,
        applicationQualifier: TestAppConfig.applicationQualifier,
      }),
    ).toThrow('VPC config for CDK Pipeline is not provided');
  });
});