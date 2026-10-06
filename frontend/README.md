# VaxiTrust — Frontend

This is the Next.js (App Router) dashboard and public consumer-verification
UI for VaxiTrust. For the overall architecture, contracts and metrics, see the
[root README](../README.md).

- **Live demo:** https://vaccine-traceability-blockchain.vercel.app/login
- **Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui
  (Radix), TanStack Query, wagmi + viem (MetaMask), sonner, qrcode.react
- **Languages:** English and Vietnamese (`src/lib/i18n.ts`)

## Run locally

```bash
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL=http://localhost:5000 for a local backend
npm run dev                        # http://localhost:3000
npm run build                      # production build (also run in CI)
```

The backend (`../backend`) must be running for login and data. For a local
Hardhat chain, set `NEXT_PUBLIC_USE_AMOY=false` and
`NEXT_PUBLIC_ENABLE_LOCAL_CHAIN=true`.

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL |
| `NEXT_PUBLIC_CONSUMER_VERIFY_BASE_URL` | Base URL encoded into consumer QR codes |
| `NEXT_PUBLIC_USE_AMOY` | `true` (default) uses Polygon Amoy; `false` uses Sepolia (plus Hardhat if local chain is enabled) |
| `NEXT_PUBLIC_ENABLE_LOCAL_CHAIN` | Adds the Hardhat chain (`127.0.0.1:8545`) when not using Amoy |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL`, `NEXT_PUBLIC_AMOY_RPC_URL` | RPC endpoints for wallet reads/writes |
| `NEXT_PUBLIC_PRODUCT_REGISTRY_ADDRESS`, `NEXT_PUBLIC_TRANSFER_LEDGER_ADDRESS` | Contract addresses for wallet-signed transactions |
| `NEXT_PUBLIC_IPFS_GATEWAY_URL` | Gateway used to open pinned metadata |
| `NEXT_PUBLIC_CHAIN_EXPLORER_BASE_URL` | Block explorer used for transaction links |

## How it talks to the system

- **REST API** (`src/lib/api.ts`). Most reads and writes go through the
  backend, which signs transactions with the key for the acting role.
- **Wallet** (`src/lib/wallet-contracts.ts`, `src/providers/Web3Provider.tsx`).
  Register, create/confirm/reject transfer and batch recall can be signed
  directly in MetaMask. Afterwards the page calls a `sync-wallet-*` endpoint so
  the backend records the transaction.
- **Auth** (`src/lib/auth.ts`). Users log in by signing a nonce with MetaMask,
  or pick a demo actor. Pages are gated by role (`src/lib/role-access.ts`).

## Structure

```text
src/app/          Routes: /, /login, /dashboard/**, /consumer/verify/[serialId]
src/components/   layout/, product/, trace/ (timeline, supply-chain graph), ui/
src/lib/          API client, auth, i18n, status labels, validation, QR, wallet calls
src/providers/    Theme, language, React Query and wagmi providers
```

The route table is in the [root README](../README.md#frontend-routes).

## Deploy

The app deploys on Vercel with `frontend/` as the project root (see
`vercel.json` and [`docs/deploy-frontend-vercel.md`](../docs/deploy-frontend-vercel.md)).
