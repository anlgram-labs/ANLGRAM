import intent from './minter-intent.json' with {type:'json'};
import {createPolicy} from './transaction-policy.mjs';
export {intent};
export const {validateIntent,fingerprint}=createPolicy(intent);
