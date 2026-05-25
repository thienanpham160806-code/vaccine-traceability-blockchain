/**
 * VaccineTrust - Seed Script
 * Tạo ~116 bản ghi mẫu cho Firebase Firestore
 *
 * Cách chạy (từ thư mục backend/):
 *   npx ts-node scripts/seed-database.ts
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

// ─── Khởi tạo Firebase ────────────────────────────────────────────────────────
const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Không tìm thấy file firebase-service-account.json trong thư mục backend/');
  console.error('   Hãy tải file từ Firebase Console → Project Settings → Service accounts');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

// ─── Helper functions ─────────────────────────────────────────────────────────
function daysAgo(n: number): admin.firestore.Timestamp {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return admin.firestore.Timestamp.fromDate(d);
}

function daysFromNow(n: number): admin.firestore.Timestamp {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return admin.firestore.Timestamp.fromDate(d);
}

function fakeHash(): string {
  return '0x' + Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

function fakeCID(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz234567';
  return 'bafybe' + Array.from({ length: 52 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── 1. ORGANIZATIONS — 6 tổ chức ────────────────────────────────────────────
const ORGANIZATIONS = [
  {
    id: 'org-mfr-001',
    name: 'Công ty TNHH Vaccine Việt Sinh',
    type: 'MANUFACTURER',
    code: 'MFR-001',
    address: '123 Lê Duẩn, Quận 1, TP.HCM',
    walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    licenseNumber: 'GMP-2023-001',
    contactEmail: 'info@vietsinhvaccine.vn',
    contactPhone: '028-3822-1234',
    isActive: true,
    createdAt: daysAgo(180),
    updatedAt: daysAgo(5),
  },
  {
    id: 'org-imp-001',
    name: 'Công ty CP Dược Bình Minh (Nhập khẩu)',
    type: 'IMPORTER',
    code: 'IMP-001',
    address: '45 Nguyễn Huệ, Quận 1, TP.HCM',
    walletAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    licenseNumber: 'IMP-2023-045',
    contactEmail: 'import@binhminh-pharma.vn',
    contactPhone: '028-3829-5678',
    isActive: true,
    createdAt: daysAgo(170),
    updatedAt: daysAgo(3),
  },
  {
    id: 'org-dist-001',
    name: 'Công ty Phân phối Dược phẩm Miền Nam',
    type: 'DISTRIBUTOR',
    code: 'DIST-001',
    address: '88 Đinh Tiên Hoàng, Bình Thạnh, TP.HCM',
    walletAddress: '0x3C44CdDd86a900fa2b585dd299e03d12FA4293BC',
    licenseNumber: 'DIST-2022-088',
    contactEmail: 'logistics@miennam-pharma.vn',
    contactPhone: '028-3551-9999',
    isActive: true,
    createdAt: daysAgo(160),
    updatedAt: daysAgo(10),
  },
  {
    id: 'org-dist-002',
    name: 'Kho Vaccine Trung Tâm Hà Nội',
    type: 'DISTRIBUTOR',
    code: 'DIST-002',
    address: '12 Trần Phú, Hà Đông, Hà Nội',
    walletAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    licenseNumber: 'DIST-2022-012',
    contactEmail: 'kho@trungtam-vaccine-hn.vn',
    contactPhone: '024-3337-0001',
    isActive: true,
    createdAt: daysAgo(155),
    updatedAt: daysAgo(7),
  },
  {
    id: 'org-clinic-001',
    name: 'Phòng khám Đa khoa An Khang',
    type: 'CLINIC',
    code: 'CLINIC-001',
    address: '77 Phan Xích Long, Phú Nhuận, TP.HCM',
    walletAddress: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    licenseNumber: 'CLINIC-2021-077',
    contactEmail: 'admin@ankhang-clinic.vn',
    contactPhone: '028-3844-7777',
    isActive: true,
    createdAt: daysAgo(150),
    updatedAt: daysAgo(2),
  },
  {
    id: 'org-clinic-002',
    name: 'Trạm y tế Phường Bến Nghé',
    type: 'CLINIC',
    code: 'CLINIC-002',
    address: '5 Ngô Đức Kế, Quận 1, TP.HCM',
    walletAddress: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    licenseNumber: 'CLINIC-2020-005',
    contactEmail: 'tramyte@bennge.gov.vn',
    contactPhone: '028-3829-0022',
    isActive: true,
    createdAt: daysAgo(148),
    updatedAt: daysAgo(1),
  },
];

// ─── 2. USERS — 8 người dùng ──────────────────────────────────────────────────
const USERS = [
  {
    id: 'user-001',
    organizationId: 'org-mfr-001',
    role: 'MANUFACTURER',
    walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    fullName: 'Nguyễn Văn An',
    email: 'an.nguyen@vietsinhvaccine.vn',
    isActive: true,
    createdAt: daysAgo(175),
    updatedAt: daysAgo(5),
  },
  {
    id: 'user-002',
    organizationId: 'org-imp-001',
    role: 'IMPORTER',
    walletAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    fullName: 'Trần Thị Bảo',
    email: 'bao.tran@binhminh-pharma.vn',
    isActive: true,
    createdAt: daysAgo(165),
    updatedAt: daysAgo(3),
  },
  {
    id: 'user-003',
    organizationId: 'org-dist-001',
    role: 'DISTRIBUTOR',
    walletAddress: '0x3C44CdDd86a900fa2b585dd299e03d12FA4293BC',
    fullName: 'Lê Hoàng Cường',
    email: 'cuong.le@miennam-pharma.vn',
    isActive: true,
    createdAt: daysAgo(155),
    updatedAt: daysAgo(10),
  },
  {
    id: 'user-004',
    organizationId: 'org-dist-002',
    role: 'DISTRIBUTOR',
    walletAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    fullName: 'Phạm Minh Đức',
    email: 'duc.pham@trungtam-vaccine-hn.vn',
    isActive: true,
    createdAt: daysAgo(150),
    updatedAt: daysAgo(7),
  },
  {
    id: 'user-005',
    organizationId: 'org-clinic-001',
    role: 'CLINIC',
    walletAddress: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    fullName: 'BS. Võ Thị Ema',
    email: 'ema.vo@ankhang-clinic.vn',
    isActive: true,
    createdAt: daysAgo(145),
    updatedAt: daysAgo(2),
  },
  {
    id: 'user-006',
    organizationId: 'org-clinic-002',
    role: 'CLINIC',
    walletAddress: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    fullName: 'Đỗ Ngọc Phúc',
    email: 'phuc.do@bennge.gov.vn',
    isActive: true,
    createdAt: daysAgo(143),
    updatedAt: daysAgo(1),
  },
  {
    id: 'user-admin-001',
    organizationId: 'org-mfr-001',
    role: 'ADMIN',
    walletAddress: '0xBcd4042DE499D14e55001CcbB24a551F3b954096',
    fullName: 'Quản trị viên Hệ thống',
    email: 'admin@vaccinetrust.vn',
    isActive: true,
    createdAt: daysAgo(180),
    updatedAt: daysAgo(1),
  },
  {
    id: 'user-auditor-001',
    organizationId: 'org-mfr-001',
    role: 'AUDITOR',
    walletAddress: '0x71bE63f3384f5fb98995aa9B7d470B480dD00b37',
    fullName: 'Ngô Thành Giám',
    email: 'giam.ngo@vaccinetrust.vn',
    isActive: true,
    createdAt: daysAgo(178),
    updatedAt: daysAgo(2),
  },
];

// ─── 3. BATCHES — 5 lô vaccine ────────────────────────────────────────────────
const VACCINE_NAMES = [
  'Vắc xin 5 trong 1 (DTP-Hib-HepB)',
  'Vắc xin Cúm mùa (Influenza)',
  'Vắc xin Viêm não Nhật Bản',
  'Vắc xin COVID-19 (mRNA)',
  'Vắc xin Sởi-Quai bị-Rubella (MMR)',
];

const BATCHES = VACCINE_NAMES.map((name, i) => ({
  id: `batch-${String(i + 1).padStart(3, '0')}`,
  batchNumber: `BATCH-2025-${String(i + 1).padStart(3, '0')}`,
  productName: name,
  manufacturerId: i < 3 ? 'org-mfr-001' : 'org-imp-001',
  totalQuantity: (i + 1) * 20,
  remainingQuantity: Math.floor((i + 1) * 20 * 0.4),
  status: i === 4 ? 'RECALLED' : 'ACTIVE',
  productionDate: daysAgo(90 + i * 10),
  expiryDate: daysFromNow(730 - i * 30),
  storageConditions: '2-8°C, tránh ánh sáng trực tiếp',
  ipfsCID: fakeCID(),
  metadataHash: fakeHash(),
  createdAt: daysAgo(85 + i * 10),
  updatedAt: daysAgo(i * 5 + 1),
}));

// ─── 4. PRODUCTS — 50 vaccine (10 per batch) ─────────────────────────────────
const PRODUCT_STATUSES = [
  'REGISTERED',
  'IN_TRANSIT',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'FLAGGED',
];

const OWNER_BY_STATUS: Record<string, string> = {
  REGISTERED: 'org-mfr-001',
  IN_TRANSIT: 'org-dist-001',
  DELIVERED: 'org-clinic-001',
  FLAGGED: 'org-dist-001',
  RECALLED: 'org-clinic-002',
};

const PRODUCTS: any[] = [];
BATCHES.forEach((batch, bIdx) => {
  for (let i = 0; i < 10; i++) {
    const globalIdx = bIdx * 10 + i + 1;
    const serialId = `SN-${String(globalIdx).padStart(4, '0')}`;
    const status = batch.status === 'RECALLED' ? 'RECALLED' : pick(PRODUCT_STATUSES);

    PRODUCTS.push({
      serialId,
      batchId: batch.id,
      productName: batch.productName,
      productType: batch.manufacturerId === 'org-imp-001' ? 'IMPORT' : 'LOCAL',
      manufacturerId: batch.manufacturerId,
      currentOwner: OWNER_BY_STATUS[status] || 'org-mfr-001',
      status,
      metadataHash: fakeHash(),
      batchHash: fakeHash(),
      ipfsCID: fakeCID(),
      zkProofVerified: status !== 'FLAGGED',
      expiryDate: batch.expiryDate,
      productionDate: batch.productionDate,
      storageTemp: '2-8°C',
      qrCodeUrl: `https://vaccinetrust.vn/verify/${serialId}`,
      blockchainTxHash: fakeHash(),
      createdAt: daysAgo(80 - globalIdx),
      updatedAt: daysAgo(Math.max(1, Math.floor(globalIdx / 5))),
    });
  }
});

// ─── 5. TRANSFERS — 25 bản ghi chuyển giao ───────────────────────────────────
const TRANSFER_TYPES = [
  { type: 'MANUFACTURE_TO_DISTRIBUTOR', sender: 'org-mfr-001', receiver: 'org-dist-001' },
  { type: 'DISTRIBUTOR_TO_CLINIC',      sender: 'org-dist-001', receiver: 'org-clinic-001' },
  { type: 'DISTRIBUTOR_TO_WAREHOUSE',   sender: 'org-dist-001', receiver: 'org-dist-002' },
];

const TRANSFERS: any[] = [];
for (let i = 0; i < 25; i++) {
  const route = TRANSFER_TYPES[i % 3];
  const daysBack = 70 - i * 2;
  const isDelivered = i < 20;

  TRANSFERS.push({
    id: `transfer-${String(i + 1).padStart(3, '0')}`,
    serialId: PRODUCTS[i * 2]?.serialId || `SN-${String(i + 1).padStart(4, '0')}`,
    senderId: route.sender,
    receiverId: route.receiver,
    senderWallet: ORGANIZATIONS.find(o => o.id === route.sender)?.walletAddress || '',
    receiverWallet: ORGANIZATIONS.find(o => o.id === route.receiver)?.walletAddress || '',
    status: isDelivered ? 'DELIVERED' : i === 23 ? 'DISPUTED' : 'PENDING',
    transferType: route.type,
    locationHashFrom: fakeHash().slice(0, 34),
    locationHashTo: fakeHash().slice(0, 34),
    shippingAddress: route.receiver === 'org-dist-002'
      ? '12 Trần Phú, Hà Đông, Hà Nội'
      : '77 Phan Xích Long, Phú Nhuận, TP.HCM',
    confirmedAt: isDelivered ? daysAgo(daysBack - 1) : null,
    blockchainTxHash: fakeHash(),
    riskFlags: i === 10 ? ['flag-001'] : [],
    createdAt: daysAgo(daysBack),
    updatedAt: daysAgo(isDelivered ? daysBack - 1 : daysBack),
  });
}

// ─── 6. VERIFICATIONS — 10 bản ghi xác thực ──────────────────────────────────
const VERIFY_RESULTS = ['VERIFIED', 'VERIFIED', 'VERIFIED', 'WARNING', 'HIGH_RISK'];
const RISK_MAP: Record<string, string> = {
  VERIFIED: 'SAFE',
  WARNING: 'ALERT',
  HIGH_RISK: 'HIGH',
};

const VERIFICATIONS: any[] = [];
for (let i = 0; i < 10; i++) {
  const result = VERIFY_RESULTS[i % VERIFY_RESULTS.length];
  VERIFICATIONS.push({
    id: `verify-${String(i + 1).padStart(3, '0')}`,
    serialId: PRODUCTS[i].serialId,
    verifiedBy: i % 2 === 0 ? 'org-clinic-001' : 'org-clinic-002',
    verifierWallet: i % 2 === 0
      ? '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'
      : '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    verificationResult: result,
    productStatus: PRODUCTS[i].status,
    currentOwner: PRODUCTS[i].currentOwner,
    riskLevel: RISK_MAP[result],
    recallStatus: PRODUCTS[i].status === 'RECALLED',
    blockchainDataMatch: result !== 'HIGH_RISK',
    ipfsDataMatch: result === 'VERIFIED',
    notes: result === 'VERIFIED'
      ? 'Tất cả dữ liệu hợp lệ, nguồn gốc xác minh thành công.'
      : result === 'WARNING'
      ? 'Phát hiện bất thường nhỏ trong lịch sử vận chuyển.'
      : 'Dữ liệu blockchain không khớp với IPFS. Cần kiểm tra ngay.',
    createdAt: daysAgo(5 - i > 0 ? 5 - i : 1),
    updatedAt: daysAgo(5 - i > 0 ? 5 - i : 1),
  });
}

// ─── 7. RISK FLAGS — 5 cờ rủi ro ─────────────────────────────────────────────
const RISK_FLAGS = [
  {
    id: 'flag-001',
    serialId: 'SN-0021',
    flaggedBy: 'org-dist-001',
    flagType: 'DOUBLE_SCAN',
    severity: 'HIGH',
    status: 'OPEN',
    description: 'Vaccine SN-0021 được quét tại 2 địa điểm cách nhau 300km trong vòng 2 giờ. Nghi ngờ hàng giả.',
    resolvedBy: null,
    resolvedAt: null,
    createdAt: daysAgo(15),
    updatedAt: daysAgo(15),
  },
  {
    id: 'flag-002',
    serialId: 'SN-0035',
    flaggedBy: 'org-clinic-001',
    flagType: 'INVALID_ROUTE',
    severity: 'MEDIUM',
    status: 'RESOLVED',
    description: 'Phát hiện lộ trình CLINIC→CLINIC không hợp lệ theo quy định phân phối.',
    resolvedBy: 'user-admin-001',
    resolvedAt: daysAgo(3),
    createdAt: daysAgo(10),
    updatedAt: daysAgo(3),
  },
  {
    id: 'flag-003',
    serialId: 'SN-0012',
    flaggedBy: 'org-dist-002',
    flagType: 'LOCATION_CONFLICT',
    severity: 'MEDIUM',
    status: 'OPEN',
    description: 'LocationHash không khớp với địa chỉ đăng ký của bên nhận hàng.',
    resolvedBy: null,
    resolvedAt: null,
    createdAt: daysAgo(7),
    updatedAt: daysAgo(7),
  },
  {
    id: 'flag-004',
    serialId: 'SN-0044',
    flaggedBy: 'org-dist-001',
    flagType: 'ANOMALY',
    severity: 'LOW',
    status: 'DISMISSED',
    description: 'Nhiệt độ bảo quản vượt ngưỡng 8°C trong 15 phút trong quá trình vận chuyển.',
    resolvedBy: 'user-auditor-001',
    resolvedAt: daysAgo(1),
    createdAt: daysAgo(5),
    updatedAt: daysAgo(1),
  },
  {
    id: 'flag-005',
    serialId: 'SN-0048',
    flaggedBy: 'org-clinic-002',
    flagType: 'DOUBLE_SCAN',
    severity: 'HIGH',
    status: 'OPEN',
    description: 'QR code vaccine SN-0048 bị quét 3 lần tại 3 phòng khám khác nhau trong 1 ngày.',
    resolvedBy: null,
    resolvedAt: null,
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
  },
];

// ─── 8. RECALLS — 3 lệnh thu hồi ─────────────────────────────────────────────
const RECALLS = [
  {
    id: 'recall-001',
    batchId: 'batch-005',
    initiatedBy: 'user-auditor-001',
    reason: 'Phát hiện lỗi bảo quản trong vận chuyển từ nhà máy. Nhiệt độ vượt ngưỡng 48 giờ liên tục.',
    ipfsCID: fakeCID(),
    affectedSerials: PRODUCTS.filter(p => p.batchId === 'batch-005').map(p => p.serialId),
    status: 'ACTIVE',
    blockchainTxHash: fakeHash(),
    createdAt: daysAgo(20),
    updatedAt: daysAgo(18),
  },
  {
    id: 'recall-002',
    batchId: 'batch-003',
    initiatedBy: 'user-auditor-001',
    reason: 'Cục Quản lý Dược ban hành lệnh thu hồi do phát hiện tạp chất trong lô sản xuất.',
    ipfsCID: fakeCID(),
    affectedSerials: ['SN-0021', 'SN-0022', 'SN-0023'],
    status: 'COMPLETED',
    blockchainTxHash: fakeHash(),
    createdAt: daysAgo(45),
    updatedAt: daysAgo(30),
  },
  {
    id: 'recall-003',
    batchId: 'batch-001',
    initiatedBy: 'user-admin-001',
    reason: 'Thu hồi khẩn cấp theo yêu cầu Bộ Y tế do nghi ngờ ô nhiễm vi sinh trong dây chuyền đóng gói.',
    ipfsCID: fakeCID(),
    affectedSerials: ['SN-0003', 'SN-0004'],
    status: 'ACTIVE',
    blockchainTxHash: fakeHash(),
    createdAt: daysAgo(10),
    updatedAt: daysAgo(8),
  },
];

// ─── 9. DISPUTES — 4 khiếu nại ───────────────────────────────────────────────
const DISPUTES = [
  {
    id: 'dispute-001',
    serialId: 'SN-0021',
    raisedBy: 'org-dist-001',
    raisedByWallet: '0x3C44CdDd86a900fa2b585dd299e03d12FA4293BC',
    reason: 'Flag DOUBLE_SCAN là sai. Vaccine chỉ quét tại 1 địa điểm, lỗi do GPS drift của thiết bị.',
    evidenceCID: fakeCID(),
    status: 'PENDING',
    resolvedBy: null,
    resolution: null,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(14),
  },
  {
    id: 'dispute-002',
    serialId: 'SN-0035',
    raisedBy: 'org-clinic-001',
    raisedByWallet: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    reason: 'Vaccine bị flag INVALID_ROUTE nhưng thực tế chuyển giao đúng quy trình, có đầy đủ giấy tờ.',
    evidenceCID: fakeCID(),
    status: 'RESOLVED',
    resolvedBy: 'user-admin-001',
    resolution: 'Đã xem xét bằng chứng đính kèm. Gỡ flag, cập nhật lại route matrix trong hệ thống.',
    createdAt: daysAgo(9),
    updatedAt: daysAgo(3),
  },
  {
    id: 'dispute-003',
    serialId: 'SN-0048',
    raisedBy: 'org-clinic-002',
    raisedByWallet: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    reason: 'Không nhận được vaccine nhưng hệ thống ghi trạng thái DELIVERED. Yêu cầu điều tra gấp.',
    evidenceCID: fakeCID(),
    status: 'PENDING',
    resolvedBy: null,
    resolution: null,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  },
  {
    id: 'dispute-004',
    serialId: 'SN-0012',
    raisedBy: 'org-dist-002',
    raisedByWallet: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    reason: 'LocationHash conflict do địa chỉ kho mới chưa được cập nhật trong hệ thống AccessControl.',
    evidenceCID: fakeCID(),
    status: 'REJECTED',
    resolvedBy: 'user-admin-001',
    resolution: 'Khiếu nại không hợp lệ. Yêu cầu cập nhật địa chỉ kho qua kênh hành chính chính thức.',
    createdAt: daysAgo(6),
    updatedAt: daysAgo(2),
  },
];

// ─── SEED FUNCTION ─────────────────────────────────────────────────────────────
async function batchWrite(collectionName: string, docs: any[], idField: string) {
  const LIMIT = 500;
  for (let i = 0; i < docs.length; i += LIMIT) {
    const batch = db.batch();
    docs.slice(i, i + LIMIT).forEach(doc => {
      const ref = db.collection(collectionName).doc(doc[idField]);
      batch.set(ref, doc);
    });
    await batch.commit();
  }
  console.log(`  ✅ ${collectionName.padEnd(15)} → ${docs.length} documents`);
}

async function seed() {
  console.log('\n🌱 VaccineTrust — Đang seed dữ liệu vào Firebase Firestore...\n');

  try {
    await batchWrite('organizations', ORGANIZATIONS, 'id');
    await batchWrite('users',         USERS,         'id');
    await batchWrite('batches',       BATCHES,       'id');
    await batchWrite('products',      PRODUCTS,      'serialId');
    await batchWrite('transfers',     TRANSFERS,     'id');
    await batchWrite('verifications', VERIFICATIONS, 'id');
    await batchWrite('risk_flags',    RISK_FLAGS,    'id');
    await batchWrite('recalls',       RECALLS,       'id');
    await batchWrite('disputes',      DISPUTES,      'id');

    const total = [
      ORGANIZATIONS, USERS, BATCHES, PRODUCTS,
      TRANSFERS, VERIFICATIONS, RISK_FLAGS, RECALLS, DISPUTES
    ].reduce((sum, arr) => sum + arr.length, 0);

    console.log(`\n🎉 Seed hoàn tất! Tổng cộng: ${total} documents\n`);
    console.log('  Kiểm tra tại: https://console.firebase.google.com');
    console.log('  → Firestore Database → xem 9 collections\n');

  } catch (err: any) {
    console.error('\n❌ Seed thất bại:', err.message);
    if (err.message?.includes('PERMISSION_DENIED')) {
      console.error('   → Kiểm tra lại Service Account trong firebase-service-account.json');
    }
    if (err.message?.includes('NOT_FOUND')) {
      console.error('   → Kiểm tra lại FIREBASE_PROJECT_ID, đảm bảo Firestore đã được tạo');
    }
    process.exit(1);
  }
}

seed();
