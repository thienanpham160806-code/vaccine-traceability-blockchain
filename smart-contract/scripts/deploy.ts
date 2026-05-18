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

  console.log("\n2. Deploying ProductRegistry...");

  const ProductRegistryFactory = await ethers.getContractFactory(
    "ProductRegistry"
  );

  const productRegistry = await ProductRegistryFactory.deploy(
    accessControlAddress
  );

  await productRegistry.waitForDeployment();

  const productRegistryAddress = await productRegistry.getAddress();

  console.log("ProductRegistry:", productRegistryAddress);

  console.log("\n3. Deploying TransferLedger...");

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

  console.log("\n4. Linking TransferLedger to ProductRegistry...");

  const setLedgerTx = await productRegistry.setTransferLedger(
    transferLedgerAddress
  );

  await setLedgerTx.wait();

  console.log("ProductRegistry linked with TransferLedger");

  console.log("\n5. Configuring MVP routes...");

  const configureRoutesTx = await accessControl.configureMvpRoutes();
  await configureRoutesTx.wait();

  console.log("MVP routes configured");

  const deploymentInfo = {
    network: network.name,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      supplyChainAccessControl: accessControlAddress,
      productRegistry: productRegistryAddress,
      transferLedger: transferLedgerAddress,
    },
    setup: {
      transferLedgerLinked: true,
      mvpRoutesConfigured: true,
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
  console.log("ProductRegistry:", productRegistryAddress);
  console.log("TransferLedger:", transferLedgerAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});