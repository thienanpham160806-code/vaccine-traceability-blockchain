# Smart Contract Handoff

## 1. Purpose

This document provides the handoff information for integrating the smart contract layer with the backend and frontend of the Vaccine Traceability Blockchain MVP.

The smart contract layer is responsible for:

- Managing supply chain roles
- Registering vaccine products
- Managing batch information
- Handling batch recall
- Creating transfer requests
- Confirming product transfers
- Recording transfer history
- Supporting product verification
- Supporting mock ZKP verification for imported vaccines
- Detecting high-risk double-scan activity

The current deployed network is:

```text
Sepolia Testnet
```

---

## 2. Repository Location

Smart contract code is located in:

```text
smart-contract/
```

Main folders:

```text
smart-contract/
├── contracts/       Solidity smart contracts
├── test/            Unit and integration tests
├── scripts/         Deployment scripts
├── deployments/     Deployment address files
├── abis/            Exported ABI files for backend/frontend
├── hardhat.config.ts
├── package.json
└── .env.example
```

---

## 3. Core Smart Contracts

The MVP uses three main smart contracts:

```text
1. SupplyChainAccessControl.sol
2. ProductRegistry.sol
3. TransferLedger.sol
```

### Contract summary

| Contract | Main purpose |
|---|---|
| `SupplyChainAccessControl` | Manages roles and valid transfer routes |
| `ProductRegistry` | Registers products, stores product status, manages batch recall, and handles mock ZKP verification |
| `TransferLedger` | Manages two-step transfer flow and transfer history |

---

## 4. Network Information

Current deployed network:

```text
Network: Sepolia Testnet
Chain ID: 11155111
Explorer: https://sepolia.etherscan.io
```

Deployment address file:

```text
smart-contract/deployments/sepolia.json
```

ABI folder:

```text
smart-contract/abis/
```

---

## 5. Deployment Address File

Backend and frontend should read contract addresses from:

```text
smart-contract/deployments/sepolia.json
```

Expected structure:

```json
{
  "network": "sepolia",
  "deployer": "0x...",
  "deployedAt": "2026-...",
  "contracts": {
    "supplyChainAccessControl": "0x...",
    "productRegistry": "0x...",
    "transferLedger": "0x..."
  },
  "setup": {
    "transferLedgerLinked": true,
    "mvpRoutesConfigured": true
  }
}
```

### Required fields

| Field | Meaning |
|---|---|
| `network` | Deployment network |
| `deployer` | Wallet address used to deploy contracts |
| `contracts.supplyChainAccessControl` | Address of `SupplyChainAccessControl` |
| `contracts.productRegistry` | Address of `ProductRegistry` |
| `contracts.transferLedger` | Address of `TransferLedger` |
| `setup.transferLedgerLinked` | Whether `ProductRegistry` is linked with `TransferLedger` |
| `setup.mvpRoutesConfigured` | Whether default MVP routes were configured |

### Important

The backend should not hard-code contract addresses directly inside source code.

Recommended approach:

```text
Read contract addresses from smart-contract/deployments/sepolia.json
```

---

## 6. ABI Files

ABI files are exported to:

```text
smart-contract/abis/
```

Current ABI files:

```text
smart-contract/abis/SupplyChainAccessControl.json
smart-contract/abis/ProductRegistry.json
smart-contract/abis/TransferLedger.json
```

These files contain ABI arrays only, not full Hardhat artifacts.

Backend and frontend should use these files to create contract instances.

Example ABI structure:

```json
[
  {
    "inputs": [],
    "name": "...",
    "outputs": [],
    "stateMutability": "...",
    "type": "function"
  }
]
```

---

## 7. How Backend Should Use Contract Address and ABI

Example with Ethers.js:

```ts
import { ethers } from "ethers";

import ProductRegistryAbi from "../smart-contract/abis/ProductRegistry.json";
import deployment from "../smart-contract/deployments/sepolia.json";

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const productRegistry = new ethers.Contract(
  deployment.contracts.productRegistry,
  ProductRegistryAbi,
  wallet
);
```

