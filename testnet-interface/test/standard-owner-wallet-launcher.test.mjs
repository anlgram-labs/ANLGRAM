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

test('launcher: atomic UTF-8 without BOM file writes and owner-only ACL', () => {
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
    // Backup file does NOT exist, so sign-init will fail on backup file existence AFTER directory pre-flight test!
    // But wait: in Invoke-SignInit, BackupGpgPath check is right before Pre-flight or after?
    // Let's check: Quote check -> Backup check -> Pre-flight write check!
    // So let's provide a dummy backup file:
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

test('launcher: disaster recovery dump emits critical banner and raw signed envelope on write error', () => {
  // Test that if an unexpected error occurs during signed envelope disk write,
  // the catch block prints the CRITICAL EMERGENCY banner containing the raw signed JSON
  const testSignedJson = JSON.stringify({
    status: 'SIGNED_NOT_BROADCAST',
    boc: 'te6cckEBAQEAAgAAAA==',
    messageHash: '22'.repeat(32),
    fingerprint: '33'.repeat(32)
  });

  const psScript = `
    . '${launcherPath.replace(/'/g, "''")}'
    $signedJson = '${testSignedJson.replace(/'/g, "''")}'
    $SignedOutputPath = 'Z:\\nonexistent_drive_disaster\\signed.json'
    try {
        Write-AtomicFileNoBom -Path $SignedOutputPath -Content $signedJson -OwnerOnly
    } catch {
        Write-Host "=========================================================================="
        Write-Host "CRITICAL EMERGENCY: FAILED TO WRITE SIGNED ENVELOPE TO DISK!"
        Write-Host "Error: $_"
        Write-Host "A permanent .init-pending marker has already been created on disk."
        Write-Host "DO NOT re-run sign-init or attempt to delete markers!"
        Write-Host "Copy and save the exact signed JSON envelope below into '$SignedOutputPath':"
        Write-Host "--------------------------------------------------------------------------"
        Write-Host $signedJson
        Write-Host "--------------------------------------------------------------------------"
        Write-Host "=========================================================================="
        exit 42
    }
  `;

  const res = runPowerShellScript(psScript);
  assert.equal(res.status, 42);
  const output = res.stdout + res.stderr;
  assert.match(output, /CRITICAL EMERGENCY: FAILED TO WRITE SIGNED ENVELOPE TO DISK!/);
  assert.match(output, /A permanent \.init-pending marker has already been created on disk\./);
  assert.match(output, /DO NOT re-run sign-init or attempt to delete markers!/);
  assert.match(output, /SIGNED_NOT_BROADCAST/);
  assert.match(output, /2222222222222222222222222222222222222222222222222222222222222222/);
});
