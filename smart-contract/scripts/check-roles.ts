import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

const roles = [
  "MANUFACTURER",
  "IMPORTER",
  "DISTRIBUTOR",
  "CLINIC",
  "PHARMACY",
  "RECALL_AUTHORITY",
] as const;

function getAccessControlAddress() {
  const explicit = process.env.ACCESS_CONTROL_ADDRESS;
  if (explicit) return explicit;

  const deploymentPath = path.join(
    __dirname,
    "..",
    "deployments",
    `${network.name}.json`
  );
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  return deployment.contracts.supplyChainAccessControl;
}

async function main() {
  const account = process.env.ACCOUNT;
  if (!account || !ethers.isAddress(account)) {
    throw new Error("Set ACCOUNT to a valid address");
  }

  const accessControlAddress = getAccessControlAddress();
  const accessControl = await ethers.getContractAt(
    "SupplyChainAccessControl",
    accessControlAddress
  );

  console.log("Network:", network.name);
  console.log("AccessControl:", accessControlAddress);
  console.log("Account:", account);

  for (const role of roles) {
    const roleHash = await accessControl[`${role}_ROLE`]();
    const hasRole = await accessControl.hasRole(roleHash, account);
    console.log(`${role}: ${hasRole ? "yes" : "no"}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
