\# ProductRegistry Contract



\## Purpose



`ProductRegistry.sol` is the core product registry contract for the vaccine traceability MVP.



It stores the on-chain proof of product registration, batch membership, current owner, status, import verification state, and risk flag state.



\## Main Responsibilities



\- Register vaccine serials

\- Store product metadata hash

\- Store batch hash

\- Store import document hash

\- Track current owner

\- Track product origin

\- Track product status

\- Track mock ZKP verification state

\- Recall all serials in a batch

\- Allow TransferLedger to update transfer-related status

\- Allow TransferLedger to flag risky products



\## Product Status



| Status | Meaning |

|---|---|

| REGISTERED | Initial enum value, not used as final active state in MVP |

| VERIFIED | Product has been registered and verified |

| IN\_TRANSIT | Product is under pending transfer |

| DELIVERED | Product has been received by the next actor |

| FLAGGED | Product has suspicious activity |

| RECALLED | Product belongs to a recalled batch |



\## Frontend Status Mapping



| On-chain Status | Frontend Display |

|---|---|

| VERIFIED | VERIFIED |

| IN\_TRANSIT | PENDING\_DELIVERY |

| DELIVERED | DELIVERED |

| FLAGGED | HIGH RISK / FLAGGED |

| RECALLED | RECALLED |



\## Main Functions



\### registerProduct



Registers a new vaccine serial.



Allowed roles:



\- MANUFACTURER\_ROLE

\- IMPORTER\_ROLE



Importer-specific checks:



\- importDocHash must not be empty

\- zkpProof must not be empty

\- verifyProof must return true



\### recallBatch



Recalls all serials in a batch.



Allowed role:



\- RECALL\_AUTHORITY\_ROLE



\### setTransferLedger



Sets the TransferLedger contract address.



Allowed role:



\- DEFAULT\_ADMIN\_ROLE



\### markInTransit



Called by TransferLedger when a transfer request is created.



\### completeTransfer



Called by TransferLedger when the receiver confirms the transfer.



\### flagProductFromLedger



Called by TransferLedger when a double-scan or route anomaly is detected.



\## Stored On-chain Data



\- serialID

\- batchHash

\- metadataHash

\- importDocHash

\- origin

\- currentOwner

\- status

\- isImported

\- zkpVerified

\- riskLevel

\- flagReason



\## Off-chain Data



Large or sensitive data should remain off-chain:



\- invoice

\- certificate

\- import documents

\- evidence files

\- full vaccine metadata

\- dashboard data



Only hashes or proof states are stored on-chain.

