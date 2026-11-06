import * as core from '@ton/core';
import { WalletContractV5R1 } from '@ton/ton';
import { mnemonicToWalletKey, sign } from '@ton/crypto';
import { readFile, open, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { backupPath, withBackupWords } from '../testnet-interface/projects/standard-owner-backup.mjs';
import execPkg from './deploy-launchpad-testnet-exec.js';
const { verifyArtifacts } = execPkg;
import enginePkg from './supervised-execution-engine.js';
const {
  deriveDeterministicAddresses,
  buildDeploymentOperations,
  SUPERVISED_BUDGET,
  APPROVED_TESTNET_DEX
} = enginePkg;

const reviewedStandardOperator = '0:9eb502b657204b2f6701f469b0edfc87b9d00cc025fbe7e329b343569a4e5f08';
const reviewedStandardPublicKey = '194f6f9fb1779cf2120e9cab41c4ff71d75fe08d4a139f86c73eae89cc3d7217';
const reviewedDeployerFriendly = '0QCetQK2VyBLL2cB9Gmw7fyHudAMwCX75-Mps0NWmk5fCAUn';

const TONCENTER_TESTNET = 'https://testnet.toncenter.com/api/v2';
const now = () => Math.floor(Date.now() / 1000);

async function toncenterRpc(method, params, apiKey = process.env.TONCENTER_TESTNET_API_KEY) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey?.trim()) headers['X-API-Key'] = apiKey.trim();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${TONCENTER_TESTNET}/jsonRPC`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 'launchpad-deployer', method, params }),
      signal: AbortSignal.timeout(10000)
    });
    if (res.status === 429 && attempt < 3) {
      await new Promise(r => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (!res.ok) throw Error(`TonCenter HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw Error(`TonCenter RPC error: ${JSON.stringify(data.error)}`);
    return data.result;
  }
}

async function getAccountInfo(address) {
  const headers = {};
  if (process.env.TONCENTER_TESTNET_API_KEY?.trim()) {
    headers['X-API-Key'] = process.env.TONCENTER_TESTNET_API_KEY.trim();
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${TONCENTER_TESTNET}/getAddressInformation?address=${encodeURIComponent(address)}`, {
      headers,
      signal: AbortSignal.timeout(10000)
    });
    if (res.status === 429 && attempt < 3) {
      await new Promise(r => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (!res.ok) throw Error(`TonCenter HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw Error(`TonCenter RPC error: ${JSON.stringify(data.error)}`);
    return data.result;
  }
}

async function runGetMethod(address, method, stack = []) {
  try {
    return await toncenterRpc('runGetMethod', { address, method, stack });
  } catch (err) {
    return null;
  }
}

async function confirmApproval(expectedText, contextLabel) {
  const envApproval = process.env.ANLGRAM_OWNER_APPROVAL?.trim();
  if (envApproval) {
    if (envApproval !== expectedText) {
      throw Error(`Approval mismatch: expected '${expectedText}', got '${envApproval}'`);
    }
    console.error(`OWNER APPROVAL CONFIRMED FOR ${contextLabel.toUpperCase()}:\n  ${envApproval}`);
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    console.error(`\n==========================================================================`);
    console.error(` MANDATORY OWNER AUTHORIZATION REQUIRED: ${contextLabel.toUpperCase()}`);
    console.error(` Type exactly: ${expectedText}`);
    console.error(`==========================================================================`);
    const input = (await rl.question('Confirmation phrase > ')).trim();
    if (input !== expectedText) {
      throw Error(`Authorization aborted: phrase mismatch.`);
    }
    console.error(`Owner approval recorded.`);
  } finally {
    rl.close();
  }
}

