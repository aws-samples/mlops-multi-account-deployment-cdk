/**
* Copyright 2022 Amazon.com Inc. or its affiliates.
* Provided as part of Amendment No. 5 to Definitive Agreement No. 8,
* Activity/Deliverable 10 (to the Strategic Framework Agreement dated March 26, 2019).”
*/

/* eslint-disable no-console */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import * as expectedHashes from '../package-verification.json';

const validateChecksum = (filePath: string, expectedHash: string) => {
  const checksum = createHash('sha256');
  checksum.update(readFileSync(filePath));
  const hexCheckSum = checksum.digest('hex');
  if (hexCheckSum !== expectedHash) {
    console.log(`File at ${filePath} has checksum ${hexCheckSum}, which does not match expected value ${expectedHash}`);
    console.log('This likely means dependencies have updated. You must get the changes approved before proceeding');
    console.log('Once you get approval, update ./package-verification.json with the new hash to proceed');
    throw 'Checksums do not match';
  }
  return true;
};
validateChecksum('./package-lock.json', expectedHashes['package-lock.json']);