For read-only calls, backend can use provider only:

```ts
const productRegistryReadOnly = new ethers.Contract(
  deployment.contracts.productRegistry,
  ProductRegistryAbi,
  provider
);
```

For write calls, backend needs a signer:

```ts
const productRegistryWithSigner = productRegistry.connect(wallet);
```

---

## 8. Environment Variables for Backend

Backend should prepare its own `.env` file.

Suggested variables:

```env
SEPOLIA_RPC_URL=
PRIVATE_KEY=
```

Recommended approach:

```text
Use SEPOLIA_RPC_URL and PRIVATE_KEY from backend/.env
Read contract addresses from smart-contract/deployments/sepolia.json
Read ABI files from smart-contract/abis/
```

Optional variables if backend wants direct address access:

```env
SUPPLY_CHAIN_ACCESS_CONTROL_ADDRESS=
PRODUCT_REGISTRY_ADDRESS=
TRANSFER_LEDGER_ADDRESS=
```

### Security warning

Never commit:

```text
.env
private keys
wallet seed phrases
Firebase service account JSON files
database URLs
JWT secrets
Alchemy private keys if sensitive
```

---

## 9. Contract 1 - SupplyChainAccessControl

### Purpose

`SupplyChainAccessControl` manages:

- Supply chain roles
- Primary role of each actor
- Valid transfer routes
- Route validation for physical vaccine movement

### Roles

| Role | Meaning |
|---|---|
| `DEFAULT_ADMIN_ROLE` | System administrator |
| `MANUFACTURER_ROLE` | Vaccine manufacturer |
| `IMPORTER_ROLE` | Vaccine importer |
| `DISTRIBUTOR_ROLE` | Distributor or intermediate warehouse |
| `CLINIC_ROLE` | Clinic or vaccination point |
| `PHARMACY_ROLE` | Pharmacy |
| `AUDITOR_ROLE` | Auditor or dispute reviewer |
| `RECALL_AUTHORITY_ROLE` | Authority allowed to recall vaccine batches |

### MVP transfer route matrix

| From role | To role |
|---|---|
| `MANUFACTURER_ROLE` | `IMPORTER_ROLE` |
| `MANUFACTURER_ROLE` | `DISTRIBUTOR_ROLE` |
| `IMPORTER_ROLE` | `DISTRIBUTOR_ROLE` |
| `DISTRIBUTOR_ROLE` | `DISTRIBUTOR_ROLE` |
| `DISTRIBUTOR_ROLE` | `CLINIC_ROLE` |
| `DISTRIBUTOR_ROLE` | `PHARMACY_ROLE` |

Notes:

- `DISTRIBUTOR_ROLE -> DISTRIBUTOR_ROLE` supports intermediate warehouse flow.
- `CLINIC_ROLE` cannot initiate physical transfer in the MVP.
- `PHARMACY_ROLE` cannot initiate physical transfer in the MVP.
- `AUDITOR_ROLE` is not part of the physical transfer route.
- `RECALL_AUTHORITY_ROLE` is used for recall, not physical transfer.

### Important backend functions

```text
grantUserRole(address account, bytes32 role)
revokeUserRole(address account, bytes32 role)
setPrimaryRole(address account, bytes32 role)
getPrimaryRole(address account)
isSupportedRole(bytes32 role)
canInitiateTransfer(bytes32 role)
canReceiveTransfer(bytes32 role)
setRoute(bytes32 fromRole, bytes32 toRole, bool allowed)
isValidRoute(bytes32 fromRole, bytes32 toRole)
configureMvpRoutes()
```

### Backend usage notes

Before registering or transferring products, backend should make sure actors have proper roles.

Example role setup flow:

```text
Admin grants MANUFACTURER_ROLE to manufacturer
Admin grants IMPORTER_ROLE to importer
Admin grants DISTRIBUTOR_ROLE to distributor
Admin grants CLINIC_ROLE to clinic
Admin grants PHARMACY_ROLE to pharmacy
Admin grants RECALL_AUTHORITY_ROLE to recall authority
Admin calls configureMvpRoutes()
```

