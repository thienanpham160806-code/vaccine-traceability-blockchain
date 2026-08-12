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

  // Deploys/txs below are sent sequentially (await each one, letting the
  // provider assign nonces automatically) rather than raced in parallel
  // with explicit nonces. Sending multiple explicit-nonce transactions via
  // Promise.all can arrive at an automining node out of order over HTTP,
  // which trips "Nonce too high" errors; sequential sends are immune to
  // that and this is a one-off setup script, not a hot path, so the extra
  // round trips don't matter.

  // Round 1: AccessControl + ImportVerifier + ColdChainVerifier
  console.log("\n[Round 1] Deploying SupplyChainAccessControl + DemoImportZKPVerifier + MockColdChainVerifier...");

  const AccessControlFactory = await ethers.getContractFactory("SupplyChainAccessControl");
  const accessControl = await AccessControlFactory.deploy(deployer.address);
  await accessControl.waitForDeployment();
  const accessControlAddress = await accessControl.getAddress();
  console.log("SupplyChainAccessControl:", accessControlAddress);

  const ImportVerifierFactory = await ethers.getContractFactory("DemoImportZKPVerifier");
  const importVerifier = await ImportVerifierFactory.deploy();
  await importVerifier.waitForDeployment();
  const importVerifierAddress = await importVerifier.getAddress();
  console.log("DemoImportZKPVerifier:", importVerifierAddress);

  const ColdChainVerifierFactory = await ethers.getContractFactory("MockColdChainVerifier");
  const coldChainVerifier = await ColdChainVerifierFactory.deploy();
  await coldChainVerifier.waitForDeployment();
  const coldChainVerifierAddress = await coldChainVerifier.getAddress();
  console.log("MockColdChainVerifier:", coldChainVerifierAddress);

  // Round 2: ProductRegistry (needs accessControlAddress)
  console.log("\n[Round 2] Deploying ProductRegistry...");

  const ProductRegistryFactory = await ethers.getContractFactory("ProductRegistry");
  const productRegistry = await ProductRegistryFactory.deploy(accessControlAddress);
  await productRegistry.waitForDeployment();

  const productRegistryAddress = await productRegistry.getAddress();
  console.log("ProductRegistry:", productRegistryAddress);

  // Round 3: TransferLedger + ColdChainRegistry (both need productRegistryAddress + accessControlAddress)
  console.log("\n[Round 3] Deploying TransferLedger + ColdChainRegistry...");

  const TransferLedgerFactory = await ethers.getContractFactory("TransferLedger");
  const transferLedger = await TransferLedgerFactory.deploy(productRegistryAddress, accessControlAddress);
  await transferLedger.waitForDeployment();
  const transferLedgerAddress = await transferLedger.getAddress();
  console.log("TransferLedger:", transferLedgerAddress);

  const ColdChainRegistryFactory = await ethers.getContractFactory("ColdChainRegistry");
  const coldChainRegistry = await ColdChainRegistryFactory.deploy(accessControlAddress, productRegistryAddress);
  await coldChainRegistry.waitForDeployment();
  const coldChainRegistryAddress = await coldChainRegistry.getAddress();
  console.log("ColdChainRegistry:", coldChainRegistryAddress);

  // Round 4: linking + route configuration
  console.log("\n[Round 4] Linking + configuring routes...");

  await (await productRegistry.setTransferLedger(transferLedgerAddress)).wait();
  await (await productRegistry.setImportVerifier(importVerifierAddress)).wait();
  await (await accessControl.configureMvpRoutes()).wait();
  await (await transferLedger.setColdChainRegistry(coldChainRegistryAddress)).wait();
  await (await coldChainRegistry.setTransferLedger(transferLedgerAddress)).wait();
  await (await coldChainRegistry.setVerifier(coldChainVerifierAddress)).wait();

  console.log("ProductRegistry linked with TransferLedger and ImportVerifier");
  console.log("TransferLedger linked with ColdChainRegistry");
  console.log("ColdChainRegistry linked with TransferLedger and MockColdChainVerifier");
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
      coldChainRegistry: coldChainRegistryAddress,
      coldChainVerifier: coldChainVerifierAddress,
    },
    setup: {
      transferLedgerLinked: true,
      importVerifierLinked: true,
      mvpRoutesConfigured: true,
      coldChainRegistryLinked: true,
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
  console.log("ColdChainRegistry:       ", coldChainRegistryAddress);
  console.log("ColdChainVerifier:       ", coldChainVerifierAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
