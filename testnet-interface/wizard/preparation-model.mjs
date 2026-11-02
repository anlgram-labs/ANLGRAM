import {normalizeDraft} from './model.mjs';
export function configuration(input){const d=normalizeDraft(input);return{schema:d.schema,network:d.network,id:d.id,mode:d.mode,metadata:d.metadata,allocations:d.allocations,distribution:d.distribution,vesting:d.vesting,lp:d.lp};}
export async function configurationFingerprint(input){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(configuration(input))));return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');}
