# Vaccine Traceability - Team Handoff

## 1. What The System Does

This project is a local demo for vaccine traceability:

- Smart contracts run on a local Hardhat chain.
- Backend signs local demo transactions by role, talks to Firebase, and pins JSON snapshots to Pinata.
- Frontend provides the UX flow for login, product registration, QR verification, transfer, recall, risk, and dispute.

Main UX flow:

1. Login as `MANUFACTURER`.
2. Register a local vaccine product in `Batch Management`.
3. See QR, transaction hash, IPFS CID, and next-step buttons.
4. Transfer `MANUFACTURER -> DISTRIBUTOR`.
5. Confirm delivery.
6. Verify product timeline and owner.
7. Open public consumer verification URL.

## 2. Environment Files

Do not commit real secrets.

Backend reads real values from:

```text
backend/.env
```

The committed placeholder file is:

```text
backend/.env.example
```

Team lead should share these private values outside git:

- `PINATA_JWT`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_CLIENT_ID`
- `JWT_SECRET`

Local Hardhat private keys do not need to be shared secretly. They are public dev keys printed by:

```powershell
cd smart-contract
npx.cmd hardhat node
```

## 3. Local Hardhat Role Keys

Default local demo mapping:

| Role | Hardhat Account | Address |
|---|---:|---|
| ADMIN / MANUFACTURER | #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| IMPORTER | #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| DISTRIBUTOR | #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| CLINIC | #3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |
| PHARMACY | #4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |

Use the matching private keys printed by Hardhat node in `backend/.env`.

For a standard Hardhat node, these are usually:

```env
BACKEND_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ADMIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
MANUFACTURER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
IMPORTER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
DISTRIBUTOR_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
CLINIC_PRIVATE_KEY=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
PHARMACY_PRIVATE_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
```

## 4. First-Time Setup

Install dependencies:

```powershell
cd smart-contract
npm.cmd install
```

```powershell
cd ../backend
npm.cmd install
```

```powershell
cd ../frontend
npm.cmd install
```

Create backend env:

```powershell
cd ../backend
Copy-Item .env.example .env
```

Then paste the team Firebase/Pinata values into `backend/.env`.

Frontend env is optional. Create `frontend/.env.local` only if the backend URL differs:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_CONSUMER_VERIFY_BASE_URL=http://localhost:3000/consumer/verify
```

## 5. Run The Project

Terminal 1 - Hardhat node:

```powershell
cd smart-contract
npx.cmd hardhat node
```

Terminal 2 - Deploy contracts:

```powershell
cd smart-contract
npx.cmd hardhat run scripts/deploy.ts --network localhost
```

Copy these printed values into `backend/.env`:

```env
PRODUCT_REGISTRY_ADDRESS=...
TRANSFER_LEDGER_ADDRESS=...
ACCESS_CONTROL_ADDRESS=...
```

Terminal 3 - Backend:

```powershell
cd backend
npm.cmd run build
npm.cmd run dev
```

Check backend:

```powershell
curl.exe http://localhost:5000/health
```

Expected:

```json
{"status":"ok","environment":"development"}
```

Terminal 4 - Frontend:

```powershell
cd frontend
npm.cmd run dev
```

Open:

```text
http://localhost:3000/login
```

## 6. UX Demo Script

1. Login as `MANUFACTURER`.
2. Dashboard should show backend status and current demo user.
3. Click `Register Product`.
4. The form has generated demo IDs already. Click `Register Product`.
5. Confirm QR, transaction hash, and IPFS CID appear.
6. Click `Transfer This Serial`.
7. Click `Create Transfer`.
8. Click `Confirm Delivery`.
9. Click `Verify Product`.
10. Product should show `DELIVERED`, distributor owner, and transfer timeline.

## 7. API Endpoints

Core:

- `POST /auth/login`
- `GET /dashboard/overview`
- `GET /products`
- `POST /products/register`
- `POST /transfers/scan`
- `POST /transfers/confirm`
- `POST /transfers/reject`
- `GET /verify/:serialId`
- `GET /consumer/verify/:serialId`

Support:

- `GET /risk-flags`
- `GET /recalls`
- `POST /recalls`
- `GET /disputes`
- `POST /disputes`

## 8. Troubleshooting

If login works in terminal but not in UI:

- Restart frontend dev server.
- Hard refresh browser with `Ctrl + F5`.
- Clear browser localStorage:

```js
localStorage.removeItem("demoUser")
localStorage.removeItem("demoToken")
location.reload()
```

If register fails:

- Use `LOCAL`, not `IMPORT`.
- Regenerate demo IDs to avoid duplicate serial.
- Confirm backend `.env` has the latest deployed contract addresses.
- Confirm Hardhat node was not restarted after deployment.

If transfer fails:

- Product must be registered by `MANUFACTURER`.
- Use `MANUFACTURER -> DISTRIBUTOR` for the first transfer.
- Do not create another transfer if one is already pending.
- Confirm after create transfer, before trying another route.

If `GET /auth/login` returns `NOT_FOUND`:

- This is expected. Login is `POST /auth/login`.
- Use frontend `/login` or `Invoke-RestMethod` with `-Method POST`.

## 9. Push Checklist

Before pushing:

```powershell
cd backend
npm.cmd run build
```

```powershell
cd ../frontend
npm.cmd run build
```

```powershell
cd ../smart-contract
npm.cmd test
```

Do not push:

- `backend/.env`
- `frontend/.env.local`
- Firebase service account JSON
- `node_modules`
- `dist`
- `.next`
- Hardhat `artifacts`, `cache`, `typechain-types`

Safe to push:

- `backend/.env.example`
- source files
- docs
- package files
- smart contract source and tests
