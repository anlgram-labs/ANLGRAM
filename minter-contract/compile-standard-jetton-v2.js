'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {compileFunc} = require('../tests/settlement-runtime/node_modules/@ton-community/func-js');
const {Cell} = require('../tests/settlement-runtime/node_modules/@ton/core');
const root = path.join(__dirname, 'contracts');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const replace = (text, before, after) => {
  if (text.split(before).length !== 2) throw Error('Standard V2 generation anchor: ' + before);
  return text.replace(before, after);
};

const ops = `
const int std_credit = 0x53544d01;
const int std_receipt = 0x53544d02;
const int std_release = 0x53544d03;
const int std_query = 0x53544d04;
const int std_child_value = 100000000;
const int std_receipt_value = 20000000;
() std_send(slice to, int value, cell body, int mode, int bounce) impure inline {
  send_raw_message(begin_cell().store_uint(bounce ? 0x18 : 0x10, 6).store_slice(to)
    .store_coins(value).store_uint(1, 107).store_ref(body).end_cell(), mode);
}
`;
function master(source) {
  source = replace(source, '(int, slice, cell, cell) load_data()', ops + `
cell mint_record() inline {
  slice s = get_data().begin_parse();
  s~load_coins(); s~load_msg_addr(); s~load_ref(); s~load_ref();
  return s.slice_empty?() ? null() : s~load_dict();
}
() save_mint_record(cell record) impure inline {
  slice s = get_data().begin_parse();
  int supply = s~load_coins();
  slice admin = s~load_msg_addr();
  cell content = s~load_ref(); cell code = s~load_ref();
  set_data(begin_cell().store_coins(supply).store_slice(admin).store_ref(content).store_ref(code).store_dict(record).end_cell());
}
(int, int, int, slice) get_initial_mint() method_id {
  cell record = mint_record();
  if (cell_null?(record)) { return (0, 0, 0, null()); }
  slice s = record.begin_parse();
  return (s~load_uint(64), s~load_uint(2), s~load_coins(), s~load_msg_addr());
}
cell pack_mint(int q, int phase, int amount, slice wallet) inline {
  return begin_cell().store_uint(q,64).store_uint(phase,2).store_coins(amount).store_slice(wallet).end_cell();
}
(int, slice, cell, cell) load_data()`);
  source = replace(source, '.store_ref(jetton_wallet_code)\n            .end_cell()', '.store_ref(jetton_wallet_code).store_dict(mint_record())\n            .end_cell()');
  source = replace(source, 'send_raw_message(msg.end_cell(), 1); ;; pay transfer fees separately, revert on errors', 'send_raw_message(msg.end_cell(), 17);');
  source = replace(source, `    if (flags & 1) { ;; ignore all bounced messages
        return ();
    }
    slice sender_address = cs~load_msg_addr();`, `    slice sender_address = cs~load_msg_addr();
    if (flags & 1) {
        if (slice_bits(in_msg_body) >= 132) {
            int prefix = in_msg_body~load_uint(32);
            int op = in_msg_body~load_uint(32);
            int q = in_msg_body~load_uint(64);
            int amount = in_msg_body~load_coins();
            (int expected, int phase, int units, slice wallet) = get_initial_mint();
            if ((prefix == 0xffffffff) & (op == std_credit) & (phase == 1) & (q == expected) & (amount == units)) {
                if (equal_slices(wallet, sender_address)) { save_mint_record(pack_mint(q,3,amount,wallet)); }
            }
        }
        return ();
    }`);
  const start = source.indexOf('    if (op == op::mint())');
  const end = source.indexOf('    if (op == op::burn_notification())', start);
  if (start < 0 || end < 0) throw Error('Mint handler anchor');
  source = source.slice(0,start) + `    if (op == op::mint()) {
        throw_unless(73, equal_slices(sender_address, admin_address));
        (int last, int phase, _, _) = get_initial_mint();
        throw_unless(740, ((phase == 0) | (phase == 3)) & (query_id > last) & (total_supply == 0));
        slice owner = in_msg_body~load_msg_addr(); force_chain(owner);
        int amount = in_msg_body~load_coins(); in_msg_body.end_parse();
        throw_unless(741, (amount > 0) & (msg_value >= 150000000));
        slice wallet = calculate_user_jetton_wallet_address(owner, my_address(), jetton_wallet_code);
        save_mint_record(pack_mint(query_id,1,amount,wallet));
        mint_tokens(owner, jetton_wallet_code, std_child_value,
            begin_cell().store_uint(std_credit,32).store_uint(query_id,64).store_coins(amount).end_cell());
        return ();
    }

    if (op == std_receipt) {
        (int q, int phase, int amount, slice wallet) = get_initial_mint();
        throw_unless(742, ((phase == 1) | (phase == 2)) & (q == query_id));
        throw_unless(742, equal_slices(sender_address,wallet) & (in_msg_body~load_coins() == amount));
        in_msg_body.end_parse();
        throw_unless(741, msg_value >= std_receipt_value);
        if (phase == 1) {
            save_data(amount, admin_address, content, jetton_wallet_code);
            save_mint_record(pack_mint(q,2,amount,wallet));
        }
        std_send(wallet, 5000000, begin_cell().store_uint(std_release,32).store_uint(q,64).end_cell(), 3, 0);
        return ();
    }

` + source.slice(end);
  return replace(source, 'return (total_supply, -1, admin_address, content, jetton_wallet_code);',
    '(_, int phase, _, _) = get_initial_mint();\n    return (total_supply, phase == 2 ? 0 : -1, admin_address, content, jetton_wallet_code);');
}

