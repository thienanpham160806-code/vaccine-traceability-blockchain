---
name: codebase-snapshot-2026-08-12
description: Trạng thái thực tế của VaxiTrust codebase tại 2026-08-12 — các file đang dirty, vấn đề code cụ thể, và hiểu biết kiến trúc hiện tại
metadata:
  type: project
---

## Files đang có thay đổi chưa commit (git status)

Backend (staged):
- `backend/package.json` — zod đã nâng lên ^4.4.3 (breaking: zod v4 có API thay đổi)
- `backend/src/routes/products.ts` — route products đang được refactor
- `backend/src/routes/transfers.ts` — route transfers đang được refactor  
- `backend/src/services/visibility.ts` — visibility service đang thay đổi
- `backend/src/types/index.ts` — types backend đang thay đổi

Frontend (unstaged):
- `frontend/src/lib/types.ts` — types frontend đang thay đổi
- `frontend/src/app/dashboard/products/[serialId]/page.tsx`
- `frontend/src/app/dashboard/products/batches/[batchId]/page.tsx`
- `frontend/src/app/dashboard/transfers/[transferId]/page.tsx`
- `frontend/src/app/dashboard/transfers/create/page.tsx`
- `frontend/src/app/dashboard/transfers/page.tsx`
- `frontend/src/components/product/ProductTable.tsx`

Untracked:
- `backend/scripts/add-transferable-batches.ts` — script seed data mới

## Vấn đề code thực tế đã phát hiện

### 1. Dead code trong transfers.ts POST /scan
Route `/scan` (line 618-861) có dead code: sau khi gọi `createTransferForSerial()` và return, vẫn còn toàn bộ logic cũ dưới lệnh `return` (lines 631-860). Code này không bao giờ chạy nhưng vẫn tồn tại và gây confusion.

### 2. Routes /administer và /reregister bị swap nhãn
Trong products.ts:
- Route `/:serialId/administer` (line 1679) thực ra được đăng ký với path `/:serialId/reregister` 
- Route `/:serialId/reregister` (line 1781) thực ra được đăng ký với path `/:serialId/administer`
Đây là bug swap router — comment và handler path không khớp.

### 3. Zod v4 breaking change
`backend/package.json` dùng zod `^4.4.3` nhưng code có thể dùng `z.string().trim()` và `.safeExtend()` theo cú pháp zod v3. Cần kiểm tra toàn bộ schema files.

### 4. Type drift giữa frontend và backend
- Backend `TransferRecord`: có `mode`, `transferMode`, `batchHash`, `offChainOnly`, `reasonNote`
- Frontend `TransferRecord`: có thêm `visibilityScope`, `batchTransferGroupId` nhưng thiếu một số trường backend
- Backend `Product`: `createdAt/updatedAt` là required; frontend: optional

### 5. ProductTable.tsx dùng raw useEffect+fetch
`ProductTable.tsx` dùng `useEffect` + `getProducts()` thay vì React Query — không nhất quán với pattern đã xác lập.

## Kiến trúc hiện tại (đã hiểu rõ)

### Firebase Realtime DB collections:
- `products/{serialHash}` — keyed by keccak256(serialId)
- `batches/{batchHash}` — keyed by batchHash  
- `transfers/{transferId}` — transferId = `${serialHash}_${timestamp}`
- `pending-transfers/{serialHash}` — index: serialHash -> transferId
- `serial-index/{serialId}` — index: serialId -> serialHash
- `batch-transfers/{transferId}` — mirror của batch custody transfers
- `risk-flags/` — cờ rủi ro
- `recalls/` — thu hồi
- `administered-products/` — audit log tiêm

### Visibility system:
- `VisibilityScope = 'mine' | 'all'`
- PRIVILEGED_VIEWER_ROLES: ADMIN, AUDITOR, RECALL_AUTHORITY (thấy tất cả nếu ?scope=all)
- Operational roles chỉ thấy transfers mà họ là from/to
- `decorateProduct()` bổ sung: currentLocationName, currentWarehouseName, latestTransferId, syncStatus

### Transfer lifecycle:
PENDING -> PROCESSING -> CONFIRMED | REJECTED | RETURNED
- PROCESSING: đang chờ txQueue xử lý on-chain
- syncStatus: OK | PROCESSING | FIREBASE_ONLY | CHAIN_ONLY | OWNER_MISMATCH | STATUS_MISMATCH | STALE_PENDING

### Transfer modes:
- `SERIAL_ON_CHAIN`: chuyển từng serial, ghi blockchain
- `BULK_SERIAL_ON_CHAIN`: bulk nhiều serial cùng batch, có `batchTransferGroupId`
- `OFF_CHAIN_BATCH_CUSTODY`: chuyển custody batch-level, không serial on-chain

**Why:** Đây là snapshot phân tích tại 2026-08-12 để làm cơ sở cho migration plan.
**How to apply:** Khi implement task nào, cross-check với snapshot này để không bỏ sót dependency.
