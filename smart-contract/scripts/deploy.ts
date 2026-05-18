import { ethers } from "hardhat";

async function main() {
  console.log("Deploying contracts to local Hardhat network...\n");

  const [deployer, importer, distributor, clinic, pharmacy] = await ethers.getSigners();
  console.log(`Deploying with: ${deployer.address}`);

  try {
    console.log("\n1. Deploying SupplyChainAccessControl...");
    const AccessControl = await ethers.getContractFactory("SupplyChainAccessControl");
    const accessControl = await AccessControl.deploy(deployer.address);
    await accessControl.waitForDeployment();
    const accessControlAddr = await accessControl.getAddress();
    console.log(`OK ${accessControlAddr}`);

    console.log("\n2. Deploying ProductRegistry...");
    const ProductRegistry = await ethers.getContractFactory("ProductRegistry");
    const productRegistry = await ProductRegistry.deploy(accessControlAddr);
    await productRegistry.waitForDeployment();
    const productRegistryAddr = await productRegistry.getAddress();
    console.log(`OK ${productRegistryAddr}`);

    console.log("\n3. Deploying TransferLedger...");
    const TransferLedger = await ethers.getContractFactory("TransferLedger");
    const transferLedger = await TransferLedger.deploy(productRegistryAddr, accessControlAddr);
    await transferLedger.waitForDeployment();
    const transferLedgerAddr = await transferLedger.getAddress();
    console.log(`OK ${transferLedgerAddr}`);

    console.log("\n4. Linking TransferLedger to ProductRegistry...");
    await productRegistry.setTransferLedger(transferLedgerAddr);
    console.log("OK linked");

    console.log("\n5. Configuring local roles and MVP routes...");
    await accessControl.grantUserRole(deployer.address, await accessControl.MANUFACTURER_ROLE());
    await accessControl.grantUserRole(importer.address, await accessControl.IMPORTER_ROLE());
    await accessControl.grantUserRole(distributor.address, await accessControl.DISTRIBUTOR_ROLE());
    await accessControl.grantUserRole(clinic.address, await accessControl.CLINIC_ROLE());
    await accessControl.grantUserRole(pharmacy.address, await accessControl.PHARMACY_ROLE());
    await accessControl.grantUserRole(deployer.address, await accessControl.RECALL_AUTHORITY_ROLE());
    await accessControl.configureMvpRoutes();
    console.log("OK roles granted and routes configured");

    console.log("\n" + "=".repeat(70));
    console.log("Copy these to backend/.env:");
    console.log("=".repeat(70));
    console.log(`PRODUCT_REGISTRY_ADDRESS=${productRegistryAddr}`);
    console.log(`TRANSFER_LEDGER_ADDRESS=${transferLedgerAddr}`);
    console.log(`ACCESS_CONTROL_ADDRESS=${accessControlAddr}`);
    console.log("BACKEND_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    console.log("=".repeat(70) + "\n");

    console.log("Local actor addresses:");
    console.log(`MANUFACTURER=${deployer.address}`);
    console.log(`IMPORTER=${importer.address}`);
    console.log(`DISTRIBUTOR=${distributor.address}`);
    console.log(`CLINIC=${clinic.address}`);
    console.log(`PHARMACY=${pharmacy.address}`);
  } catch (error) {
    console.error("Deploy error:", error);
    process.exit(1);
  }
}

main();
