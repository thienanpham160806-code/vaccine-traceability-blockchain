/**
 * clean-firebase.ts — Xóa toàn bộ dữ liệu demo khỏi Firebase
 * Giữ nguyên: users, roles (auth)
 * Xóa: products, batches, transfers, recalls, risk-flags, disputes, v.v.
 *
 * Usage (từ thư mục backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/clean-firebase.ts
 *   npx ts-node -r tsconfig-paths/register scripts/clean-firebase.ts --dry-run
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DRY_RUN = process.argv.includes('--dry-run');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID!,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL!,
});

const db = admin.database();

// Các path sẽ bị xóa hoàn toàn
const PATHS_TO_DELETE = [
  'products',
  'batches',
  'transfers',
  'batch-transfers',
  'risk-flags',
  'recalls',
  'disputes',
  'archived-products',
  'archived-batches',
  'pending-transfers',
  'serial-index',
  'batch-index',
  'import-zkp-approvals',
];

async function countRecords(p: string): Promise<number> {
  const snap = await db.ref(p).once('value');
  if (!snap.exists()) return 0;
  const val = snap.val();
  return typeof val === 'object' && val !== null ? Object.keys(val).length : 1;
}

async function main() {
  console.log(`\n🧹 Firebase Cleanup ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(50));

  let totalDeleted = 0;

  for (const p of PATHS_TO_DELETE) {
    const count = await countRecords(p);
    if (count === 0) {
      console.log(`  ⬜ ${p.padEnd(30)} — trống, bỏ qua`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  🔍 ${p.padEnd(30)} — sẽ xóa ${count} bản ghi`);
    } else {
      await db.ref(p).remove();
      console.log(`  ✅ ${p.padEnd(30)} — đã xóa ${count} bản ghi`);
      totalDeleted += count;
    }
  }

  console.log('='.repeat(50));
  if (DRY_RUN) {
    console.log('✅ Dry run hoàn tất. Chạy lại không có --dry-run để xóa thật.');
  } else {
    console.log(`✅ Xóa xong. Tổng cộng ~${totalDeleted} bản ghi đã xóa.`);
    console.log('ℹ️  Users và roles vẫn được giữ nguyên.');
    console.log('ℹ️  Bây giờ hãy vào web để tạo lại dữ liệu demo.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Lỗi:', err.message);
  process.exit(1);
});
