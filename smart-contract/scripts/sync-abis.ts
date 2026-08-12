import fs from "fs";
import path from "path";

/**
 * Copies the compiled ABI (just the `.abi` array, matching the format
 * already committed under smart-contract/abis/ and backend/src/contracts/abis/)
 * from Hardhat's build artifacts to both locations that read it.
 *
 * Run this after every `npm run compile` (or right after a fresh deploy) so
 * the backend/frontend never drift from the on-chain contract ABI again —
 * this script exists because that drift is exactly what happened before:
 * lot-Merkle functions were added to the Solidity source but never synced
 * down to backend/src/contracts/abis/, so contractClient couldn't see them.
 */

const CONTRACTS = ["ProductRegistry", "TransferLedger", "SupplyChainAccessControl", "ColdChainRegistry"];

const artifactsDir = path.join(__dirname, "..", "artifacts", "contracts");
const targets = [
  path.join(__dirname, "..", "abis"),
  path.join(__dirname, "..", "..", "backend", "src", "contracts", "abis"),
];

for (const target of targets) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

let failures = 0;

for (const name of CONTRACTS) {
  const artifactPath = path.join(artifactsDir, `${name}.sol`, `${name}.json`);

  if (!fs.existsSync(artifactPath)) {
    console.error(`✗ ${name}: artifact not found at ${artifactPath} (did you run "npm run compile"?)`);
    failures += 1;
    continue;
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

  if (!Array.isArray(artifact.abi)) {
    console.error(`✗ ${name}: artifact has no "abi" array`);
    failures += 1;
    continue;
  }

  const serialized = JSON.stringify(artifact.abi, null, 2) + "\n";

  for (const target of targets) {
    fs.writeFileSync(path.join(target, `${name}.json`), serialized);
  }

  console.log(`✓ ${name}: synced to ${targets.length} location(s)`);
}

if (failures > 0) {
  console.error(`\n${failures} contract(s) failed to sync.`);
  process.exitCode = 1;
} else {
  console.log("\nAll ABIs synced successfully.");
}
