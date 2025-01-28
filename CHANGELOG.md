# Change Log
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Released]

## [1.4.3] - 2024-12-06
applies a variety of fixes.

### Added

### Changed

### Fixed
- add missing IAM permission ec2:CreateNetworkInterfacePermission to SagemakerPipelineExecutionRole
- fix missing cd command in bundle-mlops-code.sh script that omitted bundling of the model-deploy folder
- add missing configs for network_isolation and encryption to follow sagemaker guardrails in pipeline.py
- fix variable naming issue in model-building buildspec.yaml
