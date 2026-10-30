'use strict';

// This older executor attempts to fetch its local WASM binary in recent Node
// versions. Use its synchronous in-process runner for deterministic TVM tests.
delete globalThis.fetch;
delete WebAssembly.instantiateStreaming;
const { TvmRunnerAsynchronous, TvmRunnerSynchronous } = require('ton-contract-executor/dist/executor/TvmRunner');
TvmRunnerAsynchronous.getShared = () => new TvmRunnerSynchronous();
