
import { expect } from "chai";
import { ethers } from "hardhat";

describe("ProductRegistry", function () {

  let accessControl: any;
  let registry: any;

  let admin: any;
  let manufacturer: any;
  let importer: any;
  let user1: any;

  let MANUFACTURER_ROLE: any;
  let IMPORTER_ROLE: any;

  beforeEach(async function () {

    [
      admin,
      manufacturer,
      importer,
      user1
    ] = await ethers.getSigners();

    const AccessControlFactory =
      await ethers.getContractFactory(
        "SupplyChainAccessControl"
      );

    accessControl =
      await AccessControlFactory.deploy(
        admin.address
      );

    const RegistryFactory =
      await ethers.getContractFactory(
        "ProductRegistry"
      );

    registry =
      await RegistryFactory.deploy(
        await accessControl.getAddress()
      );

    MANUFACTURER_ROLE =
      await accessControl.MANUFACTURER_ROLE();

    IMPORTER_ROLE =
      await accessControl.IMPORTER_ROLE();

    await accessControl.grantUserRole(
      manufacturer.address,
      MANUFACTURER_ROLE
    );

    await accessControl.grantUserRole(
      importer.address,
      IMPORTER_ROLE
    );

  });

  describe("Deployment", function () {

    it("Should deploy successfully", async function () {

      expect(
        await registry.getAddress()
      ).to.not.equal(
        ethers.ZeroAddress
      );

    });

  });

it("Should store correct access control address", async function () {

  expect(
    await registry.accessControl()
  ).to.equal(
    await accessControl.getAddress()
  );

});

it("Should initialize transfer ledger as zero address", async function () {

  expect(
    await registry.transferLedger()
  ).to.equal(
    ethers.ZeroAddress
  );

});


  describe("Register Product", function () {

    it("Should allow manufacturer to register product", async function () {

      const serialID =
        ethers.id("SERIAL-1");

      const batchHash =
        ethers.id("BATCH-1");

      const metadataHash =
        ethers.id("META-1");

      await registry
        .connect(manufacturer)
        .registerProduct(
          serialID,
          batchHash,
          metadataHash,
          ethers.ZeroHash,
          "0x"
        );

      expect(
        await registry.productExists(serialID)
      ).to.equal(true);

    });

    it("Should reject duplicate serial", async function () {

      const serialID =
        ethers.id("SERIAL-2");

      const batchHash =
        ethers.id("BATCH-2");

      const metadataHash =
        ethers.id("META-2");

      await registry
        .connect(manufacturer)
        .registerProduct(
          serialID,
          batchHash,
          metadataHash,
          ethers.ZeroHash,
          "0x"
        );

      await expect(
        registry
          .connect(manufacturer)
          .registerProduct(
            serialID,
            batchHash,
            metadataHash,
            ethers.ZeroHash,
            "0x"
          )
      ).to.be.revertedWith(
        "Duplicate serial"
      );

    });

    it("Should reject unauthorized user", async function () {

      const serialID =
        ethers.id("SERIAL-3");

      const batchHash =
        ethers.id("BATCH-3");

      const metadataHash =
        ethers.id("META-3");

      await expect(
        registry
          .connect(user1)
          .registerProduct(
            serialID,
            batchHash,
            metadataHash,
            ethers.ZeroHash,
            "0x"
          )
      ).to.be.revertedWith(
        "Not manufacturer or importer"
      );

    });

    it("Should reject invalid serial", async function () {

      const batchHash =
        ethers.id("BATCH-4");

      const metadataHash =
        ethers.id("META-4");

      await expect(
        registry
          .connect(manufacturer)
          .registerProduct(
            ethers.ZeroHash,
            batchHash,
            metadataHash,
            ethers.ZeroHash,
            "0x"
          )
      ).to.be.revertedWith(
        "Invalid serial"
      );

    });

    it("Should allow importer with proof", async function () {

      const serialID =
        ethers.id("SERIAL-5");

      const batchHash =
        ethers.id("BATCH-5");

      const metadataHash =
        ethers.id("META-5");

      const importDocHash =
        ethers.id("IMPORT-DOC");

      await registry
        .connect(importer)
        .registerProduct(
          serialID,
          batchHash,
          metadataHash,
          importDocHash,
          "0x1234"
        );

      expect(
        await registry.isImportedProduct(serialID)
      ).to.equal(true);

      expect(
        await registry.isZkpVerified(serialID)
      ).to.equal(true);

    });

    it("Should reject importer without proof", async function () {

      const serialID =
        ethers.id("SERIAL-6");

      const batchHash =
        ethers.id("BATCH-6");

      const metadataHash =
        ethers.id("META-6");

      const importDocHash =
        ethers.id("IMPORT-DOC");

      await expect(
        registry
          .connect(importer)
          .registerProduct(
            serialID,
            batchHash,
            metadataHash,
            importDocHash,
            "0x"
          )
      ).to.be.revertedWith(
        "Invalid proof"
      );

    });

    it("Should reject importer without import document", async function () {

      const serialID =
        ethers.id("SERIAL-7");

      const batchHash =
        ethers.id("BATCH-7");

      const metadataHash =
        ethers.id("META-7");

      await expect(
        registry
          .connect(importer)
          .registerProduct(
            serialID,
            batchHash,
            metadataHash,
            ethers.ZeroHash,
            "0x1234"
          )
      ).to.be.revertedWith(
        "Missing import doc"
      );

    });

    it("Should verify proof correctly", async function () {

      const result =
        await registry.verifyProof(
          ethers.id("DOC"),
          "0x1234"
        );

      expect(result).to.equal(true);

    });

    it("Should return false for invalid proof", async function () {

      const result =
        await registry.verifyProof(
          ethers.ZeroHash,
          "0x"
        );

      expect(result).to.equal(false);

    });

  });

});