async function main() {
  const [command, arg1, arg2, arg3] = process.argv.slice(2);

  if (command === 'preflight') {
    const deployerAddrStr = arg1 || reviewedDeployerFriendly;
    const deployerRaw = core.Address.parseFriendly(deployerAddrStr).address.toRawString();

    const artifactsRes = verifyArtifacts();
    if (!artifactsRes.ok) {
      throw Error('Artifact verification failed: ' + artifactsRes.errors.join('; '));
    }

    const predicted = deriveDeterministicAddresses(deployerRaw, artifactsRes.artifacts);
    const operations = buildDeploymentOperations(deployerRaw, predicted);

    // Query deployer wallet
    const deployerInfo = await getAccountInfo(deployerRaw);
    const balanceNano = BigInt(deployerInfo.balance || '0');
    let seqno = 0;
    try {
      const seqRes = await toncenterRpc('runGetMethod', { address: deployerRaw, method: 'seqno', stack: [] });
      if (seqRes?.exit_code === 0 && seqRes?.stack?.[0]?.[1]) {
        seqno = parseInt(seqRes.stack[0][1], 16);
      }
    } catch {}

    // Check status of each target contract
    const states = {};
    for (const [key, contract] of Object.entries(predicted)) {
      try {
        const info = await getAccountInfo(contract.rawAddress);
        states[key] = {
          address: contract.address,
          rawAddress: contract.rawAddress,
          state: info.state || 'uninitialized',
          balanceNano: info.balance || '0'
        };
      } catch (err) {
        states[key] = {
          address: contract.address,
          rawAddress: contract.rawAddress,
          state: 'unknown',
          error: err.message
        };
      }
    }

    // Determine next step
    let nextStepNumber = 1;
    if (states.launchpadMinter.state === 'active') {
      if (states.bondingCurve.state !== 'active') {
        nextStepNumber = 2; // deploy curve
      } else if (states.lpLocker.state !== 'active') {
        nextStepNumber = 3; // deploy locker
      } else if (states.migrationRouter.state !== 'active') {
        nextStepNumber = 4; // deploy router
      } else {
        // Contracts deployed, check bootstrap stages
        const lockerInitRes = await runGetMethod(predicted.lpLocker.rawAddress, 'is_router_initialized');
        const isLockerInit = lockerInitRes?.exit_code === 0 && parseInt(lockerInitRes.stack[0][1], 16) === 1;

        if (!isLockerInit) {
          nextStepNumber = 5; // bootstrap 1: init locker
        } else {
          const curveStateRes = await runGetMethod(predicted.bondingCurve.rawAddress, 'get_curve_state');
          const curveState = curveStateRes?.exit_code === 0 ? parseInt(curveStateRes.stack[0][1], 16) : -1;

          if (curveState === 0) {
            nextStepNumber = 6; // bootstrap 2: init launchpad
          } else if (curveState === 1) {
            nextStepNumber = 7; // bootstrap 3: mint 1B
          } else if (curveState === 2) {
            nextStepNumber = 8; // bootstrap 4: renounce admin
          } else if (curveState === 3) {
            nextStepNumber = 9; // ALL COMPLETED - CURVE ACTIVE
          }
        }
      }
    }

    const nextOp = operations.find(o => o.step === nextStepNumber) || null;
    const validUntil = now() + 300;

    let fingerprint = null;
    if (nextOp) {
      fingerprint = createHash('sha256')
        .update(JSON.stringify({
          step: nextOp.step,
          id: nextOp.id,
          targetAddress: nextOp.targetAddress,
          amountNano: nextOp.amountNano.toString(),
          validUntil,
          seqno,
          deployer: deployerRaw
        }))
        .digest('hex');
    }

    const quote = {
      timestamp: new Date().toISOString(),
      network: '-3',
      operator: deployerRaw,
      operatorFriendly: deployerAddrStr,
      seqno,
      walletBalanceTon: (Number(balanceNano) / 1e9).toFixed(4),
      walletBalanceNano: balanceNano.toString(),
      contracts: states,
      nextStep: nextStepNumber,
      nextOperation: nextOp ? {
        step: nextOp.step,
        id: nextOp.id,
        name: nextOp.name,
        targetAddress: nextOp.targetAddress,
        amountTon: nextOp.amountTon,
        amountNano: nextOp.amountNano.toString(),
        operationType: nextOp.operationType
      } : null,
      validUntil,
      fingerprint,
      budget: SUPERVISED_BUDGET
    };

    console.log(JSON.stringify(quote, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

  } else if (command === 'sign-step') {
    const stepNum = parseInt(arg1, 10);
    const quotePath = arg2 || 'C:/Private/ANLGRAM/supervised-launchpad-testnet/launchpad-quote.json';
    const backupGpg = arg3 || 'C:/Private/ANLGRAM/standard-v2-testnet.gpg';

    if (!stepNum || stepNum < 1 || stepNum > 8) throw Error('Valid step number 1-8 required');
    const quote = JSON.parse((await readFile(quotePath, 'utf8')).replace(/^\uFEFF/, ''));

    if (now() >= quote.validUntil) throw Error('Execution quote has expired');
    if (quote.nextStep !== stepNum) {
      throw Error(`Quote next step is ${quote.nextStep}, but step ${stepNum} was requested`);
    }

    const expectedApproval = `AUTHORIZE TESTNET STEP ${stepNum} ${quote.fingerprint}`;
    await confirmApproval(expectedApproval, `step ${stepNum} (${quote.nextOperation.name})`);

    const artifactsRes = verifyArtifacts();
    if (!artifactsRes.ok) throw Error('Artifact verification failed');
    const predicted = deriveDeterministicAddresses(quote.operator, artifactsRes.artifacts);
    const operations = buildDeploymentOperations(quote.operator, predicted);
    const op = operations.find(o => o.step === stepNum);
    if (!op) throw Error(`Step ${stepNum} operation not found`);

    const targetGpg = await backupPath(backupGpg);
    const signedResult = await withBackupWords(targetGpg, async (words) => {
      const key = await mnemonicToWalletKey(words);
      const pubKeyHex = Buffer.from(key.publicKey).toString('hex');
      if (pubKeyHex !== reviewedStandardPublicKey) {
        throw Error(`Public key mismatch: got ${pubKeyHex}, expected ${reviewedStandardPublicKey}`);
      }

      try {
        const wallet = WalletContractV5R1.create({
          publicKey: key.publicKey,
          walletId: { networkGlobalId: -3, context: { workchain: 0, walletVersion: 'v5r1', subwalletNumber: 0 } }
        });

        if (wallet.address.toRawString() !== quote.operator) {
          throw Error(`Derived wallet address mismatch: ${wallet.address.toRawString()} vs ${quote.operator}`);
        }

        const dest = core.Address.parseFriendly(op.targetAddress);
        const stateInit = op.stateInitBocBase64
          ? core.loadStateInit(core.Cell.fromBase64(op.stateInitBocBase64).beginParse())
          : null;
        const payload = op.payloadBocBase64
          ? core.Cell.fromBase64(op.payloadBocBase64)
          : core.beginCell().endCell();

        const body = await wallet.createTransfer({
          seqno: quote.seqno,
          timeout: quote.validUntil,
          authType: 'external',
          sendMode: 3,
          signer: async (cell) => sign(cell.hash(), key.secretKey),
          messages: [
            core.internal({
              to: dest.address,
              bounce: dest.isBounceable,
              value: op.amountNano,
              init: stateInit,
              body: payload
            })
          ]
        });

        const extMsg = core.beginCell()
          .store(core.storeMessage(core.external({ to: wallet.address, body })))
          .endCell();

        return {
          status: 'SIGNED_NOT_BROADCAST',
          step: op.step,
          id: op.id,
          name: op.name,
          targetAddress: op.targetAddress,
          amountNano: op.amountNano.toString(),
          fingerprint: quote.fingerprint,
          messageHash: extMsg.hash().toString('hex'),
          boc: extMsg.toBoc().toString('base64'),
          seqno: quote.seqno,
          validUntil: quote.validUntil
        };
      } finally {
        key.secretKey.fill(0);
      }
    });

    console.log(JSON.stringify(signedResult, null, 2));

  } else if (command === 'broadcast-step') {
    const stepNum = parseInt(arg1, 10);
    const signedPath = arg2;
    if (!signedPath) throw Error('Path to signed envelope JSON required');

    const signed = JSON.parse((await readFile(signedPath, 'utf8')).replace(/^\uFEFF/, ''));
    if (signed.step !== stepNum) throw Error(`Envelope step mismatch: expected ${stepNum}, got ${signed.step}`);

    if (now() >= signed.validUntil) throw Error('Signed transaction has expired');

    const expectedApproval = `CONFIRM BROADCAST STEP ${stepNum} ${signed.messageHash}`;
    await confirmApproval(expectedApproval, `broadcast step ${stepNum}`);

    const res = await toncenterRpc('sendBoc', { boc: signed.boc });
    console.log(JSON.stringify({
      status: 'BROADCAST_SUBMITTED',
      step: signed.step,
      id: signed.id,
      name: signed.name,
      messageHash: signed.messageHash,
      targetAddress: signed.targetAddress,
      rpcResult: res
    }, null, 2));

  } else if (command === 'inspect-launchpad') {
    const deployerAddrStr = arg1 || reviewedDeployerFriendly;
    const deployerRaw = core.Address.parseFriendly(deployerAddrStr).address.toRawString();

    const artifactsRes = verifyArtifacts();
    if (!artifactsRes.ok) throw Error('Artifact verification failed');
    const predicted = deriveDeterministicAddresses(deployerRaw, artifactsRes.artifacts);

    const report = {
      observedAt: new Date().toISOString(),
      network: '-3',
      deployer: deployerRaw,
      contracts: {}
    };

    for (const [key, contract] of Object.entries(predicted)) {
      const info = await getAccountInfo(contract.rawAddress);
      report.contracts[key] = {
        name: contract.address,
        raw: contract.rawAddress,
        state: info.state || 'uninitialized',
        balanceTon: (Number(BigInt(info.balance || '0')) / 1e9).toFixed(4),
        lastLt: info.last_transaction_id?.lt || '0'
      };
    }

    // Inspect get_jetton_data on Minter if active
    if (report.contracts.launchpadMinter.state === 'active') {
      try {
        const jd = await toncenterRpc('runGetMethod', { address: predicted.launchpadMinter.rawAddress, method: 'get_jetton_data', stack: [] });
        if (jd?.exit_code === 0) {
          report.contracts.launchpadMinter.totalSupplyUnits = BigInt(jd.stack[0][1]).toString();
          report.contracts.launchpadMinter.totalSupplyTokens = (Number(BigInt(jd.stack[0][1])) / 1e9).toLocaleString('en-US') + ' ANL';
        }
      } catch {}
    }

    // Inspect get_curve_state on Curve if active
    if (report.contracts.bondingCurve.state === 'active') {
      try {
        const cs = await toncenterRpc('runGetMethod', { address: predicted.bondingCurve.rawAddress, method: 'get_curve_state', stack: [] });
        if (cs?.exit_code === 0) {
          const stateEnum = parseInt(cs.stack[0][1], 16);
          const stateNames = ['UNINITIALIZED (0)', 'INITIALIZING (1)', 'RENOUNCE_PENDING (2)', 'ACTIVE (3)', 'GRADUATED (4)'];
          report.contracts.bondingCurve.curveStateEnum = stateEnum;
          report.contracts.bondingCurve.curveStateName = stateNames[stateEnum] || `UNKNOWN (${stateEnum})`;
          report.contracts.bondingCurve.realTonReserveTon = (Number(BigInt(cs.stack[4][1])) / 1e9).toFixed(4) + ' TON';
          report.contracts.bondingCurve.tokenReserveTokens = (Number(BigInt(cs.stack[5][1])) / 1e9).toLocaleString('en-US') + ' ANL';
          report.contracts.bondingCurve.graduationThresholdTon = '300 TON';
        }
      } catch {}
    }

    console.log(JSON.stringify(report, null, 2));

  } else {
    console.error('Usage: node supervised-launchpad-deployer-cli.mjs [preflight|sign-step|broadcast-step|inspect-launchpad]');
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }));
  process.exitCode = 1;
});