function wallet(source) {
  source = replace(source, '(int, slice, slice, cell) load_data()', ops + `
cell wallet_mint_record() inline {
  slice s = get_data().begin_parse();
  s~load_coins(); s~load_msg_addr(); s~load_msg_addr(); s~load_ref();
  return s.slice_empty?() ? null() : s~load_dict();
}
(int, int, int) get_initial_credit() method_id {
  cell record = wallet_mint_record();
  if (cell_null?(record)) { return (0,0,0); }
  slice s = record.begin_parse();
  return (s~load_uint(64), s~load_coins(), s~load_uint(1));
}
() store_wallet(int balance, slice owner, slice master, cell code, cell receipt) impure inline {
  set_data(begin_cell().store_coins(balance).store_slice(owner).store_slice(master).store_ref(code).store_dict(receipt).end_cell());
}
cell pack_credit(int q, int amount, int released) inline {
  return begin_cell().store_uint(q,64).store_coins(amount).store_uint(released,1).end_cell();
}
(int, slice, slice, cell) load_data()`);
  source = replace(source, 'set_data(pack_jetton_wallet_data(balance, owner_address, jetton_master_address, jetton_wallet_code));',
    'store_wallet(balance, owner_address, jetton_master_address, jetton_wallet_code, wallet_mint_record());');
  source = replace(source, '  if (op == op::transfer())', `  if ((op == std_credit) | (op == std_query) | (op == std_release)) {
    (int balance, slice owner, slice master, cell code) = load_data();
    (int prior, int amount, int released) = get_initial_credit();
    int q = in_msg_body~load_uint(64);
    if (op == std_release) {
      throw_unless(742, equal_slices(sender_address,master) & (prior > 0) & (q == prior));
      in_msg_body.end_parse();
      store_wallet(balance,owner,master,code,pack_credit(prior,amount,1));
      return ();
    }
    if (op == std_credit) {
      throw_unless(742, equal_slices(sender_address,master) & (prior == 0) & (q > 0));
      amount = in_msg_body~load_coins();
      throw_unless(741, (amount > 0) & (msg_value >= std_child_value));
      store_wallet(balance + amount,owner,master,code,pack_credit(q,amount,0));
    } else {
      throw_unless(741, (prior > 0) & (q == prior) & (msg_value >= 40000000));
    }
    in_msg_body.end_parse();
    std_send(master,std_receipt_value,
      begin_cell().store_uint(std_receipt,32).store_uint(q,64).store_coins(amount).end_cell(),17,1);
    return ();
  }

  if ((op == op::transfer()) | (op == op::burn())) {
    (int q, _, int released) = get_initial_credit();
    throw_unless(743, (q == 0) | (released == 1));
  }

  if (op == op::transfer())`);
  // Custom receipt bounces never credit tokens. Retain the authenticated
  // receipt so a funded query can re-emit it without another mint.
  source = replace(source, '  throw_unless(709, (op == op::internal_transfer())', '  if (op == std_receipt) { return (); }\n  throw_unless(709, (op == op::internal_transfer())');
  return source;
}
async function main() {
  const entries = {};
  for (const [role, transform] of [['minter',master],['wallet',wallet]]) {
    const target = 'standard-jetton-' + role + '-v2.fc';
    const generated = transform(read('jetton-' + role + '.fc'));
    const sources = {};
    const compiled = await compileFunc({targets:[target], sources:name=>{
      const source = name === target ? generated : read(name);
      sources[name] = sha(source);
      return source;
    }});
    if (compiled.status !== 'ok') throw Error(compiled.message);
    entries[role] = {target, sources, codeHash:Cell.fromBase64(compiled.codeBoc).hash().toString('hex'),
      bocSha256:sha(Buffer.from(compiled.codeBoc,'base64')), codeBocBase64:compiled.codeBoc};
  }
  const pathOut = path.join(__dirname,'build','standard-jetton-v2.compiled.json');
  const output = JSON.stringify({schema:2,generatorSha256:sha(fs.readFileSync(__filename,'utf8').replace(/\r\n/g,'\n')), ...entries},null,2)+'\n';
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(pathOut,'utf8').replace(/\r\n/g,'\n') !== output) throw Error('Standard V2 artifact mismatch');
  } else fs.writeFileSync(pathOut,output);
  console.log(JSON.stringify({minter:entries.minter.codeHash,wallet:entries.wallet.codeHash}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
