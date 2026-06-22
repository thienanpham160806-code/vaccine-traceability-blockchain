import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

type DeploymentInfo = {
  contracts?: {
    supplyChainAccessControl?: string;
  };
};

async function main() {
  const deploymentPath = path.join(
    __dirname,
    "..",
    "deployments",
    `${network.name}.json`
  );

  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }

  const deployment = JSON.parse(
    fs.readFileSync(deploymentPath, "utf8")
  ) as DeploymentInfo;
  const accessControlAddress =
    deployment.contracts?.supplyChainAccessControl;

  if (!accessControlAddress) {
    throw new Error(
      `SupplyChainAccessControl address is missing in ${deploymentPath}`
    );
  }

  const accessControl = await ethers.getContractAt(
    "SupplyChainAccessControl",
    accessControlAddress
  );
  const [signer] = await ethers.getSigners();

  console.log(`Configuring transfer routes on ${network.name}`);
  console.log(`Admin signer: ${signer.address}`);
  console.log(`Access control: ${accessControlAddress}`);

  const manufacturer = await accessControl.MANUFACTURER_ROLE();
  const importer = await accessControl.IMPORTER_ROLE();
  const distributor = await accessControl.DISTRIBUTOR_ROLE();
  const clinic = await accessControl.CLINIC_ROLE();
  const pharmacy = await accessControl.PHARMACY_ROLE();

  const routes = [
    ["MANUFACTURER -> IMPORTER", manufacturer, importer, false],
    ["MANUFACTURER -> DISTRIBUTOR", manufacturer, distributor, true],
    ["IMPORTER -> DISTRIBUTOR", importer, distributor, true],
    ["DISTRIBUTOR -> DISTRIBUTOR", distributor, distributor, false],
    ["DISTRIBUTOR -> CLINIC", distributor, clinic, true],
    ["DISTRIBUTOR -> PHARMACY", distributor, pharmacy, true],
  ] as const;

  const transactionHashes: string[] = [];
  for (const [label, fromRole, toRole, allowed] of routes) {
    const current = await accessControl.isValidRoute(fromRole, toRole);
    if (current === allowed) {
      console.log(`${label}: already ${allowed ? "enabled" : "disabled"}`);
      continue;
    }

    const tx = await accessControl.setRoute(fromRole, toRole, allowed);
    await tx.wait();
    transactionHashes.push(tx.hash);
    console.log(`${label}: ${allowed ? "enabled" : "disabled"} (${tx.hash})`);
  }

  for (const [label, fromRole, toRole, expected] of routes) {
    const actual = await accessControl.isValidRoute(fromRole, toRole);
    if (actual !== expected) {
      throw new Error(
        `Route verification failed for ${label}: expected ${expected}, got ${actual}`
      );
    }
    console.log(`${label}: ${actual ? "enabled" : "disabled"}`);
  }

  console.log(
    transactionHashes.length > 0
      ? `Route matrix updated with ${transactionHashes.length} transaction(s).`
      : "Route matrix was already up to date."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
