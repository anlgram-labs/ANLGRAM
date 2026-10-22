/**
 * ANLGRAM Factory — Deploy Script
 * 
 * This script:
 * 1. Compiles anlgram-factory.fc using @ton-community/func-js
 * 2. Fetches Jetton Minter + Wallet code from Mainnet (same as the existing deploy flow)
 * 3. Builds the factory stateInit
 * 4. Outputs the factory address + BOC for deployment
 * 
 * Usage:
 *   npx ts-node build/anlgram-factory.deploy.ts [testnet|mainnet]
 */

import * as fs from "fs";
import * as path from "path";
import axios from "axios";

// ── Config ────────────────────────────────────────────────────
const TREASURY_MAINNET = "UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd";
const TREASURY_TESTNET = "UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd"; // Use same for testnet by default
const SERVICE_RATE     = 70; // percent
const WORKCHAIN        = 0;

// Source of standard Jetton Minter code (same clone-source used in the frontend)
const CLONE_SOURCE_MAINNET = "0:30eb766a2e69f0440efb3d6d3b0962049e0c20f9e222cac6aa67c216a542f49c";

// ── Helpers ───────────────────────────────────────────────────
const hexToBytes = (hex: string) =>
  Uint8Array.from(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));

async function main() {
  const isTestnet = process.argv[2] === "testnet";
  const network   = isTestnet ? "testnet" : "mainnet";
  const apiBase   = isTestnet ? "https://testnet.tonapi.io" : "https://tonapi.io";
  const treasury  = isTestnet ? TREASURY_TESTNET : TREASURY_MAINNET;

  console.log("════════════════════════════════════════════════");
  console.log(`ANLGRAM Factory Deploy Script — ${network.toUpperCase()}`);
  console.log("════════════════════════════════════════════════");
  console.log(`Treasury  : ${treasury}`);
  console.log(`Rate      : ${SERVICE_RATE}%`);
  console.log("");

  // 1. Compile anlgram-factory.fc
  console.log("[ 1/4 ] Compiling anlgram-factory.fc ...");
  
  let factoryCode: string;
  
  // Check if we have a pre-compiled artifact
  const compiledPath = path.join(__dirname, "anlgram-factory.compiled.json");
  if (fs.existsSync(compiledPath)) {
    const compiled = JSON.parse(fs.readFileSync(compiledPath, "utf-8"));
    factoryCode = compiled.hex;
    console.log("       Found pre-compiled artifact: anlgram-factory.compiled.json");
  } else {
    // Attempt to compile with @ton-community/func-js
    try {
      const { compileFunc, Cell: FuncCell } = await import("@ton-community/func-js");
      
      const contractsDir = path.join(__dirname, "../contracts");
      const readFile = (filePath: string) => {
        const absPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(contractsDir, filePath);
        return fs.readFileSync(absPath, "utf-8");
      };

      const result = await compileFunc({
        targets: ["anlgram-factory.fc"],
        sources: (path_: string) => readFile(path_),
      });

      if (result.status === "error") {
        console.error("Compilation failed:", result.message);
        process.exit(1);
      }

      factoryCode = result.codeBoc;
      
      // Save compiled artifact
      fs.writeFileSync(compiledPath, JSON.stringify({ hex: factoryCode }, null, 2));
      console.log("       ✓ Compiled successfully → anlgram-factory.compiled.json");
    } catch (err: any) {
      console.error("Cannot compile: func-js not available.", err.message);
      console.log("");
      console.log("Please compile manually and place anlgram-factory.compiled.json in build/");
      process.exit(1);
    }
  }

  // 2. Fetch standard Jetton Minter + Wallet code from Mainnet
  //    (same technique as the existing frontend deployJettonWeb3())
  console.log("[ 2/4 ] Fetching standard Jetton code from Mainnet ...");
  
  let minterCodeHex: string;
  let walletCodeHex: string;
  
  try {
    const res = await axios.get(`https://tonapi.io/v2/blockchain/accounts/${CLONE_SOURCE_MAINNET}`);
    const { code, data } = res.data;
    
    if (!code || !data) {
      throw new Error("No code/data from TonAPI clone source");
    }
    
    minterCodeHex = code;
    
    // Extract wallet code from minter's data (4th ref = wallet_code)
    // We'll just use the raw hex for now — the deploy script will handle parsing
    walletCodeHex = data; // We'll extract wallet code in the actual deploy below
    
    console.log("       ✓ Fetched Jetton code from Mainnet");
  } catch (err: any) {
    console.error("Failed to fetch Jetton code:", err.message);
    process.exit(1);
  }

  // 3. Output instructions for manual deployment via TonConnect or mnemonic
  console.log("[ 3/4 ] Factory configuration:");
  console.log(`       Admin     : ${treasury} (same as treasury initially)`);
  console.log(`       Treasury  : ${treasury}`);
  console.log(`       Rate      : ${SERVICE_RATE}%`);
  console.log(`       Paused    : false`);
  console.log(`       Network   : ${network}`);
  console.log("");

  console.log("[ 4/4 ] Next steps:");
  console.log("");
  console.log("  The factory contract needs to be deployed via TON Connect.");
  console.log("  Run the browser-based deployment tool:");
  console.log(`  → Open: file:///e:/ANLGRAM/factory-deploy.html`);
  console.log("  → Connect your treasury wallet");
  console.log("  → Click 'Deploy Factory'");
  console.log("  → Copy the factory address");
  console.log(`  → Update ANLGRAM_CONFIG.FACTORY_${network.toUpperCase()} in launchpad.js`);
  console.log("");
  console.log("════════════════════════════════════════════════");
  
  // Write a deploy config for the browser tool
  const deployConfig = {
    network,
    treasury,
    serviceRate: SERVICE_RATE,
    factoryCodeHex: factoryCode,
    minterCodeHex,
    cloneSource: CLONE_SOURCE_MAINNET,
    timestamp: new Date().toISOString(),
  };
  
  const configPath = path.join(__dirname, "factory-deploy-config.json");
  fs.writeFileSync(configPath, JSON.stringify(deployConfig, null, 2));
  console.log(`Deploy config written: ${configPath}`);
}

main().catch(console.error);
