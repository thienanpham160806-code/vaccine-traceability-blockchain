# Phase 2 Product Management Handoff

Last updated: May 28, 2026

## Summary

Phase 2 Product Management UI is implemented for the MVP.

The system now supports:

- Product list search, filter, sort, and pagination.
- Product detail page backed by a dedicated detail API.
- Editable off-chain product metadata.
- Single product registration page.
- Bulk product registration through CSV input/upload.
- Batch management page focused on batch list and batch detail navigation.
- Local deployment role setup for demo accounts.

## Backend Changes

### Product Routes

File:

```text
backend/src/routes/products.ts
```

Implemented:

- `GET /products?search=&status=&manufacturer=&sort=&page=&pageSize=`
  - Searches serial ID, batch ID, batch hash, product name, manufacturer, owner.
  - Filters by status and manufacturer.
  - Sorts by `createdAt`, `expiryDate`, `productName`, `status`, `manufacturerName`.
  - Returns paginated shape:

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 10
  }
}
```

- `GET /products/:serialId/detail`
  - Returns product, batch, transfer timeline, risk flags, recall info, and blockchain summary.
  - Reads Firebase first and attempts chain reads when contracts are initialized.

- `PUT /products/:serialId`
  - Updates editable off-chain metadata only.
  - Editable fields: `productName`, `manufacturerName`, `expiryDate`, `notes`.
  - Read-only fields remain protected: `serialId`, `batchHash`, `currentOwner`, `status`, `riskLevel`, `blockchainTx`, `isImported`, `zkpVerified`.

- `POST /products/bulk`
  - Accepts JSON array payload from the frontend bulk CSV converter.
  - Max 50 products per request.
  - Registers each row on-chain, pins metadata, writes Firebase data, and returns per-row result.
  - Uses HTTP `207` when some rows fail.

### Local Deploy Script

File:

```text
smart-contract/scripts/deploy.ts
```

For `localhost` and `hardhat`, deploy now grants demo roles:

- Account #0: `MANUFACTURER_ROLE`, `RECALL_AUTHORITY_ROLE`
- Account #1: `IMPORTER_ROLE`
- Account #2: `DISTRIBUTOR_ROLE`
- Account #3: `CLINIC_ROLE`
- Account #4: `PHARMACY_ROLE`

This is required for local product registration and transfer testing.

## Frontend Changes

### API Client

File:

```text
frontend/src/lib/api.ts
```

Added or updated:

- `getProducts(params)`
- `getProductDetail(serialId)`
- `updateProduct(serialId, payload)`
- `bulkRegisterProducts(products)`

### Types

File:

```text
frontend/src/lib/types.ts
```

Added:

- `ProductListResponse`
- `ProductDetailResponse`

Updated product risk typing to include `CRITICAL`.

### Product List

Files:

```text
frontend/src/app/dashboard/products/page.tsx
frontend/src/components/product/ProductTable.tsx
```

Implemented:

- Search bar.
- Status filter.
- Sort selector.
- Pagination.
- Detail links to `/dashboard/products/[serialId]`.
- Buttons for single registration and bulk registration.

### Product Detail

File:

```text
frontend/src/app/dashboard/products/[serialId]/page.tsx
```

Implemented:

- Full product metadata.
- QR display.
- Blockchain transaction hash/link.
- IPFS CID/link.
- Batch and recall state.
- Transfer timeline.
- Risk history.
- Edit metadata form.
- Transfer and verify actions.

Environment variables supported:

```env
NEXT_PUBLIC_CHAIN_EXPLORER_BASE_URL=https://sepolia.etherscan.io
NEXT_PUBLIC_IPFS_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
NEXT_PUBLIC_CONSUMER_VERIFY_BASE_URL=http://localhost:3000/consumer/verify
```

### Register Product

File:

```text
frontend/src/app/dashboard/products/register/page.tsx
```

This route wraps the existing `ProductForm` and makes registration separate from batch management.

### Bulk Register

File:

```text
frontend/src/app/dashboard/products/bulk/page.tsx
```

Implemented:

- CSV paste area.
- `.csv` file upload.
- CSV preview table.
- Submit to bulk API after converting CSV rows to JSON internally.
- Per-row success/failure display.
- Links to newly created product detail pages.

Required CSV columns:

```csv
serialId,productName,expiryDate
```

Optional CSV columns:

```csv
batchId,manufacturerName,origin,quantity,importDocHash,zkpProof
```

Sample CSV:

```csv
serialId,batchId,productName,manufacturerName,expiryDate,origin,quantity,importDocHash,zkpProof
VCN-BULK-001,BATCH-BULK-001,Bulk Demo Vaccine,Local Manufacturer,2027-12-31,MANUFACTURED,1,,
VCN-BULK-002,BATCH-BULK-001,Bulk Demo Vaccine,Local Manufacturer,2027-12-31,MANUFACTURED,1,,
```

### Batch Management

File:

```text
frontend/src/app/dashboard/batches/page.tsx
```

Updated:

- Page now focuses on batch list/filter/detail navigation.
- Registration moved to `/dashboard/products/register`.

## Local Test Commands

Terminal 1:

```powershell
cd smart-contract
npx.cmd hardhat node
```

Terminal 2:

```powershell
cd smart-contract
npx.cmd hardhat run scripts/deploy.ts --network localhost
```

Copy the printed contract addresses into `backend/.env`:

```env
PRODUCT_REGISTRY_ADDRESS=...
TRANSFER_LEDGER_ADDRESS=...
ACCESS_CONTROL_ADDRESS=...
```

Terminal 3:

```powershell
cd backend
npm.cmd run dev
```

Terminal 4:

```powershell
cd frontend
npm.cmd run dev
```

Open:

```text
http://localhost:3000/dashboard/products
http://localhost:3000/dashboard/products/register
http://localhost:3000/dashboard/products/bulk
http://localhost:3000/dashboard/batches
```

## Build Verification

Both builds pass:

```powershell
cd backend
npm.cmd run build
```

```powershell
cd frontend
npm.cmd run build
```

## Phase 2 Notes

- Bulk UI is CSV-based, but the backend endpoint still receives JSON rows from the frontend converter.
- CSV upload is client-side parsing only; no file upload storage is needed for MVP.
- Product metadata edits are off-chain only. On-chain facts remain immutable/read-only in this flow.
- Existing Firebase data from previous local chain deployments may show old transaction hashes. Register new products after deploying fresh local contracts for clean tests.

## Ready For Phase 3

Recommended Phase 3 starting points:

1. Add app-level error boundary.
2. Add 404, 403, 500, and network error pages/states.
3. Replace inline success/error text with Sonner toast notifications.
4. Add skeleton loaders for product list, product detail, batch list, and registration.
5. Standardize backend error response details.
