import { expect } from "chai";
import { ethers } from "hardhat";

describe("ProductRegistry - Lot Management", function () {
  let registry: any;
  let accessControl: any;
  let admin: any;
  let manufacturer: any;
  let distributor: any;

  let MANUFACTURER_ROLE: any;
  let DISTRIBUTOR_ROLE: any;

  beforeEach(async function () {
    [admin, manufacturer, distributor] = await ethers.getSigners();

    // Deploy Access Control
    const AccessControlFactory = await ethers.getContractFactory(
      "SupplyChainAccessControl"
    );
    accessControl = await AccessControlFactory.deploy(admin.address);

    // Deploy Product Registry
    const RegistryFactory = await ethers.getContractFactory("ProductRegistry");
    registry = await RegistryFactory.deploy(await accessControl.getAddress());

    // Get roles
    MANUFACTURER_ROLE = await accessControl.MANUFACTURER_ROLE();
    DISTRIBUTOR_ROLE = await accessControl.DISTRIBUTOR_ROLE();

    // Grant role
    await accessControl.grantUserRole(manufacturer.address, MANUFACTURER_ROLE);
    await accessControl.configureMvpRoutes();
  });

  describe("Commission Lot", function () {
    it("Should commission a lot successfully", async function () {
      const lotIdHash = ethers.id("LOT-001");
      const aggregationRoot = ethers.id("AGG-ROOT-001");
      const metadataHash = ethers.id("META-001");
      const zkpProof = "0x1234";

      await registry
        .connect(manufacturer)
        .commissionLot(lotIdHash, aggregationRoot, metadataHash, zkpProof);

      expect(await registry.isLotExists(lotIdHash)).to.equal(true);
      expect(await registry.getLotAggregationRoot(lotIdHash)).to.equal(aggregationRoot);
      expect(await registry.getLotMetadataHash(lotIdHash)).to.equal(metadataHash);
    });

    it("Should reject duplicate lot", async function () {
      const lotIdHash = ethers.id("LOT-DUP");
      const aggregationRoot = ethers.id("AGG-ROOT");
      const metadataHash = ethers.id("META");
      const zkpProof = "0x1234";

      await registry
        .connect(manufacturer)
        .commissionLot(lotIdHash, aggregationRoot, metadataHash, zkpProof);

      await expect(
        registry
          .connect(manufacturer)
          .commissionLot(lotIdHash, aggregationRoot, metadataHash, zkpProof)
      ).to.be.revertedWith("Lot already exists");
    });

    it("Should reject invalid lot ID", async function () {
      await expect(
        registry
          .connect(manufacturer)
          .commissionLot(ethers.ZeroHash, ethers.id("ROOT"), ethers.id("META"), "0x")
      ).to.be.revertedWith("Invalid lot ID");
    });

    it("Should reject invalid aggregation root", async function () {
      await expect(
        registry
          .connect(manufacturer)
          .commissionLot(ethers.id("LOT"), ethers.ZeroHash, ethers.id("META"), "0x")
      ).to.be.revertedWith("Invalid aggregation root");
    });

    it("Should reject unauthorized user", async function () {
      await expect(
        registry.commissionLot(ethers.id("LOT"), ethers.id("ROOT"), ethers.id("META"), "0x")
      ).to.be.revertedWith("Not manufacturer or importer");
    });
  });

  describe("Decommission Unit", function () {
    beforeEach(async function () {
      // Commission a lot first
      await registry
        .connect(manufacturer)
        .commissionLot(
          ethers.id("LOT-001"),
          ethers.id("UNIT-001"), // Use unit hash as aggregation root for easy proof
          ethers.id("META-001"),
          "0x1234"
        );
    });

    it("Should decommission a unit with valid Merkle proof", async function () {
      const unitIdHash = ethers.id("UNIT-001");
      const lotIdHash = ethers.id("LOT-001");
      const eventType = ethers.id("DISPENSED");

      // For testing: pass empty proof - root equals leaf in MerkleProof.verify
      const merkleProof: any = [];

      await registry
        .connect(manufacturer)
        .decommission(unitIdHash, merkleProof, lotIdHash, eventType);

      expect(await registry.isUnitDecommissioned(unitIdHash)).to.equal(true);
      expect(await registry.getUnitLotId(unitIdHash)).to.equal(lotIdHash);
    });

    it("Should reject invalid unit ID", async function () {
      await expect(
        registry
          .connect(manufacturer)
          .decommission(
            ethers.ZeroHash,
            [],
            ethers.id("LOT-001"),
            ethers.id("EVENT")
          )
      ).to.be.revertedWith("Invalid unit ID");
    });

    it("Should reject invalid lot ID", async function () {
      await expect(
        registry
          .connect(manufacturer)
          .decommission(
            ethers.id("UNIT"),
            [],
            ethers.ZeroHash,
            ethers.id("EVENT")
          )
      ).to.be.revertedWith("Invalid lot ID");
    });

    it("Should reject non-existent lot", async function () {
      await expect(
        registry
          .connect(manufacturer)
          .decommission(
            ethers.id("UNIT"),
            [],
            ethers.id("NONEXISTENT"),
            ethers.id("EVENT")
          )
      ).to.be.revertedWith("Lot not found");
    });

    it("Should reject already decommissioned unit", async function () {
      const unitId = ethers.id("UNIT-DUP");
      const merkleProof: any = [];

      // Commission a separate lot for this test
      await registry
        .connect(manufacturer)
        .commissionLot(
          ethers.id("LOT-DUP"),
          unitId, // Use unitId as aggregation root
          ethers.id("META-DUP"),
          "0x1234"
        );

      await registry
        .connect(manufacturer)
        .decommission(
          unitId,
          merkleProof,
          ethers.id("LOT-DUP"),
          ethers.id("EVENT")
        );

      await expect(
        registry
          .connect(manufacturer)
          .decommission(
            unitId,
            merkleProof,
            ethers.id("LOT-DUP"),
            ethers.id("EVENT")
          )
      ).to.be.revertedWith("Unit already decommissioned");
    });
  });

  describe("Disaggregate Lot", function () {
    beforeEach(async function () {
      await registry
        .connect(manufacturer)
        .commissionLot(
          ethers.id("PARENT-LOT"),
          ethers.id("PARENT-ROOT"),
          ethers.id("PARENT-META"),
          "0x1234"
        );
    });

    it("Should disaggregate a lot into sub-lots", async function () {
      const parentLotIdHash = ethers.id("PARENT-LOT");
      const subLotIdHash = ethers.id("SUB-LOT-001");
      const subLotRoot = ethers.id("SUB-ROOT-001");

      await registry
        .connect(manufacturer)
        .disaggregate(parentLotIdHash, subLotIdHash, subLotRoot, distributor.address);

      expect(await registry.isLotExists(subLotIdHash)).to.equal(true);
      expect(await registry.getLotAggregationRoot(subLotIdHash)).to.equal(subLotRoot);
      expect(await registry.getSubLotCount(parentLotIdHash)).to.equal(1);
    });

    it("Should track multiple sub-lots", async function () {
      const parentLotIdHash = ethers.id("PARENT-LOT");

      await registry
        .connect(manufacturer)
        .disaggregate(parentLotIdHash, ethers.id("SUB-1"), ethers.id("ROOT-1"), distributor.address);

      await registry
        .connect(manufacturer)
        .disaggregate(parentLotIdHash, ethers.id("SUB-2"), ethers.id("ROOT-2"), distributor.address);

      expect(await registry.getSubLotCount(parentLotIdHash)).to.equal(2);
    });

    it("Should reject invalid parent lot", async function () {
      await expect(
        registry
          .connect(manufacturer)
          .disaggregate(
            ethers.ZeroHash,
            ethers.id("SUB"),
            ethers.id("ROOT"),
            distributor.address
          )
      ).to.be.revertedWith("Invalid parent lot");
    });

    it("Should reject duplicate sub-lot", async function () {
      const parentLotIdHash = ethers.id("PARENT-LOT");
      const subLotIdHash = ethers.id("SUB-DUP");

      await registry
        .connect(manufacturer)
        .disaggregate(parentLotIdHash, subLotIdHash, ethers.id("ROOT"), distributor.address);

      await expect(
        registry
          .connect(manufacturer)
          .disaggregate(parentLotIdHash, subLotIdHash, ethers.id("ROOT"), distributor.address)
      ).to.be.revertedWith("Sub-lot already exists");
    });

    it("Should reject invalid sub-lot ID", async function () {
      await expect(
        registry
          .connect(manufacturer)
          .disaggregate(
            ethers.id("PARENT-LOT"),
            ethers.ZeroHash,
            ethers.id("ROOT"),
            distributor.address
          )
      ).to.be.revertedWith("Invalid sub-lot");
    });
  });

  describe("Lot Recall", function () {
    beforeEach(async function () {
      // Grant recall authority role to admin
      const RECALL_AUTHORITY_ROLE = await accessControl.RECALL_AUTHORITY_ROLE();
      await accessControl.grantUserRole(admin.address, RECALL_AUTHORITY_ROLE);

      // Commission a lot
      await registry
        .connect(manufacturer)
        .commissionLot(
          ethers.id("RECALL-LOT"),
          ethers.id("RECALL-ROOT"),
          ethers.id("RECALL-META"),
          "0x1234"
        );
    });

    it("Should recall a lot", async function () {
      const lotIdHash = ethers.id("RECALL-LOT");
      const reasonHash = ethers.id("QUALITY-ISSUE");

      await expect(
        registry.connect(admin).recallLot(lotIdHash, reasonHash)
      )
        .to.emit(registry, "BatchRecalled")
        .withArgs(lotIdHash, reasonHash, 0);

      expect(await registry.isLotRecalled(lotIdHash)).to.equal(true);
    });

    it("Should reject non-authority recall", async function () {
      await expect(
        registry
          .connect(manufacturer)
          .recallLot(ethers.id("RECALL-LOT"), ethers.id("REASON"))
      ).to.be.revertedWith("Not recall authority");
    });

    it("Should reject already recalled lot", async function () {
      await registry
        .connect(admin)
        .recallLot(ethers.id("RECALL-LOT"), ethers.id("REASON"));

      await expect(
        registry
          .connect(admin)
          .recallLot(ethers.id("RECALL-LOT"), ethers.id("REASON"))
      ).to.be.revertedWith("Lot already recalled");
    });
  });
});

