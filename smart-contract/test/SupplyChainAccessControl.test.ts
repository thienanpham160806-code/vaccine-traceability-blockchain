import { expect } from "chai";
import { ethers } from "hardhat";

describe("SupplyChainAccessControl", function () {

  async function deployFixture() {
    const [admin, user1, user2] = await ethers.getSigners();

    const SupplyChainAccessControl = await ethers.getContractFactory(
      "SupplyChainAccessControl"
    );

    const contract = await SupplyChainAccessControl.deploy(admin.address);

    return {
      contract,
      admin,
      user1,
      user2,
    };
  }

  it("Should deploy successfully with valid admin", async function () {
    const { contract } = await deployFixture();

    expect(await contract.getAddress()).to.not.equal(
      ethers.ZeroAddress
    );
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

    const DEFAULT_ADMIN_ROLE =
      await contract.DEFAULT_ADMIN_ROLE();

    expect(
      await contract.hasRole(
        DEFAULT_ADMIN_ROLE,
        admin.address
      )
    ).to.equal(true);
  });

  it("Should grant manufacturer role correctly", async function () {
    const { contract, user1 } = await deployFixture();

    const manufacturerRole =
      await contract.MANUFACTURER_ROLE();

    await contract.grantUserRole(
      user1.address,
      manufacturerRole
    );

    expect(
      await contract.hasRole(
        manufacturerRole,
        user1.address
      )
    ).to.equal(true);
  });

  it("Should automatically set primary role", async function () {
    const { contract, user1 } = await deployFixture();

    const manufacturerRole =
      await contract.MANUFACTURER_ROLE();

    await contract.grantUserRole(
      user1.address,
      manufacturerRole
    );

    expect(
      await contract.getPrimaryRole(user1.address)
    ).to.equal(manufacturerRole);
  });

  it("Should prevent non-admin from granting role", async function () {
    const { contract, user1, user2 } =
      await deployFixture();

    const manufacturerRole =
      await contract.MANUFACTURER_ROLE();

    await expect(
      contract
        .connect(user1)
        .grantUserRole(
          user2.address,
          manufacturerRole
        )
    ).to.be.reverted;
  });

  it("Should revert when granting role to zero address", async function () {
    const { contract } = await deployFixture();

    const manufacturerRole =
      await contract.MANUFACTURER_ROLE();

    await expect(
      contract.grantUserRole(
        ethers.ZeroAddress,
        manufacturerRole
      )
    ).to.be.revertedWith("Invalid account");
  });

  it("Should revert when granting invalid role", async function () {
    const { contract, user1 } = await deployFixture();

    await expect(
      contract.grantUserRole(
        user1.address,
        ethers.ZeroHash
      )
    ).to.be.revertedWith("Invalid role");
  });

  it("Should revoke role correctly", async function () {
    const { contract, user1 } = await deployFixture();

    const manufacturerRole =
      await contract.MANUFACTURER_ROLE();

    await contract.grantUserRole(
      user1.address,
      manufacturerRole
    );

    await contract.revokeUserRole(
      user1.address,
      manufacturerRole
    );

    expect(
      await contract.hasRole(
        manufacturerRole,
        user1.address
      )
    ).to.equal(false);
  });

  it("Should reset primary role after revoking", async function () {
    const { contract, user1 } = await deployFixture();

    const manufacturerRole =
      await contract.MANUFACTURER_ROLE();

    await contract.grantUserRole(
      user1.address,
      manufacturerRole
    );

    await contract.revokeUserRole(
      user1.address,
      manufacturerRole
    );

    expect(
      await contract.getPrimaryRole(user1.address)
    ).to.equal(ethers.ZeroHash);
  });

  it("Should allow admin to manually set primary role", async function () {
    const { contract, user1 } = await deployFixture();

    const manufacturerRole =
      await contract.MANUFACTURER_ROLE();

    await contract.grantUserRole(
      user1.address,
      manufacturerRole
    );

    await contract.setPrimaryRole(
      user1.address,
      manufacturerRole
    );

    expect(
      await contract.getPrimaryRole(user1.address)
    ).to.equal(manufacturerRole);
  });

  it("Should revert if account does not have role", async function () {
    const { contract, user1 } = await deployFixture();

    const manufacturerRole =
      await contract.MANUFACTURER_ROLE();

    await expect(
      contract.setPrimaryRole(
        user1.address,
        manufacturerRole
      )
    ).to.be.revertedWith(
      "Account does not have role"
    );
  });

  it("Should allow valid route", async function () {
    const { contract } = await deployFixture();

    const manufacturerRole =
      await contract.MANUFACTURER_ROLE();

    const importerRole =
      await contract.IMPORTER_ROLE();

    await contract.setRoute(
      manufacturerRole,
      importerRole,
      true
    );

    expect(
      await contract.isValidRoute(
        manufacturerRole,
        importerRole
      )
    ).to.equal(true);
  });

  it("Should return false for invalid route", async function () {
    const { contract } = await deployFixture();

    const pharmacyRole =
      await contract.PHARMACY_ROLE();

    const manufacturerRole =
      await contract.MANUFACTURER_ROLE();

    expect(
      await contract.isValidRoute(
        pharmacyRole,
        manufacturerRole
      )
    ).to.equal(false);
  });

});