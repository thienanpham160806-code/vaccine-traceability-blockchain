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

  console.log("\n1. Deploying SupplyChainAccessControl...");

  const AccessControlFactory = await ethers.getContractFactory(
    "SupplyChainAccessControl"
  );

  const accessControl = await AccessControlFactory.deploy(deployer.address);
  await accessControl.waitForDeployment();

  const accessControlAddress = await accessControl.getAddress();

  console.log("SupplyChainAccessControl:", accessControlAddress);

  console.log("\n2. Deploying DemoImportZKPVerifier...");

  const ImportVerifierFactory = await ethers.getContractFactory(
    "DemoImportZKPVerifier"
  );

  const importVerifier = await ImportVerifierFactory.deploy();
  await importVerifier.waitForDeployment();

  const importVerifierAddress = await importVerifier.getAddress();

  console.log("DemoImportZKPVerifier:", importVerifierAddress);

  console.log("\n3. Deploying ProductRegistry...");

  const ProductRegistryFactory = await ethers.getContractFactory(
    "ProductRegistry"
  );

  const productRegistry = await ProductRegistryFactory.deploy(
    accessControlAddress
  );

  await productRegistry.waitForDeployment();

  const productRegistryAddress = await productRegistry.getAddress();

  console.log("ProductRegistry:", productRegistryAddress);

  console.log("\n4. Deploying TransferLedger...");

  const TransferLedgerFactory = await ethers.getContractFactory(
    "TransferLedger"
  );

  const transferLedger = await TransferLedgerFactory.deploy(
    productRegistryAddress,
    accessControlAddress
  );

  await transferLedger.waitForDeployment();

  const transferLedgerAddress = await transferLedger.getAddress();

  console.log("TransferLedger:", transferLedgerAddress);

  console.log("\n5. Linking TransferLedger and ImportVerifier to ProductRegistry...");

  const setLedgerTx = await productRegistry.setTransferLedger(
    transferLedgerAddress
  );

  await setLedgerTx.wait();

  console.log("ProductRegistry linked with TransferLedger");

  const setImportVerifierTx = await productRegistry.setImportVerifier(
    importVerifierAddress
  );

  await setImportVerifierTx.wait();

  console.log("ProductRegistry linked with DemoImportZKPVerifier");

  console.log("\n6. Configuring MVP routes...");

  const configureRoutesTx = await accessControl.configureMvpRoutes();
  await configureRoutesTx.wait();

  console.log("MVP routes configured");

  let localDemoRolesConfigured = false;

  if (network.name === "localhost" || network.name === "hardhat") {
    console.log("\n7. Granting local demo roles...");

    const signers = await ethers.getSigners();
    const roleAssignments = [
      {
        label: "MANUFACTURER",
        account: signers[0],
        role: await accessControl.MANUFACTURER_ROLE(),
      },
      {
        label: "IMPORTER",
        account: signers[1],
        role: await accessControl.IMPORTER_ROLE(),
      },
      {
        label: "DISTRIBUTOR",
        account: signers[2],
        role: await accessControl.DISTRIBUTOR_ROLE(),
      },
      {
        label: "CLINIC",
        account: signers[3],
        role: await accessControl.CLINIC_ROLE(),
      },
      {
        label: "PHARMACY",
        account: signers[4],
        role: await accessControl.PHARMACY_ROLE(),
      },
      {
        label: "RECALL_AUTHORITY",
        account: signers[0],
        role: await accessControl.RECALL_AUTHORITY_ROLE(),
      },
    ];

    for (const assignment of roleAssignments) {
      const tx = await accessControl.grantUserRole(
        assignment.account.address,
        assignment.role
      );
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
  console.log("ImportVerifier:", importVerifierAddress);
  console.log("ProductRegistry:", productRegistryAddress);
  console.log("TransferLedger:", transferLedgerAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
