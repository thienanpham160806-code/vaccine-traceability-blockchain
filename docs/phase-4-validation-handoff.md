# Phase 4 Handoff - Input Validation & Data Integrity

## Completed

- Added backend Zod validation middleware:
  - `backend/src/middleware/validation.ts`
- Added backend product schemas:
  - `backend/src/schemas/productSchemas.ts`
- Added backend transfer schemas:
  - `backend/src/schemas/transferSchemas.ts`
- Applied backend validation to:
  - `GET /products`
  - `GET /products/:serialId`
  - `GET /products/:serialId/detail`
  - `PUT /products/:serialId`
  - `POST /products/register`
  - `POST /products/bulk`
  - `GET /transfers/:transferId`
  - `POST /transfers/scan`
  - `POST /transfers/confirm`
  - `POST /transfers/reject`
- Added frontend Zod schemas:
  - `frontend/src/lib/validation.ts`
- Applied frontend validation to:
  - Product registration form
  - Product metadata edit form
  - Bulk CSV parsing
  - Transfer scan/confirm/reject actions
- Added duplicate serial protection:
  - Single product registration returns `409 SERIAL_ALREADY_EXISTS`
  - Bulk registration rejects duplicate serials within the CSV request
  - Bulk registration rejects serials already stored in Firebase

## Validation Rules

- Serial and batch IDs allow letters, numbers, dot, underscore, colon, and dash.
- Product and manufacturer names are length-limited.
- Expiry dates must parse as valid dates.
- Quantity must be an integer from 1 to 10000.
- Ethereum addresses must match `0x` plus 40 hex characters.
- Hash fields must match 32-byte hex strings where required.
- Bulk registration is capped at 50 products per request.

## Verification

```powershell
cd backend
npm.cmd run build

cd ../frontend
npm.cmd run build
```

Both builds passed on May 28, 2026.

## Notes for Phase 5

Firebase does not enforce relational constraints by itself. Phase 4 now validates and guards key MVP writes at the API layer. If this project later moves to a relational database, duplicate serial and required-field constraints should be enforced at the database layer too.