---

## 10. Contract 2 - ProductRegistry

### Purpose

`ProductRegistry` manages:

- Product registration
- Product ownership
- Product status
- Batch grouping
- Batch recall
- Imported product proof state
- Mock ZKP verification state
- Risk state
- Product verification data

### Product status enum

| Value | On-chain status | Frontend display |
|---|---|---|
| 0 | `REGISTERED` | `REGISTERED` |
| 1 | `VERIFIED` | `VERIFIED` |
| 2 | `IN_TRANSIT` | `PENDING_DELIVERY` |
| 3 | `DELIVERED` | `DELIVERED` |
| 4 | `FLAGGED` | `HIGH RISK` or `FLAGGED` |
| 5 | `RECALLED` | `RECALLED` |

Important frontend rule:

```text
IN_TRANSIT should be displayed as PENDING_DELIVERY.
```

### Product struct

The product object stores:

```text
serialID
batchHash
metadataHash
importDocHash
origin
currentOwner
status
previousStatus
isImported
zkpVerified
riskLevel
flagReason
registeredAt
exists
```

### Important backend functions

```text
registerProduct(
  bytes32 serialID,
  bytes32 batchHash,
  bytes32 metadataHash,
  bytes32 importDocHash,
  bytes zkpProof
)

verifyProof(bytes32 importDocHash, bytes zkpProof)

recallBatch(bytes32 batchHash, bytes32 reasonHash)

getStatus(bytes32 serialID)
getCurrentOwner(bytes32 serialID)
getProduct(bytes32 serialID)
getBatchSerials(bytes32 batchHash)
isBatchRecalled(bytes32 batchHash)
getBatchSize(bytes32 batchHash)
getBatchSummary(bytes32 batchHash)
productExists(bytes32 serialID)
getRiskLevel(bytes32 serialID)
getFlagReason(bytes32 serialID)
isZkpVerified(bytes32 serialID)
isImportedProduct(bytes32 serialID)
```

### TransferLedger-only functions

These functions should normally only be called by `TransferLedger`:

```text
markInTransit(bytes32 serialID)
completeTransfer(bytes32 serialID, address newOwner)
flagProductFromLedger(bytes32 serialID, uint8 riskLevel, bytes32 reason)
```

Backend should not call these directly for normal product movement.

Use:

```text
TransferLedger.createTransferRequest()
TransferLedger.confirmTransfer()
```

instead.

---

## 11. ZKP Design in MVP

### Current implementation

The current MVP uses a mock ZKP verification mechanism for imported vaccines.

In `ProductRegistry.sol`, imported products require:

```text
importDocHash
zkpProof
```

The contract checks that:

```text
importDocHash != bytes32(0)
zkpProof.length > 0
```

If both conditions are true, the product is treated as ZKP verified.

### Why mock ZKP is used in the MVP

The purpose of this design is to simulate a privacy-preserving import verification flow without introducing the full complexity of a real ZKP circuit during the MVP phase.

In the MVP:

- The full import document is not stored on-chain.
- Only `importDocHash` is stored on-chain.
- `zkpProof` acts as a mock proof that the importer has a valid import document.
- The contract records whether the imported product is ZKP verified.
- The frontend can display `ZKP Verified: Yes / No`.

This allows the project to demonstrate the intended architecture:

```text
Importer owns valid import document
-> backend hashes the document
-> backend sends importDocHash and mock zkpProof
-> smart contract verifies non-empty hash and proof
-> product is marked as ZKP verified
```

### Current smart contract logic

The current verifier logic is:

```solidity
/**
 * @dev MVP mock ZKP verifier.
 *
 * In the current MVP, the contract only checks that:
 * - import document hash is not empty
 * - proof bytes are not empty
 *
 * This simulates an importer proving that an import document exists
 * without exposing the full document on-chain.
 *
 * In production, this function should be replaced with a real verifier
 * contract generated from a ZKP circuit, such as Groth16 or Plonk.
 */
function verifyProof(
    bytes32 importDocHash,
    bytes calldata zkpProof
) public pure returns (bool) {
    return importDocHash != bytes32(0) && zkpProof.length > 0;
}
```

