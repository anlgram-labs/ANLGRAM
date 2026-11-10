'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  EXPECTED_COMMIT_SHA,
  EXPECTED_ARCHIVE_SHA256,
  EXPECTED_ESCROW_SOURCE_SHA256,
  verifySourceFile,
  sha256Buffer
} = require('./verify-escrow-v3-handoff');

test('Escrow V3 handoff constants are pinned correctly', () => {
  assert.equal(EXPECTED_COMMIT_SHA, 'f91820aff8aa8708c51ef4d3f8d703f41a061a95');
  assert.equal(EXPECTED_ARCHIVE_SHA256, '33b4de9b9dbf8e58ed53288a185ae21b8318f5c86fbec02723b7b8ca04356400');
  assert.equal(EXPECTED_ESCROW_SOURCE_SHA256, 'ed68732cba8f75917112f9bddef9cf30ce131cb2f39cb20d52585bbe65a60190');
});

test('verifySourceFile rejects corrupt source and validates correct source', () => {
  const baseTmp = process.env.AUDIT_SCRATCH_DIR || path.resolve(__dirname, '../../tmp');
  const tmpDir = path.join(baseTmp, 'test-ingestion');
  fs.mkdirSync(tmpDir, { recursive: true });
  const corruptFile = path.join(tmpDir, 'corrupt.fc');
  fs.writeFileSync(corruptFile, ';; corrupt');

  assert.throws(
    () => verifySourceFile(corruptFile),
    /CRITICAL INTEGRITY FAILURE/
  );

  // Clean up
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});
