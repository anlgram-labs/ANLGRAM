import {Address,Cell,CellType,Dictionary,loadShardIdent,loadCurrencyCollection} from '@ton/core';

const need=(ok,message)=>{if(!ok)throw Error(message);};
const hex=c=>c.hash(0).toString('hex');
function roots(value){need(typeof value==='string'&&value.length>0&&value.length<524288&&/^[a-f0-9]+$/i.test(value),'Bounded proof BOC required');return Cell.fromBoc(Buffer.from(value,'hex'));}
function virtual(cell){need(cell?.type===CellType.MerkleProof&&cell.refs.length===1,'Merkle proof wrapper required');return cell.refs[0];}
function blockState(header,id){
 const b=virtual(header);need(hex(b)===id.root_hash.toLowerCase(),'Block proof root mismatch');
 const s=b.beginParse();need(s.loadUint(32)===0x11ef55aa&&s.loadInt(32)===-3,'Testnet block required');
 const info=s.loadRef().beginParse();s.loadRef();const update=s.loadRef();s.loadRef();s.endParse();
 need(info.loadUint(32)===0x9bc7a987,'BlockInfo tag mismatch');info.loadUint(32);info.loadUint(8);info.loadUint(8);
 need(info.loadUint(32)===id.seqno,'Block seqno mismatch');info.loadUint(32);const shard=loadShardIdent(info),chainTime=info.loadUint(32);
 const encoded=(shard.shardPrefix|(1n<<BigInt(63-shard.shardPrefixBits))).toString(16).padStart(16,'0');
 need(shard.workchainId===id.workchain&&encoded===id.shard.toLowerCase(),'Block shard identity mismatch');
 need(update.type===CellType.MerkleUpdate&&update.refs.length===2,'Block state update required');
 return{stateHash:hex(update.refs[1]),chainTime};
}
function shardState(wrapper,header){
 const cell=virtual(wrapper);need(hex(cell)===header.stateHash,'State proof is not committed by block');
 const s=cell.beginParse();need(s.loadUint(32)===0x9023afe2&&s.loadInt(32)===-3,'Testnet ShardState required');
 const shard=loadShardIdent(s),seqno=s.loadUint(32);s.loadUint(32);const time=s.loadUint(32);s.loadUintBig(64);s.loadUint(32);s.loadRef();s.loadBit();const accounts=s.loadRef();s.loadRef();const extra=s.loadBit()?s.loadRef():null;s.endParse();
 need(time===header.chainTime,'Block/state time mismatch');return{shard,seqno,time,accounts,extra};
}
function shardDescriptor(master,account){
 need(master.extra&&!master.extra.isExotic,'Masterchain shard commitments missing');const s=master.extra.beginParse();need(s.loadUint(16)===0xcc26,'McStateExtra tag mismatch');
 const dict=Dictionary.load(Dictionary.Keys.Int(32),{parse:cs=>cs.loadRef(),serialize(){throw Error('Read-only');}},s);let tree=dict.get(account.workChain);need(tree,'Workchain proof missing');
 let depth=0,prefix=0n;const key=BigInt('0x'+account.hash.toString('hex'));
 while(true){need(!tree.isExotic&&depth<=60,'Required shard branch pruned or unsupported');const t=tree.beginParse();if(!t.loadBit()){
   const tag=t.loadUint(4);need(tag===0xa||tag===0xb,'ShardDescr tag mismatch');const seqno=t.loadUint(32);t.loadUint(32);t.loadUintBig(64);t.loadUintBig(64);
   return{workchain:account.workChain,shard:(prefix|(1n<<BigInt(63-depth))).toString(16).padStart(16,'0'),seqno,root_hash:t.loadBuffer(32).toString('hex'),file_hash:t.loadBuffer(32).toString('hex')};
  }
  const left=t.loadRef(),right=t.loadRef(),bit=(key>>BigInt(255-depth))&1n;t.endParse();if(bit)prefix|=1n<<BigInt(63-depth);tree=bit?right:left;depth++;
 }
}
// Verifies inclusion relative to a block hash independently corroborated by two
// fixed providers. This does NOT sync validator sets or verify quorum signatures.
export function verifyAccountInclusion(raw,reference,address){
 const account=Address.parse(address);need(account.workChain===0,'Only approved basechain operator supported');
 need(reference?.workchain===-1&&reference.shard==='-9223372036854775808'&&Number.isSafeInteger(reference.seqno),'Independent masterchain reference required');
 const id=raw.id;need(id?.workchain===-1&&id.shard==='8000000000000000'&&id.seqno===reference.seqno&&id.root_hash.toLowerCase()===Buffer.from(reference.root_hash,'base64').toString('hex')&&id.file_hash.toLowerCase()===Buffer.from(reference.file_hash,'base64').toString('hex'),'Independent masterchain hashes disagree');
 const masterProof=roots(raw.shard_proof);need(masterProof.length===2,'Two-root masterchain proof required');const mh=blockState(masterProof[0],id),master=shardState(masterProof[1],mh);need(master.shard.workchainId===-1&&master.seqno===id.seqno,'Wrong masterchain state');
 const descriptor=shardDescriptor(master,account),expected=raw.shardblk;
 for(const k of ['workchain','shard','seqno','root_hash','file_hash'])need(descriptor[k]===expected[k],'Shard block not committed in masterchain');
 const proof=roots(raw.proof);need(proof.length===2,'Two-root account proof required');const bh=blockState(proof[0],descriptor),state=shardState(proof[1],bh);need(state.shard.workchainId===0&&state.seqno===descriptor.seqno,'Wrong account shard state');
 need((state.shard.shardPrefix|(1n<<BigInt(63-state.shard.shardPrefixBits))).toString(16).padStart(16,'0')===descriptor.shard,'Account shard prefix mismatch');
 need(!state.accounts.isExotic,'Account dictionary pruned');
 const values={parse:cs=>{cs.loadUint(5);loadCurrencyCollection(cs);return{account:cs.loadRef(),lastHash:cs.loadUintBig(256),lastLt:cs.loadUintBig(64)};},serialize(){throw Error('Read-only');}};
 const accounts=Dictionary.load(Dictionary.Keys.BigUint(256),values,state.accounts.beginParse()),entry=accounts.get(BigInt('0x'+account.hash.toString('hex')));need(entry,'Account path missing from proof');
 const cells=roots(raw.state);need(cells.length===1&&!cells[0].isExotic&&hex(cells[0])===hex(entry.account),'Account state hash not committed by dictionary');
 return{scope:'ACCOUNT_INCLUSION_RELATIVE_TO_TWO_PROVIDER_MASTERCHAIN_REFERENCE',accountHash:hex(cells[0]),lastTransactionHash:entry.lastHash.toString(16).padStart(64,'0'),lastTransactionLt:entry.lastLt.toString(),masterchainSeqno:id.seqno,masterchainRootHash:id.root_hash,masterchainFileHash:id.file_hash,chainTime:mh.chainTime,shardChainTime:bh.chainTime,proofInclusionVerified:true,validatorFinalityVerified:false,financialSigningEnabled:false};
}
