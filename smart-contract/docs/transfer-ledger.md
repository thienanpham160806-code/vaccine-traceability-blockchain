\# TransferLedger Contract



\## Purpose



`TransferLedger.sol` manages the physical transfer flow between actors in the vaccine supply chain MVP.



This contract implements a two-step transfer flow:



1\. Sender creates a transfer request.

2\. Receiver confirms the transfer.



Ownership is updated only after confirmation.



\## Main Responsibilities



\- Validate transfer routes

\- Create pending transfer requests

\- Confirm transfers

\- Record transfer history

\- Detect double-scan anomalies

\- Trigger product flagging through ProductRegistry



\## Main Functions



\### createTransferRequest



Creates a pending transfer.



Checks:



\- Product exists

\- Sender is current owner

\- Product is not recalled or flagged

\- Sender role is allowed

\- Receiver role is allowed

\- Route is valid

\- No active pending transfer

\- No suspicious double-scan activity



Effects:



\- Product status becomes `IN\_TRANSIT`

\- Pending transfer is stored

\- Event `TransferRequested` is emitted



\### confirmTransfer



Receiver confirms the transfer.



Checks:



\- Pending transfer exists

\- Caller is receiver

\- Product status is `IN\_TRANSIT`

\- Receiver location matches expected location



Effects:



\- Ownership is transferred

\- Product status becomes `DELIVERED`

\- Transfer history is recorded

\- Event `TransferConfirmed` is emitted



\## Double-scan Detection



If:



\- the same serial is scanned

\- within a short time window

\- at a different location



then:



\- ProductRegistry flags the product

\- transfer is reverted

\- `DoubleScanDetected` event is emitted



\## Pending Transfer Flow



```text

Sender

&#x20; -> createTransferRequest()

&#x20; -> Product status = IN\_TRANSIT



Receiver

&#x20; -> confirmTransfer()

&#x20; -> Product status = DELIVERED

