import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * Regression tests for the access-control fixes described in
 * docs/security-review.md:
 *
 * H-1  TransferLedger lot functions (recordEvent, anchorEnv, disaggregate,
 *      decommissionUnit) were callable by any address.
 * M-1  Recalling a lot did not stop units in its sub-lots being dispensed.
 * M-2  Revoking a role through the inherited revokeRole / renounceRole left
 *      the primary role in place, so the account could still transfer.
 */
describe("Security fixes", function () {
  let accessControl: any;
  let registry: any;
  let ledger: any;
  let coldChain: any;

  let admin: any;
  let manufacturer: any;
  let distributor: any;
  let clinic: any;
  let auditor: any;
  let recallAuthority: any;
  let attacker: any;

  const NOW = 1_800_000_000;
  const PARENT = ethers.id("LOT-PARENT");
  const SUB = ethers.id("LOT-SUB");
  const U1 = ethers.id("UNIT-1");
  const U2 = ethers.id("UNIT-2");
  const U3 = ethers.id("UNIT-3");
  const DISPENSE = ethers.id("DISPENSE");

  function hashPair(a: string, b: string): string {
    const [lo, hi] = BigInt(a) <= BigInt(b) ? [a, b] : [b, a];
    return ethers.keccak256(ethers.concat([lo, hi]));
  }

  beforeEach(async function () {
    [admin, manufacturer, distributor, clinic, auditor, recallAuthority, attacker] = await ethers.getSigners();

    accessControl = await (await ethers.getContractFactory("SupplyChainAccessControl")).deploy(admin.address);
    registry = await (await ethers.getContractFactory("ProductRegistry")).deploy(await accessControl.getAddress());
    ledger = await (await ethers.getContractFactory("TransferLedger")).deploy(
      await registry.getAddress(),
      await accessControl.getAddress()
    );
    coldChain = await (await ethers.getContractFactory("ColdChainRegistry")).deploy(
      await accessControl.getAddress(),
      await registry.getAddress()
    );
    const verifier = await (await ethers.getContractFactory("MockColdChainVerifier")).deploy();

    await registry.setTransferLedger(await ledger.getAddress());
    await ledger.setColdChainRegistry(await coldChain.getAddress());
    await coldChain.setTransferLedger(await ledger.getAddress());
    await coldChain.setVerifier(await verifier.getAddress());

    await accessControl.grantUserRole(manufacturer.address, await accessControl.MANUFACTURER_ROLE());
    await accessControl.grantUserRole(distributor.address, await accessControl.DISTRIBUTOR_ROLE());
    await accessControl.grantUserRole(clinic.address, await accessControl.CLINIC_ROLE());
    await accessControl.grantUserRole(auditor.address, await accessControl.AUDITOR_ROLE());
    await accessControl.grantUserRole(recallAuthority.address, await accessControl.RECALL_AUTHORITY_ROLE());
    await accessControl.configureMvpRoutes();

    // Parent lot {U1, U2, U3}.
    await registry
      .connect(manufacturer)
      .commissionLot(PARENT, hashPair(hashPair(U1, U2), U3), ethers.id("META"), "0x01", NOW);
  });

  describe("H-1: caller checks on TransferLedger lot functions", function () {
    it("an address without a role cannot call any lot function", async function () {
      const l = ledger.connect(attacker);
      await expect(l.recordEvent(PARENT, ethers.id("A"), ethers.id("B"), ethers.id("P"), "0x01", NOW))
        .to.be.revertedWith("Not custody actor");
      await expect(l.anchorEnv(PARENT, ethers.id("LEG"), ethers.id("ENV"), 1, 2, true, "0x01", NOW))
        .to.be.revertedWith("Not custody actor");
      await expect(l.disaggregate(PARENT, SUB, hashPair(U1, U2), ethers.id("TO"), NOW))
        .to.be.revertedWith("Not lot sender");
      await expect(l.decommissionUnit(U1, PARENT, [U2, U3], DISPENSE, NOW))
        .to.be.revertedWith("Not dispenser");
    });

    it("blocks the fake sub-lot attack that marked any unit as dispensed without a valid proof", async function () {
      // Before the fix: create a sub-lot whose root is the victim unit itself,
      // then "prove" membership with an empty proof.
      await expect(
        ledger.connect(attacker).disaggregate(PARENT, ethers.id("FAKE"), U3, ethers.id("ATTACKER"), NOW)
      ).to.be.revertedWith("Not lot sender");
      await expect(
        ledger.connect(attacker).decommissionUnit(U3, ethers.id("FAKE"), [], DISPENSE, NOW)
      ).to.be.revertedWith("Not dispenser");

      expect(await registry.unitDecommissioned(U3)).to.equal(false);
    });

    it("roles outside each function's set are rejected", async function () {
      await expect(
        ledger.connect(auditor).recordEvent(PARENT, ethers.id("A"), ethers.id("B"), ethers.id("P"), "0x01", NOW)
      ).to.be.revertedWith("Not custody actor");
      await expect(
        ledger.connect(clinic).disaggregate(PARENT, SUB, hashPair(U1, U2), ethers.id("TO"), NOW)
      ).to.be.revertedWith("Not lot sender");
      await expect(
        ledger.connect(distributor).decommissionUnit(U1, PARENT, [U2, U3], DISPENSE, NOW)
      ).to.be.revertedWith("Not dispenser");
    });

    it("the intended roles keep working", async function () {
      await expect(
        ledger.connect(distributor).recordEvent(PARENT, ethers.id("A"), ethers.id("B"), ethers.id("P"), "0x01", NOW)
      ).to.emit(registry, "CustodyEvent");
      await expect(
        ledger.connect(clinic).anchorEnv(PARENT, ethers.id("LEG"), ethers.id("ENV"), 1, 2, true, "0x01", NOW)
      ).to.emit(coldChain, "EnvAnchored");
      await expect(
        ledger.connect(distributor).disaggregate(PARENT, SUB, hashPair(U1, U2), ethers.id("TO"), NOW)
      ).to.emit(registry, "LotDisaggregated");
      await expect(
        ledger.connect(clinic).decommissionUnit(U1, SUB, [U2], DISPENSE, NOW)
      ).to.emit(registry, "UnitDecommissioned");
      await expect(
        ledger.connect(recallAuthority).decommissionUnit(U3, PARENT, [hashPair(U1, U2)], ethers.id("DESTROY"), NOW)
      ).to.emit(registry, "UnitDecommissioned");
    });

    it("the admin (backend fallback signer) is allowed on every lot function", async function () {
      const l = ledger.connect(admin);
      await expect(l.recordEvent(PARENT, ethers.id("A"), ethers.id("B"), ethers.id("P"), "0x01", NOW))
        .to.emit(registry, "CustodyEvent");
      await expect(l.anchorEnv(PARENT, ethers.id("LEG"), ethers.id("ENV"), 1, 2, true, "0x01", NOW))
        .to.emit(coldChain, "EnvAnchored");
      await expect(l.disaggregate(PARENT, SUB, hashPair(U1, U2), ethers.id("TO"), NOW))
        .to.emit(registry, "LotDisaggregated");
      await expect(l.decommissionUnit(U1, SUB, [U2], DISPENSE, NOW))
        .to.emit(registry, "UnitDecommissioned");
    });
  });

  describe("M-1: recall of a parent lot covers its sub-lots", function () {
    it("units in a sub-lot cannot be dispensed after the parent lot is recalled", async function () {
      await ledger.connect(distributor).disaggregate(PARENT, SUB, hashPair(U1, U2), ethers.id("TO"), NOW);
      await registry.connect(recallAuthority).recallLot(PARENT, ethers.id("CONTAMINATION"));

      await expect(
        ledger.connect(clinic).decommissionUnit(U1, SUB, [U2], DISPENSE, NOW)
      ).to.be.revertedWith("Lot recalled");
    });

    it("sub-lots of a lot that is not recalled are unaffected", async function () {
      await ledger.connect(distributor).disaggregate(PARENT, SUB, hashPair(U1, U2), ethers.id("TO"), NOW);
      await registry
        .connect(manufacturer)
        .commissionLot(ethers.id("OTHER"), ethers.id("ROOT"), ethers.id("META"), "0x01", NOW);
      await registry.connect(recallAuthority).recallLot(ethers.id("OTHER"), ethers.id("R"));

      await expect(
        ledger.connect(clinic).decommissionUnit(U1, SUB, [U2], DISPENSE, NOW)
      ).to.emit(registry, "UnitDecommissioned");
    });
  });

  describe("M-2: every revocation path clears the primary role", function () {
    let DISTRIBUTOR_ROLE: string;
    const BATCH = ethers.id("BATCH");
    const SERIAL = ethers.id("SERIAL");

    beforeEach(async function () {
      DISTRIBUTOR_ROLE = await accessControl.DISTRIBUTOR_ROLE();
      await registry.connect(manufacturer).registerProduct(SERIAL, BATCH, ethers.id("META"), ethers.ZeroHash, "0x");
      await ledger.connect(manufacturer).createTransferRequest(SERIAL, distributor.address, ethers.id("A"), ethers.id("B"));
      await ledger.connect(distributor).confirmTransfer(SERIAL, ethers.id("B"));
    });

    it("inherited revokeRole: a revoked distributor can no longer ship goods it holds", async function () {
      await expect(accessControl.revokeRole(DISTRIBUTOR_ROLE, distributor.address))
        .to.emit(accessControl, "PrimaryRoleSet")
        .withArgs(distributor.address, ethers.ZeroHash);

      expect(await accessControl.getPrimaryRole(distributor.address)).to.equal(ethers.ZeroHash);
      await expect(
        ledger.connect(distributor).createTransferRequest(SERIAL, clinic.address, ethers.id("B"), ethers.id("C"))
      ).to.be.revertedWith("Sender has no role");
    });

    it("renounceRole also clears the primary role", async function () {
      await accessControl.connect(distributor).renounceRole(DISTRIBUTOR_ROLE, distributor.address);

      expect(await accessControl.getPrimaryRole(distributor.address)).to.equal(ethers.ZeroHash);
      await expect(
        ledger.connect(distributor).createTransferRequest(SERIAL, clinic.address, ethers.id("B"), ethers.id("C"))
      ).to.be.revertedWith("Sender has no role");
    });

    it("revokeUserRole still emits PrimaryRoleSet exactly once", async function () {
      const tx = await accessControl.revokeUserRole(distributor.address, DISTRIBUTOR_ROLE);
      const receipt = await tx.wait();
      const events = receipt.logs
        .map((l: any) => { try { return accessControl.interface.parseLog(l); } catch { return null; } })
        .filter((e: any) => e?.name === "PrimaryRoleSet");
      expect(events.length).to.equal(1);
      await expect(tx).to.emit(accessControl, "UserRoleRevoked").withArgs(distributor.address, DISTRIBUTOR_ROLE);
    });

    it("revoking a non-primary role leaves the primary role alone", async function () {
      const CLINIC_ROLE = await accessControl.CLINIC_ROLE();
      await accessControl.grantUserRole(distributor.address, CLINIC_ROLE);
      await accessControl.revokeRole(CLINIC_ROLE, distributor.address);

      expect(await accessControl.getPrimaryRole(distributor.address)).to.equal(DISTRIBUTOR_ROLE);
    });

    it("revoking the admin role does not touch primary roles", async function () {
      await accessControl.grantRole(ethers.ZeroHash, attacker.address);
      await expect(accessControl.revokeRole(ethers.ZeroHash, attacker.address))
        .to.not.emit(accessControl, "PrimaryRoleSet");
    });
  });
});
