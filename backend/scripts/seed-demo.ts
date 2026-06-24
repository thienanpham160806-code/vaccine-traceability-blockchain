/**
 * seed-demo.ts — VaxiTrust Demo Dataset Generator
 * Xóa dữ liệu cũ, tạo 30 lô × 3 serial = 90 sản phẩm
 * Firebase-only (không gọi smart contract). Chạy reconcile sau.
 *
 * Usage:
 *   npx ts-node scripts/seed-demo.ts
 *   npx ts-node scripts/seed-demo.ts --dry-run
 */

import * as admin from 'firebase-admin';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Firebase ─────────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID!,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL!,
});
const db = admin.database();

// ─── Wallet addresses from private keys ──────────────────────────────────────

function walletAddr(pk?: string): string {
  if (!pk) return ethers.ZeroAddress;
  const key = pk.startsWith('0x') ? pk : `0x${pk}`;
  return new ethers.Wallet(key).address;
}

const W = {
  MANUFACTURER:     walletAddr(process.env.MANUFACTURER_PRIVATE_KEY),
  IMPORTER:         walletAddr(process.env.IMPORTER_PRIVATE_KEY),
  DISTRIBUTOR:      walletAddr(process.env.DISTRIBUTOR_PRIVATE_KEY),
  CLINIC:           walletAddr(process.env.CLINIC_PRIVATE_KEY),
  PHARMACY:         walletAddr(process.env.PHARMACY_PRIVATE_KEY),
  RECALL_AUTHORITY: walletAddr(process.env.RECALL_AUTHORITY_PRIVATE_KEY),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function h32(v: string): string {
  return /^0x[0-9a-f]{64}$/i.test(v) ? v : ethers.keccak256(ethers.toUtf8Bytes(v));
}
function rndTx(): string {
  return '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
const daysAgo  = (n: number) => Date.now() - n * 86_400_000;
const daysLater = (n: number) => Date.now() + n * 86_400_000;

const CARRIERS = ['DHL Express', 'Giaohangnhanh', 'Viettel Post', 'VNPost Cold Chain', 'FedEx Medical'];
const PLATES   = ['51B', '29A', '43D', '92C', '30E'];
function rndCarrier() { return CARRIERS[Math.floor(Math.random() * CARRIERS.length)]; }
function rndPlate()   { return `${PLATES[Math.floor(Math.random() * PLATES.length)]}-${Math.floor(10000 + Math.random() * 89999)}`; }

const LOCS: Record<string, string[]> = {
  MANUFACTURER: ['Nhà máy Sanofi Pasteur TP.HCM', 'Xưởng sản xuất Vabiotech Hà Nội', 'Kho sản xuất BioPharma Đà Nẵng'],
  IMPORTER:     ['Kho nhập khẩu Tân Sơn Nhất', 'Kho ngoại quan Nội Bài', 'Kho lạnh nhập khẩu Cát Lái'],
  DISTRIBUTOR:  ['Kho phân phối Quận 7 TP.HCM', 'Kho Vaccine Hà Đông', 'Kho phân phối Đà Nẵng', 'Kho lạnh Bình Dương'],
  CLINIC:       ['Phòng khám An Khang Phú Nhuận', 'Trạm Y tế Bến Nghé', 'Bệnh viện Nhi Đồng 1', 'Trạm y tế P.Tân Định'],
  PHARMACY:     ['Long Châu Q.1', 'Pharmacity Nguyễn Huệ', 'An Khang Q.3'],
};
function rndLoc(role: string) {
  const list = LOCS[role] || LOCS.DISTRIBUTOR;
  return list[Math.floor(Math.random() * list.length)];
}

const VACCINES = [
  { name: 'Hexaxim (6-in-1)',          mfr: 'Sanofi Pasteur' },
  { name: 'ComBE Five (5-in-1)',        mfr: 'Vabiotech' },
  { name: 'Influvac (Cúm mùa)',         mfr: 'Abbott' },
  { name: 'Viêm não Nhật Bản',         mfr: 'VNCDC' },
  { name: 'MMR II (Sởi-Quai bị-Rubella)', mfr: 'MSD' },
  { name: 'Gardasil 9 (HPV)',           mfr: 'MSD' },
  { name: 'Prevenar 13 (Phế cầu)',      mfr: 'Pfizer' },
  { name: 'Rotarix (Tiêu chảy)',        mfr: 'GSK' },
  { name: 'Engerix-B (Viêm gan B)',     mfr: 'GSK' },
  { name: 'Comirnaty (COVID-19 mRNA)',  mfr: 'BioNTech/Pfizer' },
];
let vIdx = 0;
function nextVaccine() { return VACCINES[vIdx++ % VACCINES.length]; }

// ─── Counters ─────────────────────────────────────────────────────────────────

let batchNo = 0, txNo = 0, flagNo = 0, disputeNo = 0;
const nextBatch    = () => `BATCH-VCN-2026-${String(++batchNo).padStart(3, '0')}`;
const nextTransfer = () => `TR-${String(++txNo).padStart(4, '0')}`;
const nextFlag     = () => `FLAG-${String(++flagNo).padStart(3, '0')}`;
const nextDispute  = () => `DISP-${String(++disputeNo).padStart(3, '0')}`;

// ─── Record builders ──────────────────────────────────────────────────────────

function makeBatch(opts: {
  origin?:         'MANUFACTURED' | 'IMPORTED';
  expiryOffset?:   number;   // days from now, default 540
  createdAgo?:     number;   // days, default 30
  recalled?:       boolean;
  vaccine?:        { name: string; mfr: string };
}) {
  const v = opts.vaccine ?? nextVaccine();
  const batchQR    = nextBatch();
  const batchHash  = h32(batchQR);
  const origin     = opts.origin ?? 'MANUFACTURED';
  const expiryDate = new Date(daysLater(opts.expiryOffset ?? 540)).toISOString().slice(0, 10);
  const mfrAddr    = origin === 'IMPORTED' ? W.IMPORTER : W.MANUFACTURER;
  const createdAt  = daysAgo(opts.createdAgo ?? 30);
  const metadataHash = h32(JSON.stringify({ batchQR, productName: v.name, manufacturerName: v.mfr, expiryDate, origin }));

  return {
    id: batchQR, batchHash, batchQR, metadataHash,
    productName: v.name, quantity: 3,
    manufacturerAddress: mfrAddr, manufacturerName: v.mfr,
    expiryDate, origin,
    ...(opts.recalled ? { recalledAt: Date.now() } : {}),
    createdAt, updatedAt: createdAt,
  };
}

type Batch = ReturnType<typeof makeBatch>;

function makeProduct(b: Batch, suffix: string, overrides: Record<string, any> = {}) {
  const serialId   = `${b.batchQR}-${suffix}`;
  const serialHash = h32(serialId);
  const metadataHash = h32(JSON.stringify({ serialId, productName: b.productName }));
  return {
    serialId, serialHash,
    batchId: b.id, batchHash: b.batchHash,
    productName: b.productName, manufacturerName: b.manufacturerName,
    manufacturerAddress: b.manufacturerAddress,
    currentOwner: b.manufacturerAddress,
    ownerRole: b.origin === 'IMPORTED' ? 'IMPORTER' : 'MANUFACTURER',
    status: 'REGISTERED', riskLevel: 'LOW',
    expiryDate: b.expiryDate,
    isImported: b.origin === 'IMPORTED',
    zkpVerified: b.origin === 'IMPORTED',
    metadataHash,
    blockchainTx: rndTx(),
    createdAt: b.createdAt, updatedAt: b.createdAt,
    ...overrides,
  };
}

function makeTransfer(opts: {
  serialId: string; batchId: string;
  from: keyof typeof W; to: keyof typeof W;
  status: 'CONFIRMED' | 'PENDING' | 'REJECTED' | 'RETURNED';
  createdAgo: number;
  rejectedReason?: string;
  tempMin?: number; tempMax?: number;
}) {
  const id         = nextTransfer();
  const createdAt  = daysAgo(opts.createdAgo);
  const resolvedAt = createdAt + 86_400_000; // +1 day
  const fromLoc    = rndLoc(opts.from);
  const toLoc      = rndLoc(opts.to);
  return {
    id, serialId: opts.serialId, batchId: opts.batchId,
    fromAddress: W[opts.from], toAddress: W[opts.to],
    fromRole: opts.from, toRole: opts.to, status: opts.status,
    fromLocationHash: h32(fromLoc), toLocationHash: h32(toLoc),
    fromLocationName: fromLoc, toLocationName: toLoc,
    carrierName: rndCarrier(), vehicleId: rndPlate(),
    temperatureMinC: opts.tempMin ?? 2, temperatureMaxC: opts.tempMax ?? 8, temperatureUnit: 'C',
    departedAt: createdAt,
    ...(opts.status === 'CONFIRMED' ? { arrivedAt: resolvedAt, confirmedAt: resolvedAt } : {}),
    ...(opts.status === 'REJECTED'  ? { rejectedAt: resolvedAt, rejectedReason: opts.rejectedReason ?? 'Hàng không đạt kiểm tra đầu vào' } : {}),
    ...(opts.status === 'RETURNED'  ? { returnedAt: resolvedAt } : {}),
    blockchainTx: rndTx(),
    createdAt, updatedAt: resolvedAt,
  };
}

function makeFlag(serialId: string, batchId: string, reason: string, riskLevel: string, createdAgo: number, status = 'OPEN') {
  return {
    id: nextFlag(), serialId, batchId,
    reason, riskLevel, status,
    flagReason: reason === 'DOUBLE_SCAN'   ? 'Phát hiện quét kép tại 2 địa điểm trong vòng 30 phút'
              : reason === 'BATCH_RECALLED' ? 'Lô hàng bị cơ quan thẩm quyền ra lệnh thu hồi'
              : reason === 'EXPIRED'        ? 'Sản phẩm đã quá hạn sử dụng'
              : reason === 'INVALID_ROUTE'  ? 'Lộ trình chuyển giao không hợp lệ theo AccessControl'
              : reason,
    level: riskLevel === 'CRITICAL' ? 4 : riskLevel === 'HIGH' ? 3 : 2,
    createdAt: daysAgo(createdAgo), updatedAt: daysAgo(createdAgo),
  };
}

function makeDispute(serialId: string, reportedBy: string, reason: string, status: 'OPEN' | 'RESOLVED' | 'REJECTED', createdAgo: number, resolutionNote?: string) {
  return {
    id: nextDispute(), relatedSerialId: serialId, reportedBy,
    status, reason,
    ...(resolutionNote ? { resolutionNote } : {}),
    createdAt: daysAgo(createdAgo), updatedAt: daysAgo(Math.max(0, createdAgo - 2)),
  };
}

// ─── Dataset builder ──────────────────────────────────────────────────────────

function buildDataset() {
  const products:    Record<string, any> = {};
  const batches:     Record<string, any> = {};
  const transfers:   Record<string, any> = {};
  const riskFlags:   Record<string, any> = {};
  const recalls:     Record<string, any> = {};
  const disputes:    Record<string, any> = {};
  const serialIndex: Record<string, string> = {};

  const addBatch    = (b: any) => { batches[b.batchHash] = b; };
  const addProduct  = (p: any) => { products[p.serialHash] = p; serialIndex[p.serialId] = p.serialHash; };
  const addTransfer = (t: any) => { transfers[t.id] = t; };
  const addFlag     = (f: any) => { riskFlags[f.id] = f; };
  const addDispute  = (d: any) => { disputes[d.id] = d; };
  const addRecall   = (r: any) => { recalls[r.batchHash] = r; };

  // ── 1. Happy path → CLINIC (6 batches, daysAgo 55-30) ───────────────────
  for (let i = 0; i < 6; i++) {
    const b = makeBatch({ createdAgo: 60 + i * 5 });
    addBatch(b);
    const base = 55 - i * 5;
    for (let s = 1; s <= 3; s++) {
      const sfx = `S${String(s).padStart(2, '0')}`;
      const p = makeProduct(b, sfx, {
        status: s === 1 ? 'ADMINISTERED' : 'DELIVERED_TO_CLINIC',
        currentOwner: W.CLINIC, ownerRole: 'CLINIC', riskLevel: 'LOW',
        updatedAt: daysAgo(base - 10),
      });
      addProduct(p);
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'MANUFACTURER', to: 'IMPORTER',    status: 'CONFIRMED', createdAgo: base + 10 }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'IMPORTER',     to: 'DISTRIBUTOR', status: 'CONFIRMED', createdAgo: base + 5  }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'DISTRIBUTOR',  to: 'CLINIC',      status: 'CONFIRMED', createdAgo: base      }));
    }
  }

  // ── 2. Happy path → PHARMACY (3 batches) ────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const b = makeBatch({ createdAgo: 40 + i * 5 });
    addBatch(b);
    const base = 35 - i * 5;
    for (let s = 1; s <= 3; s++) {
      const sfx = `S${String(s).padStart(2, '0')}`;
      const p = makeProduct(b, sfx, {
        status: 'DELIVERED_TO_PHARMACY',
        currentOwner: W.PHARMACY, ownerRole: 'PHARMACY', riskLevel: 'LOW',
        updatedAt: daysAgo(base - 5),
      });
      addProduct(p);
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'MANUFACTURER', to: 'IMPORTER',    status: 'CONFIRMED', createdAgo: base + 8 }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'IMPORTER',     to: 'DISTRIBUTOR', status: 'CONFIRMED', createdAgo: base + 4 }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'DISTRIBUTOR',  to: 'PHARMACY',    status: 'CONFIRMED', createdAgo: base     }));
    }
  }

  // ── 3. Recalled batch mid-journey (3 batches) ───────────────────────────
  const recallReasons = [
    'Nhiệt độ vượt ngưỡng liên tục 48 giờ trong vận chuyển',
    'Cơ quan quản lý yêu cầu thu hồi do nghi ngờ tạp chất',
    'Lỗi nhà sản xuất: lô hàng không đạt tiêu chuẩn vô khuẩn',
  ];
  for (let i = 0; i < 3; i++) {
    const b = makeBatch({ recalled: true, createdAgo: 25 + i * 3 });
    addBatch(b);
    addRecall({
      batchHash: b.batchHash, id: b.batchHash,
      reasonHash: h32(recallReasons[i]),
      authorityAddress: W.RECALL_AUTHORITY,
      serialsAffected: 3,
      createdAt: daysAgo(20 - i * 3),
    });
    for (let s = 1; s <= 3; s++) {
      const sfx = `S${String(s).padStart(2, '0')}`;
      const ownerAtRecall = s === 1 ? { currentOwner: W.DISTRIBUTOR, ownerRole: 'DISTRIBUTOR' }
                                    : { currentOwner: W.CLINIC,      ownerRole: 'CLINIC' };
      const p = makeProduct(b, sfx, { status: 'RECALLED', riskLevel: 'CRITICAL', ...ownerAtRecall, updatedAt: daysAgo(20 - i * 3) });
      addProduct(p);
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'MANUFACTURER', to: 'IMPORTER',   status: 'CONFIRMED', createdAgo: 22 + i * 3 }));
      if (s > 1) addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'IMPORTER', to: 'DISTRIBUTOR', status: 'CONFIRMED', createdAgo: 21 + i * 3 }));
    }
    addFlag(makeFlag(`${b.batchQR}-S01`, b.id, 'BATCH_RECALLED', 'CRITICAL', 20 - i * 3));
  }

  // ── 4. Flagged products (2 batches) — test unflag/repute flow ────────────
  for (let i = 0; i < 2; i++) {
    const b = makeBatch({ createdAgo: 15 + i * 3 });
    addBatch(b);
    for (let s = 1; s <= 3; s++) {
      const sfx    = `S${String(s).padStart(2, '0')}`;
      const flagIt = i === 0 ? true : s === 1; // batch 13: all flagged; batch 14: only S01
      const p = makeProduct(b, sfx, {
        status: flagIt ? 'FLAGGED' : 'DELIVERED_TO_CLINIC',
        riskLevel: flagIt ? 'HIGH' : 'LOW',
        currentOwner: W.DISTRIBUTOR, ownerRole: 'DISTRIBUTOR',
        ...(flagIt ? { flagReason: h32('DOUBLE_SCAN'), previousStatus: 'IN_TRANSIT' } : {}),
        updatedAt: daysAgo(10),
      });
      addProduct(p);
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'MANUFACTURER', to: 'IMPORTER',    status: 'CONFIRMED', createdAgo: 14 + i * 3 }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'IMPORTER',     to: 'DISTRIBUTOR', status: 'CONFIRMED', createdAgo: 12 + i * 3 }));
      if (flagIt) addFlag(makeFlag(p.serialId, b.id, 'DOUBLE_SCAN', 'HIGH', 10));
    }
    // Dispute for batch 14 S01 (unflag case — resolved dispute simulating repute)
    if (i === 1) {
      addDispute(makeDispute(`${b.batchQR}-S01`, W.DISTRIBUTOR,
        'Flag DOUBLE_SCAN sai — thiết bị quét lỗi GPS, thực tế chỉ scan 1 địa điểm.',
        'RESOLVED', 9,
        'Đã xác minh, gỡ cờ sản phẩm, cập nhật trạng thái về DELIVERED.',
      ));
    }
  }

  // ── 5. Rejected transfer (2 batches) ────────────────────────────────────
  const rejectReasons = [
    'Nhiệt độ bảo quản vượt ngưỡng 8°C trong vận chuyển',
    'Bao bì hàng hóa bị hỏng, nguy cơ nhiễm khuẩn',
    'Số lot không khớp với chứng từ giao hàng',
  ];
  for (let i = 0; i < 2; i++) {
    const b = makeBatch({ createdAgo: 12 + i * 2 });
    addBatch(b);
    for (let s = 1; s <= 3; s++) {
      const sfx = `S${String(s).padStart(2, '0')}`;
      const p = makeProduct(b, sfx, { status: 'DELIVERED_TO_DISTRIBUTOR', currentOwner: W.DISTRIBUTOR, ownerRole: 'DISTRIBUTOR', riskLevel: 'LOW', updatedAt: daysAgo(8) });
      addProduct(p);
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'MANUFACTURER', to: 'IMPORTER',    status: 'CONFIRMED', createdAgo: 11 + i * 2 }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'IMPORTER',     to: 'DISTRIBUTOR', status: 'CONFIRMED', createdAgo: 9 + i * 2  }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'DISTRIBUTOR',  to: 'CLINIC',      status: 'REJECTED',  createdAgo: 8 + i * 2, rejectedReason: rejectReasons[(i * 3 + s - 1) % 3] }));
    }
  }

  // ── 6. Returned transfer (2 batches) ────────────────────────────────────
  for (let i = 0; i < 2; i++) {
    const b = makeBatch({ createdAgo: 10 + i * 2 });
    addBatch(b);
    for (let s = 1; s <= 3; s++) {
      const sfx = `S${String(s).padStart(2, '0')}`;
      const p = makeProduct(b, sfx, { status: 'DELIVERED_TO_DISTRIBUTOR', currentOwner: W.DISTRIBUTOR, ownerRole: 'DISTRIBUTOR', riskLevel: 'LOW', updatedAt: daysAgo(5) });
      addProduct(p);
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'MANUFACTURER', to: 'IMPORTER',   status: 'CONFIRMED', createdAgo: 9 + i * 2 }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'IMPORTER',     to: 'DISTRIBUTOR',status: 'CONFIRMED', createdAgo: 7 + i * 2 }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'DISTRIBUTOR',  to: 'CLINIC',     status: 'CONFIRMED', createdAgo: 6 + i * 2 }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'CLINIC',       to: 'DISTRIBUTOR',status: 'RETURNED',  createdAgo: 5 + i * 2 }));
    }
  }

  // ── 7. Imported batch (2 batches) ────────────────────────────────────────
  for (let i = 0; i < 2; i++) {
    const b = makeBatch({ origin: 'IMPORTED', createdAgo: 20 + i * 5 });
    addBatch(b);
    const base = 15 - i * 5;
    for (let s = 1; s <= 3; s++) {
      const sfx = `S${String(s).padStart(2, '0')}`;
      const p = makeProduct(b, sfx, {
        status: 'DELIVERED_TO_CLINIC', currentOwner: W.CLINIC, ownerRole: 'CLINIC',
        isImported: true, zkpVerified: true, importProofMode: 'demo-zk',
        riskLevel: 'LOW', updatedAt: daysAgo(base),
      });
      addProduct(p);
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'IMPORTER',    to: 'DISTRIBUTOR', status: 'CONFIRMED', createdAgo: base + 8 }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'DISTRIBUTOR', to: 'CLINIC',       status: 'CONFIRMED', createdAgo: base     }));
    }
  }

  // ── 8. Near expiry < 30 days → riskLevel HIGH (2 batches) ───────────────
  for (let i = 0; i < 2; i++) {
    const b = makeBatch({ expiryOffset: 10 + i * 5, createdAgo: 310 });
    addBatch(b);
    for (let s = 1; s <= 3; s++) {
      const sfx = `S${String(s).padStart(2, '0')}`;
      const p = makeProduct(b, sfx, { status: 'IN_TRANSIT', currentOwner: W.DISTRIBUTOR, ownerRole: 'DISTRIBUTOR', riskLevel: 'HIGH', updatedAt: daysAgo(3) });
      addProduct(p);
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'MANUFACTURER', to: 'IMPORTER',    status: 'CONFIRMED', createdAgo: 20 }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'IMPORTER',     to: 'DISTRIBUTOR', status: 'CONFIRMED', createdAgo: 10 }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'DISTRIBUTOR',  to: 'CLINIC',      status: 'PENDING',   createdAgo: 3  }));
    }
  }

  // ── 9. Expired (1 batch) → riskLevel CRITICAL ────────────────────────────
  {
    const b = makeBatch({ expiryOffset: -30, createdAgo: 400, vaccine: { name: 'Influvac (Cúm mùa cũ)', mfr: 'Abbott' } });
    addBatch(b);
    for (let s = 1; s <= 3; s++) {
      const sfx = `S${String(s).padStart(2, '0')}`;
      const p = makeProduct(b, sfx, { status: 'DELIVERED_TO_DISTRIBUTOR', currentOwner: W.DISTRIBUTOR, ownerRole: 'DISTRIBUTOR', riskLevel: 'CRITICAL', updatedAt: daysAgo(30) });
      addProduct(p);
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'MANUFACTURER', to: 'IMPORTER',    status: 'CONFIRMED', createdAgo: 380 }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'IMPORTER',     to: 'DISTRIBUTOR', status: 'CONFIRMED', createdAgo: 370 }));
      addFlag(makeFlag(p.serialId, b.id, 'EXPIRED', 'CRITICAL', 30));
    }
  }

  // ── 10. In transit / pending (2 batches) ─────────────────────────────────
  for (let i = 0; i < 2; i++) {
    const b = makeBatch({ createdAgo: 5 + i });
    addBatch(b);
    for (let s = 1; s <= 3; s++) {
      const sfx = `S${String(s).padStart(2, '0')}`;
      const isEarlyStage = s === 1;
      const p = makeProduct(b, sfx, {
        status: isEarlyStage ? 'IN_TRANSIT' : 'PENDING_DELIVERY',
        currentOwner: isEarlyStage ? W.IMPORTER : W.DISTRIBUTOR,
        ownerRole:    isEarlyStage ? 'IMPORTER' : 'DISTRIBUTOR',
        riskLevel: 'LOW', updatedAt: daysAgo(2),
      });
      addProduct(p);
      if (isEarlyStage) {
        addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'MANUFACTURER', to: 'IMPORTER', status: 'PENDING', createdAgo: 2 }));
      } else {
        addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'MANUFACTURER', to: 'IMPORTER',    status: 'CONFIRMED', createdAgo: 4 + i }));
        addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'IMPORTER',     to: 'DISTRIBUTOR', status: 'CONFIRMED', createdAgo: 3 + i }));
        addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'DISTRIBUTOR',  to: 'CLINIC',      status: 'PENDING',   createdAgo: 1     }));
      }
    }
  }

  // ── 11. Just registered — no transfers yet (2 batches) ───────────────────
  for (let i = 0; i < 2; i++) {
    const b = makeBatch({ createdAgo: 1 + i });
    addBatch(b);
    for (let s = 1; s <= 3; s++) {
      const sfx = `S${String(s).padStart(2, '0')}`;
      const p = makeProduct(b, sfx, { status: 'REGISTERED', riskLevel: 'LOW', updatedAt: daysAgo(1 + i) });
      addProduct(p);
    }
  }

  // ── 12. Mixed stages in 1 batch (2 batches) ──────────────────────────────
  for (let i = 0; i < 2; i++) {
    const b = makeBatch({ createdAgo: 8 + i * 3 });
    addBatch(b);
    const stages = [
      { status: 'DELIVERED_TO_CLINIC', owner: W.CLINIC,        role: 'CLINIC'       },
      { status: 'IN_TRANSIT',          owner: W.IMPORTER,      role: 'IMPORTER'     },
      { status: 'REGISTERED',          owner: W.MANUFACTURER,  role: 'MANUFACTURER' },
    ];
    for (let s = 1; s <= 3; s++) {
      const sfx = `S${String(s).padStart(2, '0')}`;
      const st  = stages[s - 1];
      const p = makeProduct(b, sfx, { status: st.status, currentOwner: st.owner, ownerRole: st.role, riskLevel: 'LOW', updatedAt: daysAgo(5 - s) });
      addProduct(p);
      if (s === 1) {
        addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'MANUFACTURER', to: 'IMPORTER',    status: 'CONFIRMED', createdAgo: 7 }));
        addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'IMPORTER',     to: 'DISTRIBUTOR', status: 'CONFIRMED', createdAgo: 5 }));
        addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'DISTRIBUTOR',  to: 'CLINIC',      status: 'CONFIRMED', createdAgo: 3 }));
      } else if (s === 2) {
        addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'MANUFACTURER', to: 'IMPORTER', status: 'PENDING', createdAgo: 2 }));
      }
    }
  }

  // ── 13. Dispute + invalid route (1 batch) ────────────────────────────────
  {
    const b = makeBatch({ createdAgo: 6 });
    addBatch(b);
    for (let s = 1; s <= 3; s++) {
      const sfx    = `S${String(s).padStart(2, '0')}`;
      const flagIt = s === 1;
      const p = makeProduct(b, sfx, {
        status: flagIt ? 'FLAGGED' : 'IN_TRANSIT',
        riskLevel: flagIt ? 'HIGH' : 'LOW',
        currentOwner: W.DISTRIBUTOR, ownerRole: 'DISTRIBUTOR',
        ...(flagIt ? { flagReason: h32('INVALID_ROUTE'), previousStatus: 'IN_TRANSIT' } : {}),
        updatedAt: daysAgo(2),
      });
      addProduct(p);
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'MANUFACTURER', to: 'IMPORTER',    status: 'CONFIRMED', createdAgo: 5 }));
      addTransfer(makeTransfer({ serialId: p.serialId, batchId: b.id, from: 'IMPORTER',     to: 'DISTRIBUTOR', status: 'CONFIRMED', createdAgo: 3 }));
      if (flagIt) {
        addFlag(makeFlag(p.serialId, b.id, 'INVALID_ROUTE', 'HIGH', 2));
        addDispute(makeDispute(p.serialId, W.DISTRIBUTOR,
          'Flag INVALID_ROUTE không chính xác. Chuyển giao đúng quy trình, đề nghị xem xét.',
          'OPEN', 1,
        ));
      }
    }
  }

  return { products, batches, transfers, riskFlags, recalls, disputes, serialIndex };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  VaxiTrust Demo Seed — 30 lô × 3 serial');
  if (DRY_RUN) console.log('  MODE: DRY RUN');
  console.log('══════════════════════════════════════════════\n');

  console.log('Wallets:');
  for (const [role, addr] of Object.entries(W)) {
    console.log(`  ${role.padEnd(18)}: ${addr}`);
  }
  console.log('');

  const ds = buildDataset();
  const stats = {
    batches:     Object.keys(ds.batches).length,
    products:    Object.keys(ds.products).length,
    transfers:   Object.keys(ds.transfers).length,
    riskFlags:   Object.keys(ds.riskFlags).length,
    recalls:     Object.keys(ds.recalls).length,
    disputes:    Object.keys(ds.disputes).length,
  };

  console.log('Dataset:');
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(12)}: ${v}`);
  console.log('');

  if (DRY_RUN) {
    console.log('[DRY RUN] No writes. Done.\n');
    return;
  }

  // Step 1: clear
  console.log('Step 1: Clearing old data...');
  const nodes = ['products', 'batches', 'transfers', 'risk-flags', 'recalls', 'disputes', 'serial-index', 'pending-transfers'];
  await Promise.all(nodes.map(n => db.ref(n).remove()));
  console.log('  ✅ Cleared:', nodes.join(', '));

  // Step 2: write
  console.log('\nStep 2: Writing new dataset...');
  await Promise.all([
    db.ref('batches').set(ds.batches),
    db.ref('products').set(ds.products),
    db.ref('transfers').set(ds.transfers),
    db.ref('risk-flags').set(ds.riskFlags),
    db.ref('recalls').set(ds.recalls),
    db.ref('disputes').set(ds.disputes),
    db.ref('serial-index').set(ds.serialIndex),
  ]);
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ✅ ${k.padEnd(12)}: ${v}`);
  }

  console.log('\n══════════════════════════════════════════════');
  console.log('  Seed complete!');
  console.log('  Next: cd backend && npm run reconcile');
  console.log('══════════════════════════════════════════════\n');
}

main()
  .then(() => db.app.delete())
  .then(() => process.exit(0))
  .catch(e => { console.error('Fatal:', e.message || e); process.exit(1); });
