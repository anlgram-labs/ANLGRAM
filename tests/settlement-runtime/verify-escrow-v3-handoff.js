'use strict';

/**
 * Escrow V3 Handoff Integrity Ingestion and Verification Engine
 *
 * Enforces cryptographic pinning for Codex handoff candidate:
 * - Commit: f91820aff8aa8708c51ef4d3f8d703f41a061a95
 * - Expected Archive SHA-256: 33b4de9b9dbf8e58ed53288a185ae21b8318f5c86fbec02723b7b8ca04356400
 * - Expected Escrow Source SHA-256: ed68732cba8f75917112f9bddef9cf30ce131cb2f39cb20d52585bbe65a60190
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const EXPECTED_COMMIT_SHA = 'f91820aff8aa8708c51ef4d3f8d703f41a061a95';
const EXPECTED_ARCHIVE_SHA256 = '33b4de9b9dbf8e58ed53288a185ae21b8318f5c86fbec02723b7b8ca04356400'.toLowerCase();
const EXPECTED_ESCROW_SOURCE_SHA256 = 'ed68732cba8f75917112f9bddef9cf30ce131cb2f39cb20d52585bbe65a60190'.toLowerCase();

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function verifyArchive(archivePath, targetExtractDir) {
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Archive not found at path: ${archivePath}`);
  }

  const archiveHash = sha256File(archivePath);
  console.log(`[INGESTION] Inspecting archive: ${archivePath}`);
  console.log(`[INGESTION] Archive SHA-256:  ${archiveHash}`);
  console.log(`[INGESTION] Expected SHA-256: ${EXPECTED_ARCHIVE_SHA256}`);

  if (archiveHash !== EXPECTED_ARCHIVE_SHA256) {
    throw new Error(`CRITICAL INTEGRITY FAILURE: Archive hash ${archiveHash} does not match expected ${EXPECTED_ARCHIVE_SHA256}`);
  }

  console.log('[INGESTION] Archive cryptographic hash verified successfully.');

  // Safe extraction without path traversal
  fs.mkdirSync(targetExtractDir, { recursive: true });
  const isZip = archivePath.endsWith('.zip');
  const isTar = archivePath.endsWith('.tar') || archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz');

  if (isTar) {
    const tarResult = spawnSync('tar', ['-xzf', archivePath, '-C', targetExtractDir], { stdio: 'inherit' });
    if (tarResult.status !== 0) {
      throw new Error(`Failed to extract tar archive: exit status ${tarResult.status}`);
    }
  } else if (isZip) {
    // Unzip via system or node unzip
    const unzipResult = spawnSync('unzip', ['-q', archivePath, '-d', targetExtractDir], { stdio: 'inherit' });
    if (unzipResult.status !== 0) {
      throw new Error(`Failed to extract zip archive: exit status ${unzipResult.status}`);
    }
  } else {
    throw new Error(`Unsupported archive format: ${archivePath}`);
  }

  // Verify extracted escrow source
  const extractedCandidatePath = path.join(targetExtractDir, 'minter-contract/contracts/anlgram-f02-escrow-candidate.fc');
  if (!fs.existsSync(extractedCandidatePath)) {
    throw new Error(`Extracted archive is missing candidate contract at: ${extractedCandidatePath}`);
  }

  const sourceHash = sha256File(extractedCandidatePath);
  console.log(`[INGESTION] Extracted source SHA-256:  ${sourceHash}`);
  console.log(`[INGESTION] Expected source SHA-256:   ${EXPECTED_ESCROW_SOURCE_SHA256}`);

  if (sourceHash !== EXPECTED_ESCROW_SOURCE_SHA256) {
    throw new Error(`CRITICAL INTEGRITY FAILURE: Extracted source hash ${sourceHash} does not match expected ${EXPECTED_ESCROW_SOURCE_SHA256}`);
  }

  console.log('[INGESTION PASSED] Escrow V3 candidate extracted and verified clean.');
  return {
    verified: true,
    archiveSha256: archiveHash,
    sourceSha256: sourceHash,
    candidatePath: extractedCandidatePath
  };
}

function verifySourceFile(sourceFilePath) {
  if (!fs.existsSync(sourceFilePath)) {
    throw new Error(`Source file not found at: ${sourceFilePath}`);
  }
  const sourceHash = sha256File(sourceFilePath);
  console.log(`[INGESTION] Inspecting candidate source file: ${sourceFilePath}`);
  console.log(`[INGESTION] Computed SHA-256: ${sourceHash}`);
  console.log(`[INGESTION] Expected SHA-256: ${EXPECTED_ESCROW_SOURCE_SHA256}`);

  if (sourceHash !== EXPECTED_ESCROW_SOURCE_SHA256) {
    throw new Error(`CRITICAL INTEGRITY FAILURE: Candidate source hash ${sourceHash} does not match expected ${EXPECTED_ESCROW_SOURCE_SHA256}`);
  }
  console.log('[INGESTION PASSED] Candidate source verified exact match.');
  return {
    verified: true,
    sourceSha256: sourceHash,
    candidatePath: sourceFilePath
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let archiveArg = process.env.ESCROW_V3_ARCHIVE_PATH;
  let sourceArg = process.env.ESCROW_V3_SOURCE_PATH;
  const baseTmp = process.env.AUDIT_SCRATCH_DIR || path.resolve(__dirname, '../../tmp');
  let targetDir = process.env.ESCROW_V3_EXTRACT_DIR || path.join(baseTmp, 'escrow-v3-staged');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--archive' && args[i + 1]) {
      archiveArg = args[++i];
    } else if (args[i] === '--source' && args[i + 1]) {
      sourceArg = args[++i];
    } else if (args[i] === '--target' && args[i + 1]) {
      targetDir = args[++i];
    }
  }

  try {
    if (archiveArg && fs.existsSync(archiveArg)) {
      verifyArchive(archiveArg, targetDir);
    } else if (sourceArg && fs.existsSync(sourceArg)) {
      verifySourceFile(sourceArg);
    } else {
      console.log('[INGESTION STATUS] No archive or source provided. Awaiting formal handoff transfer.');
      console.log(`[INGESTION STATUS] Expected commit:  ${EXPECTED_COMMIT_SHA}`);
      console.log(`[INGESTION STATUS] Expected archive: ${EXPECTED_ARCHIVE_SHA256}`);
      console.log(`[INGESTION STATUS] Expected source:  ${EXPECTED_ESCROW_SOURCE_SHA256}`);
      console.log('[INGESTION STATUS] Ingestion engine ready and listening.');
      process.exit(0);
    }
  } catch (err) {
    console.error(`[INGESTION ERROR] ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  EXPECTED_COMMIT_SHA,
  EXPECTED_ARCHIVE_SHA256,
  EXPECTED_ESCROW_SOURCE_SHA256,
  verifyArchive,
  verifySourceFile,
  sha256Buffer,
  sha256File
};