### Imported vaccine registration logic

For imported vaccines:

```text
Importer must provide importDocHash
Importer must provide non-empty zkpProof
verifyProof(importDocHash, zkpProof) must return true
Product is stored with isImported = true
Product is stored with zkpVerified = true
```

For local vaccines:

```text
Manufacturer can register without importDocHash
Manufacturer can register without zkpProof
Product is stored with isImported = false
Product is stored with zkpVerified = false
```

### Backend responsibility in MVP

Backend should:

- Receive readable import document data or file reference
- Store readable import document off-chain or on IPFS
- Generate `importDocHash`
- Generate or provide mock `zkpProof`
- Send `importDocHash` and `zkpProof` to `ProductRegistry.registerProduct()`
- Store readable metadata off-chain for dashboard display

Example mock proof:

```ts
const importDocHash = ethers.keccak256(
  ethers.toUtf8Bytes(JSON.stringify(importDocument))
);

const zkpProof = "0x1234";
```

### Frontend responsibility in MVP

Frontend should display imported vaccine verification state:

```text
ZKP Verified: Yes
```

or:

```text
ZKP Verified: No
```

Suggested UI fields:

```text
Product Type: Local / Imported
Import Verification: ZKP Verified / Not Verified
Import Document Hash: 0x...
```

For consumer-facing pages, display only simplified information:

```text
Imported product verified
```

Avoid showing unnecessary technical details to end users.

### Production upgrade path

In a production version, the mock verifier should be replaced by a real verifier contract.

Suggested production flow:

```text
1. Define the import verification statement
2. Build a ZKP circuit
3. Compile the circuit
4. Generate proving key and verification key
5. Generate Solidity verifier contract
6. Deploy verifier contract
7. Update ProductRegistry to call the verifier contract
8. Backend generates proof off-chain
9. Smart contract verifies proof on-chain
```

Possible tools:

```text
Circom
snarkjs
Groth16
Plonk
Solidity verifier contract
```

### Possible production verification statement

A future ZKP circuit could prove that:

```text
The importer owns a valid import document
The document was issued by an authorized authority
The document matches the vaccine batch
The document has not expired
The document hash matches the on-chain importDocHash
```

without revealing the full import document on-chain.

### Production architecture suggestion

Production version could use:

```text
ImportDocumentVerifier.sol
ProductRegistry.sol
```

Flow:

```text
Backend generates proof off-chain
Backend sends proof and public signals to ProductRegistry
ProductRegistry calls ImportDocumentVerifier.verifyProof()
Verifier returns true or false
ProductRegistry stores zkpVerified state
```

Example future interface:

```solidity
interface IImportDocumentVerifier {
    function verifyProof(
        bytes calldata proof,
        uint256[] calldata publicSignals
    ) external view returns (bool);
}
```

### Important note

The current MVP does not implement a real cryptographic ZKP verifier.

The current design is a mock verifier intended to demonstrate:

```text
Privacy-preserving import verification concept
On-chain storage of document hash
On-chain storage of verification state
Backend-driven proof generation flow
Future upgrade path to real ZKP
```

---

## 12. Contract 3 - TransferLedger

### Purpose

`TransferLedger` manages:

- Transfer request creation
- Receiver confirmation
- Route validation
- Product movement history
- Double-scan risk detection

The transfer flow is a two-step process:

```text
Step 1: Sender creates transfer request
Step 2: Receiver confirms transfer
```

Ownership changes only after confirmation.

### Important backend functions

```text
createTransferRequest(
  bytes32 serialID,
  address receiver,
  bytes32 fromLocationHash,
  bytes32 toLocationHash
)

confirmTransfer(
  bytes32 serialID,
  bytes32 receiverLocationHash
)

getTransferHistory(bytes32 serialID)

getTransferHistoryLength(bytes32 serialID)
```

