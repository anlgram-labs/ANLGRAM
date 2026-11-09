import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import support from '../../tests/settlement-runtime/one-shot-dispatch-support.js';
import {migrationAccountFields} from '../projects/migration-account.mjs';
import {generation2Status} from '../projects/migration-status.mjs';
import {rememberMigrationCheckpoint} from '../projects/evidence-brand.mjs';
import {selectLpDelivery} from '../projects/project-lp-acquisition.mjs';
import {rememberLpEvidence} from '../projects/lp-evidence.mjs';

const core = createRequire(new URL('../../tests/settlement-runtime/one-shot-dispatch-support.js', import.meta.url))('@ton/core');

test('missing-notification lookup ignores query collisions and refuses distinct matching deliveries', () => {
 const address = n => core.Address.parseRaw('0:'+String(n).repeat(64));
 const policy={pool:address(1),lpWallet:address(2),contributor:address(3),q:77n};
 const row=(id,payloadId,amount=1n)=>{
  const body=core.beginCell().storeUint(0x178d4519,32).storeUint(policy.q,64).storeCoins(amount)
   .storeAddress(policy.contributor).storeAddress(null).storeCoins(1n).storeBit(false)
   .storeUint(0x414c5632,32).storeUint(payloadId,64).endCell();
  const inMessage=core.internal({to:policy.lpWallet,value:1n,body});
  inMessage.info.src=policy.pool;
  return {tx:{inMessage},cell:core.beginCell().storeUint(id,8).endCell()};
 };
 const collision=row(1,78n),exact=row(2,77n);
 assert.equal(selectLpDelivery(policy,[collision]),null);
 assert.equal(selectLpDelivery(policy,[collision,exact,exact]),exact);
 assert.equal(selectLpDelivery(policy,[exact,row(3,77n,2n)]),null);
});

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
 const bounce=rememberLpEvidence({kind:'LP_WITHDRAWAL_IMMEDIATE_BOUNCE',operationId:'77',
  reference:JSON.stringify([after.proof.masterchainSeqno,after.proof.masterchainRootHash,after.proof.masterchainFileHash]),
  locker:after.locker,pool:after.pool,lpWallet:after.lpWallet,walletTransactionHash:'aa'.repeat(32),
  contractPrincipalRestoredFields:true,deliveryVerified:false,newAttemptAuthorized:false,operationCompleted:false});
 const delivery=rememberLpEvidence({...bounce,kind:'LP_WITHDRAWAL_DELIVERY',
  walletTransactionHash:'bb'.repeat(32),contractPendingMustRemain:true});
 const receipts=generation2Status(identity,{checkpoint:after,evidence:[bounce,bounce,delivery]});
 assert.deepEqual(receipts.withdrawalEvidence,[bounce,delivery]);
 assert.equal(receipts.mint,'NOT_VERIFIED');
 assert.equal(receipts.settlement,'SETTLEMENT_PENDING');
 assert.equal(receipts.withdrawalsEnabled,false);
 assert.throws(()=>generation2Status(identity,{checkpoint:after,
  evidence:[rememberLpEvidence({...delivery,lpWallet:after.locker})]}),/Wrong project/);
 const legs=status.principalAccounting;
 assert(BigInt(legs.tonNano.original)>0n&&BigInt(legs.jettonUnits.original)>0n);
 for(const leg of [legs.tonNano,legs.jettonUnits]){
  assert.equal(leg.funded,leg.original);
  assert.equal(leg.notBookedByCurve,leg.original);
  assert.equal(leg.dexTerminalOutcome,'UNKNOWN');
  assert.equal(leg.fundingStatus,'VERIFIED');
  assert.equal(leg.curveReturnStatus,'UNKNOWN');
 }
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
 // Synthetic future counter snapshots exercise the monitor independently of
 // Gate 414. They are never used as contract evidence.
 const returned=checkpoint({...after,lifecycle:{...after.lifecycle,
  returnTransitTonNano:'1',curveBookedTonNano:'2'}});
 const monitoring=generation2Status(identity,{checkpoint:returned,previous:after});
 assert.equal(monitoring.principalAccounting.tonNano.inTransit,'1');
 assert.equal(monitoring.principalAccounting.tonNano.curveBooked,'2');
 assert.equal(monitoring.principalAccounting.tonNano.curveReturnStatus,'RETURN_PENDING');
 assert.equal(monitoring.principalAccounting.jettonUnits.curveReturnStatus,'UNKNOWN');
 assert.equal(monitoring.principalAccounting.tonNano.notBookedByCurve,String(BigInt(legs.tonNano.original)-2n));
 assert.equal(monitoring.settlement,'SETTLEMENT_PENDING');
 const partial=checkpoint({...before,lifecycle:{...after.lifecycle,dexDispatched:'0',
  fundedTonNano:'1',fundedJettonUnits:'0',fundingBouncedJettonUnits:legs.jettonUnits.original}});
 const partialStatus=generation2Status(identity,{checkpoint:partial});
 assert.equal(partialStatus.principalAccounting.tonNano.fundingStatus,'PARTIAL');
 assert.equal(partialStatus.principalAccounting.jettonUnits.fundingStatus,'FAILED');
 assert.equal(partialStatus.principalAccounting.jettonUnits.dexTerminalOutcome,'UNKNOWN');
 const booked=checkpoint({...returned,lifecycle:{...returned.lifecycle,returnTransitTonNano:'0',
  curveBookedTonNano:legs.tonNano.original}});
 const bookedStatus=generation2Status(identity,{checkpoint:booked});
 assert.equal(bookedStatus.principalAccounting.tonNano.curveReturnStatus,'REFUNDED');
 assert.equal(bookedStatus.settlement,'SETTLEMENT_PENDING');
 assert.deepEqual(generation2Status(identity,{checkpoint:returned,previous:returned}),monitoring);
 const rollback=checkpoint({...returned,lifecycle:{...returned.lifecycle,curveBookedTonNano:'1'}});
 assert.throws(()=>generation2Status(identity,{checkpoint:rollback,previous:returned}),/Regressed/);
 const overbook=checkpoint({...returned,lifecycle:{...returned.lifecycle,returnTransitTonNano:legs.tonNano.original}});
 assert.throws(()=>generation2Status(identity,{checkpoint:overbook,previous:returned}),/Invalid principal accounting/);
 assert.throws(()=>generation2Status(identity,{checkpoint:after,evidence:[{kind:'LP_ISSUANCE',operationId:'77'}]}),/mint evidence/);
});
