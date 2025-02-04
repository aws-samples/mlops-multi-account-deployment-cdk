/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codegurureviewer from 'aws-cdk-lib/aws-codegurureviewer';
import { Construct } from 'constructs';

interface Props extends codecommit.RepositoryProps {
}

export class CodeCommitRepository extends codecommit.Repository {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, {
      ...props,
    });

    new codegurureviewer.CfnRepositoryAssociation(scope, 'RepositoryAssociation', {
      name: this.repositoryName,
      type: 'CodeCommit',
    });
  }
}
