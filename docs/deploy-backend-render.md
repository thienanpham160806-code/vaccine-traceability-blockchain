# Deploy Backend Len Render

Tai lieu nay ghi lai cach deploy backend Express cua du an Vaccine Traceability len Render sau khi smart contract da deploy len Sepolia.

## Backend production URL

```text
https://vaccine-traceability-blockchain.onrender.com
```

## Cau hinh Render Web Service

Tao Web Service moi tu GitHub repo:

```text
Repository: vaccine-traceability-blockchain
Branch: main
Root Directory: backend
Runtime: Node
Build Command: npm ci && npm run build
Start Command: npm start
Instance Type: Free cho demo/MVP
```

## Environment Variables

Them cac bien sau trong Render > Service > Environment:

```env
NODE_ENV=production
LOG_LEVEL=info

BLOCKCHAIN_RPC_URL=<sepolia_rpc_url_from_alchemy_or_infura>

BACKEND_PRIVATE_KEY=<backend_wallet_private_key>
ADMIN_PRIVATE_KEY=<admin_wallet_private_key_or_backend_wallet_private_key>
MANUFACTURER_PRIVATE_KEY=<manufacturer_wallet_private_key_or_backend_wallet_private_key>
IMPORTER_PRIVATE_KEY=<importer_wallet_private_key_or_backend_wallet_private_key>
DISTRIBUTOR_PRIVATE_KEY=<distributor_wallet_private_key_or_backend_wallet_private_key>
CLINIC_PRIVATE_KEY=<clinic_wallet_private_key_or_backend_wallet_private_key>
PHARMACY_PRIVATE_KEY=<pharmacy_wallet_private_key_or_backend_wallet_private_key>

PRODUCT_REGISTRY_ADDRESS=0x1FBe3e5e622789738B083927698648835298f542
TRANSFER_LEDGER_ADDRESS=0x61f996C3707dF292e0fC026d64Bb4E8BBC243F3E
ACCESS_CONTROL_ADDRESS=0x5cC66170F57DE15963eC24c1bf5A998645923947

PINATA_JWT=<pinata_jwt>

FIREBASE_PROJECT_ID=<firebase_project_id>
FIREBASE_DATABASE_URL=<firebase_realtime_database_url>
FIREBASE_PRIVATE_KEY=<firebase_private_key_with_escaped_newlines>
FIREBASE_CLIENT_EMAIL=<firebase_service_account_email>
FIREBASE_CLIENT_ID=<firebase_client_id>

JWT_SECRET=<long_random_secret>
```

Voi demo, co the dung cung mot private key cho cac bien role private key neu vi do da duoc cap du role tren Sepolia.

## Kiem tra role Sepolia

Chay lenh sau o thu muc `smart-contract` de kiem tra vi backend co role nao:

```powershell
$env:ACCOUNT="0x_DIA_CHI_VI_BACKEND"
npx.cmd hardhat run scripts/check-roles.ts --network sepolia
```

Cap role neu can:

```powershell
$env:ROLE="MANUFACTURER"
$env:ACCOUNT="0x_DIA_CHI_VI_BACKEND"
npx.cmd hardhat run scripts/grant-role.ts --network sepolia
```

Neu dung mot vi demo cho backend, nen cap cac role:

```text
MANUFACTURER
IMPORTER
DISTRIBUTOR
CLINIC
PHARMACY
RECALL_AUTHORITY
```

Luu y: flow recall hien tai dung `BACKEND_PRIVATE_KEY`, nen vi backend can co `RECALL_AUTHORITY`.

## Kiem tra sau deploy

```powershell
curl.exe "https://vaccine-traceability-blockchain.onrender.com/health"
curl.exe "https://vaccine-traceability-blockchain.onrender.com/products"
curl.exe "https://vaccine-traceability-blockchain.onrender.com/dashboard/overview"
```

Neu `/health` tra ve `status: ok` va `environment: production` thi backend da chay.

## Luu y bao mat

Khong commit file `.env` len GitHub. Chi luu secret trong Render Environment Variables hoac kenh chia se noi bo an toan.
