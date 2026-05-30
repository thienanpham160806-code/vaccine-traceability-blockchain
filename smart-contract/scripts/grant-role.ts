import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

const supportedRoles = [
  "MANUFACTURER",
  "IMPORTER",
  "DISTRIBUTOR",
  "CLINIC",
  "PHARMACY",
  "RECALL_AUTHORITY",
] as const;

type SupportedRole = (typeof supportedRoles)[number];

function getAccessControlAddress() {
  const explicit = process.env.ACCESS_CONTROL_ADDRESS;
  if (explicit) return explicit;

  const deploymentPath = path.join(
    __dirname,
    "..",
    "deployments",
    `${network.name}.json`
  );

  if (!fs.existsSync(deploymentPath)) {
    throw new Error(
      `Missing ACCESS_CONTROL_ADDRESS and deployment file ${deploymentPath}`
    );
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const address = deployment.contracts?.supplyChainAccessControl;
  if (!address) {
    throw new Error(`Deployment file does not include supplyChainAccessControl`);
  }

  return address;
}

function parseAssignments() {
  const role = process.env.ROLE?.toUpperCase() as SupportedRole | undefined;
  const account = process.env.ACCOUNT;

  if (role || account) {
    if (!role || !supportedRoles.includes(role)) {
      throw new Error(`ROLE must be one of: ${supportedRoles.join(", ")}`);
    }
    if (!account || !ethers.isAddress(account)) {
      throw new Error("ACCOUNT must be a valid Ethereum address");
    }
    return [{ role, account }];
  }

  const assignments = supportedRoles
    .map((item) => {
      const value = process.env[`${item}_ADDRESS`];
      return value ? { role: item, account: value } : null;
    })
    .filter(Boolean) as Array<{ role: SupportedRole; account: string }>;

  if (assignments.length === 0) {
    throw new Error(
      "Provide ROLE + ACCOUNT, or role address envs like MANUFACTURER_ADDRESS"
    );
  }

  for (const assignment of assignments) {
    if (!ethers.isAddress(assignment.account)) {
      throw new Error(`${assignment.role}_ADDRESS is not a valid address`);
    }
  }

  return assignments;
}

async function main() {
  console.log("Granting role(s) on", network.name);

  const [admin] = await ethers.getSigners();
  const accessControlAddress = getAccessControlAddress();
  const accessControl = await ethers.getContractAt(
    "SupplyChainAccessControl",
    accessControlAddress
  );

  console.log("Admin:", admin.address);
  console.log("AccessControl:", accessControlAddress);

  for (const assignment of parseAssignments()) {
    const roleHash = await accessControl[`${assignment.role}_ROLE`]();
    const hasRole = await accessControl.hasRole(roleHash, assignment.account);

    if (hasRole) {
      console.log(`${assignment.role}: ${assignment.account} already granted`);
      continue;
    }

    const tx = await accessControl.grantUserRole(assignment.account, roleHash);
    await tx.wait();
    console.log(`${assignment.role}: ${assignment.account} granted (${tx.hash})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
