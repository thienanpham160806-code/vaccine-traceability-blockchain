import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * Critical-path coverage for the branches that matter most in a vaccine
 * supply chain and that the original suites did not exercise:
 *
 * - role changes (revoke, primary-role switch) and their effect on transfers
 * - two-step transfer rejections (every guard in createTransferRequest /
 *   confirmTransfer / rejectTransfer)
 * - double-scan detection (DoubleScanDetected event, window + location rules)
 * - recall interacting with in-flight transfers and the read-side getters
 * - flag / unflag lifecycle and the ZK import-registration path
 *
 * These tests describe the contracts as they are; they do not change logic.
 */
describe("Critical paths", function () {
  let accessControl: any;
  let registry: any;
  let ledger: any;

  let admin: any;
  let manufacturer: any;
  let importer: any;
  let distributor: any;
  let distributor2: any;
  let clinic: any;
  let recallAuthority: any;
  let stranger: any;

  let MANUFACTURER_ROLE: string;
  let IMPORTER_ROLE: string;
  let DISTRIBUTOR_ROLE: string;
  let CLINIC_ROLE: string;
  let PHARMACY_ROLE: string;
  let RECALL_AUTHORITY_ROLE: string;

  const BATCH = ethers.id("BATCH-CP-001");
  const META = ethers.id("META-CP");
  const LOC_FACTORY = ethers.id("LOC-FACTORY");
  const LOC_WAREHOUSE = ethers.id("LOC-WAREHOUSE");
  const LOC_WAREHOUSE_2 = ethers.id("LOC-WAREHOUSE-2");
  const LOC_CLINIC = ethers.id("LOC-CLINIC");

  // ProductRegistry.Status
  const VERIFIED = 1n;
  const IN_TRANSIT = 2n;
  const DELIVERED = 3n;
  const FLAGGED = 4n;
  const RECALLED = 5n;

  const serial = (n: number) => ethers.id(`SERIAL-CP-${n}`);

  async function register(n: number, batch = BATCH) {
    await registry
      .connect(manufacturer)
      .registerProduct(serial(n), batch, META, ethers.ZeroHash, "0x");
    return serial(n);
  }

  function shipToDistributor(id: string) {
    return ledger
      .connect(manufacturer)
      .createTransferRequest(id, distributor.address, LOC_FACTORY, LOC_WAREHOUSE);
  }

  beforeEach(async function () {
    [admin, manufacturer, importer, distributor, distributor2, clinic, recallAuthority, stranger] =
      await ethers.getSigners();

    accessControl = await (await ethers.getContractFactory("SupplyChainAccessControl")).deploy(admin.address);
    registry = await (await ethers.getContractFactory("ProductRegistry")).deploy(await accessControl.getAddress());
    ledger = await (await ethers.getContractFactory("TransferLedger")).deploy(
      await registry.getAddress(),
      await accessControl.getAddress()
    );

    MANUFACTURER_ROLE = await accessControl.MANUFACTURER_ROLE();
    IMPORTER_ROLE = await accessControl.IMPORTER_ROLE();
    DISTRIBUTOR_ROLE = await accessControl.DISTRIBUTOR_ROLE();
    CLINIC_ROLE = await accessControl.CLINIC_ROLE();
    PHARMACY_ROLE = await accessControl.PHARMACY_ROLE();
    RECALL_AUTHORITY_ROLE = await accessControl.RECALL_AUTHORITY_ROLE();

    await accessControl.grantUserRole(manufacturer.address, MANUFACTURER_ROLE);
    await accessControl.grantUserRole(importer.address, IMPORTER_ROLE);
    await accessControl.grantUserRole(distributor.address, DISTRIBUTOR_ROLE);
    await accessControl.grantUserRole(distributor2.address, DISTRIBUTOR_ROLE);
    await accessControl.grantUserRole(clinic.address, CLINIC_ROLE);
    await accessControl.grantUserRole(recallAuthority.address, RECALL_AUTHORITY_ROLE);
    await accessControl.configureMvpRoutes();

    await registry.setTransferLedger(await ledger.getAddress());
  });

  describe("Role changes", function () {
    it("a manufacturer whose role is revoked can no longer register products", async function () {
      await accessControl.revokeUserRole(manufacturer.address, MANUFACTURER_ROLE);

      await expect(
        registry.connect(manufacturer).registerProduct(serial(1), BATCH, META, ethers.ZeroHash, "0x")
      ).to.be.revertedWith("Not manufacturer or importer");
    });

    it("an owner whose role is revoked via revokeUserRole can no longer initiate transfers", async function () {
      const id = await register(1);
      await accessControl.revokeUserRole(manufacturer.address, MANUFACTURER_ROLE);

      await expect(
        ledger.connect(manufacturer).createTransferRequest(id, distributor.address, LOC_FACTORY, LOC_WAREHOUSE)
      ).to.be.revertedWith("Sender has no role");
    });

    it("a receiver whose role is revoked can no longer be sent products", async function () {
      const id = await register(1);
      await accessControl.revokeUserRole(distributor.address, DISTRIBUTOR_ROLE);

      await expect(
        ledger.connect(manufacturer).createTransferRequest(id, distributor.address, LOC_FACTORY, LOC_WAREHOUSE)
      ).to.be.revertedWith("Receiver has no role");
    });

    it("revoking a secondary role keeps the primary role", async function () {
      await accessControl.grantUserRole(distributor.address, PHARMACY_ROLE);
      await accessControl.revokeUserRole(distributor.address, PHARMACY_ROLE);

      expect(await accessControl.getPrimaryRole(distributor.address)).to.equal(DISTRIBUTOR_ROLE);
      expect(await accessControl.hasRole(DISTRIBUTOR_ROLE, distributor.address)).to.equal(true);
    });

    it("switching the primary role changes which routes apply to the account", async function () {
      // distributor2 holds DISTRIBUTOR (primary) + CLINIC.
      await accessControl.grantUserRole(distributor2.address, CLINIC_ROLE);

      const id = await register(1);
      await shipToDistributor(id);
      await ledger.connect(distributor).confirmTransfer(id, LOC_WAREHOUSE);

      // DISTRIBUTOR -> DISTRIBUTOR is disabled in the MVP route matrix.
      await expect(
        ledger.connect(distributor).createTransferRequest(id, distributor2.address, LOC_WAREHOUSE, LOC_CLINIC)
      ).to.be.revertedWith("Invalid route");

      // Once distributor2 acts as a clinic, DISTRIBUTOR -> CLINIC is allowed.
      await accessControl.setPrimaryRole(distributor2.address, CLINIC_ROLE);
      await expect(
        ledger.connect(distributor).createTransferRequest(id, distributor2.address, LOC_WAREHOUSE, LOC_CLINIC)
      ).to.emit(ledger, "TransferRequested");
    });

    it("only the admin can revoke roles, set primary roles or change routes", async function () {
      await expect(
        accessControl.connect(stranger).revokeUserRole(distributor.address, DISTRIBUTOR_ROLE)
      ).to.be.revertedWithCustomError(accessControl, "AccessControlUnauthorizedAccount");
      await expect(
        accessControl.connect(stranger).setPrimaryRole(distributor.address, DISTRIBUTOR_ROLE)
      ).to.be.revertedWithCustomError(accessControl, "AccessControlUnauthorizedAccount");
      await expect(
        accessControl.connect(stranger).setRoute(DISTRIBUTOR_ROLE, CLINIC_ROLE, false)
      ).to.be.revertedWithCustomError(accessControl, "AccessControlUnauthorizedAccount");
      await expect(
        accessControl.connect(stranger).configureMvpRoutes()
      ).to.be.revertedWithCustomError(accessControl, "AccessControlUnauthorizedAccount");
    });

    it("rejects revoking or setting unsupported roles and zero addresses", async function () {
      await expect(
        accessControl.revokeUserRole(ethers.ZeroAddress, DISTRIBUTOR_ROLE)
      ).to.be.revertedWith("Invalid account");
      await expect(
        accessControl.revokeUserRole(distributor.address, ethers.id("FAKE_ROLE"))
      ).to.be.revertedWith("Unsupported role");
      await expect(
        accessControl.setPrimaryRole(ethers.ZeroAddress, DISTRIBUTOR_ROLE)
      ).to.be.revertedWith("Invalid account");
      await expect(
        accessControl.setPrimaryRole(distributor.address, ethers.id("FAKE_ROLE"))
      ).to.be.revertedWith("Unsupported role");
    });

    it("a disabled route blocks transfers that were previously allowed", async function () {
      const id = await register(1);
      await accessControl.setRoute(MANUFACTURER_ROLE, DISTRIBUTOR_ROLE, false);

      await expect(shipToDistributor(id)).to.be.revertedWith("Invalid route");
    });
  });

  describe("Transfer request guards", function () {
    it("rejects a zero receiver, self-transfer and zero locations", async function () {
      const id = await register(1);
      const m = ledger.connect(manufacturer);

      await expect(m.createTransferRequest(id, ethers.ZeroAddress, LOC_FACTORY, LOC_WAREHOUSE))
        .to.be.revertedWith("Invalid receiver");
      await expect(m.createTransferRequest(id, manufacturer.address, LOC_FACTORY, LOC_WAREHOUSE))
        .to.be.revertedWith("Receiver cannot be sender");
      await expect(m.createTransferRequest(id, distributor.address, ethers.ZeroHash, LOC_WAREHOUSE))
        .to.be.revertedWith("Invalid from location");
      await expect(m.createTransferRequest(id, distributor.address, LOC_FACTORY, ethers.ZeroHash))
        .to.be.revertedWith("Invalid to location");
    });

    it("rejects an unknown serial", async function () {
      await expect(
        ledger.connect(manufacturer).createTransferRequest(serial(999), distributor.address, LOC_FACTORY, LOC_WAREHOUSE)
      ).to.be.revertedWith("Product not found");
    });

    it("rejects a second request while one is pending", async function () {
      const id = await register(1);
      await shipToDistributor(id);

      await expect(shipToDistributor(id)).to.be.revertedWith("Pending transfer exists");
    });

    it("rejects a receiver without any role", async function () {
      const id = await register(1);
      await expect(
        ledger.connect(manufacturer).createTransferRequest(id, stranger.address, LOC_FACTORY, LOC_WAREHOUSE)
      ).to.be.revertedWith("Receiver has no role");
    });

    it("rejects a receiver whose role cannot receive (manufacturer)", async function () {
      await accessControl.grantUserRole(stranger.address, MANUFACTURER_ROLE);
      const id = await register(1);

      await expect(
        ledger.connect(manufacturer).createTransferRequest(id, stranger.address, LOC_FACTORY, LOC_WAREHOUSE)
      ).to.be.revertedWith("Receiver cannot receive");
    });

    it("rejects a sender whose role cannot initiate (clinic re-selling)", async function () {
      const id = await register(1);
      await shipToDistributor(id);
      await ledger.connect(distributor).confirmTransfer(id, LOC_WAREHOUSE);
      await ledger.connect(distributor).createTransferRequest(id, clinic.address, LOC_WAREHOUSE, LOC_CLINIC);
      await ledger.connect(clinic).confirmTransfer(id, LOC_CLINIC);

      await expect(
        ledger.connect(clinic).createTransferRequest(id, distributor.address, LOC_CLINIC, LOC_WAREHOUSE)
      ).to.be.revertedWith("Sender cannot initiate");
    });

    it("an invalid route reverts atomically: the product is not left FLAGGED", async function () {
      // createTransferRequest calls flagProductFromLedger and then reverts, so
      // the flag and the TransferRejected event are rolled back with the tx.
      // See docs/security-review.md (finding L-2).
      await accessControl.grantUserRole(stranger.address, IMPORTER_ROLE);
      const id = await register(1);

      await expect(
        ledger.connect(manufacturer).createTransferRequest(id, stranger.address, LOC_FACTORY, LOC_WAREHOUSE)
      ).to.be.revertedWith("Invalid route");

      expect(await registry.getStatus(id)).to.equal(VERIFIED);
      expect(await registry.getRiskLevel(id)).to.equal(0);
    });
  });

  describe("Confirm transfer guards", function () {
    it("rejects a zero receiver location and a missing pending transfer", async function () {
      const id = await register(1);

      await expect(ledger.connect(distributor).confirmTransfer(id, ethers.ZeroHash))
        .to.be.revertedWith("Invalid receiver location");
      await expect(ledger.connect(distributor).confirmTransfer(id, LOC_WAREHOUSE))
        .to.be.revertedWith("No pending transfer");
      await expect(ledger.connect(distributor).confirmTransfer(ethers.ZeroHash, LOC_WAREHOUSE))
        .to.be.revertedWith("Invalid serial");
    });

    it("records a full multi-hop history in order", async function () {
      const id = await register(1);
      await shipToDistributor(id);
      await ledger.connect(distributor).confirmTransfer(id, LOC_WAREHOUSE);
      await ledger.connect(distributor).createTransferRequest(id, clinic.address, LOC_WAREHOUSE, LOC_CLINIC);
      await ledger.connect(clinic).confirmTransfer(id, LOC_CLINIC);

      const history = await ledger.getTransferHistory(id);
      expect(history.length).to.equal(2);
      expect(history[0].from).to.equal(manufacturer.address);
      expect(history[0].to).to.equal(distributor.address);
      expect(history[0].fromRole).to.equal(MANUFACTURER_ROLE);
      expect(history[1].from).to.equal(distributor.address);
      expect(history[1].to).to.equal(clinic.address);
      expect(history[1].toRole).to.equal(CLINIC_ROLE);
      expect(history[1].toLocationHash).to.equal(LOC_CLINIC);

      expect(await registry.getCurrentOwner(id)).to.equal(clinic.address);
      expect(await registry.getStatus(id)).to.equal(DELIVERED);
      expect((await ledger.pendingTransfers(id)).exists).to.equal(false);
    });
  });

  describe("Rejected transfers (rejectTransfer)", function () {
    it("receiver can reject: status reverts, owner unchanged, pending cleared", async function () {
      const id = await register(1);
      await shipToDistributor(id);
      expect(await registry.getStatus(id)).to.equal(IN_TRANSIT);

      const reason = ethers.id("DAMAGED_PACKAGING");
      await expect(ledger.connect(distributor).rejectTransfer(id, reason))
        .to.emit(ledger, "TransferRejected")
        .withArgs(id, manufacturer.address, distributor.address, reason)
        .and.to.emit(registry, "ProductTransferReverted")
        .withArgs(id, VERIFIED);

      expect(await registry.getStatus(id)).to.equal(VERIFIED);
      expect(await registry.getCurrentOwner(id)).to.equal(manufacturer.address);
      expect((await ledger.pendingTransfers(id)).exists).to.equal(false);
      expect(await ledger.getTransferHistoryLength(id)).to.equal(0);
    });

    it("sender can re-send after a rejection", async function () {
      const id = await register(1);
      await shipToDistributor(id);
      await ledger.connect(distributor).rejectTransfer(id, ethers.id("WRONG_ITEM"));

      await expect(shipToDistributor(id)).to.emit(ledger, "TransferRequested");
    });

    it("a rejected re-delivery reverts to DELIVERED, not VERIFIED", async function () {
      const id = await register(1);
      await shipToDistributor(id);
      await ledger.connect(distributor).confirmTransfer(id, LOC_WAREHOUSE);
      await ledger.connect(distributor).createTransferRequest(id, clinic.address, LOC_WAREHOUSE, LOC_CLINIC);

      await ledger.connect(clinic).rejectTransfer(id, ethers.id("COLD_CHAIN_BREAK"));

      expect(await registry.getStatus(id)).to.equal(DELIVERED);
      expect(await registry.getCurrentOwner(id)).to.equal(distributor.address);
    });

    it("only the intended receiver can reject", async function () {
      const id = await register(1);
      await shipToDistributor(id);

      await expect(ledger.connect(manufacturer).rejectTransfer(id, ethers.id("X")))
        .to.be.revertedWith("Not receiver");
      await expect(ledger.connect(stranger).rejectTransfer(id, ethers.id("X")))
        .to.be.revertedWith("Not receiver");
    });

    it("rejects invalid input and missing pending transfers", async function () {
      const id = await register(1);

      await expect(ledger.connect(distributor).rejectTransfer(ethers.ZeroHash, ethers.id("X")))
        .to.be.revertedWith("Invalid serial");
      await expect(ledger.connect(distributor).rejectTransfer(id, ethers.ZeroHash))
        .to.be.revertedWith("Invalid reason");
      await expect(ledger.connect(distributor).rejectTransfer(id, ethers.id("X")))
        .to.be.revertedWith("No pending transfer");
    });
  });

  describe("Double-scan detection", function () {
    it("emits DoubleScanDetected when re-scanned at a different location within 30 minutes", async function () {
      const id = await register(1);
      await shipToDistributor(id); // last scan: LOC_FACTORY
      await ledger.connect(distributor).rejectTransfer(id, ethers.id("RETRY"));

      // Same serial shows up at another location a few minutes later.
      await time.increase(5 * 60);
      const tx = ledger
        .connect(manufacturer)
        .createTransferRequest(id, distributor.address, LOC_WAREHOUSE_2, LOC_WAREHOUSE);

      await expect(tx).to.emit(ledger, "DoubleScanDetected");
      const receipt = await (await tx).wait();
      const parsed = receipt.logs
        .map((l: any) => { try { return ledger.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "DoubleScanDetected");
      expect(parsed.args.serialID).to.equal(id);
      expect(parsed.args.previousLocationHash).to.equal(LOC_FACTORY);
      expect(parsed.args.newLocationHash).to.equal(LOC_WAREHOUSE_2);
    });

    it("detects a scan at a location other than where the product was just received", async function () {
      const id = await register(1);
      await shipToDistributor(id);
      await ledger.connect(distributor).confirmTransfer(id, LOC_WAREHOUSE); // last scan: LOC_WAREHOUSE

      await expect(
        ledger.connect(distributor).createTransferRequest(id, clinic.address, LOC_WAREHOUSE_2, LOC_CLINIC)
      ).to.emit(ledger, "DoubleScanDetected");
    });

    it("does not fire when re-scanned at the same location", async function () {
      const id = await register(1);
      await shipToDistributor(id);
      await ledger.connect(distributor).confirmTransfer(id, LOC_WAREHOUSE);

      await expect(
        ledger.connect(distributor).createTransferRequest(id, clinic.address, LOC_WAREHOUSE, LOC_CLINIC)
      ).to.not.emit(ledger, "DoubleScanDetected");
    });

    it("does not fire once the 30-minute window has passed", async function () {
      const id = await register(1);
      await shipToDistributor(id);
      await ledger.connect(distributor).confirmTransfer(id, LOC_WAREHOUSE);

      await time.increase(30 * 60);
      await expect(
        ledger.connect(distributor).createTransferRequest(id, clinic.address, LOC_WAREHOUSE_2, LOC_CLINIC)
      ).to.not.emit(ledger, "DoubleScanDetected");
    });

    it("does not fire on the first scan of a serial", async function () {
      const id = await register(1);
      await expect(shipToDistributor(id)).to.not.emit(ledger, "DoubleScanDetected");
      expect((await ledger.lastScans(id)).locationHash).to.equal(LOC_FACTORY);
    });
  });

  describe("Recall interacting with transfers", function () {
    const REASON = ethers.id("CONTAMINATION");

    it("blocks confirming a transfer that was in transit when the batch was recalled", async function () {
      const id = await register(1);
      await shipToDistributor(id);
      await registry.connect(recallAuthority).recallBatch(BATCH, REASON);

      await expect(ledger.connect(distributor).confirmTransfer(id, LOC_WAREHOUSE))
        .to.be.revertedWith("Product recalled");
    });

    it("blocks creating new transfers for a recalled product", async function () {
      const id = await register(1);
      await registry.connect(recallAuthority).recallBatch(BATCH, REASON);

      await expect(shipToDistributor(id)).to.be.revertedWith("Product recalled");
    });

    it("lets the receiver reject an in-transit recalled product so it is not stuck as pending", async function () {
      const id = await register(1);
      await shipToDistributor(id);
      await registry.connect(recallAuthority).recallBatch(BATCH, REASON);

      await ledger.connect(distributor).rejectTransfer(id, REASON);
      expect((await ledger.pendingTransfers(id)).exists).to.equal(false);
      expect(await registry.getStatus(id)).to.equal(RECALLED);
    });

    it("getProduct / getRiskLevel / getFlagReason report recall data", async function () {
      const id = await register(1);
      await registry.connect(recallAuthority).recallBatch(BATCH, REASON);

      const p = await registry.getProduct(id);
      expect(p.status).to.equal(RECALLED);
      expect(p.riskLevel).to.equal(4);
      expect(p.flagReason).to.equal(REASON);
      expect(await registry.getRiskLevel(id)).to.equal(4);
      expect(await registry.getFlagReason(id)).to.equal(REASON);
    });

    it("recall only affects the targeted batch", async function () {
      const a = await register(1, BATCH);
      const b = await register(2, ethers.id("OTHER-BATCH"));
      await registry.connect(recallAuthority).recallBatch(BATCH, REASON);

      expect(await registry.getStatus(a)).to.equal(RECALLED);
      expect(await registry.getStatus(b)).to.equal(VERIFIED);
      expect((await registry.getProduct(b)).riskLevel).to.equal(0);
    });
  });

  describe("Flag / unflag lifecycle (ProductRegistry in isolation)", function () {
    // FLAGGED is only reachable through TransferLedger hooks; here an EOA plays
    // the ledger so the registry's own state machine can be tested directly.
    let fakeLedger: any;
    const REASON = ethers.id("TAMPER_SUSPECTED");

    beforeEach(async function () {
      fakeLedger = stranger;
      await registry.setTransferLedger(fakeLedger.address);
    });

    it("flags a product and lets the recall authority unflag it back to its previous status", async function () {
      const id = await register(1);
      await expect(registry.connect(fakeLedger).flagProductFromLedger(id, 3, REASON))
        .to.emit(registry, "ProductFlagged").withArgs(id, 3, REASON);
      expect(await registry.getStatus(id)).to.equal(FLAGGED);
      expect(await registry.getFlagReason(id)).to.equal(REASON);

      await expect(registry.connect(recallAuthority).unflagProduct(id))
        .to.emit(registry, "ProductUnflagged").withArgs(id, recallAuthority.address);
      expect(await registry.getStatus(id)).to.equal(VERIFIED);
      expect(await registry.getRiskLevel(id)).to.equal(0);
      expect(await registry.getFlagReason(id)).to.equal(ethers.ZeroHash);
    });

    it("re-flagging keeps the original pre-flag status", async function () {
      const id = await register(1);
      await registry.connect(fakeLedger).flagProductFromLedger(id, 2, REASON);
      await registry.connect(fakeLedger).flagProductFromLedger(id, 3, ethers.id("SECOND"));
      await registry.connect(recallAuthority).unflagProduct(id);

      expect(await registry.getStatus(id)).to.equal(VERIFIED);
    });

    it("a flagged product cannot be put in transit", async function () {
      const id = await register(1);
      await registry.connect(fakeLedger).flagProductFromLedger(id, 3, REASON);

      await expect(registry.connect(fakeLedger).markInTransit(id)).to.be.revertedWith("Product flagged");
    });

    it("rejects invalid flag input and flagging recalled products", async function () {
      const id = await register(1);
      await expect(registry.connect(fakeLedger).flagProductFromLedger(serial(999), 3, REASON))
        .to.be.revertedWith("Product not found");
      await expect(registry.connect(fakeLedger).flagProductFromLedger(id, 3, ethers.ZeroHash))
        .to.be.revertedWith("Invalid reason");
      await expect(registry.connect(fakeLedger).flagProductFromLedger(id, 0, REASON))
        .to.be.revertedWith("Invalid risk level");

      await registry.connect(recallAuthority).recallBatch(BATCH, ethers.id("RECALL"));
      await expect(registry.connect(fakeLedger).flagProductFromLedger(id, 3, REASON))
        .to.be.revertedWith("Product recalled");
    });

    it("unflag guards: authority only, product must exist, be flagged and not recalled", async function () {
      const id = await register(1);
      await expect(registry.connect(stranger).unflagProduct(id)).to.be.revertedWith("Not recall authority");
      await expect(registry.connect(recallAuthority).unflagProduct(serial(999))).to.be.revertedWith("Product not found");
      await expect(registry.connect(recallAuthority).unflagProduct(id)).to.be.revertedWith("Not flagged");

      await registry.connect(fakeLedger).flagProductFromLedger(id, 3, REASON);
      await registry.connect(recallAuthority).recallBatch(BATCH, ethers.id("RECALL"));
      await expect(registry.connect(recallAuthority).unflagProduct(id)).to.be.revertedWith("Batch recalled");
    });

    it("ledger hooks reject unknown products and invalid states", async function () {
      const id = await register(1);
      await expect(registry.connect(fakeLedger).markInTransit(serial(999))).to.be.revertedWith("Product not found");
      await expect(registry.connect(fakeLedger).revertTransit(serial(999))).to.be.revertedWith("Product not found");
      await expect(registry.connect(fakeLedger).revertTransit(id)).to.be.revertedWith("Not in transit");
      await expect(registry.connect(fakeLedger).completeTransfer(id, distributor.address)).to.be.revertedWith("Not in transit");
      await expect(registry.connect(fakeLedger).completeTransfer(id, ethers.ZeroAddress)).to.be.revertedWith("Invalid owner");
      await expect(registry.connect(fakeLedger).completeTransfer(serial(999), distributor.address)).to.be.revertedWith("Product not found");

      await registry.connect(fakeLedger).markInTransit(id);
      await expect(registry.connect(fakeLedger).markInTransit(id)).to.be.revertedWith("Invalid status");

      await registry.connect(recallAuthority).recallBatch(BATCH, ethers.id("RECALL"));
      await registry.connect(fakeLedger).revertTransit(id);
      await expect(registry.connect(fakeLedger).markInTransit(id)).to.be.revertedWith("Product recalled");
    });

    it("ledger hooks cannot be called by other addresses", async function () {
      const id = await register(1);
      const r = registry.connect(manufacturer);
      await expect(r.markInTransit(id)).to.be.revertedWith("Not transfer ledger");
      await expect(r.revertTransit(id)).to.be.revertedWith("Not transfer ledger");
      await expect(r.completeTransfer(id, distributor.address)).to.be.revertedWith("Not transfer ledger");
      await expect(r.flagProductFromLedger(id, 3, REASON)).to.be.revertedWith("Not transfer ledger");
    });
  });

  describe("Admin wiring on ProductRegistry", function () {
    it("only admin can set ledger / import verifier / import root, and zero values are rejected", async function () {
      await expect(registry.connect(stranger).setTransferLedger(stranger.address)).to.be.revertedWith("Not admin");
      await expect(registry.connect(stranger).setImportVerifier(stranger.address)).to.be.revertedWith("Not admin");
      await expect(registry.connect(stranger).setApprovedImportRoot(1)).to.be.revertedWith("Not admin");

      await expect(registry.setTransferLedger(ethers.ZeroAddress)).to.be.revertedWith("Invalid transfer ledger");
      await expect(registry.setImportVerifier(ethers.ZeroAddress)).to.be.revertedWith("Invalid import verifier");
      await expect(registry.setApprovedImportRoot(0)).to.be.revertedWith("Invalid import root");

      await expect(registry.setApprovedImportRoot(42)).to.emit(registry, "ApprovedImportRootUpdated").withArgs(0, 42);
    });

    it("read helpers reject the zero batch and unknown serials", async function () {
      await expect(registry.getBatchSerials(ethers.ZeroHash)).to.be.revertedWith("Invalid batch");
      await expect(registry.isBatchRecalled(ethers.ZeroHash)).to.be.revertedWith("Invalid batch");
      await expect(registry.getBatchSize(ethers.ZeroHash)).to.be.revertedWith("Invalid batch");
      await expect(registry.getBatchSummary(ethers.ZeroHash)).to.be.revertedWith("Invalid batch");
      for (const fn of ["getStatus", "getCurrentOwner", "getProduct", "getRiskLevel", "getFlagReason", "isZkpVerified", "isImportedProduct"]) {
        await expect(registry[fn](serial(999))).to.be.revertedWith("Product not found");
      }
    });
  });

  describe("ZK import registration (registerImportedProductZK)", function () {
    const ROOT = 123456789n;
    const a: [bigint, bigint] = [1n, 2n];
    const b: [[bigint, bigint], [bigint, bigint]] = [[3n, 4n], [5n, 6n]];
    const c: [bigint, bigint] = [7n, 8n];
    // input = [importDocCommitment, batchHash, expiryDate, currentDate, approvedRoot]
    const inputs = (overrides: Partial<Record<number, bigint>> = {}) => {
      const base = [999n, BigInt(BATCH), 20300101n, 20260101n, ROOT];
      return base.map((v, i) => (overrides[i] ?? v)) as [bigint, bigint, bigint, bigint, bigint];
    };
    const zk = (signer: any, id: string, input = inputs()) =>
      registry.connect(signer).registerImportedProductZK(id, BATCH, META, a, b, c, input);

    async function wireVerifier() {
      const v = await (await ethers.getContractFactory("DemoImportZKPVerifier")).deploy();
      await registry.setImportVerifier(await v.getAddress());
      await registry.setApprovedImportRoot(ROOT);
      return v;
    }

    it("registers an imported product when the proof and public signals check out", async function () {
      await wireVerifier();
      const id = serial(1);

      await expect(zk(importer, id))
        .to.emit(registry, "ProductRegistered")
        .withArgs(id, BATCH, importer.address, true, true, VERIFIED);

      const p = await registry.getProduct(id);
      expect(p.isImported).to.equal(true);
      expect(p.zkpVerified).to.equal(true);
      expect(p.importDocCommitment).to.equal(999n);
      expect(p.approvedImportRoot).to.equal(ROOT);
      expect(await registry.getBatchSize(BATCH)).to.equal(1);
    });

    it("requires a configured verifier and approved root", async function () {
      await expect(zk(importer, serial(1))).to.be.revertedWith("Missing import verifier");
      const v = await (await ethers.getContractFactory("DemoImportZKPVerifier")).deploy();
      await registry.setImportVerifier(await v.getAddress());
      await expect(zk(importer, serial(1))).to.be.revertedWith("Missing import root");
    });

    it("only importers may use the ZK path", async function () {
      await wireVerifier();
      await expect(zk(manufacturer, serial(1))).to.be.revertedWith("Not importer");
      await expect(zk(stranger, serial(1))).to.be.revertedWith("Not manufacturer or importer");
    });

    it("rejects mismatched or invalid public signals", async function () {
      await wireVerifier();
      await expect(zk(importer, serial(1), inputs({ 0: 0n }))).to.be.revertedWith("Invalid import doc commitment");
      await expect(zk(importer, serial(1), inputs({ 1: 1n }))).to.be.revertedWith("Batch mismatch");
      await expect(zk(importer, serial(1), inputs({ 2: 20250101n }))).to.be.revertedWith("Vaccine expired");
      await expect(zk(importer, serial(1), inputs({ 4: 1n }))).to.be.revertedWith("Import root mismatch");
    });

    it("rejects a proof the verifier refuses", async function () {
      await wireVerifier();
      await expect(
        registry.connect(importer).registerImportedProductZK(serial(1), BATCH, META, [0n, 0n], b, c, inputs())
      ).to.be.revertedWith("Invalid import ZKP");
    });

    it("applies the same serial/batch guards as registerProduct", async function () {
      await wireVerifier();
      const r = registry.connect(importer);
      await expect(r.registerImportedProductZK(ethers.ZeroHash, BATCH, META, a, b, c, inputs())).to.be.revertedWith("Invalid serial");
      await expect(r.registerImportedProductZK(serial(1), ethers.ZeroHash, META, a, b, c, inputs())).to.be.revertedWith("Invalid batch");
      await expect(r.registerImportedProductZK(serial(1), BATCH, ethers.ZeroHash, a, b, c, inputs())).to.be.revertedWith("Invalid metadata");

      await zk(importer, serial(1));
      await expect(zk(importer, serial(1))).to.be.revertedWith("Duplicate serial");

      await registry.connect(recallAuthority).recallBatch(BATCH, ethers.id("RECALL"));
      await expect(zk(importer, serial(2))).to.be.revertedWith("Batch recalled");
    });
  });
});
