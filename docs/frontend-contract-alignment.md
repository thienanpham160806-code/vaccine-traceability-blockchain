\# Frontend - Smart Contract Alignment Checklist



\## Current Smart Contract Flow



The smart contract layer has 3 contracts:



1\. `SupplyChainAccessControl.sol`

2\. `ProductRegistry.sol`

3\. `TransferLedger.sol`



The transfer flow is a two-step flow:



1\. Sender creates a transfer request.

2\. Receiver confirms the transfer.



Ownership changes only after receiver confirmation.



\---



\## Required Frontend Routes



| Route | Purpose | Status |

|---|---|---|

| `/` | Landing page | Needs UI check |

| `/login` | Login page | Needs UI check |

| `/dashboard` | Dashboard overview | Needs UI check |

| `/dashboard/products` | Product registration and product list | Must align with `ProductRegistry.registerProduct()` |

| `/dashboard/batches` | Batch list and batch status | Must show batch size and recall status |

| `/dashboard/scan-transfer` | Transfer request and transfer confirmation | Must support two-step transfer |

| `/dashboard/verify/\[serialId]` | B2B product verification | Must show full internal verification data |

| `/dashboard/risk-dispute` | Risk and dispute management | Can remain mock until dispute contract logic is implemented |

| `/dashboard/recall` | Recall batch | Must align with `ProductRegistry.recallBatch()` |

| `/consumer/verify/\[serialId]` | Public consumer verification | Must show simplified product status |



\---



\## Status Mapping



| On-chain Status | Frontend Display |

|---|---|

| REGISTERED | REGISTERED |

| VERIFIED | VERIFIED |

| IN\_TRANSIT | PENDING\_DELIVERY |

| DELIVERED | DELIVERED |

| FLAGGED | HIGH RISK / FLAGGED |

| RECALLED | RECALLED |



\---



\## Product Registration Page



Route:



`/dashboard/products`



Required fields:



\- serialID

\- batchHash or batchId

\- metadata

\- import document, if imported

\- product type: LOCAL / IMPORT



Smart contract function:



`ProductRegistry.registerProduct()`



Frontend should not directly decide final hashes in production.

Backend should validate data, upload files to IPFS, calculate hashes, then call the contract.



\---



\## Batch Page



Route:



`/dashboard/batches`



Required display:



\- batch ID / batch hash

\- total products

\- recall status

\- risk summary

\- list of serials

\- action to recall batch



Smart contract functions:



\- `ProductRegistry.getBatchSize()`

\- `ProductRegistry.getBatchSerials()`

\- `ProductRegistry.isBatchRecalled()`

\- `ProductRegistry.getBatchSummary()`



\---



\## Scan Transfer Page



Route:



`/dashboard/scan-transfer`



This page must have two sections.



\### 1. Create Transfer Request



Required inputs:



\- serialID

\- receiverAddress

\- fromLocation

\- toLocation



Smart contract function:



`TransferLedger.createTransferRequest()`



Expected result:



\- product status becomes `IN\_TRANSIT`

\- frontend displays `PENDING\_DELIVERY`



\### 2. Confirm Transfer



Required inputs:



\- serialID

\- receiverLocation



Smart contract function:



`TransferLedger.confirmTransfer()`



Expected result:



\- owner changes to receiver

\- product status becomes `DELIVERED`

\- transfer history is updated



\---



\## B2B Verify Page



Route:



`/dashboard/verify/\[serialId]`



Required display:



\- serialID

\- product status

\- current owner

\- origin

\- batch info

\- product type: LOCAL / IMPORT

\- ZKP verified

\- risk level

\- flag reason

\- recall status

\- transfer timeline

\- blockchain transaction proof, if available



Smart contract functions:



\- `ProductRegistry.getProduct()`

\- `ProductRegistry.getStatus()`

\- `ProductRegistry.getCurrentOwner()`

\- `ProductRegistry.getRiskLevel()`

\- `ProductRegistry.getFlagReason()`

\- `ProductRegistry.isImportedProduct()`

\- `ProductRegistry.isZkpVerified()`

\- `TransferLedger.getTransferHistory()`



\---



\## Recall Page



Route:



`/dashboard/recall`



Required inputs:



\- batchHash or batchId

\- reason

\- optional evidence file / CID



Smart contract function:



`ProductRegistry.recallBatch()`



Expected display after recall:



\- batch recalled = true

\- all serials in batch = RECALLED

\- risk level = CRITICAL

\- reason hash displayed or stored



\---



\## Consumer Verify Page



Route:



`/consumer/verify/\[serialId]`



Required display:



\- product validity

\- status

\- product type

\- recall warning

\- simplified origin

\- simplified transfer timeline

\- warning if FLAGGED or RECALLED



This page should not display too much internal technical information.

