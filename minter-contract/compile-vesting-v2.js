'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {compileFunc} = require('../tests/settlement-runtime/node_modules/@ton-community/func-js');
const {Cell} = require('../tests/settlement-runtime/node_modules/@ton/core');
const read = file => fs.readFileSync(path.join(__dirname,file),'utf8').replace(/\r\n/g,'\n');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const replace = (text,old,value) => {
  if (text.split(old).length!==2) throw Error('Vesting V2 source anchor: '+old);
  return text.replace(old,value);
};
function versionedSource(walletHash) {
  let s = read('contracts/anlgram-vesting-wallet.fc');
  s = replace(s,';; File: minter-contract/contracts/anlgram-vesting-wallet.fc',
    ';; Generated V2: authenticated settlement-wallet claims, fresh deployments only.');
  s = replace(s,';; 5. Re-entrancy & Double-Claim Protection: State updated before outgoing transfer.',
    ';; 5. One pending claim; delivery is booked only from the pinned wallet receipt.');
  s = replace(s,';; 7. Decimals & Bounce Handling: TEP-74 compliant 0x0f8a7ea5 dispatch.',
    ';; 7. Authenticated failure leaves claimed principal unchanged.');
  s = replace(s,'#include "imports/utils.fc";','#include "imports/utils.fc";\n#include "imports/settlement-protocol.fc";');
  s = replace(s,'() save_data(', `;; Trailing storage preserves the legacy schedule fields while versioning the address.
(int,int) get_pending_claim() method_id {
    slice ds = get_data().begin_parse();
    ds~load_msg_addr(); ds~load_msg_addr(); ds~load_msg_addr();
    ds~load_ref(); ds~load_ref();
    if (ds.slice_empty?()) { return (0,0); }
    int q = ds~load_uint(64);
    int pending = ds~load_coins();
    ds.end_parse();
    return (q,pending);
}

() send_vesting_wallet(slice wallet, cell payload) impure inline {
    send_raw_message(begin_cell().store_uint(0x18,6).store_slice(wallet).store_coins(0)
        .store_uint(1,107).store_ref(payload).end_cell(),64 + 16);
}

cell vesting_transfer(int q,int amount,slice beneficiary) inline {
    return begin_cell().store_uint(sop::transfer,32).store_uint(q,64).store_coins(amount)
        .store_slice(beneficiary).store_slice(my_address()).store_uint(0,1).store_coins(0).store_uint(0,1).end_cell();
}

() save_data(`);
  s = replace(s,'    int is_initialized\n) impure inline {','    int is_initialized,\n    int last_query,\n    int pending_amount\n) impure inline {');
  s = replace(s,'            .store_ref(schedule_cell)\n','            .store_ref(schedule_cell)\n            .store_uint(last_query,64).store_coins(pending_amount)\n');
  const a=s.indexOf('    if (flags & 1)'), b=s.indexOf('    if (op == op::transfer_notification())',a);
  if (a<0||b<0) throw Error('Vesting V2 bounce handler anchor');
  s=s.slice(0,a)+`    if (flags & 1) { return (); } ;; Keep uncertain claims pending; use funded retry.
    throw_unless(403, cell_hash(jetton_wallet_code) == 0x${walletHash});
    int op = in_msg_body~load_uint(32);
    int query_id = in_msg_body~load_uint(64);
    (int last_query,int pending_amount) = get_pending_claim();
    slice wallet = calculate_user_jetton_wallet_address(my_address(),jetton_master_address,jetton_wallet_code);

    if (op == sop::receipt) {
        throw_unless(403,equal_slices(sender_address,wallet));
        int wire_id = in_msg_body~load_uint(64);
        int amount = in_msg_body~load_coins();
        int outcome = in_msg_body~load_uint(2);
        in_msg_body.end_parse();
        if ((query_id != last_query) | (pending_amount == 0)) { return (); }
        throw_unless(409,(wire_id > 0) & (amount == pending_amount) & ((outcome == 2) | (outcome == 3)));
        if (outcome == 2) { claimed_amount += amount; }
        throw_unless(409,claimed_amount <= total_locked_amount);
        save_data(creator_address,beneficiary_address,jetton_master_address,jetton_wallet_code,
            vesting_start_time,cliff_duration,vesting_total_duration,total_locked_amount,claimed_amount,is_initialized,last_query,0);
        return ();
    }

    if (op == sop::retry) {
        throw_unless(401,equal_slices(sender_address,beneficiary_address));
        throw_unless(409,(query_id == last_query) & (pending_amount > 0));
        throw_unless(408,msg_value >= 80000000);
        in_msg_body.end_parse();
        send_vesting_wallet(wallet,begin_cell().store_uint(sop::retry,32).store_uint(query_id,64).end_cell());
        return ();
    }

    if (op == sop::not_seen) {
        throw_unless(403,equal_slices(sender_address,wallet));
        if ((query_id != last_query) | (pending_amount == 0)) { return (); }
        throw_unless(408,msg_value >= 40000000);
        in_msg_body.end_parse();
        ;; Resubmit only the same owner ID. The wallet's persistent index
        ;; prevents a second debit if the original transfer arrives later.
        send_vesting_wallet(wallet,vesting_transfer(query_id,pending_amount,beneficiary_address));
        return ();
    }

`+s.slice(b);
  s=replace(s,'            1 ;; is_initialized = true','            1, last_query, pending_amount');
  s=replace(s,'        ;; 3. Gas check: minimum 0.04 TON required to cover Jetton transfer fees\n        throw_unless(error::insufficient_gas(), msg_value >= 40000000);',
    '        throw_unless(409,(pending_amount == 0) & (query_id > last_query));\n        throw_unless(408,msg_value >= 80000000);\n        in_msg_body.end_parse();');
  const start=s.indexOf('        ;; 7. Checks-Effects-Interactions:'), end=s.indexOf('        return ();',start);
  if(start<0||end<0)throw Error('Vesting V2 claim handler anchor');
  s=s.slice(0,start)+`        save_data(creator_address,beneficiary_address,jetton_master_address,jetton_wallet_code,
            vesting_start_time,cliff_duration,vesting_total_duration,total_locked_amount,claimed_amount,is_initialized,query_id,claimable);
        send_vesting_wallet(wallet,vesting_transfer(query_id,claimable,beneficiary_address));
`+s.slice(end);
  s=replace(s,'    int claimable = 0;','    int claimable = 0;\n    (_,int pending) = get_pending_claim();');
  s=replace(s,'        claimable = vested - claimed_amount;','        claimable = pending ? 0 : vested - claimed_amount;');
  s=replace(s,'    if (is_initialized == 0) {','    (_,int pending) = get_pending_claim();\n    if ((is_initialized == 0) | (pending > 0)) {');
  return s;
}
async function main() {
  const standard = process.argv.includes('--standard');
  const dispatch = process.argv.includes('--dispatch');
  if (standard && dispatch) throw Error('Select only one Vesting wallet profile');
  const walletName = standard ? 'standard-jetton-settlement-wallet'
    : dispatch ? 'anlgram-dispatch-sell-wallet' : 'anlgram-settlement-wallet';
  const wallet = JSON.parse(read('build/'+walletName+'.compiled.json'));
  const walletHash = Cell.fromBase64(wallet.codeBocBase64).hash().toString('hex');
  if (walletHash!==wallet.codeCellHash) throw Error('Settlement wallet pin mismatch');
  const name=standard?'anlgram-vesting-wallet-standard-v2'
    : dispatch?'anlgram-vesting-wallet-dispatch-v2':'anlgram-vesting-wallet-v2';
  const target=name+'.fc', generated=versionedSource(walletHash), sourceHashes={};
  const compiled=await compileFunc({targets:[target],sources:file=>{
    const source=file===target?generated:read('contracts/'+file);
    sourceHashes[file]=sha(source);
    return source;
  }});
  if(compiled.status!=='ok')throw Error(compiled.message);
  const codeBocBase64=compiled.codeBoc,codeCellHash=Cell.fromBase64(codeBocBase64).hash().toString('hex');
  const output=JSON.stringify({schema:2,target,walletHash,codeCellHash,codeBocBase64,sourceHashes,
    generatorSha256:sha(read('compile-vesting-v2.js'))},null,2)+'\n';
  const file='build/'+name+'.compiled.json';
  if(process.argv.includes('--check')) {
    if(read(file)!==output)throw Error('Vesting V2 artifact mismatch');
  } else fs.writeFileSync(path.join(__dirname,file),output);
  console.log(JSON.stringify({target,codeCellHash,walletHash}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
