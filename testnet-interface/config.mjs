import { PAGES_ORIGIN } from './pages-origin.mjs';
export const OPERATOR = '0:8119eb76ff64af554ad7fcc64bd30d0eb8faa56c9b651d3de76e959a107d9061';
export const PUBLIC_KEY = '94a010bf130bfceefdcba69f1dc18260277e1a3d073b632dd578b9c38b421a09';
export const V5_CODE = '20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f';
export const CHAIN = '-3';
export { MINTER } from './candidate-public.mjs';
export const TESTNET_RPC = 'https://testnet.toncenter.com/api/v2';
export const TTL = 300;
// V5R1 candidate using the existing PUBLIC key; owner must select this wallet in
// their own wallet app and prove control. No private key is available here.
export function approvedOrigin(value) {
  const u = new URL(value);
  if (u.origin !== value || u.protocol !== 'https:' || !['https://testnet.anlgram.com', PAGES_ORIGIN].includes(value)) {
    throw new Error('Unapproved Testnet origin');
  }
  return u;
}
