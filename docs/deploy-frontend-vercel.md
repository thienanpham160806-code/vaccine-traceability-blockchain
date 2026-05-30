# Deploy Frontend Len Vercel

Frontend la ung dung Next.js trong thu muc `frontend`. Backend production hien dang chay tai Render:

```text
https://vaccine-traceability-blockchain.onrender.com
```

## Cau hinh Vercel Project

Tao project moi tren Vercel tu GitHub repo:

```text
Repository: vaccine-traceability-blockchain
Framework Preset: Next.js
Root Directory: frontend
Build Command: npm run build
Install Command: npm install
Output Directory: de trong mac dinh cua Next.js
Production Branch: main
```

## Environment Variables

Trong Vercel Project > Settings > Environment Variables, them cac bien sau cho Production:

```env
NEXT_PUBLIC_API_URL=https://vaccine-traceability-blockchain.onrender.com
NEXT_PUBLIC_APP_NAME=Vaccine Traceability
NEXT_PUBLIC_CONSUMER_VERIFY_BASE_URL=https://<your-vercel-domain>/consumer/verify
NEXT_PUBLIC_IPFS_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
NEXT_PUBLIC_CHAIN_EXPLORER_BASE_URL=https://sepolia.etherscan.io
```

Sau khi Vercel cap domain production, quay lai cap nhat:

```env
NEXT_PUBLIC_CONSUMER_VERIFY_BASE_URL=https://<domain-that-cua-ban>/consumer/verify
```

Sau moi lan doi Environment Variables tren Vercel, can redeploy de bien moi co hieu luc.

## Kiem tra sau deploy

1. Mo trang Vercel production.
2. Dang nhap dashboard.
3. Kiem tra cac trang:

```text
/dashboard
/dashboard/products
/dashboard/products/register
/dashboard/products/bulk
/dashboard/batches
/dashboard/risk-flags
/dashboard/disputes
/consumer/verify/<serialId>
```

4. Neu frontend bao loi ket noi API, kiem tra lai `NEXT_PUBLIC_API_URL` co dung Render URL khong.

## Chay local voi backend Render

Tao `frontend/.env.local` tu file example:

```env
NEXT_PUBLIC_API_URL=https://vaccine-traceability-blockchain.onrender.com
NEXT_PUBLIC_APP_NAME=Vaccine Traceability
NEXT_PUBLIC_CONSUMER_VERIFY_BASE_URL=http://localhost:3000/consumer/verify
NEXT_PUBLIC_IPFS_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
NEXT_PUBLIC_CHAIN_EXPLORER_BASE_URL=https://sepolia.etherscan.io
```

Sau do chay:

```powershell
cd C:\Users\Dell\vaccine-traceability-blockchain\frontend
npm.cmd run dev
```