---

## 13. Backend Integration Flow 1 - Register Product

### Frontend route

```text
/dashboard/products
```

### Suggested backend endpoint

```text
POST /products/register
```

### Smart contract function

```text
ProductRegistry.registerProduct()
```

### Required request fields

Backend may receive readable fields from frontend:

```json
{
  "serialId": "VCN-2026-000001",
  "batchId": "BATCH-2026-001",
  "metadata": {
    "vaccineName": "Example Vaccine",
    "manufacturer": "Example Manufacturer",
    "expiryDate": "2027-12-31",
    "storageCondition": "2-8C"
  },
  "isImported": false,
  "importDocument": null,
  "zkpProof": null
}
```

### Backend processing steps

Step 1 - Validate request body:

```text
serialId must exist
batchId must exist
metadata must exist
actor must have MANUFACTURER_ROLE or IMPORTER_ROLE
```

Step 2 - Convert readable data into hashes:

```ts
const serialID = ethers.keccak256(ethers.toUtf8Bytes(serialId));
const batchHash = ethers.keccak256(ethers.toUtf8Bytes(batchId));
const metadataHash = ethers.keccak256(
  ethers.toUtf8Bytes(JSON.stringify(metadata))
);
```

Step 3 - Handle local vaccine:

```ts
const importDocHash = ethers.ZeroHash;
const zkpProof = "0x";
```

Step 4 - Handle imported vaccine:

```ts
const importDocHash = ethers.keccak256(
  ethers.toUtf8Bytes(JSON.stringify(importDocument))
);

const zkpProof = "0x1234"; // mock proof for MVP
```

Step 5 - Call contract:

```ts
const tx = await productRegistry.registerProduct(
  serialID,
  batchHash,
  metadataHash,
  importDocHash,
  zkpProof
);

await tx.wait();
```

Step 6 - Store readable data off-chain:

Backend should store:

```text
serialId
batchId
metadata
serialID hash
batchHash
metadataHash
importDocHash
zkpVerified
transaction hash
contract address
```

### Expected result

On-chain:

```text
Product status = VERIFIED
Current owner = caller
Origin = caller
ProductRegistered event emitted
```

Frontend should display:

```text
Product registered successfully
Status: VERIFIED
QR code generated
```

For imported products, frontend should also display:

```text
ZKP Verified: Yes
```

---

## 14. Backend Integration Flow 2 - Create Transfer Request

### Frontend route

```text
/dashboard/scan-transfer
```

### Suggested backend endpoint

```text
POST /transfers/scan
```

### Smart contract function

```text
TransferLedger.createTransferRequest()
```

### Required request fields

```json
{
  "serialId": "VCN-2026-000001",
  "receiverAddress": "0x...",
  "fromLocation": "MANUFACTURER_WAREHOUSE_HCM",
  "toLocation": "DISTRIBUTOR_WAREHOUSE_HCM"
}
```

### Backend processing steps

Step 1 - Validate request:

```text
serialId must exist
receiverAddress must be valid EVM address
fromLocation must exist
toLocation must exist
sender must be current owner
sender and receiver must have valid roles
```

Step 2 - Convert fields into hashes:

```ts
const serialID = ethers.keccak256(ethers.toUtf8Bytes(serialId));
const fromLocationHash = ethers.keccak256(ethers.toUtf8Bytes(fromLocation));
const toLocationHash = ethers.keccak256(ethers.toUtf8Bytes(toLocation));
```

Step 3 - Call contract:

```ts
const tx = await transferLedger.createTransferRequest(
  serialID,
  receiverAddress,
  fromLocationHash,
  toLocationHash
);

await tx.wait();
```

### Expected result

On-chain:

```text
Product status = IN_TRANSIT
Pending transfer is stored
TransferRequested event emitted
```

Frontend should display:

```text
Status: PENDING_DELIVERY
Waiting for receiver confirmation
```

