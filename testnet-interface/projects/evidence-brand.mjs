// Process-local capability for internal adapters, not persisted evidence or a
// ledger. After deserialization/restart the raw proof must be verified again.
const checkpoints=new WeakSet();
export const isMigrationCheckpoint=x=>!!x&&checkpoints.has(x);
export function rememberMigrationCheckpoint(value){checkpoints.add(value);return value;}
