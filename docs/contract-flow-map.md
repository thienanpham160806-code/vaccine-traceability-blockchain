\# Contract Flow Map



\## Flow 1: Vaccine Registration



API:



`POST /products/register`



Smart contract:



`ProductRegistry.registerProduct()`



Main checks:



\- Caller must have `MANUFACTURER\_ROLE` or `IMPORTER\_ROLE`

\- Serial must not already exist

\- Batch must not be recalled

\- Importer must provide `importDocHash` and `zkpProof`

\- Product status becomes `VERIFIED`

\- Event `ProductRegistered` is emitted



\## Flow 2: Transfer and Receive



API:



`POST /transfers/scan`



Smart contract:



`TransferLedger.createTransferRequest()`



Main checks:



\- Serial exists

\- Sender is current owner

\- Sender role and receiver role are valid

\- Route is allowed by `SupplyChainAccessControl.isValidRoute()`

\- Product is not `FLAGGED` or `RECALLED`

\- Double-scan anomaly is checked



On success:



\- Product status becomes `IN\_TRANSIT`

\- Frontend displays `PENDING\_DELIVERY`

\- Event `TransferRequested` is emitted



API:



`POST /transfers/confirm`



Smart contract:



`TransferLedger.confirmTransfer()`



Main checks:



\- Pending transfer exists

\- Caller is the intended receiver

\- Product is not `FLAGGED` or `RECALLED`



On success:



\- Product owner becomes receiver

\- Product status becomes `DELIVERED`

\- Transfer history is recorded

\- Event `TransferConfirmed` is emitted



\## Flow 3: Verification



API:



`GET /verify/:serialId`



Smart contracts:



\- `ProductRegistry.getProduct()`

\- `ProductRegistry.getStatus()`

\- `ProductRegistry.getRiskLevel()`

\- `TransferLedger.getTransferHistory()`



Backend also queries:



\- Database metadata

\- IPFS CIDs

\- Event logs if needed



\## Flow 4: Recall and Dispute



Recall API:



`POST /recalls`



Smart contract:



`ProductRegistry.recallBatch()`



Allowed role:



`RECALL\_AUTHORITY\_ROLE`



Dispute API:



`POST /disputes`



Smart contract, future function:



`ProductRegistry.submitDispute()`



Resolve API:



`POST /disputes/:id/resolve`



Smart contract, future function:



`ProductRegistry.resolveDispute()`