Important:

```text
Ownership does not change at this step.
```

---

## 15. Backend Integration Flow 3 - Confirm Transfer

### Frontend route

```text
/dashboard/scan-transfer
```

### Suggested backend endpoint

```text
POST /transfers/confirm
```

### Smart contract function

```text
TransferLedger.confirmTransfer()
```

### Required request fields

```json
{
  "serialId": "VCN-2026-000001",
  "receiverLocation": "DISTRIBUTOR_WAREHOUSE_HCM"
}
```

### Backend processing steps

Step 1 - Validate request:

```text
serialId must exist
receiverLocation must exist
caller must be the intended receiver
product must be IN_TRANSIT
```

Step 2 - Convert fields into hashes:

```ts
const serialID = ethers.keccak256(ethers.toUtf8Bytes(serialId));
const receiverLocationHash = ethers.keccak256(
  ethers.toUtf8Bytes(receiverLocation)
);
```

Step 3 - Call contract:

```ts
const tx = await transferLedger.confirmTransfer(
  serialID,
  receiverLocationHash
);

await tx.wait();
```

### Expected result

On-chain:

```text
Product owner changes to receiver
Product status = DELIVERED
Transfer history is recorded
TransferConfirmed event emitted
```

Frontend should display:

```text
Status: DELIVERED
Transfer completed
```

---

## 16. Backend Integration Flow 4 - Verify Product

### Frontend routes

```text
/dashboard/verify/[serialId]
/consumer/verify/[serialId]
```

### Suggested backend endpoints

```text
GET /verify/:serialId
GET /consumer/verify/:serialId
```

### Recommended contract reads

```text
ProductRegistry.getProduct()
ProductRegistry.getStatus()
ProductRegistry.getCurrentOwner()
ProductRegistry.getRiskLevel()
ProductRegistry.getFlagReason()
ProductRegistry.isImportedProduct()
ProductRegistry.isZkpVerified()
TransferLedger.getTransferHistory()
```

### Backend processing steps

Step 1 - Receive serial ID:

```text
VCN-2026-000001
```

Step 2 - Convert serial ID to hash:

```ts
const serialID = ethers.keccak256(ethers.toUtf8Bytes(serialId));
```

Step 3 - Read product existence:

```ts
const exists = await productRegistry.productExists(serialID);

if (!exists) {
  return {
    valid: false,
    status: "UNKNOWN",
    message: "Product not found"
  };
}
```

Step 4 - Read verification data:

```ts
const product = await productRegistry.getProduct(serialID);
const status = await productRegistry.getStatus(serialID);
const owner = await productRegistry.getCurrentOwner(serialID);
const riskLevel = await productRegistry.getRiskLevel(serialID);
const flagReason = await productRegistry.getFlagReason(serialID);
const imported = await productRegistry.isImportedProduct(serialID);
const zkpVerified = await productRegistry.isZkpVerified(serialID);
const history = await transferLedger.getTransferHistory(serialID);
```

Step 5 - Map status for frontend:

```ts
const statusMap = {
  0: "REGISTERED",
  1: "VERIFIED",
  2: "PENDING_DELIVERY",
  3: "DELIVERED",
  4: "FLAGGED",
  5: "RECALLED"
};
```

### Suggested dashboard response

```json
{
  "valid": true,
  "serialId": "VCN-2026-000001",
  "status": "VERIFIED",
  "currentOwner": "0x...",
  "origin": "0x...",
  "batchHash": "0x...",
  "metadataHash": "0x...",
  "isImported": true,
  "zkpVerified": true,
  "riskLevel": 0,
  "flagReason": "0x...",
  "transferHistory": []
}
```

### Suggested consumer response

```json
{
  "valid": true,
  "serialId": "VCN-2026-000001",
  "status": "VERIFIED",
  "safe": true,
  "warning": null,
  "isImported": true,
  "zkpVerified": true
}
```

Dashboard page should show more internal data.

Consumer page should show simplified verification data.

---

## 17. Backend Integration Flow 5 - Recall Batch

