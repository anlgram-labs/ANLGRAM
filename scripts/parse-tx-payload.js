import { Cell } from '@ton/core';

// From Tx LT 105013867000005 raw body
const rawHex = 'b5ee9c720101030100cd0001627362d09c000000000000000039896808008de5d9eb97b6fa83746ade278b7d75352d37f52d10c94aff56de30b553ed7f6d0101e137c096df801f2fa3d5bc3d16f44e1986f4350d9618e19ce7f99629706331bfd874d0a253de90011bcbb3d72f6df506e8d5bc4f16faea6a5a6fea5a219295feadbc616aa7dafeda002379767ae5edbea0dd1ab789e2df5d4d4b4dfd4b443252bfd5b78c2d54fb5fdb00000000356dedb64002004508008de5d9eb97b6fa83746ade278b7d75352d37f52d10c94aff56de30b553ed7f6d04';

const cell = Cell.fromBoc(Buffer.from(rawHex, 'hex'))[0];
const cs = cell.beginParse();
console.log('Op:', cs.loadUint(32).toString(16));
console.log('QueryId:', cs.loadUint(64));
console.log('Coins:', cs.loadCoins());
console.log('Sender:', cs.loadAddress().toRawString());

// Forward payload: in jetton_notify, forward_payload can be either inline (if bit 0 is 0) or in ref (if bit 0 is 1)
const isRef = cs.loadBit();
console.log('isRef:', isRef);
const fwdSlice = isRef ? cs.loadRef().beginParse() : cs;

console.log('ProvideLp Op:', fwdSlice.loadUint(32).toString(16));
console.log('TokenWallet1:', fwdSlice.loadAddress().toRawString());
console.log('RefundAddress:', fwdSlice.loadAddress().toRawString());
console.log('ExcessesAddress:', fwdSlice.loadAddress().toRawString());

// Let's check bits remaining in fwdSlice
console.log('Remaining bits in fwdSlice:', fwdSlice.remainingBits, 'refs:', fwdSlice.remainingRefs);
const deadlineBits = fwdSlice.remainingBits;
console.log('Deadline value if 64 bits:', deadlineBits >= 64 ? fwdSlice.preloadUint(64) : 'less than 64');
console.log('Deadline value if 32 bits:', deadlineBits >= 32 ? fwdSlice.preloadUint(32) : 'less than 32');

if (deadlineBits === 64) {
  console.log('Loaded uint64 deadline:', fwdSlice.loadUint(64));
}

// Now parse cross_provide_lp_body
const crossRef = fwdSlice.loadRef().beginParse();
console.log('CrossRef min_lp_out:', crossRef.loadCoins());
console.log('CrossRef to_address:', crossRef.loadAddress().toRawString());
console.log('CrossRef both_positive:', crossRef.loadUint(1));
console.log('CrossRef fwd_amount:', crossRef.loadCoins());
console.log('CrossRef custom_payload bit:', crossRef.loadBit());
console.log('CrossRef remaining bits:', crossRef.remainingBits, 'refs:', crossRef.remainingRefs);