describe("ColdChainRegistry", function () {
  let coldChain: any;
  let admin: any;
  let manufacturer: any;

  beforeEach(async function () {
    [admin, manufacturer] = await ethers.getSigners();

    const ColdChainFactory = await ethers.getContractFactory("ColdChainRegistry");
    coldChain = await ColdChainFactory.deploy();
  });

  describe("Anchor Environmental Data", function () {
    it("Should anchor environmental data for a lot leg", async function () {
      const lotIdHash = ethers.id("LOT-001");
      const legId = 1;
      const envMerkleRoot = ethers.id("ENV-ROOT-001");
      const windowStart = BigInt(Math.floor(Date.now() / 1000));
      const windowEnd = windowStart + 3600n; // 1 hour later
      const complianceFlag = 0; // COMPLIANT
      const zkProof = "0x1234";

      await coldChain.anchorEnv(
        lotIdHash,
        legId,
        envMerkleRoot,
        windowStart,
        windowEnd,
        complianceFlag,
        zkProof
      );

      const leg = await coldChain.getLeg(lotIdHash, legId);
      expect(leg.exists).to.equal(true);
      expect(leg.merkleRoot).to.equal(envMerkleRoot);
      expect(await coldChain.getLegCount(lotIdHash)).to.equal(1);
    });

    it("Should reject duplicate leg", async function () {
      const lotIdHash = ethers.id("LOT-001");
      const legId = 1;
      const now = BigInt(Math.floor(Date.now() / 1000));

      await coldChain.anchorEnv(
        lotIdHash,
        legId,
        ethers.id("ROOT"),
        now,
        now + 3600n,
        0,
        "0x"
      );

      await expect(
        coldChain.anchorEnv(
          lotIdHash,
          legId,
          ethers.id("ROOT"),
          now,
          now + 3600n,
          0,
          "0x"
        )
      ).to.be.revertedWith("Leg already anchored");
    });

    it("Should reject invalid lot ID", async function () {
      const now = BigInt(Math.floor(Date.now() / 1000));
      await expect(
        coldChain.anchorEnv(
          ethers.ZeroHash,
          1,
          ethers.id("ROOT"),
          now,
          now + 3600n,
          0,
          "0x"
        )
      ).to.be.revertedWith("Invalid lot ID");
    });

    it("Should reject invalid Merkle root", async function () {
      const now = BigInt(Math.floor(Date.now() / 1000));
      await expect(
        coldChain.anchorEnv(
          ethers.id("LOT"),
          1,
          ethers.ZeroHash,
          now,
          now + 3600n,
          0,
          "0x"
        )
      ).to.be.revertedWith("Invalid Merkle root");
    });

    it("Should reject invalid window (end before start)", async function () {
      const now = BigInt(Math.floor(Date.now() / 1000));
      await expect(
        coldChain.anchorEnv(
          ethers.id("LOT"),
          1,
          ethers.id("ROOT"),
          now + 3600n,
          now,
          0,
          "0x"
        )
      ).to.be.revertedWith("Invalid window");
    });

    it("Should track multiple legs per lot", async function () {
      const lotIdHash = ethers.id("LOT-MULTI");
      const now = BigInt(Math.floor(Date.now() / 1000));

      await coldChain.anchorEnv(
        lotIdHash,
        1,
        ethers.id("ROOT-1"),
        now,
        now + 3600n,
        0,
        "0x"
      );

      await coldChain.anchorEnv(
        lotIdHash,
        2,
        ethers.id("ROOT-2"),
        now + 3600n,
        now + 7200n,
        0,
        "0x"
      );

      expect(await coldChain.getLegCount(lotIdHash)).to.equal(2);
    });

    it("Should set compliance flag correctly", async function () {
      const lotIdHash = ethers.id("LOT-FLAG");
      const now = BigInt(Math.floor(Date.now() / 1000));

      await coldChain.anchorEnv(
        lotIdHash,
        1,
        ethers.id("ROOT"),
        now,
        now + 3600n,
        0, // COMPLIANT
        "0x"
      );

      expect(await coldChain.getLotComplianceFlag(lotIdHash)).to.equal(0);

      await coldChain.anchorEnv(
        lotIdHash,
        2,
        ethers.id("ROOT-2"),
        now + 3600n,
        now + 7200n,
        1, // EXCURSION
        "0x"
      );

      expect(await coldChain.getLotComplianceFlag(lotIdHash)).to.equal(1);

      await coldChain.anchorEnv(
        lotIdHash,
        3,
        ethers.id("ROOT-3"),
        now + 7200n,
        now + 10800n,
        2, // BREACH
        "0x"
      );

      expect(await coldChain.getLotComplianceFlag(lotIdHash)).to.equal(2);
    });
  });

  describe("Verify Reading", function () {
    it("Should verify a valid reading", async function () {
      const lotIdHash = ethers.id("LOT-VERIFY");
      const legId = 1;
      const readingHash = ethers.id("READING-001");
      const now = BigInt(Math.floor(Date.now() / 1000));

      await coldChain.anchorEnv(
        lotIdHash,
        legId,
        readingHash, // Use readingHash as root for test
        now,
        now + 3600n,
        0,
        "0x"
      );

      const isValid = await coldChain.verifyReading(
        lotIdHash,
        legId,
        readingHash,
        []
      );

      expect(isValid).to.equal(true);
    });

    it("Should reject non-existent leg", async function () {
      await expect(
        coldChain.verifyReading(
          ethers.id("LOT"),
          99,
          ethers.id("READING"),
          []
        )
      ).to.be.revertedWith("Leg not found");
    });
  });
});

