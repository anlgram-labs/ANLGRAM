import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import support from '../../tests/settlement-runtime/one-shot-dispatch-support.js';
import {migrationAccountFields} from '../projects/migration-account.mjs';
import {generation2Status} from '../projects/migration-status.mjs';
import {rememberMigrationCheckpoint} from '../projects/evidence-brand.mjs';

const core = createRequire(new URL('../../tests/settlement-runtime/one-shot-dispatch-support.js', import.meta.url))('@ton/core');

test('generation 2 projection reads source-compiled state and separates historical custody from settlement', async () => {
 const f = await support.ready({percent: 50, duration: 'days180'});
 await f.fund();
 const identity = {project: f.c.addresses.minter.toRawString(), migrator: f.c.addresses.migration.toRawString(), operationId: '77'};
 const configuration = {...f.options, beneficiary: f.options.beneficiary.toRawString(), unlockedController: f.options.unlockedController.toRawString()};
 const snapshot = async () => {
  const contract = await f.chain.getContract(f.c.addresses.migration);
  const cell = core.beginCell().storeBit(true).store(core.storeAccount(contract.account.account)).endCell();
  return migrationAccountFields(configuration, 'migration', cell.toBoc().toString('base64'), 2);
 };
 // Synthetic inclusion envelope for projector testing. Account fields are
 // parsed from actual Sandbox state. No claim of live provider inclusion.
 let seqno = 0;
 const checkpoint = fields => rememberMigrationCheckpoint(Object.freeze({
  ...fields,
  proof: Object.freeze({masterchainSeqno: ++seqno, masterchainRootHash: String(seqno),
   masterchainFileHash: String(seqno), lastTransactionLt: String(10000000000n + BigInt(seqno)),
   lastTransactionHash: String(seqno), accountHash: fields.accountHash,
   scope: 'SYNTHETIC_TEST_REFERENCE', validatorFinalityVerified: false}),
 }));
 const before = checkpoint(await snapshot());
 assert.equal(generation2Status(identity).dispatch, 'UNKNOWN');
 assert.equal(generation2Status(identity,{checkpoint:before}).dispatch, 'UNKNOWN');
 await f.execute(await f.authorize());
 const after = checkpoint(await snapshot());
 const status = generation2Status(identity,{checkpoint:after,previous:before});
 assert.equal(status.dispatch,'DEX_DISPATCHED');
 assert.equal(status.custody,'LP_CUSTODY_VERIFIED');
 assert.equal(status.lock,'LP_LOCKED_VERIFIED');
 assert.equal(status.mint,'NOT_VERIFIED');
 assert.equal(status.settlement,'SETTLEMENT_PENDING');
 assert.equal(status.unresolvedReturns,'UNKNOWN');
 assert.equal(status.currentWalletUnits,null);
 const getter = (await f.chain.runGetMethod(f.c.addresses.migration,'get_lp_v2_state')).stack;
 assert.equal(status.historicalLp.receivedUnits,String((await f.stage())[1]));
 assert.equal(status.historicalLp.lt,String(getter[2].value));
 assert.equal(status.historicalLp.unlockTimestamp,String(getter[7].value));
 assert.deepEqual(generation2Status(identity,{checkpoint:after,previous:after}),status);
 assert.throws(()=>generation2Status(identity,{checkpoint:before,previous:after}),/Stale/);
 assert.throws(()=>generation2Status({...identity,project:f.other.address.toRawString()},{checkpoint:after}),/Wrong/);
 assert.throws(()=>generation2Status(identity,{checkpoint:JSON.parse(JSON.stringify(after))}),/Wrong/);
 const oldLt = rememberMigrationCheckpoint({...after,proof:{...after.proof,masterchainSeqno:99,lastTransactionLt:'1'}});
 assert.throws(()=>generation2Status(identity,{checkpoint:oldLt,previous:after}),/newer|Stale/);
 const claim = core.beginCell().storeUint(0x414c5633,32).storeUint(1,64).storeBit(false)
  .storeCoins(BigInt(status.historicalLp.freeUnits)).endCell();
 await f.send(f.c.vault.address,claim,150000000n,f.other);
 const withdrawn = generation2Status(identity,{checkpoint:checkpoint(await snapshot()),previous:after});
 assert.deepEqual(withdrawn.historicalLp,status.historicalLp);
 assert.equal(withdrawn.currentWalletUnits,null);
 assert.equal(withdrawn.withdrawalsEnabled,false);
 // LPAccount snapshot flags cannot change the settlement decision.
 const recreated = checkpoint({...await snapshot(),lpAccount:{balance:'0',complete:true}});
 assert.equal(generation2Status(identity,{checkpoint:recreated}).settlement,'SETTLEMENT_PENDING');
 assert.throws(()=>generation2Status(identity,{checkpoint:after,evidence:[{kind:'LP_ISSUANCE',operationId:'77'}]}),/mint evidence/);
});