### Frontend route

```text
/dashboard/recall
```

### Suggested backend endpoint

```text
POST /recalls
```

### Smart contract function

```text
ProductRegistry.recallBatch()
```

### Required request fields

```json
{
  "batchId": "BATCH-2026-001",
  "reason": "Temperature anomaly detected during transportation"
}
```

### Backend processing steps

Step 1 - Validate request:

```text
batchId must exist
reason must exist
caller must have RECALL_AUTHORITY_ROLE
batch must not already be recalled
```

Step 2 - Convert data into hashes:

```ts
const batchHash = ethers.keccak256(ethers.toUtf8Bytes(batchId));
const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(reason));
```

Step 3 - Call contract:

```ts
const tx = await productRegistry.recallBatch(
  batchHash,
  reasonHash
);

await tx.wait();
```

### Expected result

On-chain:

```text
Batch recalled = true
All products in batch become RECALLED
Risk level = CRITICAL
BatchRecalled event emitted
```

### Recommended post-recall reads

```ts
const summary = await productRegistry.getBatchSummary(batchHash);
const serials = await productRegistry.getBatchSerials(batchHash);
const recalled = await productRegistry.isBatchRecalled(batchHash);
```

Frontend should display:

```text
Batch recalled
Total products affected
Reason
Affected serial list
```

---

## 18. Events for Backend Indexing

Backend can listen to events to sync off-chain database.

### ProductRegistry events

```text
ProductRegistered
BatchRecalled
TransferLedgerUpdated
ProductMarkedInTransit
ProductTransferCompleted
ProductFlagged
```

### TransferLedger events

```text
TransferRequested
TransferConfirmed
TransferRejected
DoubleScanDetected
```

### AccessControl events

Backend may also track role changes and route updates if events are emitted.

Backend should check exact event signatures from ABI before implementation.

---

## 19. Suggested Backend Contract Service Structure

Suggested backend structure:

```text
backend/
├── src/
│   ├── blockchain/
│   │   ├── blockchain.module.ts
│   │   ├── blockchain.service.ts
│   │   ├── contract-addresses.ts
│   │   └── contract-abis.ts
│   ├── products/
│   ├── transfers/
│   ├── recalls/
│   └── verify/
```

Suggested contract service responsibilities:

```text
- Create provider
- Create signer
- Load contract addresses
- Load ABI files
- Expose ProductRegistry instance
- Expose TransferLedger instance
- Expose AccessControl instance
```

Example service idea:

```ts
@Injectable()
export class BlockchainService {
  provider: ethers.JsonRpcProvider;
  signer: ethers.Wallet;

  accessControl: ethers.Contract;
  productRegistry: ethers.Contract;
  transferLedger: ethers.Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    this.signer = new ethers.Wallet(process.env.PRIVATE_KEY!, this.provider);

    this.accessControl = new ethers.Contract(
      deployment.contracts.supplyChainAccessControl,
      AccessControlAbi,
      this.signer
    );

    this.productRegistry = new ethers.Contract(
      deployment.contracts.productRegistry,
      ProductRegistryAbi,
      this.signer
    );

    this.transferLedger = new ethers.Contract(
      deployment.contracts.transferLedger,
      TransferLedgerAbi,
      this.signer
    );
  }
}
```

---

## 20. Frontend Alignment Requirements

Frontend should call backend APIs, not smart contracts directly.

### Product page

Route:

```text
/dashboard/products
```

Should support:

```text
Register product
Show product table
Show status badge
Show QR code
Distinguish local and imported products
Display ZKP verification status for imported products
```

### Batch page

Route:

```text
/dashboard/batches
```

Should display:

```text
Batch ID
Batch size
Recall status
Risk summary
List of serials
Recall action
```

### Scan transfer page

Route:

```text
/dashboard/scan-transfer
```

Must have two sections:

```text
1. Create Transfer Request
2. Confirm Transfer
```

Important:

```text
Transfer request does not immediately change ownership.
Ownership changes only after receiver confirmation.
```

