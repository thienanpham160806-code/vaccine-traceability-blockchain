# Vaccine Traceability System

MVP system for blockchain-based vaccine traceability.

## Project Structure

```text
smart-contract/   Solidity smart contracts, Hardhat tests, deployment scripts
backend/          Backend API service
frontend/         Frontend dashboard and consumer verification UI
docs/             Technical documentation and team handoff
```

## Team Setup

Read the full handoff before running the project:

```text
docs/frontend-backend-handoff.md
```

Quick run summary:

1. Start local Hardhat node in `smart-contract/`.
2. Deploy contracts and copy printed contract addresses into `backend/.env`.
3. Paste Firebase and Pinata secrets shared by the team lead into `backend/.env`.
4. Start backend on `http://localhost:5000`.
5. Start frontend on `http://localhost:3000`.

Validation commands:

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
