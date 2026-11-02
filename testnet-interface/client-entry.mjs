export * from '@tonconnect/ui';
// Same patched class that TonConnectUI imports; no alternate transport/test hook.
export {TonConnect} from '@tonconnect/sdk';

import execution from './execution-version.json' with {type:'json'};
export const curveExecutionVersion=execution.sha256;
