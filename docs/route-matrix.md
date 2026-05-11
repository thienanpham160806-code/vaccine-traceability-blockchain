\# Route Matrix for Vaccine Supply Chain MVP



\## Purpose



This document defines the valid transfer routes between supply chain actors. These routes will be checked by `TransferLedger.sol` before an ownership transfer is accepted.



\## Valid Routes



| From Role | To Role | Meaning |

|---|---|---|

| MANUFACTURER\_ROLE | IMPORTER\_ROLE | Manufacturer transfers imported vaccine batch to importer |

| MANUFACTURER\_ROLE | DISTRIBUTOR\_ROLE | Manufacturer transfers domestic vaccine batch to distributor |

| IMPORTER\_ROLE | DISTRIBUTOR\_ROLE | Importer transfers vaccine batch to distributor |

| DISTRIBUTOR\_ROLE | CLINIC\_ROLE | Distributor transfers vaccine to clinic |

| DISTRIBUTOR\_ROLE | PHARMACY\_ROLE | Distributor transfers vaccine to pharmacy |



\## Invalid Routes



| From Role | To Role | Reason |

|---|---|---|

| CLINIC\_ROLE | DISTRIBUTOR\_ROLE | Invalid reverse flow in MVP |

| PHARMACY\_ROLE | DISTRIBUTOR\_ROLE | Invalid reverse flow in MVP |

| CLINIC\_ROLE | MANUFACTURER\_ROLE | Invalid reverse flow |

| PHARMACY\_ROLE | MANUFACTURER\_ROLE | Invalid reverse flow |

| AUDITOR\_ROLE | DISTRIBUTOR\_ROLE | Auditor is not part of physical product transfer |



\## Notes



\- Routes are stored on-chain in `SupplyChainAccessControl.sol`.

\- Admin can enable or disable routes by calling `setRoute`.

\- `TransferLedger.sol` will call `isValidRoute` before processing ownership transfer.

\- In Week 2, this contract only stores and validates the route matrix.