### Verify page

Route:

```text
/dashboard/verify/[serialId]
```

Should display:

```text
Serial ID
Product status
Current owner
Origin
Batch info
Product type
ZKP verified
Risk level
Recall status
Transfer timeline
```

### Recall page

Route:

```text
/dashboard/recall
```

Should support:

```text
batchId or batchHash input
reason input
confirm recall action
affected product display
```

### Consumer verify page

Route:

```text
/consumer/verify/[serialId]
```

Should display simplified data:

```text
Product validity
Status
Recall warning
Risk warning
Basic origin
ZKP verified status if imported
Simplified timeline
```

---

## 21. Local Development Commands

Return to project root:

```powershell
cd C:\Users\Dell\vaccine-traceability-blockchain
```

Install smart contract dependencies:

```powershell
cd smart-contract
npm install
```

Compile contracts:

```powershell
npm run compile
```

Run tests:

```powershell
npm run test
```

Run local deployment:

```powershell
npm run deploy:local
```

Run Sepolia deployment:

```powershell
npm run deploy:sepolia
```

Return to project root:

```powershell
cd C:\Users\Dell\vaccine-traceability-blockchain
```

---

## 22. Verification Commands

To verify contracts on Sepolia Etherscan, prepare:

```text
ETHERSCAN_API_KEY in smart-contract/.env
```

Then run commands from:

```powershell
cd C:\Users\Dell\vaccine-traceability-blockchain\smart-contract
```

### Verify SupplyChainAccessControl

```powershell
npx hardhat verify --network sepolia ACCESS_CONTROL_ADDRESS DEPLOYER_ADDRESS
```

### Verify ProductRegistry

```powershell
npx hardhat verify --network sepolia PRODUCT_REGISTRY_ADDRESS ACCESS_CONTROL_ADDRESS
```

### Verify TransferLedger

```powershell
npx hardhat verify --network sepolia TRANSFER_LEDGER_ADDRESS PRODUCT_REGISTRY_ADDRESS ACCESS_CONTROL_ADDRESS
```

Replace placeholders with values from:

```text
smart-contract/deployments/sepolia.json
```

---

## 23. Security Notes

Do not commit:

```text
.env
private keys
seed phrases
Firebase service account JSON
database URLs
JWT secrets
API secrets
```

Safe to commit:

```text
smart-contract/deployments/sepolia.json
smart-contract/abis/*.json
docs/smart-contract-handoff.md
```

Use only a test wallet for Sepolia deployment.

Do not use a wallet that contains real funds.

---

## 24. Current Smart Contract Status

Completed:

```text
SupplyChainAccessControl contract
ProductRegistry contract
TransferLedger contract
Product registration logic
Importer mock ZKP logic
Batch recall logic
Two-step transfer flow
Route validation
Double-scan detection
60 passing tests
Deployment script
Sepolia deployment address file
ABI export
Smart contract handoff documentation
```

In progress or optional:

```text
Etherscan verification
Real ZKP verifier integration
Slither audit
Backend integration
Frontend business UI completion
```

---

## 25. Backend and Frontend Handoff Checklist

Backend team should receive:

```text
[ ] smart-contract/deployments/sepolia.json
[ ] smart-contract/abis/SupplyChainAccessControl.json
[ ] smart-contract/abis/ProductRegistry.json
[ ] smart-contract/abis/TransferLedger.json
[ ] docs/smart-contract-handoff.md
```

Frontend team should receive:

```text
[ ] Status mapping
[ ] Route mapping
[ ] Product verification fields
[ ] ZKP verification explanation
[ ] Transfer two-step explanation
[ ] Recall flow explanation
```

Before backend/frontend integration, confirm:

```text
[ ] Contract addresses exist on Sepolia
[ ] ABI files are updated
[ ] Backend has RPC URL
[ ] Backend has signer wallet
[ ] Backend has role setup plan
[ ] Frontend does not call private-key operations directly
[ ] Imported product flow displays ZKP verification status
```