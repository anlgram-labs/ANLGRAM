import { Address } from '@ton/core';

const CANDIDATES = [
  {
    name: 'Candidate A: STON.fi CPI Router v2.1.0',
    address: 'kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v',
    version: 'v2.1.0 (CPI Router)',
    source: 'Official STON.fi Docs & SDK testnet constant',
    expectedNetwork: 'testnet'
  },
  {
    name: 'Candidate B: STON.fi DEX v2 HackenProof',
    address: 'kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn',
    version: 'v2 (HackenProof bug bounty program)',
    source: 'https://hackenproof.com/programs/ston-dot-fi-dex-smart-contracts-v2',
    expectedNetwork: 'testnet'
  },
  {
    name: 'Candidate C: STON.fi DEX v1 Official Repo',
    address: 'EQBsGx9ArADUrREB34W-ghgsCgBShvfUr4Jvlu-0KGc33Rbt',
    version: 'v1.0.0 (dex-core)',
    source: 'https://github.com/ston-fi/dex-core',
    expectedNetwork: 'testnet/mainnet check'
  }
];

const TESTNET_TONCENTER = 'https://testnet.toncenter.com/api/v2';
const TESTNET_TONAPI = 'https://testnet.tonapi.io/v2';
const MAINNET_TONCENTER = 'https://toncenter.com/api/v2';
const MAINNET_TONAPI = 'https://tonapi.io/v2';

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return await res.json();
}

async function inspectCandidateOnNetwork(candidate, network = 'testnet') {
  const toncenter = network === 'testnet' ? TESTNET_TONCENTER : MAINNET_TONCENTER;
  const tonapi = network === 'testnet' ? TESTNET_TONAPI : MAINNET_TONAPI;

  const parsed = Address.parse(candidate.address);
  const rawAddr = parsed.toRawString();
  const testnetBounceable = parsed.toString({ testOnly: true, bounceable: true });
  const mainnetBounceable = parsed.toString({ testOnly: false, bounceable: true });

  console.log(`\n======================================================================`);
  console.log(`🔍 Inspecting ${candidate.name} on ${network.toUpperCase()}`);
  console.log(`   Input Address:      ${candidate.address}`);
  console.log(`   Raw Address:        ${rawAddr}`);
  console.log(`   Testnet Address:    ${testnetBounceable}`);
  console.log(`   Mainnet Address:    ${mainnetBounceable}`);
  console.log(`   Workchain:          ${parsed.workChain}`);
  console.log(`======================================================================`);

  // 1. TonAPI Account inspection
  let tonapiData = null;
  try {
    tonapiData = await fetchJson(`${tonapi}/blockchain/accounts/${rawAddr}`);
    console.log(`\n[TonAPI Account Overview]`);
    console.log(`  Status:             ${tonapiData.status}`);
    console.log(`  Balance:            ${tonapiData.balance} nanoTON (${(Number(tonapiData.balance) / 1e9).toFixed(4)} TON)`);
    console.log(`  Last Activity (LT): ${tonapiData.last_activity}`);
    console.log(`  Interfaces:         ${JSON.stringify(tonapiData.interfaces || [])}`);
    console.log(`  Code Hash:          ${tonapiData.code_hash || 'N/A'}`);
    console.log(`  Data Hash:          ${tonapiData.data_hash || 'N/A'}`);
  } catch (err) {
    console.log(`  [TonAPI Error]: ${err.message}`);
  }

  // 2. Toncenter Address Information
  let toncenterState = null;
  try {
    const tcRes = await fetchJson(`${toncenter}/getAddressInformation?address=${encodeURIComponent(rawAddr)}`);
    if (tcRes.ok) {
      toncenterState = tcRes.result;
      console.log(`\n[Toncenter Address Info]`);
      console.log(`  State:              ${toncenterState.state}`);
      console.log(`  Sync Utime:         ${toncenterState.sync_utime}`);
      console.log(`  Code (truncated):   ${toncenterState.code ? toncenterState.code.slice(0, 32) + '...' : 'empty'}`);
      console.log(`  Data (truncated):   ${toncenterState.data ? toncenterState.data.slice(0, 32) + '...' : 'empty'}`);
    }
  } catch (err) {
    console.log(`  [Toncenter Error]: ${err.message}`);
  }

  // 3. Methods to test
  if (tonapiData && tonapiData.status === 'active') {
    const methodsToTest = ['get_router_data', 'get_router_version', 'get_version', 'get_pool_address'];
    console.log(`\n[Get-Method Probing via Toncenter runGetMethod]`);
    for (const method of methodsToTest) {
      try {
        const gmRes = await fetchJson(`${toncenter}/runGetMethod`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: rawAddr,
            method: method,
            stack: []
          })
        });
        if (gmRes.ok) {
          console.log(`  👉 ${method}: exit_code = ${gmRes.result.exit_code}, gas_used = ${gmRes.result.gas_used}`);
          if (gmRes.result.exit_code === 0) {
            console.log(`     Stack return:`, JSON.stringify(gmRes.result.stack));
          } else {
            console.log(`     Exit Code Details: exit_code ${gmRes.result.exit_code}`);
          }
        } else {
          console.log(`  👉 ${method}: Toncenter returned ok: false`, gmRes);
        }
      } catch (err) {
        console.log(`  👉 ${method}: Call failed: ${err.message}`);
      }
    }

    // 4. Inspect last 5 transactions
    console.log(`\n[Recent Transactions Inspection (last 5)]`);
    try {
      const txRes = await fetchJson(`${tonapi}/blockchain/accounts/${rawAddr}/transactions?limit=5`);
      if (txRes.transactions && txRes.transactions.length > 0) {
        console.log(`  Total fetched: ${txRes.transactions.length}`);
        for (const tx of txRes.transactions) {
          const date = new Date(tx.utime * 1000).toISOString();
          const inMsgOp = tx.in_msg?.decoded_op_name || tx.in_msg?.op_code || 'none';
          const computeSuccess = tx.compute_phase?.success;
          const exitCode = tx.compute_phase?.exit_code;
          const gas = tx.compute_phase?.gas_used;
          console.log(`  - Tx LT: ${tx.lt} | Date: ${date} | InOp: ${inMsgOp} | Compute: ${computeSuccess ? 'OK' : 'FAIL'} (exit: ${exitCode}, gas: ${gas}) | OutMsgs: ${tx.out_msgs?.length || 0}`);
        }
      } else {
        console.log(`  Zero transactions found.`);
      }
    } catch (err) {
      console.log(`  [Transaction fetch error]: ${err.message}`);
    }
  } else {
    console.log(`\n  ⚠️ Account is NOT active on ${network}. Skipping get-methods.`);
  }

  return { candidate, network, tonapiData, toncenterState };
}

async function main() {
  console.log(`======================================================================`);
  console.log(`🚀 STON.FI & DEX ROUTER CANDIDATE DISCOVERY AND AUDIT TOOL`);
  console.log(`   UTC Timestamp: ${new Date().toISOString()}`);
  console.log(`======================================================================`);

  for (const c of CANDIDATES) {
    // Inspect on testnet
    await inspectCandidateOnNetwork(c, 'testnet');
    
    // For Candidate C or any candidate that looks like mainnet, also check mainnet
    if (c.address.startsWith('EQ') || c.name.includes('v1')) {
      await inspectCandidateOnNetwork(c, 'mainnet');
    }
  }
}

main().catch(console.error);
