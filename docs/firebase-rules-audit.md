# Firebase Realtime Database rules audit

## Current rules file

Project rules are versioned in `database.rules.json` and referenced by `firebase.json`.

## What the current rules do

- Root `.read` requires `auth != null`.
- Root `.write` requires `auth != null`.
- Main collections have `.indexOn` entries for the queries used by backend/API flows:
  - `products`: serial, status, batch, owner, created time.
  - `transfers`: serial, status, from/to role, created/updated time.
  - `risk-flags`: serial, status, created time.
  - `recalls`: batch, status, created time.
  - `batches`: batch, manufacturer, created time.
  - `pending-transfers`: serial indexes.

## Important architecture note

The backend uses Firebase Admin SDK. Admin SDK bypasses Realtime Database security rules. That means these rules mainly protect any direct client-side Firebase access, not backend route access.

In this project, frontend primarily talks to the Express backend, so transfer, reject, confirm, recall, role, and notification logic should be enforced in backend routes and smart contracts, not only in Firebase rules.

## Risk review

The current rules are acceptable for a backend-only MVP because unauthenticated direct reads/writes are blocked.

For production, avoid letting normal Firebase-authenticated clients write broad paths directly. A stricter production rule set should limit direct writes by path and role, or fully disable client direct writes and keep all writes behind backend APIs.

## Current recommendation

No rule change is required for the current bugs. The reject/transfer/recall problems are caused by on-chain signer and state alignment, not Firebase rule permission.
