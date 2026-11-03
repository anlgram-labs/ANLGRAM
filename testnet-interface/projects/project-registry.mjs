import {generation2Status} from './migration-status.mjs';

export function registryStub(fingerprint, env) {
  const ns = env.PROJECT_REGISTRY;
  if (!/^[a-f0-9]{64}$/.test(fingerprint || '') || !ns?.get || !ns?.idFromName) return null;
  return ns.get(ns.idFromName(fingerprint));
}

// The public route can only resolve an exact configuration key. It cannot
// pass records, receipt fields, account addresses or proof material to the DO.
export async function readRegisteredProjectStatus(fingerprint, env = {}) {
  const stub = registryStub(fingerprint, env);
  if (!stub) return null;
  const response = await stub.fetch('https://project-registry.internal/' + fingerprint + '/status');
  if (response.status === 404) return null;
  if (!response.ok) throw Error('Project registry unavailable');
  return response.json();
}

export function projectStatusResponse(record, options, acquisition) {
  const projection = generation2Status(record, options);
  return {
    ...projection, network: '-3', configurationFingerprint: record.configurationFingerprint,
    creationEnabled: false, status: projection, acquisition
  };
}
