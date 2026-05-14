
import { expect } from "chai";
import { ethers } from "hardhat";

describe("TransferLedger", function () {

  let accessControl: any;
  let registry: any;
  let transferLedger: any;

  let admin: any;
  let manufacturer: any;
  let importer: any;
  let distributor: any;
  let pharmacy: any;
  let user1: any;

  let MANUFACTURER_ROLE: any;
  let IMPORTER_ROLE: any;
  let DISTRIBUTOR_ROLE: any;
  let PHARMACY_ROLE: any;

  beforeEach(async function () {

    [
      admin,
      manufacturer,
      importer,
      distributor,
      pharmacy,
      user1
    ] = await ethers.getSigners();

    // Deploy Access Control
    const AccessControlFactory =
      await ethers.getContractFactory(
        "SupplyChainAccessControl"
      );

    accessControl =
      await AccessControlFactory.deploy(
        admin.address
      );

    // Deploy Product Registry
    const RegistryFactory =
      await ethers.getContractFactory(
        "ProductRegistry"
      );

    registry =
      await RegistryFactory.deploy(
        await accessControl.getAddress()
      );

    // Deploy Transfer Ledger
    const TransferLedgerFactory =
      await ethers.getContractFactory(
        "TransferLedger"
      );

    transferLedger =
      await TransferLedgerFactory.deploy(
        await registry.getAddress(),
        await accessControl.getAddress()
      );

    // Get roles
    MANUFACTURER_ROLE =
      await accessControl.MANUFACTURER_ROLE();

    IMPORTER_ROLE =
      await accessControl.IMPORTER_ROLE();

    DISTRIBUTOR_ROLE =
      await accessControl.DISTRIBUTOR_ROLE();

    PHARMACY_ROLE =
      await accessControl.PHARMACY_ROLE();

    // Grant roles
    await accessControl.grantUserRole(
      manufacturer.address,
      MANUFACTURER_ROLE
    );

    await accessControl.grantUserRole(
      importer.address,
      IMPORTER_ROLE
    );

    await accessControl.grantUserRole(
      distributor.address,
      DISTRIBUTOR_ROLE
    );

    await accessControl.grantUserRole(
      pharmacy.address,
      PHARMACY_ROLE
    );

    // Configure routes
    await accessControl.configureMvpRoutes();

    // Set transfer ledger
    await registry.setTransferLedger(
      await transferLedger.getAddress()
    );

  });

  describe("Deployment", function () {

    it("Should deploy successfully", async function () {

      expect(
        await transferLedger.getAddress()
      ).to.not.equal(
        ethers.ZeroAddress
      );

    });

    it("Should store correct registry address", async function () {

      expect(
        await transferLedger.productRegistry()
      ).to.equal(
        await registry.getAddress()
      );

    });

    it("Should store correct access control address", async function () {

      expect(
        await transferLedger.accessControl()
      ).to.equal(
        await accessControl.getAddress()
      );

    });

  });

  describe("Create Transfer Request", function () {

    it("Should create transfer request successfully", async function () {

      const serialID =
        ethers.id("SERIAL-1");

      const batchHash =
        ethers.id("BATCH-1");

      const metadataHash =
        ethers.id("META-1");

      const fromLocation =
        ethers.id("WAREHOUSE-A");

      const toLocation =
        ethers.id("WAREHOUSE-B");

      await registry
        .connect(manufacturer)
        .registerProduct(
          serialID,
          batchHash,
          metadataHash,
          ethers.ZeroHash,
          "0x"
        );

      await transferLedger
        .connect(manufacturer)
        .createTransferRequest(
          serialID,
          distributor.address,
          fromLocation,
          toLocation
        );

      const pending =
        await transferLedger.pendingTransfers(
          serialID
        );

      expect(
        pending.exists
      ).to.equal(true);

    });

    it("Should reject invalid serial", async function () {

      const fromLocation =
        ethers.id("A");

      const toLocation =
        ethers.id("B");

      await expect(
        transferLedger
          .connect(manufacturer)
          .createTransferRequest(
            ethers.ZeroHash,
            distributor.address,
            fromLocation,
            toLocation
          )
      ).to.be.revertedWith(
        "Invalid serial"
      );

    });

    it("Should reject non owner transfer", async function () {

      const serialID =
        ethers.id("SERIAL-2");

      const batchHash =
        ethers.id("BATCH-2");

      const metadataHash =
        ethers.id("META-2");

      const fromLocation =
        ethers.id("A");

      const toLocation =
        ethers.id("B");

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
        transferLedger
          .connect(user1)
          .createTransferRequest(
            serialID,
            distributor.address,
            fromLocation,
            toLocation
          )
      ).to.be.revertedWith(
        "Not current owner"
      );

    });

    it("Should reject invalid route", async function () {

      const serialID =
        ethers.id("SERIAL-3");

      const batchHash =
        ethers.id("BATCH-3");

      const metadataHash =
        ethers.id("META-3");

      const fromLocation =
        ethers.id("A");

      const toLocation =
        ethers.id("B");

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
        transferLedger
          .connect(manufacturer)
          .createTransferRequest(
            serialID,
            pharmacy.address,
            fromLocation,
            toLocation
          )
      ).to.be.revertedWith(
        "Invalid route"
      );

    });

    it("Should mark product in transit", async function () {

      const serialID =
        ethers.id("SERIAL-4");

      const batchHash =
        ethers.id("BATCH-4");

      const metadataHash =
        ethers.id("META-4");

      const fromLocation =
        ethers.id("A");

      const toLocation =
        ethers.id("B");

      await registry
        .connect(manufacturer)
        .registerProduct(
          serialID,
          batchHash,
          metadataHash,
          ethers.ZeroHash,
          "0x"
        );

      await transferLedger
        .connect(manufacturer)
        .createTransferRequest(
          serialID,
          distributor.address,
          fromLocation,
          toLocation
        );

      expect(
        await registry.getStatus(serialID)
      ).to.equal(2);

    });

  });

  describe("Confirm Transfer", function () {

    it("Should confirm transfer successfully", async function () {

      const serialID =
        ethers.id("SERIAL-5");

      const batchHash =
        ethers.id("BATCH-5");

      const metadataHash =
        ethers.id("META-5");

      const fromLocation =
        ethers.id("A");

      const toLocation =
        ethers.id("B");

      await registry
        .connect(manufacturer)
        .registerProduct(
          serialID,
          batchHash,
          metadataHash,
          ethers.ZeroHash,
          "0x"
        );

      await transferLedger
        .connect(manufacturer)
        .createTransferRequest(
          serialID,
          distributor.address,
          fromLocation,
          toLocation
        );

      await transferLedger
        .connect(distributor)
        .confirmTransfer(
          serialID,
          toLocation
        );

      expect(
        await registry.getCurrentOwner(serialID)
      ).to.equal(
        distributor.address
      );

    });

    it("Should reject non receiver confirmation", async function () {

      const serialID =
        ethers.id("SERIAL-6");

      const batchHash =
        ethers.id("BATCH-6");

      const metadataHash =
        ethers.id("META-6");

      const fromLocation =
        ethers.id("A");

      const toLocation =
        ethers.id("B");

      await registry
        .connect(manufacturer)
        .registerProduct(
          serialID,
          batchHash,
          metadataHash,
          ethers.ZeroHash,
          "0x"
        );

      await transferLedger
        .connect(manufacturer)
        .createTransferRequest(
          serialID,
          distributor.address,
          fromLocation,
          toLocation
        );

      await expect(
        transferLedger
          .connect(user1)
          .confirmTransfer(
            serialID,
            toLocation
          )
      ).to.be.revertedWith(
        "Not receiver"
      );

    });

    it("Should reject wrong location confirmation", async function () {

      const serialID =
        ethers.id("SERIAL-7");

      const batchHash =
        ethers.id("BATCH-7");

      const metadataHash =
        ethers.id("META-7");

      const fromLocation =
        ethers.id("A");

      const toLocation =
        ethers.id("B");

      await registry
        .connect(manufacturer)
        .registerProduct(
          serialID,
          batchHash,
          metadataHash,
          ethers.ZeroHash,
          "0x"
        );

      await transferLedger
        .connect(manufacturer)
        .createTransferRequest(
          serialID,
          distributor.address,
          fromLocation,
          toLocation
        );

      await expect(
        transferLedger
          .connect(distributor)
          .confirmTransfer(
            serialID,
            ethers.id("WRONG")
          )
      ).to.be.revertedWith(
        "Location mismatch"
      );

    });

  });

  describe("Transfer History", function () {

    it("Should store transfer history correctly", async function () {

      const serialID =
        ethers.id("SERIAL-8");

      const batchHash =
        ethers.id("BATCH-8");

      const metadataHash =
        ethers.id("META-8");

      const fromLocation =
        ethers.id("A");

      const toLocation =
        ethers.id("B");

      await registry
        .connect(manufacturer)
        .registerProduct(
          serialID,
          batchHash,
          metadataHash,
          ethers.ZeroHash,
          "0x"
        );

      await transferLedger
        .connect(manufacturer)
        .createTransferRequest(
          serialID,
          distributor.address,
          fromLocation,
          toLocation
        );

      await transferLedger
        .connect(distributor)
        .confirmTransfer(
          serialID,
          toLocation
        );

      expect(
        await transferLedger.getTransferHistoryLength(
          serialID
        )
      ).to.equal(1);

    });

  });

});

