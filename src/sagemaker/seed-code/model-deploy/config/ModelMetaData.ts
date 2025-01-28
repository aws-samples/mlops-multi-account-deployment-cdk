/*
* Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
* SPDX-License-Identifier: MIT-0
*/

import * as fs from 'fs';
export interface ModelConfig {
  s3ModelPath: string;
  modelECRImage: string;
  transformInstance: string;
  modelVersion: string;
  modelPackageGroupName: string;
  buildAccount: string;
}

export class ModelMetaData {
  static loadJSON(filePath: string): ModelConfig {
    try {
      const loadedData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return {
        s3ModelPath: loadedData.InferenceSpecification.Containers[0].ModelDataUrl,
        modelECRImage: loadedData.InferenceSpecification.Containers[0].Image,
        transformInstance: loadedData.InferenceSpecification.SupportedTransformInstanceTypes[0],
        modelVersion: loadedData.ModelPackageVersion.toString(),
        modelPackageGroupName: loadedData.ModelPackageGroupName,
        buildAccount: loadedData.MetadataProperties.GeneratedBy.match(/arn:aws:sagemaker:.*:(\d+):.*/)?.[1],
      };

    } catch (error) {
      throw new Error(`Failed to load model meta data: ${error}`);
    }
  };
}