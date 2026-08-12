import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * Consolidated lot-Merkle test suite: TransferLedger forwarding/wiring for
 * recordEvent/disaggregate/decommissionUnit/anchorEnv, and ColdChainRegistry
 * access control + anchoring behavior.
 *
 * Basic ProductRegistry-only lot scenarios (commissionLot, direct
 * disaggregate/recordEvent/recallLot calls, decommissionUnit merkle-proof
 * edge cases) already live in ProductRegistry.test.ts under "Lot-Merkle
 * Commissioning" — this file focuses on what that one doesn't cover: calling
 * through TransferLedger (the only path a real actor can use, since
 * ProductRegistry's lot mutators are onlyTransferLedger-gated) and the
 * ColdChainRegistry contract this repo actually ships.
 */
describe("Lot Management — TransferLedger forwarding & ColdChainRegistry", function () {
  let accessControl: any;
  let registry: any;
  let transferLedger: any;
  let coldChainRegistry: any;
  let verifier: any;

  let admin: any;
  let manufacturer: any;
  let recallAuthority: any;
  let stranger: any;

  function hashPair(a: string, b: string): string {
    const [lo, hi] = BigInt(a) <= BigInt(b) ? [a, b] : [b, a];
    return ethers.keccak256(ethers.concat([lo, hi]));
  }

  beforeEach(async function () {
    [admin, manufacturer, recallAuthority, stranger] = await ethers.getSigners();

    const AccessControlFactory = await ethers.getContractFactory("SupplyChainAccessControl");
    accessControl = await AccessControlFactory.deploy(admin.address);

    const RegistryFactory = await ethers.getContractFactory("ProductRegistry");
    registry = await RegistryFactory.deploy(await accessControl.getAddress());

    const TransferLedgerFactory = await ethers.getContractFactory("TransferLedger");
    transferLedger = await TransferLedgerFactory.deploy(
      await registry.getAddress(),
      await accessControl.getAddress()
    );

    const ColdChainRegistryFactory = await ethers.getContractFactory("ColdChainRegistry");
    coldChainRegistry = await ColdChainRegistryFactory.deploy(
      await accessControl.getAddress(),
      await registry.getAddress()
    );

    const VerifierFactory = await ethers.getContractFactory("MockColdChainVerifier");
    verifier = await VerifierFactory.deploy();

    await registry.setTransferLedger(await transferLedger.getAddress());
    await transferLedger.setColdChainRegistry(await coldChainRegistry.getAddress());
    await coldChainRegistry.setTransferLedger(await transferLedger.getAddress());
    await coldChainRegistry.setVerifier(await verifier.getAddress());

    const MANUFACTURER_ROLE = await accessControl.MANUFACTURER_ROLE();
    const RECALL_AUTHORITY_ROLE = await accessControl.RECALL_AUTHORITY_ROLE();
    await accessControl.grantUserRole(manufacturer.address, MANUFACTURER_ROLE);
    await accessControl.grantUserRole(recallAuthority.address, RECALL_AUTHORITY_ROLE);
  });

  async function commissionLot(lotIdHash: string, aggregationRoot: string) {
    await registry
      .connect(manufacturer)
      .commissionLot(lotIdHash, aggregationRoot, ethers.id(`META-${lotIdHash}`), "0x01", Math.floor(Date.now() / 1000));
  }

  describe("decommissionUnit via TransferLedger", function () {
    it("verifies a real multi-leaf merkle proof and decommissions the unit", async function () {
      const lotIdHash = ethers.id("LOT-DECOMMISSION-FWD");
      const leafA = ethers.id("UNIT-A");
      const leafB = ethers.id("UNIT-B");
      const root = hashPair(leafA, leafB);
      await commissionLot(lotIdHash, root);

      await transferLedger.decommissionUnit(
        leafA,
        lotIdHash,
        [leafB],
        ethers.id("DISPENSE"),
        Math.floor(Date.now() / 1000)
      );

      expect(await registry.unitDecommissioned(leafA)).to.equal(true);
    });

    it("rejects an invalid merkle proof", async function () {
      const lotIdHash = ethers.id("LOT-DECOMMISSION-BAD");
      await commissionLot(lotIdHash, ethers.id("SOME-ROOT"));

      await expect(
        transferLedger.decommissionUnit(
          ethers.id("NOT-IN-TREE"),
          lotIdHash,
          [ethers.id("RANDOM")],
          ethers.id("DISPENSE"),
          Math.floor(Date.now() / 1000)
        )
      ).to.be.revertedWith("Invalid merkle proof");
    });

    it("rejects decommissioning the same unit twice", async function () {
      const lotIdHash = ethers.id("LOT-DECOMMISSION-DUP");
      const leaf = ethers.id("SOLE-UNIT");
      await commissionLot(lotIdHash, leaf); // single-leaf tree: root == leaf

      await transferLedger.decommissionUnit(leaf, lotIdHash, [], ethers.id("DISPENSE"), Math.floor(Date.now() / 1000));

      await expect(
        transferLedger.decommissionUnit(leaf, lotIdHash, [], ethers.id("DISPENSE"), Math.floor(Date.now() / 1000))
      ).to.be.revertedWith("Unit already decommissioned");
    });

    it("rejects decommissioning against a non-existent lot", async function () {
      await expect(
        transferLedger.decommissionUnit(
          ethers.id("UNIT"),
          ethers.id("NO-SUCH-LOT"),
          [],
          ethers.id("DISPENSE"),
          Math.floor(Date.now() / 1000)
        )
      ).to.be.revertedWith("Lot not found");
    });

    it("rejects decommissioning a unit from a recalled lot", async function () {
      const lotIdHash = ethers.id("LOT-DECOMMISSION-RECALLED");
      const leaf = ethers.id("RECALLED-UNIT");
      await commissionLot(lotIdHash, leaf);
      await registry.connect(recallAuthority).recallLot(lotIdHash, ethers.id("REASON"));

      await expect(
        transferLedger.decommissionUnit(leaf, lotIdHash, [], ethers.id("DISPENSE"), Math.floor(Date.now() / 1000))
      ).to.be.revertedWith("Lot recalled");
    });

    it("cannot be called directly on ProductRegistry by a non-TransferLedger address", async function () {
      const lotIdHash = ethers.id("LOT-DIRECT-CALL");
      const leaf = ethers.id("DIRECT-UNIT");
      await commissionLot(lotIdHash, leaf);

      await expect(
        registry.connect(manufacturer).decommissionUnit(leaf, lotIdHash, [], ethers.id("DISPENSE"), Math.floor(Date.now() / 1000))
      ).to.be.revertedWith("Not transfer ledger");
    });
  });

  describe("disaggregate via TransferLedger", function () {
    beforeEach(async function () {
      await commissionLot(ethers.id("PARENT-LOT-FWD"), ethers.id("PARENT-ROOT-FWD"));
    });

    it("forwards to ProductRegistry and records the sub-lot's parent + root", async function () {
      const parentLotIdHash = ethers.id("PARENT-LOT-FWD");
      const subLotIdHash = ethers.id("SUB-LOT-FWD-1");
      const subLotRoot = ethers.id("SUB-ROOT-FWD-1");

      await transferLedger.disaggregate(parentLotIdHash, subLotIdHash, subLotRoot, ethers.id("TO-ACTOR"), Math.floor(Date.now() / 1000));

      expect(await registry.lotToParent(subLotIdHash)).to.equal(parentLotIdHash);
      expect(await registry.lotToSubRoot(subLotIdHash)).to.equal(subLotRoot);
      expect(await registry.lotExists(subLotIdHash)).to.equal(true);
    });

    it("tracks multiple independent sub-lots under the same parent", async function () {
      const parentLotIdHash = ethers.id("PARENT-LOT-FWD");

      await transferLedger.disaggregate(parentLotIdHash, ethers.id("SUB-A"), ethers.id("ROOT-A"), ethers.id("TO-ACTOR-A"), Math.floor(Date.now() / 1000));
      await transferLedger.disaggregate(parentLotIdHash, ethers.id("SUB-B"), ethers.id("ROOT-B"), ethers.id("TO-ACTOR-B"), Math.floor(Date.now() / 1000));

      expect(await registry.lotToParent(ethers.id("SUB-A"))).to.equal(parentLotIdHash);
      expect(await registry.lotToParent(ethers.id("SUB-B"))).to.equal(parentLotIdHash);
    });

    it("rejects a duplicate sub-lot id", async function () {
      const parentLotIdHash = ethers.id("PARENT-LOT-FWD");
      const subLotIdHash = ethers.id("SUB-LOT-DUP-FWD");

      await transferLedger.disaggregate(parentLotIdHash, subLotIdHash, ethers.id("ROOT"), ethers.id("TO-ACTOR"), Math.floor(Date.now() / 1000));

      await expect(
        transferLedger.disaggregate(parentLotIdHash, subLotIdHash, ethers.id("ROOT-2"), ethers.id("TO-ACTOR"), Math.floor(Date.now() / 1000))
      ).to.be.revertedWith("Sub lot already exists");
    });

    it("rejects disaggregating a non-existent parent lot", async function () {
      await expect(
        transferLedger.disaggregate(ethers.id("NO-SUCH-PARENT"), ethers.id("SUB"), ethers.id("ROOT"), ethers.id("TO-ACTOR"), Math.floor(Date.now() / 1000))
      ).to.be.revertedWith("Parent lot not found");
    });
  });

  describe("recordEvent via TransferLedger", function () {
    it("forwards to ProductRegistry and emits CustodyEvent", async function () {
      const lotIdHash = ethers.id("LOT-CUSTODY-FWD");
      await commissionLot(lotIdHash, ethers.id("ROOT"));

      await expect(
        transferLedger.recordEvent(
          lotIdHash,
          ethers.id("FROM-ACTOR"),
          ethers.id("TO-ACTOR"),
          ethers.id("PAYLOAD"),
          "0x1234",
          Math.floor(Date.now() / 1000)
        )
      ).to.emit(registry, "CustodyEvent");
    });

    it("rejects a custody event for a lot that doesn't exist", async function () {
      await expect(
        transferLedger.recordEvent(
          ethers.id("NO-SUCH-LOT"),
          ethers.id("FROM-ACTOR"),
          ethers.id("TO-ACTOR"),
          ethers.id("PAYLOAD"),
          "0x1234",
          Math.floor(Date.now() / 1000)
        )
      ).to.be.revertedWith("Lot not found");
    });
  });

  describe("anchorEnv via TransferLedger -> ColdChainRegistry", function () {
    it("forwards and anchors environmental data for an existing lot", async function () {
      const lotIdHash = ethers.id("LOT-ENV-FWD");
      await commissionLot(lotIdHash, ethers.id("ROOT"));

      const now = Math.floor(Date.now() / 1000);
      await expect(
        transferLedger.anchorEnv(lotIdHash, ethers.id("LEG-1"), ethers.id("ENV-ROOT"), now, now + 3600, true, "0x1234", now)
      ).to.emit(coldChainRegistry, "EnvAnchored");
    });

    it("rejects anchoring for a lot that doesn't exist", async function () {
      const now = Math.floor(Date.now() / 1000);
      await expect(
        transferLedger.anchorEnv(ethers.id("NO-SUCH-LOT"), ethers.id("LEG-1"), ethers.id("ENV-ROOT"), now, now + 3600, true, "0x1234", now)
      ).to.be.revertedWith("Lot not found");
    });

    it("rejects an invalid window (end before start)", async function () {
      const lotIdHash = ethers.id("LOT-ENV-WINDOW");
      await commissionLot(lotIdHash, ethers.id("ROOT"));
      const now = Math.floor(Date.now() / 1000);

      await expect(
        transferLedger.anchorEnv(lotIdHash, ethers.id("LEG-1"), ethers.id("ENV-ROOT"), now, now - 3600, true, "0x1234", now)
      ).to.be.revertedWith("Invalid window");
    });

    it("cannot be called directly on ColdChainRegistry by a non-TransferLedger address", async function () {
      const lotIdHash = ethers.id("LOT-ENV-DIRECT");
      await commissionLot(lotIdHash, ethers.id("ROOT"));
      const now = Math.floor(Date.now() / 1000);

      await expect(
        coldChainRegistry.anchorEnv(lotIdHash, ethers.id("LEG-1"), ethers.id("ENV-ROOT"), now, now + 3600, true, "0x1234", now)
      ).to.be.revertedWith("Not transfer ledger");
    });

    it("rejects anchoring when no verifier is configured", async function () {
      const ColdChainRegistryFactory = await ethers.getContractFactory("ColdChainRegistry");
      const bareColdChain = await ColdChainRegistryFactory.deploy(await accessControl.getAddress(), await registry.getAddress());
      await bareColdChain.setTransferLedger(await transferLedger.getAddress());
      await transferLedger.setColdChainRegistry(await bareColdChain.getAddress());

      const lotIdHash = ethers.id("LOT-ENV-NO-VERIFIER");
      await commissionLot(lotIdHash, ethers.id("ROOT"));
      const now = Math.floor(Date.now() / 1000);

      await expect(
        transferLedger.anchorEnv(lotIdHash, ethers.id("LEG-1"), ethers.id("ENV-ROOT"), now, now + 3600, true, "0x1234", now)
      ).to.be.revertedWith("Missing verifier");

      // restore wiring for any subsequent tests in this file
      await transferLedger.setColdChainRegistry(await coldChainRegistry.getAddress());
    });
  });

  describe("ColdChainRegistry admin wiring", function () {
    it("only admin can set the transfer ledger", async function () {
      await expect(
        coldChainRegistry.connect(stranger).setTransferLedger(stranger.address)
      ).to.be.revertedWith("Not admin");
    });

    it("only admin can set the verifier", async function () {
      await expect(
        coldChainRegistry.connect(stranger).setVerifier(stranger.address)
      ).to.be.revertedWith("Not admin");
    });

    it("rejects the zero address for both setters", async function () {
      await expect(coldChainRegistry.setTransferLedger(ethers.ZeroAddress)).to.be.revertedWith("Invalid transfer ledger");
      await expect(coldChainRegistry.setVerifier(ethers.ZeroAddress)).to.be.revertedWith("Invalid verifier");
    });
  });

  describe("TransferLedger admin wiring", function () {
    it("only admin can set the cold-chain registry", async function () {
      await expect(
        transferLedger.connect(stranger).setColdChainRegistry(stranger.address)
      ).to.be.revertedWith("Not admin");
    });

    it("rejects anchorEnv before a cold-chain registry is configured", async function () {
      const TransferLedgerFactory = await ethers.getContractFactory("TransferLedger");
      const bareLedger = await TransferLedgerFactory.deploy(await registry.getAddress(), await accessControl.getAddress());
      const now = Math.floor(Date.now() / 1000);

      await expect(
        bareLedger.anchorEnv(ethers.id("LOT"), ethers.id("LEG"), ethers.id("ROOT"), now, now + 3600, true, "0x1234", now)
      ).to.be.revertedWith("Cold chain registry not set");
    });
  });
});
