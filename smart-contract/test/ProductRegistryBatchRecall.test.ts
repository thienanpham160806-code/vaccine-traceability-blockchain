import { expect } from "chai";
import { ethers } from "hardhat";

describe("ProductRegistry - Batch and Recall", function () {
  async function deployFixture() {
    const [admin, manufacturer, recallAuthority, outsider] =
      await ethers.getSigners();

    const AccessControlFactory = await ethers.getContractFactory(
      "SupplyChainAccessControl"
    );

    const accessControl = await AccessControlFactory.deploy(admin.address);
    await accessControl.waitForDeployment();

    const ProductRegistryFactory = await ethers.getContractFactory(
      "ProductRegistry"
    );

    const productRegistry = await ProductRegistryFactory.deploy(
      await accessControl.getAddress()
    );
    await productRegistry.waitForDeployment();

    const MANUFACTURER_ROLE = await accessControl.MANUFACTURER_ROLE();
    const RECALL_AUTHORITY_ROLE =
      await accessControl.RECALL_AUTHORITY_ROLE();

    await accessControl.grantUserRole(
      manufacturer.address,
      MANUFACTURER_ROLE
    );

    await accessControl.grantUserRole(
      recallAuthority.address,
      RECALL_AUTHORITY_ROLE
    );

    const batchHash = ethers.keccak256(ethers.toUtf8Bytes("BATCH-001"));
    const reasonHash = ethers.keccak256(
      ethers.toUtf8Bytes("TEMPERATURE_ANOMALY")
    );

    const serial1 = ethers.keccak256(ethers.toUtf8Bytes("SERIAL-001"));
    const serial2 = ethers.keccak256(ethers.toUtf8Bytes("SERIAL-002"));
    const serial3 = ethers.keccak256(ethers.toUtf8Bytes("SERIAL-003"));

    const metadataHash1 = ethers.keccak256(
      ethers.toUtf8Bytes("METADATA-001")
    );

    const metadataHash2 = ethers.keccak256(
      ethers.toUtf8Bytes("METADATA-002")
    );

    const metadataHash3 = ethers.keccak256(
      ethers.toUtf8Bytes("METADATA-003")
    );

    return {
      accessControl,
      productRegistry,
      admin,
      manufacturer,
      recallAuthority,
      outsider,
      batchHash,
      reasonHash,
      serial1,
      serial2,
      serial3,
      metadataHash1,
      metadataHash2,
      metadataHash3,
    };
  }

  async function registerTwoProductsInSameBatch() {
    const fixture = await deployFixture();

    const {
      productRegistry,
      manufacturer,
      batchHash,
      serial1,
      serial2,
      metadataHash1,
      metadataHash2,
    } = fixture;

    await productRegistry
      .connect(manufacturer)
      .registerProduct(
        serial1,
        batchHash,
        metadataHash1,
        ethers.ZeroHash,
        "0x"
      );

    await productRegistry
      .connect(manufacturer)
      .registerProduct(
        serial2,
        batchHash,
        metadataHash2,
        ethers.ZeroHash,
        "0x"
      );

    return fixture;
  }

  it("Should return correct batch size after registering products", async function () {
    const { productRegistry, batchHash } =
      await registerTwoProductsInSameBatch();

    expect(await productRegistry.getBatchSize(batchHash)).to.equal(2);
  });

  it("Should return all serials in a batch", async function () {
    const { productRegistry, batchHash, serial1, serial2 } =
      await registerTwoProductsInSameBatch();

    const serials = await productRegistry.getBatchSerials(batchHash);

    expect(serials.length).to.equal(2);
    expect(serials[0]).to.equal(serial1);
    expect(serials[1]).to.equal(serial2);
  });

  it("Should return false when batch has not been recalled", async function () {
    const { productRegistry, batchHash } =
      await registerTwoProductsInSameBatch();

    expect(await productRegistry.isBatchRecalled(batchHash)).to.equal(false);
  });

  it("Should return correct batch summary before recall", async function () {
    const { productRegistry, batchHash } =
      await registerTwoProductsInSameBatch();

    const summary = await productRegistry.getBatchSummary(batchHash);

    expect(summary.recalled).to.equal(false);
    expect(summary.totalProducts).to.equal(2);
  });

  it("Should allow recall authority to recall a batch", async function () {
    const {
      productRegistry,
      recallAuthority,
      batchHash,
      reasonHash,
    } = await registerTwoProductsInSameBatch();

    await expect(
      productRegistry
        .connect(recallAuthority)
        .recallBatch(batchHash, reasonHash)
    )
      .to.emit(productRegistry, "BatchRecalled")
      .withArgs(batchHash, reasonHash, 2);

    expect(await productRegistry.isBatchRecalled(batchHash)).to.equal(true);
  });

  it("Should update all products in batch to RECALLED", async function () {
    const {
      productRegistry,
      recallAuthority,
      batchHash,
      reasonHash,
      serial1,
      serial2,
    } = await registerTwoProductsInSameBatch();

    await productRegistry
      .connect(recallAuthority)
      .recallBatch(batchHash, reasonHash);

    const RECALLED = 5;

    expect(await productRegistry.getStatus(serial1)).to.equal(RECALLED);
    expect(await productRegistry.getStatus(serial2)).to.equal(RECALLED);
  });

  it("Should set critical risk level and flag reason after recall", async function () {
    const {
      productRegistry,
      recallAuthority,
      batchHash,
      reasonHash,
      serial1,
    } = await registerTwoProductsInSameBatch();

    await productRegistry
      .connect(recallAuthority)
      .recallBatch(batchHash, reasonHash);

    const RISK_CRITICAL = await productRegistry.RISK_CRITICAL();

    expect(await productRegistry.getRiskLevel(serial1)).to.equal(
      RISK_CRITICAL
    );

    expect(await productRegistry.getFlagReason(serial1)).to.equal(
      reasonHash
    );
  });

  it("Should return correct batch summary after recall", async function () {
    const {
      productRegistry,
      recallAuthority,
      batchHash,
      reasonHash,
    } = await registerTwoProductsInSameBatch();

    await productRegistry
      .connect(recallAuthority)
      .recallBatch(batchHash, reasonHash);

    const summary = await productRegistry.getBatchSummary(batchHash);

    expect(summary.recalled).to.equal(true);
    expect(summary.totalProducts).to.equal(2);
  });

  it("Should reject recall by non recall authority", async function () {
    const {
      productRegistry,
      outsider,
      batchHash,
      reasonHash,
    } = await registerTwoProductsInSameBatch();

    await expect(
      productRegistry
        .connect(outsider)
        .recallBatch(batchHash, reasonHash)
    ).to.be.revertedWith("Not recall authority");
  });

  it("Should reject recall for empty batch", async function () {
    const { productRegistry, recallAuthority, reasonHash } =
      await deployFixture();

    const emptyBatchHash = ethers.keccak256(
      ethers.toUtf8Bytes("EMPTY-BATCH")
    );

    await expect(
      productRegistry
        .connect(recallAuthority)
        .recallBatch(emptyBatchHash, reasonHash)
    ).to.be.revertedWith("Empty batch");
  });

  it("Should reject recall with invalid batch hash", async function () {
    const { productRegistry, recallAuthority, reasonHash } =
      await deployFixture();

    await expect(
      productRegistry
        .connect(recallAuthority)
        .recallBatch(ethers.ZeroHash, reasonHash)
    ).to.be.revertedWith("Invalid batch");
  });

  it("Should reject recall with invalid reason hash", async function () {
    const { productRegistry, recallAuthority, batchHash } =
      await registerTwoProductsInSameBatch();

    await expect(
      productRegistry
        .connect(recallAuthority)
        .recallBatch(batchHash, ethers.ZeroHash)
    ).to.be.revertedWith("Invalid reason");
  });

  it("Should reject recalling the same batch twice", async function () {
    const {
      productRegistry,
      recallAuthority,
      batchHash,
      reasonHash,
    } = await registerTwoProductsInSameBatch();

    await productRegistry
      .connect(recallAuthority)
      .recallBatch(batchHash, reasonHash);

    await expect(
      productRegistry
        .connect(recallAuthority)
        .recallBatch(batchHash, reasonHash)
    ).to.be.revertedWith("Batch already recalled");
  });

  it("Should reject registering new product into recalled batch", async function () {
    const {
      productRegistry,
      manufacturer,
      recallAuthority,
      batchHash,
      reasonHash,
      serial3,
      metadataHash3,
    } = await registerTwoProductsInSameBatch();

    await productRegistry
      .connect(recallAuthority)
      .recallBatch(batchHash, reasonHash);

    await expect(
      productRegistry
        .connect(manufacturer)
        .registerProduct(
          serial3,
          batchHash,
          metadataHash3,
          ethers.ZeroHash,
          "0x"
        )
    ).to.be.revertedWith("Batch recalled");
  });
});