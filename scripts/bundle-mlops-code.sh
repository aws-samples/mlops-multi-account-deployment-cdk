#!/usr/bin/env sh
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: MIT-0

export SEED_CODE_PATH='src/sagemaker/'
cd $SEED_CODE_PATH

# download the shutdown-idle-kernels-script, to be used for s3 upload
tar czf sagemaker_studio_auto-shutdown-0.1.5.tar.gz sagemaker_studio_autoshutdown-0.1.5

# bundle the source code for the model building CodeCommit repository
cd 'seed-code/model-building'
zip -r ../model-building.zip * -x "*node_modules*"
cd '../model-deploy'
zip -r ../model-deploy.zip * -x "*node_modules*"