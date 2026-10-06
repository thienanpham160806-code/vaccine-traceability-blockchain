import { ethers } from "hardhat";

/**
 * Measures real gasUsed (from transaction receipts on the in-process Hardhat
 * network) for the main write paths, and checks how recallBatch and the
 * batch read helpers scale with batch size.
 *
 *   npx hardhat run scripts/gas-benchmark.ts
 *
 * Numbers depend on compiler settings in hardhat.config.ts (solc 0.8.28,
 * viaIR, optimizer runs = 1).
 */

const BATCH_SIZES = [1, 10, 100, 500];

async function deploy() {
  const [admin, manufacturer, distributor, clinic, recallAuthority] = await ethers.getSigners();

  const accessControl = await (await ethers.getContractFactory("SupplyChainAccessControl")).deploy(admin.address);
  const registry = await (await ethers.getContractFactory("ProductRegistry")).deploy(await accessControl.getAddress());
  const ledger = await (await ethers.getContractFactory("TransferLedger")).deploy(
    await registry.getAddress(),
    await accessControl.getAddress()
  );
  await registry.setTransferLedger(await ledger.getAddress());

  await accessControl.grantUserRole(manufacturer.address, await accessControl.MANUFACTURER_ROLE());
  await accessControl.grantUserRole(distributor.address, await accessControl.DISTRIBUTOR_ROLE());
  await accessControl.grantUserRole(clinic.address, await accessControl.CLINIC_ROLE());
  await accessControl.grantUserRole(recallAuthority.address, await accessControl.RECALL_AUTHORITY_ROLE());
  await accessControl.configureMvpRoutes();

  return { registry, ledger, manufacturer, distributor, clinic, recallAuthority };
}

async function gasOf(txPromise: Promise<any>): Promise<bigint> {
  const receipt = await (await txPromise).wait();
  return receipt.gasUsed;
}

async function main() {
  const { registry, ledger, manufacturer, distributor, clinic, recallAuthority } = await deploy();
  const META = ethers.id("META");
  const LOC_A = ethers.id("LOC-A");
  const LOC_B = ethers.id("LOC-B");
  const LOC_C = ethers.id("LOC-C");

  // --- Single-product lifecycle -------------------------------------------
  const batch = ethers.id("BATCH-LIFECYCLE");
  const s1 = ethers.id("S-1");
  const s2 = ethers.id("S-2");
  const reg = registry.connect(manufacturer);

  const registerFirst = await gasOf(reg.registerProduct(s1, batch, META, ethers.ZeroHash, "0x"));
  const registerNext = await gasOf(reg.registerProduct(s2, batch, META, ethers.ZeroHash, "0x"));

  const createFirst = await gasOf(
    ledger.connect(manufacturer).createTransferRequest(s1, distributor.address, LOC_A, LOC_B)
  );
  const confirmFirst = await gasOf(ledger.connect(distributor).confirmTransfer(s1, LOC_B));
  const createSecondHop = await gasOf(
    ledger.connect(distributor).createTransferRequest(s1, clinic.address, LOC_B, LOC_C)
  );
  const confirmSecondHop = await gasOf(ledger.connect(clinic).confirmTransfer(s1, LOC_C));

  await ledger.connect(manufacturer).createTransferRequest(s2, distributor.address, LOC_A, LOC_B);
  const reject = await gasOf(ledger.connect(distributor).rejectTransfer(s2, ethers.id("DAMAGED")));

  console.log("\n## Single-product lifecycle (gasUsed)");
  console.log(`registerProduct (first serial in batch)   ${registerFirst}`);
  console.log(`registerProduct (next serial, same batch) ${registerNext}`);
  console.log(`createTransferRequest (first hop)         ${createFirst}`);
  console.log(`confirmTransfer (first hop)               ${confirmFirst}`);
  console.log(`createTransferRequest (second hop)        ${createSecondHop}`);
  console.log(`confirmTransfer (second hop)              ${confirmSecondHop}`);
  console.log(`rejectTransfer                            ${reject}`);

  // --- recallBatch vs batch size ------------------------------------------
  console.log("\n## recallBatch and batch reads vs batch size");
  console.log("size | recallBatch gasUsed | getBatchSerials eth_call gas | getBatchSize eth_call gas");
  for (const size of BATCH_SIZES) {
    const b = ethers.id(`BATCH-${size}`);
    for (let i = 0; i < size; i++) {
      await reg.registerProduct(ethers.id(`B${size}-S${i}`), b, META, ethers.ZeroHash, "0x");
    }
    const serialsCallGas = await registry.getBatchSerials.estimateGas(b);
    const sizeCallGas = await registry.getBatchSize.estimateGas(b);
    const recall = await gasOf(registry.connect(recallAuthority).recallBatch(b, ethers.id("RECALL")));
    console.log(`${size} | ${recall} | ${serialsCallGas} | ${sizeCallGas}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
