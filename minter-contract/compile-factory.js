/**
 * ANLGRAM Factory — In-Node Compilation Script
 * Compiles anlgram-factory.fc using @ton-community/func-js
 * No local func/fift installation required
 */
const path = require("path");
const fs   = require("fs");

async function compile() {
  console.log("Importing @ton-community/func-js ...");
  const { compileFunc } = require("@ton-community/func-js");
  
  const contractsDir = path.join(__dirname, "contracts");
  console.log("Contracts dir:", contractsDir);
  
  // Read source files
  const sources = (filePath) => {
    // func-js calls this with relative paths from the target file
    let absPath;
    if (filePath.startsWith("/") || filePath.includes(":")) {
      absPath = filePath;
    } else {
      absPath = path.join(contractsDir, filePath);
    }
    
    if (!fs.existsSync(absPath)) {
      throw new Error(`Source file not found: ${absPath}`);
    }
    return fs.readFileSync(absPath, "utf-8");
  };
  
  console.log("Compiling anlgram-factory.fc ...");
  
  const result = await compileFunc({
    targets: ["anlgram-factory.fc"],
    sources,
  });
  
  if (result.status === "error") {
    console.error("COMPILATION FAILED:");
    console.error(result.message);
    process.exit(1);
  }
  
  const outputPath = path.join(__dirname, "build", "anlgram-factory.compiled.json");
  fs.mkdirSync(path.join(__dirname, "build"), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ hex: result.codeBoc }, null, 2));
  
  console.log("SUCCESS! Compiled to:", outputPath);
  console.log("Code BOC length:", result.codeBoc.length, "chars");
  
  return result.codeBoc;
}

compile().catch(err => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