describe("TransferLedger - Lot Level", function () {
  let transferLedger: any;
  let registry: any;
  let accessControl: any;
  let admin: any;
  let manufacturer: any;
  let distributor: any;

  beforeEach(async function () {
    [admin, manufacturer, distributor] = await ethers.getSigners();

    // Deploy Access Control
    const AccessControlFactory = await ethers.getContractFactory(
      "SupplyChainAccessControl"
    );
    accessControl = await AccessControlFactory.deploy(admin.address);

    // Deploy Product Registry
    const RegistryFactory = await ethers.getContractFactory("ProductRegistry");
    registry = await RegistryFactory.deploy(await accessControl.getAddress());

    // Deploy Transfer Ledger
    const TransferLedgerFactory = await ethers.getContractFactory("TransferLedger");
    transferLedger = await TransferLedgerFactory.deploy(
      await registry.getAddress(),
      await accessControl.getAddress()
    );

    // Grant roles and configure routes
    const MANUFACTURER_ROLE = await accessControl.MANUFACTURER_ROLE();
    const DISTRIBUTOR_ROLE = await accessControl.DISTRIBUTOR_ROLE();

    await accessControl.grantUserRole(manufacturer.address, MANUFACTURER_ROLE);
    await accessControl.grantUserRole(distributor.address, DISTRIBUTOR_ROLE);
    await accessControl.configureMvpRoutes();

    // Set transfer ledger
    await registry.setTransferLedger(await transferLedger.getAddress());
  });

  it("Should create transfer with lotIdHash and legId", async function () {
    const serialID = ethers.id("SERIAL-1");
    const lotIdHash = ethers.id("LOT-001");
    const legId = 1;

    await registry
      .connect(manufacturer)
      .registerProduct(
        serialID,
        ethers.id("BATCH-1"),
        ethers.id("META-1"),
        ethers.ZeroHash,
        "0x"
      );

    await transferLedger
      .connect(manufacturer)
      .createTransferRequest(
        serialID,
        distributor.address,
        ethers.id("LOC-A"),
        ethers.id("LOC-B"),
        lotIdHash,
        legId
      );

    const pending = await transferLedger.pendingTransfers(serialID);
    expect(pending.exists).to.equal(true);
    expect(pending.lotIdHash).to.equal(lotIdHash);
    expect(pending.legId).to.equal(legId);
  });

  it("Should record lotIdHash and legId in transfer history", async function () {
    const serialID = ethers.id("SERIAL-2");
    const lotIdHash = ethers.id("LOT-002");
    const legId = 2;

    await registry
      .connect(manufacturer)
      .registerProduct(
        serialID,
        ethers.id("BATCH-2"),
        ethers.id("META-2"),
        ethers.ZeroHash,
        "0x"
      );

    await transferLedger
      .connect(manufacturer)
      .createTransferRequest(
        serialID,
        distributor.address,
        ethers.id("LOC-A"),
        ethers.id("LOC-B"),
        lotIdHash,
        legId
      );

    await transferLedger
      .connect(distributor)
      .confirmTransfer(serialID, ethers.id("LOC-B"));

    const history = await transferLedger.getTransferHistory(serialID);
    expect(history.length).to.equal(1);
    expect(history[0].lotIdHash).to.equal(lotIdHash);
    expect(history[0].legId).to.equal(legId);
  });
});
