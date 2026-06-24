import { expect } from "chai";
import { ethers } from "hardhat";

describe("SupplyChainAccessControl", function () {
  async function deployFixture() {
    const [admin, user1, user2] = await ethers.getSigners();

    const SupplyChainAccessControl = await ethers.getContractFactory(
      "SupplyChainAccessControl"
    );

    const contract = await SupplyChainAccessControl.deploy(admin.address);
    await contract.waitForDeployment();

    return {
      contract,
      admin,
      user1,
      user2,
    };
  }

  it("Should deploy successfully with valid admin", async function () {
    const { contract } = await deployFixture();

    expect(await contract.getAddress()).to.not.equal(ethers.ZeroAddress);
  });

  it("Should revert with invalid admin address", async function () {
    const SupplyChainAccessControl = await ethers.getContractFactory(
      "SupplyChainAccessControl"
    );

    await expect(
      SupplyChainAccessControl.deploy(ethers.ZeroAddress)
    ).to.be.revertedWith("Invalid admin");
  });

  it("Should set deployer as default admin", async function () {
    const { contract, admin } = await deployFixture();

    const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE();

    expect(await contract.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(
      true
    );
  });

  it("Should grant manufacturer role correctly", async function () {
    const { contract, user1 } = await deployFixture();

    const manufacturerRole = await contract.MANUFACTURER_ROLE();

    await contract.grantUserRole(user1.address, manufacturerRole);

    expect(await contract.hasRole(manufacturerRole, user1.address)).to.equal(
      true
    );
  });

  it("Should automatically set primary role", async function () {
    const { contract, user1 } = await deployFixture();

    const manufacturerRole = await contract.MANUFACTURER_ROLE();

    await contract.grantUserRole(user1.address, manufacturerRole);

    expect(await contract.getPrimaryRole(user1.address)).to.equal(
      manufacturerRole
    );
  });

  it("Should prevent non-admin from granting role", async function () {
    const { contract, user1, user2 } = await deployFixture();

    const manufacturerRole = await contract.MANUFACTURER_ROLE();

    await expect(
      contract.connect(user1).grantUserRole(user2.address, manufacturerRole)
    ).to.be.reverted;
  });

  it("Should revert when granting role to zero address", async function () {
    const { contract } = await deployFixture();

    const manufacturerRole = await contract.MANUFACTURER_ROLE();

    await expect(
      contract.grantUserRole(ethers.ZeroAddress, manufacturerRole)
    ).to.be.revertedWith("Invalid account");
  });

  it("Should revert when granting invalid role", async function () {
    const { contract, user1 } = await deployFixture();

    await expect(
      contract.grantUserRole(user1.address, ethers.ZeroHash)
    ).to.be.revertedWith("Unsupported role");
  });

  it("Should revoke role correctly", async function () {
    const { contract, user1 } = await deployFixture();

    const manufacturerRole = await contract.MANUFACTURER_ROLE();

    await contract.grantUserRole(user1.address, manufacturerRole);
    await contract.revokeUserRole(user1.address, manufacturerRole);

    expect(await contract.hasRole(manufacturerRole, user1.address)).to.equal(
      false
    );
  });

  it("Should reset primary role after revoking", async function () {
    const { contract, user1 } = await deployFixture();

    const manufacturerRole = await contract.MANUFACTURER_ROLE();

    await contract.grantUserRole(user1.address, manufacturerRole);
    await contract.revokeUserRole(user1.address, manufacturerRole);

    expect(await contract.getPrimaryRole(user1.address)).to.equal(
      ethers.ZeroHash
    );
  });

  it("Should allow admin to manually set primary role", async function () {
    const { contract, user1 } = await deployFixture();

    const manufacturerRole = await contract.MANUFACTURER_ROLE();

    await contract.grantUserRole(user1.address, manufacturerRole);
    await contract.setPrimaryRole(user1.address, manufacturerRole);

    expect(await contract.getPrimaryRole(user1.address)).to.equal(
      manufacturerRole
    );
  });

  it("Should revert if account does not have role", async function () {
    const { contract, user1 } = await deployFixture();

    const manufacturerRole = await contract.MANUFACTURER_ROLE();

    await expect(
      contract.setPrimaryRole(user1.address, manufacturerRole)
    ).to.be.revertedWith("Account does not have role");
  });

  it("Should allow valid route", async function () {
    const { contract } = await deployFixture();

    const manufacturerRole = await contract.MANUFACTURER_ROLE();
    const importerRole = await contract.IMPORTER_ROLE();

    await contract.setRoute(manufacturerRole, importerRole, true);

    expect(await contract.isValidRoute(manufacturerRole, importerRole)).to.equal(
      true
    );
  });

  it("Should return false for invalid route", async function () {
    const { contract } = await deployFixture();

    const pharmacyRole = await contract.PHARMACY_ROLE();
    const manufacturerRole = await contract.MANUFACTURER_ROLE();

    expect(await contract.isValidRoute(pharmacyRole, manufacturerRole)).to.equal(
      false
    );
  });

  it("Should return true for supported roles", async function () {
    const { contract } = await deployFixture();

    const manufacturerRole = await contract.MANUFACTURER_ROLE();
    const importerRole = await contract.IMPORTER_ROLE();
    const distributorRole = await contract.DISTRIBUTOR_ROLE();
    const clinicRole = await contract.CLINIC_ROLE();
    const pharmacyRole = await contract.PHARMACY_ROLE();
    const auditorRole = await contract.AUDITOR_ROLE();
    const recallAuthorityRole = await contract.RECALL_AUTHORITY_ROLE();

    expect(await contract.isSupportedRole(manufacturerRole)).to.equal(true);
    expect(await contract.isSupportedRole(importerRole)).to.equal(true);
    expect(await contract.isSupportedRole(distributorRole)).to.equal(true);
    expect(await contract.isSupportedRole(clinicRole)).to.equal(true);
    expect(await contract.isSupportedRole(pharmacyRole)).to.equal(true);
    expect(await contract.isSupportedRole(auditorRole)).to.equal(true);
    expect(await contract.isSupportedRole(recallAuthorityRole)).to.equal(true);
  });

  it("Should return false for unsupported role", async function () {
    const { contract } = await deployFixture();

    const fakeRole = ethers.keccak256(ethers.toUtf8Bytes("FAKE_ROLE"));

    expect(await contract.isSupportedRole(fakeRole)).to.equal(false);
  });

  it("Should allow only manufacturer, importer, and distributor to initiate transfer", async function () {
    const { contract } = await deployFixture();

    const manufacturerRole = await contract.MANUFACTURER_ROLE();
    const importerRole = await contract.IMPORTER_ROLE();
    const distributorRole = await contract.DISTRIBUTOR_ROLE();
    const clinicRole = await contract.CLINIC_ROLE();
    const pharmacyRole = await contract.PHARMACY_ROLE();
    const auditorRole = await contract.AUDITOR_ROLE();

    expect(await contract.canInitiateTransfer(manufacturerRole)).to.equal(true);
    expect(await contract.canInitiateTransfer(importerRole)).to.equal(true);
    expect(await contract.canInitiateTransfer(distributorRole)).to.equal(true);

    expect(await contract.canInitiateTransfer(clinicRole)).to.equal(false);
    expect(await contract.canInitiateTransfer(pharmacyRole)).to.equal(false);
    expect(await contract.canInitiateTransfer(auditorRole)).to.equal(false);
  });

  it("Should allow importer, distributor, clinic, and pharmacy to receive transfer", async function () {
    const { contract } = await deployFixture();

    const manufacturerRole = await contract.MANUFACTURER_ROLE();
    const importerRole = await contract.IMPORTER_ROLE();
    const distributorRole = await contract.DISTRIBUTOR_ROLE();
    const clinicRole = await contract.CLINIC_ROLE();
    const pharmacyRole = await contract.PHARMACY_ROLE();
    const auditorRole = await contract.AUDITOR_ROLE();

    expect(await contract.canReceiveTransfer(importerRole)).to.equal(true);
    expect(await contract.canReceiveTransfer(distributorRole)).to.equal(true);
    expect(await contract.canReceiveTransfer(clinicRole)).to.equal(true);
    expect(await contract.canReceiveTransfer(pharmacyRole)).to.equal(true);

    expect(await contract.canReceiveTransfer(manufacturerRole)).to.equal(false);
    expect(await contract.canReceiveTransfer(auditorRole)).to.equal(false);
  });

  it("Should keep DISTRIBUTOR to DISTRIBUTOR disabled", async function () {
    const { contract } = await deployFixture();

    const distributorRole = await contract.DISTRIBUTOR_ROLE();

    expect(await contract.isValidRoute(distributorRole, distributorRole)).to.equal(
      false
    );
  });

  it("Should reject CLINIC as sender role in route setup", async function () {
    const { contract } = await deployFixture();

    const clinicRole = await contract.CLINIC_ROLE();

    await expect(
      contract.setRoute(clinicRole, clinicRole, true)
    ).to.be.revertedWith("Unsupported sender role");
  });

  it("Should reject AUDITOR as sender role in physical transfer route", async function () {
    const { contract } = await deployFixture();

    const auditorRole = await contract.AUDITOR_ROLE();
    const distributorRole = await contract.DISTRIBUTOR_ROLE();

    await expect(
      contract.setRoute(auditorRole, distributorRole, true)
    ).to.be.revertedWith("Unsupported sender role");
  });

  it("Should configure all MVP routes", async function () {
    const { contract } = await deployFixture();

    const manufacturerRole = await contract.MANUFACTURER_ROLE();
    const importerRole = await contract.IMPORTER_ROLE();
    const distributorRole = await contract.DISTRIBUTOR_ROLE();
    const clinicRole = await contract.CLINIC_ROLE();
    const pharmacyRole = await contract.PHARMACY_ROLE();

    await contract.configureMvpRoutes();

    expect(await contract.isValidRoute(manufacturerRole, importerRole)).to.equal(false);

    expect(
      await contract.isValidRoute(manufacturerRole, distributorRole)
    ).to.equal(true);

    expect(await contract.isValidRoute(importerRole, distributorRole)).to.equal(
      true
    );

    expect(
      await contract.isValidRoute(distributorRole, distributorRole)
    ).to.equal(false);

    expect(await contract.isValidRoute(distributorRole, clinicRole)).to.equal(
      true
    );

    expect(await contract.isValidRoute(distributorRole, pharmacyRole)).to.equal(
      true
    );
  });
});
