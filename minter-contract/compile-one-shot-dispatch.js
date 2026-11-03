'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {compileFunc}=require('../tests/settlement-runtime/node_modules/@ton-community/func-js'),{Cell}=require('../tests/settlement-runtime/node_modules/@ton/core');
const dir=path.join(__dirname,'contracts'),check=process.argv.includes('--check'),read=f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function save(file,text){if(check){if(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Dispatch generation mismatch: '+file);}else fs.writeFileSync(file,text);}
const write=(f,s)=>save(path.join(dir,f),s);
function once(s,a,b){if(s.split(a).length!==2)throw Error('Dispatch derivation anchor: '+a.slice(0,100));return s.replace(a,b);}
async function main(){
 let auth=read('imports/curve-vnext-auth.fc');
 auth=once(auth,'.store_uint(1,32).end_cell()).end_cell()))','.store_uint(2,32).end_cell()).end_cell()))');
 auth=once(auth,'    throw(414); ;; No release authorization or external settlement proof path.',`    cell network = config_param(19);throw_if(408,cell_null?(network));slice actual_network = network.begin_parse();throw_unless(408,actual_network~load_int(32) == -3);
    throw_unless(409,curve_v2_local_ready() & ((curve_life_flags(q) & 7) == 3));
    (_,_,_,_,_,_,_,_,_,int ton,_,int fees,_,_,_,_,_,_,_) = load_data();
    throw_unless(409,get_balance().pair_first() >= ton + fees + 10000000);`);
 auth+=`\n() vd_consume_curve(int q) impure inline {
    (int n,int h,int expiry,int epoch,int state) = vn_curve_record(q);throw_unless(409,state == 1);
    vn_curve_save(q,n,h,expiry,epoch,3);
}
(int,int) get_dispatch_state_curve(int q) method_id {
    (int n,_,_,_,int state) = vn_curve_record(q);int flags = curve_life_flags(q);
    return((flags >= 0) & ((flags & 4) != 0) ? 2 : (state == 1 ? 1 : 0),0);
}\n`;
 write('imports/curve-dispatch-auth-v2.fc',auth);
 let life=read('imports/curve-lifecycle-vnext.fc').replace('"curve-vnext-auth.fc"','"curve-dispatch-auth-v2.fc"');
 life=once(life,'curve_life_flag(q,flags | 4);raw_reserve','curve_life_flag(q,flags | 4);vd_consume_curve(q);raw_reserve');
 life=once(life,'.store_uint(q,64).store_coins(ton).end_cell(),1);return -1;', '.store_uint(q,64).store_coins(ton).end_cell(),1);return_unreserved_gas(sender,q);return -1;');
 write('imports/curve-lifecycle-dispatch-v2.fc',life);
 let ma=read('imports/migration-vnext-auth.fc');
 ma=once(ma,'    throw(414); ;; SOURCE REVIEW / EXTERNAL SETTLEMENT PROOF GATE STAYS CLOSED.',`    cell network = config_param(19);throw_if(408,cell_null?(network));slice actual_network = network.begin_parse();throw_unless(408,actual_network~load_int(32) == -3);`);
 ma=ma.replace('get_protocol_vnext() method_id { return(1,1,0); }','get_protocol_vnext() method_id { return(2,1,0); }');
 ma+=`\n() vd_consume_migration() impure inline {
    (int n,int expiry,int hash,int state) = vn_migration_registration();throw_unless(409,state == 0);
    slice s = v2_registration().begin_parse();cell p = s~load_ref();vn_save_migration_registration(n,expiry,hash,1,p);
}\n`;
 write('imports/migration-dispatch-auth-v2.fc',ma);
 let lp=read('imports/migration-lp-vnext-base.fc');
 const anchor='    cell next = begin_cell().store_uint(lt,64).store_coins(received)';
 const at=lp.indexOf(anchor);if(at<0)throw Error('LP custody insertion anchor');
 lp=lp.slice(0,at)+`    if(received > 0) {
        (int found,cell f,_) = migration_life(q);throw_unless(409,found & (life_get(f,11) == 1));
        slice reg = v2_registration().begin_parse();throw_unless(409,reg~load_uint(32) == 0x4e585250);reg~load_uint(64);reg~load_uint(32);reg~load_uint(256);throw_unless(409,reg~load_uint(2) == 1);
        slice p = reg~load_ref().begin_parse();p~skip_bits(272);p~load_coins();p~load_coins();int minimum = p~load_coins();
        throw_unless(409,(received >= minimum) & (locked == target) & (free == received - target) & (pending == 0));
        (_,_,_,_,_,_,int nt,int nj,_,_,_,int dt,int dj,_) = load_data();
        (_,_,_,int ot,int oj,int rt,int rj,_) = load_reconciliation();
        throw_unless(409,(nt == 0) & (nj == 0) & (dt == ot) & (dj == oj) & (rt == 0) & (rj == 0));
        throw_unless(409,life_get(f,7) + life_get(f,8) + life_get(f,9) + life_get(f,10) + life_get(f,12) + life_get(f,13) == 0);
    }
`+lp.slice(at);
 // Positive custody snapshots may not be replayed as new evidence. Zero bootstrap remains idempotent.
 lp=once(lp,'if(lt < prior) { return_receipt_gas(admin,balance - value,q);return -1; } if(lt == prior)', 'if(received > 0) { throw_unless(409,lt > prior); } if(lt < prior) { return_receipt_gas(admin,balance - value,q);return -1; } if(lt == prior)');
 write('imports/migration-lp-dispatch-v2.fc',lp);
 let m=read('anlgram-migration-router-vnext.fc').replace(';; GENERATED VNext: financial execution remains sealed.\n','').replace('"imports/migration-lp-vnext-base.fc"','"imports/migration-lp-dispatch-v2.fc"').replace('"imports/migration-vnext-auth.fc"','"imports/migration-dispatch-auth-v2.fc";\n#include "imports/migration-dispatch-control-v2.fc"');
 m=once(m,'    if(handle_vnext_recovery(my_balance,msg_value,in_msg_full,in_msg_body))','    if(handle_dispatch_control(my_balance,msg_value,in_msg_full,in_msg_body)) { return (); }\n    if(handle_vnext_recovery(my_balance,msg_value,in_msg_full,in_msg_body))');
 m=once(m,'        ;; V2 LP wallet/configuration is immutable and authenticated at bind.','        int protected_before = my_balance - msg_value - ton_liquidity;throw_unless(409,protected_before >= 10000000);raw_reserve(protected_before,0);\n        ;; V2 LP wallet/configuration is immutable and authenticated at bind.');
 m=once(m,'        mark_life_deposit(query_id);\n        return ();','        mark_life_deposit(query_id);vd_consume_migration();vd_dispatch_excess(admin_address,query_id);\n        return ();');
 write('anlgram-migration-router-dispatch-v2.fc',';; EXPERIMENTAL GENERATION2: isolated Sandbox development; deployment NOT authorized.\n'+m);
 const artifacts=[];
 for(const name of ['anlgram-migration-router-dispatch-v2','anlgram-bonding-curve-dispatch-v2']){
  if(name.includes('bonding')){
   write('imports/migration-router-dispatch-v2-code.fc','const int MIGRATION_ROUTER_V2_CODE_HASH = 0x'+artifacts[0].codeCellHash+';\n');
   write('imports/curve-dispatch-router-v2.fc',read('imports/curve-vnext-router.fc').replace('migration-router-vnext-code.fc','migration-router-dispatch-v2-code.fc'));
   let c=read('anlgram-bonding-curve-vnext.fc').replace(';; GENERATED VNext: exact signed migration permits; all execution gates closed.\n','').replace('imports/curve-vnext-router.fc','imports/curve-dispatch-router-v2.fc').replace('imports/curve-lifecycle-vnext.fc','imports/curve-lifecycle-dispatch-v2.fc').replace('get_protocol_vnext() method_id { return(1,1,0); }','get_protocol_vnext() method_id { return(2,1,0); }');
   write(name+'.fc',';; EXPERIMENTAL GENERATION2: new identities; deployment NOT authorized.\n'+c);
  }
  const sources={};const r=await compileFunc({targets:[name+'.fc'],sources:f=>{const s=read(f);sources[f]=sha(s);return s;}});if(r.status!=='ok')throw Error(r.message);
  const code=Cell.fromBase64(r.codeBoc),a={contract:name+'.fc',codeCellHash:code.hash().toString('hex'),codeBocBase64:r.codeBoc,bocFileSha256:sha(code.toBoc()),sourceFilesSha256:sources,compilerPackageVersion:'0.11.0',generatorSha256Lf:sha(fs.readFileSync(__filename,'utf8').replace(/\r\n/g,'\n')),baseline:'59f5a931ef488508c20140d7dbd467caefadc77d',generation:2,sandboxExecutionPathImplemented:true,financialDeploymentAuthorized:false,fullSettlementImplemented:false};
  save(path.join(__dirname,'build',name+'.compiled.json'),JSON.stringify(a,null,2)+'\n');artifacts.push(a);
 }
 let factory=fs.readFileSync(path.join(__dirname,'scripts/migration-package-vnext.js'),'utf8').replace(/\r\n/g,'\n');factory=once(factory,"'anlgram-bonding-curve-vnext'","'anlgram-bonding-curve-dispatch-v2'");factory=once(factory,"'anlgram-migration-router-vnext'","'anlgram-migration-router-dispatch-v2'");factory=once(factory,"anlgram_protocol:'vnext-migration-permission-only'","anlgram_protocol:'experimental-one-shot-dispatch-v2'");factory=once(factory,'storeBuffer(c.wallet.hash()).storeUint(1,32)','storeBuffer(c.wallet.hash()).storeUint(2,32)');factory=once(factory,'lockerCodeVersion:2','lockerCodeVersion:2,generation:2,sandboxExecutionPathImplemented:true');
 save(path.join(__dirname,'scripts/migration-package-dispatch-v2.js'),factory);
 console.log(JSON.stringify({check,artifacts:artifacts.map(a=>({name:a.contract,hash:a.codeCellHash})),financialDeploymentAuthorized:false}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
