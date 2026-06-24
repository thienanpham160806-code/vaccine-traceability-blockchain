import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("Deploying vaccine traceability smart contracts...");
  console.log("Network:", network.name);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

  // Round 1: AccessControl + ImportVerifier in parallel (no dependencies)
  console.log("\n[Round 1] Deploying SupplyChainAccessControl + DemoImportZKPVerifier in parallel...");
  let nonce = await deployer.getNonce();

  const [AccessControlFactory, ImportVerifierFactory] = await Promise.all([
    ethers.getContractFactory("SupplyChainAccessControl"),
    ethers.getContractFactory("DemoImportZKPVerifier"),
  ]);

  const [accessControl, importVerifier] = await Promise.all([
    AccessControlFactory.deploy(deployer.address, { nonce: nonce }),
    ImportVerifierFactory.deploy({ nonce: nonce + 1 }),
  ]);

  await Promise.all([accessControl.waitForDeployment(), importVerifier.waitForDeployment()]);

  const accessControlAddress = await accessControl.getAddress();
  const importVerifierAddress = await importVerifier.getAddress();
  console.log("SupplyChainAccessControl:", accessControlAddress);
  console.log("DemoImportZKPVerifier:", importVerifierAddress);

  // Round 2: ProductRegistry (needs accessControlAddress)
  console.log("\n[Round 2] Deploying ProductRegistry...");
  nonce = await deployer.getNonce();

  const ProductRegistryFactory = await ethers.getContractFactory("ProductRegistry");
  const productRegistry = await ProductRegistryFactory.deploy(accessControlAddress, { nonce });
  await productRegistry.waitForDeployment();

  const productRegistryAddress = await productRegistry.getAddress();
  console.log("ProductRegistry:", productRegistryAddress);

  // Round 3: TransferLedger (needs productRegistryAddress + accessControlAddress)
  console.log("\n[Round 3] Deploying TransferLedger...");
  nonce = await deployer.getNonce();

  const TransferLedgerFactory = await ethers.getContractFactory("TransferLedger");
  const transferLedger = await TransferLedgerFactory.deploy(
    productRegistryAddress,
    accessControlAddress,
    { nonce }
  );
  await transferLedger.waitForDeployment();

  const transferLedgerAddress = await transferLedger.getAddress();
  console.log("TransferLedger:", transferLedgerAddress);

  // Round 4: 3 config txs in parallel
  console.log("\n[Round 4] Linking + configuring routes in parallel...");
  nonce = await deployer.getNonce();

  const [setLedgerTx, setImportVerifierTx, configureRoutesTx] = await Promise.all([
    productRegistry.setTransferLedger(transferLedgerAddress, { nonce }),
    productRegistry.setImportVerifier(importVerifierAddress, { nonce: nonce + 1 }),
    accessControl.configureMvpRoutes({ nonce: nonce + 2 }),
  ]);

  await Promise.all([setLedgerTx.wait(), setImportVerifierTx.wait(), configureRoutesTx.wait()]);
  console.log("ProductRegistry linked with TransferLedger and ImportVerifier");
  console.log("MVP routes configured");

  // Local dev: grant roles
  let localDemoRolesConfigured = false;

  if (network.name === "localhost" || network.name === "hardhat") {
    console.log("\n[Local] Granting demo roles...");

    const signers = await ethers.getSigners();
    const roleAssignments = [
      { label: "MANUFACTURER",     account: signers[0], role: await accessControl.MANUFACTURER_ROLE() },
      { label: "IMPORTER",         account: signers[1], role: await accessControl.IMPORTER_ROLE() },
      { label: "DISTRIBUTOR",      account: signers[2], role: await accessControl.DISTRIBUTOR_ROLE() },
      { label: "CLINIC",           account: signers[3], role: await accessControl.CLINIC_ROLE() },
      { label: "PHARMACY",         account: signers[4], role: await accessControl.PHARMACY_ROLE() },
      { label: "RECALL_AUTHORITY", account: signers[0], role: await accessControl.RECALL_AUTHORITY_ROLE() },
    ];

    for (const assignment of roleAssignments) {
      const tx = await accessControl.grantUserRole(assignment.account.address, assignment.role);
      await tx.wait();
      console.log(`${assignment.label}: ${assignment.account.address}`);
    }

    localDemoRolesConfigured = true;
  }

  const deploymentInfo = {
    network: network.name,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      supplyChainAccessControl: accessControlAddress,
      importVerifier: importVerifierAddress,
      productRegistry: productRegistryAddress,
      transferLedger: transferLedgerAddress,
    },
    setup: {
      transferLedgerLinked: true,
      importVerifierLinked: true,
      mvpRoutesConfigured: true,
      localDemoRolesConfigured,
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outputPath = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\nDeployment completed successfully.");
  console.log("Deployment info saved to:", outputPath);
  console.log("\nSummary:");
  console.log("SupplyChainAccessControl:", accessControlAddress);
  console.log("ImportVerifier:          ", importVerifierAddress);
  console.log("ProductRegistry:         ", productRegistryAddress);
  console.log("TransferLedger:          ", transferLedgerAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
