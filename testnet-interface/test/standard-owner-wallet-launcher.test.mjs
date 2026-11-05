import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const launcherPath = fileURLToPath(new URL('../standard-owner-wallet-launcher.ps1', import.meta.url));
const PINNED_WALLET_ADDRESS = '0QCetQK2VyBLL2cB9Gmw7fyHudAMwCX75-Mps0NWmk5fCAUn';
const PINNED_OPERATOR = '0:9eb502b657204b2f6701f469b0edfc87b9d00cc025fbe7e329b343569a4e5f08';

function runLauncher(args, envOverrides = {}) {
  const psArgs = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', launcherPath,
    ...args
  ];
  return spawnSync('powershell.exe', psArgs, {
    encoding: 'utf8',
    env: {
      ...process.env,
      TONCENTER_TESTNET_API_KEY: 'test-center-key',
      TONAPI_TESTNET_API_KEY: 'test-api-key',
      ...envOverrides
    }
  });
}

function runPowerShellScript(scriptBody) {
  const psArgs = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command', scriptBody
  ];
  return spawnSync('powershell.exe', psArgs, {
    encoding: 'utf8',
    env: process.env
  });
}

test('launcher: atomic UTF-8 without BOM file writes and fail-closed owner-only ACL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anlgram-launcher-bom-'));
  try {
    const targetPath = join(dir, 'test-target.json');
    const psScript = `
      . '${launcherPath.replace(/'/g, "''")}'
      Write-AtomicFileNoBom -Path '${targetPath.replace(/'/g, "''")}' -Content '{"key":"value"}' -OwnerOnly
    `;
    const res = runPowerShellScript(psScript);
    assert.equal(res.status, 0, `PowerShell script failed: ${res.stderr}`);

    assert.equal(existsSync(targetPath), true);
    const buffer = readFileSync(targetPath);
    // Assert NO UTF-8 BOM (0xEF, 0xBB, 0xBF)
    assert.ok(buffer.length >= 3);
    const hasBom = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF;
    assert.equal(hasBom, false, 'File must not start with UTF-8 BOM');
    assert.equal(buffer.toString('utf8'), '{"key":"value"}');

    // Test no-overwrite default
    const overwriteScript = `
      . '${launcherPath.replace(/'/g, "''")}'
      Write-AtomicFileNoBom -Path '${targetPath.replace(/'/g, "''")}' -Content '{"key":"overwritten"}'
    `;
    const overwriteRes = runPowerShellScript(overwriteScript);
    assert.notEqual(overwriteRes.status, 0, 'Should fail when target exists and Overwrite is omitted');
    assert.match(overwriteRes.stderr + overwriteRes.stdout, /already exists and Overwrite is not permitted/);

    // Test overwrite switch
    const allowOverwriteScript = `
      . '${launcherPath.replace(/'/g, "''")}'
      Write-AtomicFileNoBom -Path '${targetPath.replace(/'/g, "''")}' -Content '{"key":"updated"}' -Overwrite
    `;
    const allowRes = runPowerShellScript(allowOverwriteScript);
    assert.equal(allowRes.status, 0, `Overwrite with switch failed: ${allowRes.stderr}`);
    assert.equal(readFileSync(targetPath, 'utf8'), '{"key":"updated"}');
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('launcher: pre-flight check rejects existing signed output file before sign-init CLI is invoked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anlgram-launcher-preflight-'));
  try {
    const quoteFile = join(dir, 'init-quote.json');
    const backupFile = join(dir, 'backup.gpg');
    const signedFile = join(dir, 'signed-init.json');

    const now = Math.floor(Date.now() / 1000);
    const validQuote = {
      wallet: {address: PINNED_WALLET_ADDRESS, operator: PINNED_OPERATOR},
      quote: {fingerprint: 'aa'.repeat(32), validUntil: now + 300}
    };
    writeFileSync(quoteFile, JSON.stringify(validQuote));
    writeFileSync(backupFile, 'dummy-backup-data');
    // Pre-create signedFile to trigger no-overwrite pre-flight
    writeFileSync(signedFile, 'existing-signed-envelope');

    const res = runLauncher([
      '-Action', 'sign-init',
      '-QuoteOutputPath', quoteFile,
      '-BackupGpgPath', backupFile,
      '-SignedOutputPath', signedFile
    ]);

    assert.notEqual(res.status, 0, 'Should fail before signing when signed output file exists');
    assert.match(res.stderr + res.stdout, /Target output file already exists/);
    assert.match(res.stderr + res.stdout, /Refusing to overwrite existing file/);
    // Verify existing file was not modified
    assert.equal(readFileSync(signedFile, 'utf8'), 'existing-signed-envelope');
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('launcher: pre-flight check rejects existing quote file before prepare-init CLI is invoked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anlgram-launcher-prepare-'));
  try {
    const publicInputFile = join(dir, 'public-input.json');
    const quoteFile = join(dir, 'init-quote.json');

    writeFileSync(publicInputFile, JSON.stringify({wallet: {address: PINNED_WALLET_ADDRESS}}));
    writeFileSync(quoteFile, 'existing-quote');

    const res = runLauncher([
      '-Action', 'prepare-init',
      '-PublicInputPath', publicInputFile,
      '-QuoteOutputPath', quoteFile
    ]);

    assert.notEqual(res.status, 0, 'Should fail before prepare when quote output file exists');
    assert.match(res.stderr + res.stdout, /Target output file already exists/);
    assert.equal(readFileSync(quoteFile, 'utf8'), 'existing-quote');
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('launcher: pre-flight check rejects invalid/unwritable signed output path before signing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anlgram-launcher-unwritable-'));
  try {
    const quoteFile = join(dir, 'init-quote.json');
    const backupFile = join(dir, 'backup.gpg');
    const invalidSignedFile = 'Z:\\nonexistent_drive_99999\\signed-init.json';

    const now = Math.floor(Date.now() / 1000);
    const validQuote = {
      wallet: {address: PINNED_WALLET_ADDRESS, operator: PINNED_OPERATOR},
      quote: {fingerprint: 'aa'.repeat(32), validUntil: now + 300}
    };
    writeFileSync(quoteFile, JSON.stringify(validQuote));
    writeFileSync(backupFile, 'dummy-backup-data');

    const res = runLauncher([
      '-Action', 'sign-init',
      '-QuoteOutputPath', quoteFile,
      '-BackupGpgPath', backupFile,
      '-SignedOutputPath', invalidSignedFile
    ]);

    assert.notEqual(res.status, 0, 'Should fail when target directory cannot be created/written');
    assert.match(res.stderr + res.stdout, /Target output path is not writable/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('launcher: pre-flight check rejects expired quote before irreversible signing stage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anlgram-launcher-expired-'));
  try {
    const quoteFile = join(dir, 'init-quote.json');
    const backupFile = join(dir, 'backup.gpg');
    const signedFile = join(dir, 'signed-init.json');

    const now = Math.floor(Date.now() / 1000);
    // Expired 60 seconds ago
    const expiredQuote = {
      wallet: {address: PINNED_WALLET_ADDRESS, operator: PINNED_OPERATOR},
      quote: {fingerprint: 'bb'.repeat(32), validUntil: now - 60}
    };
    writeFileSync(quoteFile, JSON.stringify(expiredQuote));
    writeFileSync(backupFile, 'dummy-backup-data');

    const res = runLauncher([
      '-Action', 'sign-init',
      '-QuoteOutputPath', quoteFile,
      '-BackupGpgPath', backupFile,
      '-SignedOutputPath', signedFile
    ]);

    assert.notEqual(res.status, 0, 'Should fail when quote is expired');
    assert.match(res.stderr + res.stdout, /Quote has already expired/);
    assert.match(res.stderr + res.stdout, /Refusing to sign with expired quote/);
    assert.equal(existsSync(signedFile), false, 'No signed envelope should be created');
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('launcher: pre-flight check enforces minimum quote validity safety margin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anlgram-launcher-margin-'));
  try {
    const quoteFile = join(dir, 'init-quote.json');
    const backupFile = join(dir, 'backup.gpg');
    const signedFile = join(dir, 'signed-init.json');

    const now = Math.floor(Date.now() / 1000);
    // Only 5 seconds left, below default margin of 10s
    const tightQuote = {
      wallet: {address: PINNED_WALLET_ADDRESS, operator: PINNED_OPERATOR},
      quote: {fingerprint: 'cc'.repeat(32), validUntil: now + 5}
    };
    writeFileSync(quoteFile, JSON.stringify(tightQuote));
    writeFileSync(backupFile, 'dummy-backup-data');

    const res = runLauncher([
      '-Action', 'sign-init',
      '-QuoteOutputPath', quoteFile,
      '-BackupGpgPath', backupFile,
      '-SignedOutputPath', signedFile,
      '-MinQuoteValiditySeconds', '10'
    ]);

    assert.notEqual(res.status, 0, 'Should fail when validity is below safety margin');
    assert.match(res.stderr + res.stdout, /below safety margin/);
    assert.equal(existsSync(signedFile), false);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('launcher: pre-flight check rejects mismatched target wallet address', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anlgram-launcher-wallet-'));
  try {
    const quoteFile = join(dir, 'init-quote.json');
    const backupFile = join(dir, 'backup.gpg');
    const signedFile = join(dir, 'signed-init.json');

    const now = Math.floor(Date.now() / 1000);
    const foreignQuote = {
      wallet: {address: '0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c', operator: '0:0000'},
      quote: {fingerprint: 'dd'.repeat(32), validUntil: now + 300}
    };
    writeFileSync(quoteFile, JSON.stringify(foreignQuote));
    writeFileSync(backupFile, 'dummy-backup-data');

    const res = runLauncher([
      '-Action', 'sign-init',
      '-QuoteOutputPath', quoteFile,
      '-BackupGpgPath', backupFile,
      '-SignedOutputPath', signedFile
    ]);

    assert.notEqual(res.status, 0, 'Should fail on mismatched wallet');
    assert.match(res.stderr + res.stdout, /Quote target wallet mismatch/);
    assert.equal(existsSync(signedFile), false);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('launcher: broadcast rejects expired quote and fingerprint mismatch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anlgram-launcher-broadcast-'));
  try {
    const quoteFile = join(dir, 'init-quote.json');
    const signedFile = join(dir, 'signed-init.json');

    const now = Math.floor(Date.now() / 1000);
    const expiredQuote = {
      wallet: {address: PINNED_WALLET_ADDRESS, operator: PINNED_OPERATOR},
      quote: {fingerprint: 'ee'.repeat(32), validUntil: now - 10}
    };
    const signedEnvelope = {
      status: 'SIGNED_NOT_BROADCAST',
      boc: 'te6cckEBAQEAAgAAAA==',
      messageHash: '11'.repeat(32),
      fingerprint: 'ee'.repeat(32)
    };
    writeFileSync(quoteFile, JSON.stringify(expiredQuote));
    writeFileSync(signedFile, JSON.stringify(signedEnvelope));

    const res = runLauncher([
      '-Action', 'broadcast',
      '-QuoteOutputPath', quoteFile,
      '-SignedOutputPath', signedFile
    ]);

    assert.notEqual(res.status, 0, 'Broadcast must reject expired quote');
    assert.match(res.stderr + res.stdout, /Initialization quote expired/);

    // Test fingerprint mismatch
    const freshQuote = {
      wallet: {address: PINNED_WALLET_ADDRESS, operator: PINNED_OPERATOR},
      quote: {fingerprint: 'ff'.repeat(32), validUntil: now + 300}
    };
    writeFileSync(quoteFile, JSON.stringify(freshQuote));
    const mismatchRes = runLauncher([
      '-Action', 'broadcast',
      '-QuoteOutputPath', quoteFile,
      '-SignedOutputPath', signedFile
    ]);
    assert.notEqual(mismatchRes.status, 0, 'Broadcast must reject fingerprint mismatch');
    assert.match(mismatchRes.stderr + mismatchRes.stdout, /Fingerprint mismatch/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('launcher: marker permanence ensures markers are never removed or retried on error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anlgram-launcher-marker-'));
  try {
    const markerFile = join(dir, 'test-marker.init-pending');
    writeFileSync(markerFile, 'permanent-marker-fingerprint-12345');

    // Run launcher with invalid action / parameters in this environment
    const res = runLauncher([
      '-Action', 'sign-init',
      '-QuoteOutputPath', join(dir, 'nonexistent-quote.json')
    ]);

    assert.notEqual(res.status, 0);
    // Verify marker still exists and its content was never touched or deleted
    assert.equal(existsSync(markerFile), true, 'Marker must never be unlinked');
    assert.equal(readFileSync(markerFile, 'utf8'), 'permanent-marker-fingerprint-12345');
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('launcher: pre-flight check automatically creates missing parent directory safely', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anlgram-launcher-mkdir-'));
  try {
    const nestedSignedFile = join(dir, 'nested', 'deeply', 'folder', 'signed-init.json');
    const quoteFile = join(dir, 'init-quote.json');
    const backupFile = join(dir, 'backup.gpg');

    const now = Math.floor(Date.now() / 1000);
    const validQuote = {
      wallet: {address: PINNED_WALLET_ADDRESS, operator: PINNED_OPERATOR},
      quote: {fingerprint: '11'.repeat(32), validUntil: now + 300}
    };
    writeFileSync(quoteFile, JSON.stringify(validQuote));
    writeFileSync(backupFile, 'dummy-backup');

    const psScript = `
      . '${launcherPath.replace(/'/g, "''")}'
      Test-OutputTargetWritable -path '${nestedSignedFile.replace(/'/g, "''")}'
    `;
    const res = runPowerShellScript(psScript);
    assert.equal(res.status, 0, `Test-OutputTargetWritable failed on nested directory: ${res.stderr}`);
    assert.equal(existsSync(join(dir, 'nested', 'deeply', 'folder')), true, 'Parent directory should have been created');
    assert.equal(existsSync(nestedSignedFile), false, 'Target file itself should not exist yet');
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('launcher: post-signing failure emits fail-closed error, preserves markers, and never leaks signed envelope or BOC', () => {
  // Test that on write failure, the launcher halts fail-closed, does NOT dump raw signed BOC or JSON to console,
  // and does NOT suggest broadcasting an unverified payload.
  const testSignedJson = JSON.stringify({
    status: 'SIGNED_NOT_BROADCAST',
    boc: 'te6cckEBAQEAAgAAAA==',
    messageHash: '22'.repeat(32),
    fingerprint: '33'.repeat(32)
  });

  const psScript = `
    . '${launcherPath.replace(/'/g, "''")}'
    $signedJson = $env:TEST_SIGNED_PAYLOAD
    $SignedOutputPath = 'Z:\\nonexistent_drive_disaster\\signed.json'
    try {
        Write-AtomicFileNoBom -Path $SignedOutputPath -Content $signedJson -OwnerOnly
    } catch {
        Write-Error "=========================================================================="
        Write-Error "CRITICAL POST-SIGNING FAILURE: Failed to atomically save signed envelope."
        Write-Error "Target Path : $SignedOutputPath"
        Write-Error "Error Cause : $_"
        Write-Error "A permanent .init-pending marker has been established on disk."
        Write-Error "Execution stopped. Markers will NOT be removed, rearmed, or retried."
        Write-Error "Do NOT re-run sign-init. Do NOT broadcast unverified payloads."
        Write-Error "Investigate local filesystem permissions before taking further action."
        Write-Error "=========================================================================="
        throw
    }
  `;

  const psArgs = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command', psScript
  ];
  const res = spawnSync('powershell.exe', psArgs, {
    encoding: 'utf8',
    env: { ...process.env, TEST_SIGNED_PAYLOAD: testSignedJson }
  });

  assert.notEqual(res.status, 0);
  const output = res.stdout + res.stderr;
  assert.match(output, /CRITICAL POST-SIGNING FAILURE/);
  assert.match(output, /A permanent \.init-pending marker has been established on disk/);
  assert.match(output, /Do NOT re-run sign-init/);
  assert.match(output, /Do NOT broadcast unverified payloads/);

  // REDACTION CHECKS: Neither BOC nor full JSON nor manual recovery prompt must appear
  assert.equal(output.includes('te6cckEBAQEAAgAAAA=='), false, 'Signed BOC must never be emitted to console');
  assert.equal(output.includes('SIGNED_NOT_BROADCAST'), false, 'Raw signed envelope must never be emitted to console');
  assert.equal(output.includes('Copy and save the exact signed JSON'), false, 'Must never prompt operator to manually recover unverified envelope');
});

test('launcher: owner-only ACL enforcement fails closed on invalid path', () => {
  const psScript = `
    . '${launcherPath.replace(/'/g, "''")}'
    try {
        Set-OwnerOnlyAcl -filePath 'Z:\\nonexistent_invalid_drive\\bad.json'
        Write-Output "SHOULD_NOT_REACH_HERE"
    } catch {
        Write-Output "CAUGHT_ACL_FAILURE: $_"
        exit 77
    }
  `;
  const res = runPowerShellScript(psScript);
  assert.equal(res.status, 77);
  assert.match(res.stdout, /CAUGHT_ACL_FAILURE/);
  assert.match(res.stdout, /Owner-only ACL enforcement failed closed/);
  assert.equal(res.stdout.includes('SHOULD_NOT_REACH_HERE'), false);
});

test('launcher: temporary file is created with protected owner-only ACL at kernel creation time', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anlgram-launcher-tmpacl-'));
  try {
    const targetPath = join(dir, 'protected-file.json');
    const psScript = `
      . '${launcherPath.replace(/'/g, "''")}'
      Write-AtomicFileNoBom -Path '${targetPath.replace(/'/g, "''")}' -Content '{"secret":"data"}' -OwnerOnly
      $acl = Get-Acl -LiteralPath '${targetPath.replace(/'/g, "''")}'
      Write-Output "PROTECTED:$($acl.AreAccessRulesProtected)"
      Write-Output "RULE_COUNT:$($acl.Access.Count)"
      Write-Output "SID:$($acl.Access[0].IdentityReference.Value)"
    `;
    const res = runPowerShellScript(psScript);
    assert.equal(res.status, 0, `Script failed: ${res.stderr}`);
    assert.match(res.stdout, /PROTECTED:True/);
    assert.match(res.stdout, /RULE_COUNT:1/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('launcher: concurrent attempts reject racing output creation without corrupting target', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anlgram-launcher-race-'));
  try {
    const targetFile = join(dir, 'exclusive-output.json');
    const quoteFile = join(dir, 'init-quote.json');
    const backupFile = join(dir, 'backup.gpg');

    const now = Math.floor(Date.now() / 1000);
    const validQuote = {
      wallet: {address: PINNED_WALLET_ADDRESS, operator: PINNED_OPERATOR},
      quote: {fingerprint: '12'.repeat(32), validUntil: now + 300}
    };
    writeFileSync(quoteFile, JSON.stringify(validQuote));
    writeFileSync(backupFile, 'dummy-backup');

    // First attempt creates exclusive output
    const psScript1 = `
      . '${launcherPath.replace(/'/g, "''")}'
      Write-AtomicFileNoBom -Path '${targetFile.replace(/'/g, "''")}' -Content '{"run":1}' -OwnerOnly
    `;
    const res1 = runPowerShellScript(psScript1);
    assert.equal(res1.status, 0);
    assert.equal(readFileSync(targetFile, 'utf8'), '{"run":1}');

    // Second concurrent/sequential attempt into the same target must fail closed before executing or modifying target
    const res2 = runLauncher([
      '-Action', 'sign-init',
      '-QuoteOutputPath', quoteFile,
      '-BackupGpgPath', backupFile,
      '-SignedOutputPath', targetFile
    ]);
    assert.notEqual(res2.status, 0);
    assert.match(res2.stderr + res2.stdout, /Target output file already exists/);
    assert.equal(readFileSync(targetFile, 'utf8'), '{"run":1}', 'Target content must remain untouched and uncorrupted');
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

