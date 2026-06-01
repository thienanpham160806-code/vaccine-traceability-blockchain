const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const buildDir = path.join(root, "zkp-artifacts", "import-registration");
const circuit = path.join(root, "circuits", "import_registration.circom");
const ptau = path.join(buildDir, "powersOfTau28_hez_final_12.ptau");

fs.mkdirSync(buildDir, { recursive: true });

function run(command, args) {
  console.log(`> ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
}

console.log("This script expects the circom binary to be installed on PATH.");
console.log("It compiles the importer registration circuit and prepares Groth16 artifacts.");

run("circom", [circuit, "--r1cs", "--wasm", "--sym", "-o", buildDir]);

if (!fs.existsSync(ptau)) {
  console.log("");
  console.log("Missing ptau file:");
  console.log(ptau);
  console.log("Download a powersOfTau28_hez_final_12.ptau file into that path, then rerun this script.");
  process.exit(1);
}

const r1cs = path.join(buildDir, "import_registration.r1cs");
const zkey0 = path.join(buildDir, "import_registration_0000.zkey");
const zkeyFinal = path.join(buildDir, "import_registration_final.zkey");
const verifier = path.join(root, "contracts", "verifiers", "ImportRegistrationGroth16Verifier.sol");
const vkey = path.join(buildDir, "verification_key.json");

run("npx", ["snarkjs", "groth16", "setup", r1cs, ptau, zkey0]);
run("npx", ["snarkjs", "zkey", "contribute", zkey0, zkeyFinal, "--name=demo-import-registration", "-v", "-e=demo entropy"]);
run("npx", ["snarkjs", "zkey", "export", "verificationkey", zkeyFinal, vkey]);
run("npx", ["snarkjs", "zkey", "export", "solidityverifier", zkeyFinal, verifier]);

console.log("");
console.log("ZKP artifacts written to:", buildDir);
console.log("Solidity verifier written to:", verifier);
