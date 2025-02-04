/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct, IConstruct } from 'constructs';

interface Props extends PipelineProps {
  applicationQualifier: string;
  pipelineName: string;
  rolePolicies?: iam.PolicyStatement[];
}

export interface VpcProps {
  vpc: ec2.IVpc;
  proxy?: {
    noProxy: string[];
    proxySecretArn: string;
    proxyTestUrl: string;
  };
}

export interface PipelineProps {
  repositoryInput: pipelines.IFileSetProducer;
  branch: string;
  isDockerEnabledForSynth?: boolean;
  buildImage?: codebuild.IBuildImage;
  vpcProps?: VpcProps;
  pipelineVariables?: {[key in string]: string};
}

// ensure that VPC is detached from codebuild project on VPC deletion
class CodeBuildAspect implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof codebuild.Project) {
      (node.node.defaultChild as codebuild.CfnProject).addPropertyOverride ('VpcConfig', {
        VpcId: { Ref: 'AWS::NoValue' },
      });
    };
  };
};

export class CDKPipeline extends pipelines.CodePipeline {
  static readonly pipelineCommands: string[] =
    [
      './scripts/proxy.sh',
      '. ./scripts/warming.sh',
      './scripts/build.sh',
      './scripts/test.sh',
      './scripts/cdk-synth.sh',
    ];
  static readonly installCommands: string[] =
    [
      'pip3 install awscli --upgrade --quiet',
    ];

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, {
      pipelineName: props.pipelineName,
      crossAccountKeys: true,
      dockerEnabledForSynth: props.isDockerEnabledForSynth,
      synth: new pipelines.ShellStep('Synth', {
        input: props.repositoryInput,
        installCommands: CDKPipeline.installCommands,
        commands: CDKPipeline.pipelineCommands,
        env: {
          CDK_QUALIFIER: props.applicationQualifier,
          AWS_REGION: cdk.Stack.of(scope).region,
          ...props.pipelineVariables,
        },
        primaryOutputDirectory: './cdk.out',
      }),
      codeBuildDefaults: {
        ...CDKPipeline.generateVPCCodeBuildDefaults(scope, props.vpcProps),
        buildEnvironment: {
          buildImage: props.buildImage,
        },
        rolePolicy: props.rolePolicies,
      },
    });

    if (!props.vpcProps) {cdk.Aspects.of(this).add(new CodeBuildAspect());}
  }

  static generateVPCCodeBuildDefaults(scope: Construct, vpcProps?: VpcProps): pipelines.CodeBuildOptions | {} {
    if (!vpcProps) return {};

    const vpcConfig = {
      vpc: vpcProps.vpc,
      subnetSelection: vpcProps.vpc.isolatedSubnets ?? vpcProps.vpc.privateSubnets,
    };

    if (vpcProps.proxy?.proxySecretArn) {
      return {
        partialBuildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          env: {
            'variables': {
              NO_PROXY: vpcProps.proxy.noProxy.join(','),
              AWS_STS_REGIONAL_ENDPOINTS: 'regional',
            },
            'secrets-manager': {
              PROXY_USERNAME: vpcProps.proxy.proxySecretArn.concat(':username'),
              PROXY_PASSWORD: vpcProps.proxy.proxySecretArn.concat(':password'),
              HTTP_PROXY_PORT: vpcProps.proxy.proxySecretArn.concat(':http_proxy_port'),
              HTTPS_PROXY_PORT: vpcProps.proxy.proxySecretArn.concat(':https_proxy_port'),
              PROXY_DOMAIN: vpcProps.proxy.proxySecretArn.concat(':proxy_domain'),
            },
          },
          phases: {
            install: {
              commands: [
                CDKPipeline.getInstallCommands(vpcProps.proxy.proxyTestUrl),
              ],
            },
          },
        }),
        ...vpcConfig,
      };
    }

    return {
      partialBuildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
      }),
      ...vpcConfig,
    };
  }

  public static getInstallCommands(proxyTestUrl: string) : string {
    return 'export HTTP_PROXY="http://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTP_PROXY_PORT"; ' +
    'export HTTPS_PROXY="https://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTPS_PROXY_PORT"; ' +
    'echo "--- Proxy Test ---"; ' +
    `curl -Is --connect-timeout 5 ${proxyTestUrl} | grep "HTTP/"; ` +
    'if [ -f /var/run/docker.pid ]; then ' +
    'echo "--- Configuring docker env ---" ' +
    '&& mkdir ~/.docker/ ' +
    '&& echo -n "{\\"proxies\\": {\\"default\\": {\\"httpProxy\\": \\"$HTTP_PROXY\\",\\"httpsProxy\\": \\"$HTTPS_PROXY\\",\\"noProxy\\": \\"$NO_PROXY\\"}}}" > ~/.docker/config.json ' +
    '&& cat ~/.docker/config.json | jq' +
    '&& echo "Kill and restart the docker daemon so that it reads the PROXY env variables" ' +
    '&& kill "$(cat /var/run/docker.pid)" ' +
    '&& while kill -0 "$(cat /var/run/docker.pid)" ; do sleep 1 ; done ' +
    '&& /usr/local/bin/dockerd-entrypoint.sh > /dev/null 2>&1 ' +
    '&& echo "--- Docker daemon restarted ---"; ' +
    'fi';
  }
}