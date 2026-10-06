import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * Input-validation and wiring guards that the behavioural suites skip:
 * constructor zero-address checks, every zero-argument revert on the
 * lot-Merkle functions, and decommissioning a unit that belongs to a
 * sub-lot (the `lotToSubRoot` branch of ProductRegistry.decommissionUnit).
 */
describe("Input validation", function () {
  let accessControl: any;
  let registry: any;
  let ledger: any;
  let coldChain: any;

  let admin: any;
  let manufacturer: any;
  let recallAuthority: any;

  const Z = ethers.ZeroHash;
  const LOT = ethers.id("LOT-IV-1");
  const ROOT = ethers.id("ROOT-IV-1");
  const META = ethers.id("META-IV-1");
  const NOW = 1_800_000_000;

  function hashPair(a: string, b: string): string {
    const [lo, hi] = BigInt(a) <= BigInt(b) ? [a, b] : [b, a];
    return ethers.keccak256(ethers.concat([lo, hi]));
  }

  beforeEach(async function () {
    [admin, manufacturer, recallAuthority] = await ethers.getSigners();

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
    await accessControl.grantUserRole(recallAuthority.address, await accessControl.RECALL_AUTHORITY_ROLE());
  });

  describe("Constructors and setters", function () {
    it("reject zero addresses", async function () {
      const ac = await accessControl.getAddress();
      const reg = await registry.getAddress();

      const Registry = await ethers.getContractFactory("ProductRegistry");
      await expect(Registry.deploy(ethers.ZeroAddress)).to.be.revertedWith("Invalid access control");

      const Ledger = await ethers.getContractFactory("TransferLedger");
      await expect(Ledger.deploy(ethers.ZeroAddress, ac)).to.be.revertedWith("Invalid registry");
      await expect(Ledger.deploy(reg, ethers.ZeroAddress)).to.be.revertedWith("Invalid access control");

      const ColdChain = await ethers.getContractFactory("ColdChainRegistry");
      await expect(ColdChain.deploy(ethers.ZeroAddress, reg)).to.be.revertedWith("Invalid access control");
      await expect(ColdChain.deploy(ac, ethers.ZeroAddress)).to.be.revertedWith("Invalid product registry");

      await expect(ledger.setColdChainRegistry(ethers.ZeroAddress)).to.be.revertedWith("Invalid cold chain registry");
    });

    it("setRoute rejects a receiver role that cannot receive", async function () {
      await expect(
        accessControl.setRoute(await accessControl.DISTRIBUTOR_ROLE(), await accessControl.AUDITOR_ROLE(), true)
      ).to.be.revertedWith("Unsupported receiver role");
    });

    it("registerProduct rejects a zero batch or metadata hash", async function () {
      const r = registry.connect(manufacturer);
      await expect(r.registerProduct(ethers.id("S"), Z, META, Z, "0x")).to.be.revertedWith("Invalid batch");
      await expect(r.registerProduct(ethers.id("S"), ethers.id("B"), Z, Z, "0x")).to.be.revertedWith("Invalid metadata");
    });
  });

  describe("Lot-Merkle functions", function () {
    const commission = (lot = LOT, root = ROOT, meta = META, proof = "0x01") =>
      registry.connect(manufacturer).commissionLot(lot, root, meta, proof, NOW);

    it("commissionLot rejects zero ids, duplicates and empty proofs", async function () {
      await expect(commission(Z)).to.be.revertedWith("Invalid lot id");
      await expect(commission(LOT, Z)).to.be.revertedWith("Invalid aggregation root");
      await expect(commission(LOT, ROOT, Z)).to.be.revertedWith("Invalid metadata hash");
      await expect(commission(LOT, ROOT, META, "0x")).to.be.revertedWith("Invalid proof");
      await commission();
      await expect(commission()).to.be.revertedWith("Lot already exists");
    });

    it("recordEvent rejects zero ids, empty signatures and unknown lots", async function () {
      await commission();
      const rec = (lot: string, payload: string, sig: string) =>
        ledger.recordEvent(lot, ethers.id("A"), ethers.id("B"), payload, sig, NOW);

      await expect(rec(Z, ethers.id("P"), "0x01")).to.be.revertedWith("Invalid lot id");
      await expect(rec(LOT, Z, "0x01")).to.be.revertedWith("Invalid payload");
      await expect(rec(LOT, ethers.id("P"), "0x")).to.be.revertedWith("Invalid signature");
      await expect(rec(ethers.id("NOPE"), ethers.id("P"), "0x01")).to.be.revertedWith("Lot not found");
    });

    it("disaggregate rejects zero ids and a zero recipient", async function () {
      await commission();
      const sub = ethers.id("SUB");
      const dis = (parent: string, s: string, root: string, to: string) =>
        ledger.disaggregate(parent, s, root, to, NOW);

      await expect(dis(Z, sub, ROOT, ethers.id("TO"))).to.be.revertedWith("Invalid parent lot id");
      await expect(dis(LOT, Z, ROOT, ethers.id("TO"))).to.be.revertedWith("Invalid sub lot id");
      await expect(dis(LOT, sub, Z, ethers.id("TO"))).to.be.revertedWith("Invalid sub lot root");
      await expect(dis(LOT, sub, ROOT, Z)).to.be.revertedWith("Invalid recipient");
    });

    it("decommissionUnit rejects zero ids and unknown lots", async function () {
      const dec = (unit: string, lot: string) => ledger.decommissionUnit(unit, lot, [], ethers.id("DISPENSE"), NOW);
      await expect(dec(Z, LOT)).to.be.revertedWith("Invalid unit id");
      await expect(dec(ethers.id("U"), Z)).to.be.revertedWith("Invalid lot id");
      await expect(dec(ethers.id("U"), LOT)).to.be.revertedWith("Lot not found");
    });

    it("decommissions a unit against a sub-lot's own Merkle root", async function () {
      const u1 = ethers.id("UNIT-1");
      const u2 = ethers.id("UNIT-2");
      const u3 = ethers.id("UNIT-3");
      await commission(LOT, hashPair(hashPair(u1, u2), u3));

      // Distributor splits off a sub-lot containing {u1, u2}.
      const sub = ethers.id("SUB-LOT-1");
      const subRoot = hashPair(u1, u2);
      await ledger.disaggregate(LOT, sub, subRoot, ethers.id("CLINIC-A"), NOW);
      expect(await registry.lotExists(sub)).to.equal(true);

      // Custody events can be recorded against the sub-lot too.
      await expect(ledger.recordEvent(sub, ethers.id("DIST"), ethers.id("CLINIC-A"), ethers.id("P"), "0x01", NOW))
        .to.emit(registry, "CustodyEvent");

      await expect(ledger.decommissionUnit(u1, sub, [u2], ethers.id("DISPENSE"), NOW))
        .to.emit(registry, "UnitDecommissioned")
        .withArgs(u1, sub, ethers.id("DISPENSE"), NOW);
      expect(await registry.unitDecommissioned(u1)).to.equal(true);

      // u3 is not in the sub-lot, so a proof against the sub-root fails.
      await expect(ledger.decommissionUnit(u3, sub, [u1], ethers.id("DISPENSE"), NOW))
        .to.be.revertedWith("Invalid merkle proof");
    });

    it("recallLot rejects zero ids, unknown lots and double recalls", async function () {
      const r = registry.connect(recallAuthority);
      await expect(r.recallLot(Z, ethers.id("R"))).to.be.revertedWith("Invalid lot id");
      await expect(r.recallLot(LOT, Z)).to.be.revertedWith("Invalid reason");
      await expect(r.recallLot(LOT, ethers.id("R"))).to.be.revertedWith("Lot not found");
      await commission();
      await r.recallLot(LOT, ethers.id("R"));
      await expect(r.recallLot(LOT, ethers.id("R"))).to.be.revertedWith("Lot already recalled");
    });

    it("lot mutators enforce their caller restrictions", async function () {
      await expect(
        registry.connect(recallAuthority).commissionLot(LOT, ROOT, META, "0x01", NOW)
      ).to.be.revertedWith("Not manufacturer or importer");
      await commission();
      await expect(
        registry.connect(manufacturer).recordEvent(LOT, ethers.id("A"), ethers.id("B"), ethers.id("P"), "0x01", NOW)
      ).to.be.revertedWith("Not transfer ledger");
      await expect(
        registry.connect(manufacturer).disaggregate(LOT, ethers.id("SUB"), ROOT, ethers.id("TO"), NOW)
      ).to.be.revertedWith("Not transfer ledger");
      await expect(
        registry.connect(manufacturer).recallLot(LOT, ethers.id("R"))
      ).to.be.revertedWith("Not recall authority");
    });

    it("anchorEnv rejects zero ids and proofs the verifier refuses", async function () {
      await commission();
      const anchor = (lot: string, leg: string, root: string, proof = "0x01") =>
        ledger.anchorEnv(lot, leg, root, 100, 200, true, proof, NOW);

      await expect(anchor(Z, ethers.id("LEG"), ROOT)).to.be.revertedWith("Invalid lot id");
      await expect(anchor(LOT, Z, ROOT)).to.be.revertedWith("Invalid leg id");
      await expect(anchor(LOT, ethers.id("LEG"), Z)).to.be.revertedWith("Invalid env root");
      await expect(anchor(LOT, ethers.id("LEG"), ROOT, "0x")).to.be.revertedWith("Invalid proof");
    });
  });
});
