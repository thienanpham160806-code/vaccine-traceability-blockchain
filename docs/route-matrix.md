# Route Matrix for Vaccine Supply Chain MVP

## Purpose

This document defines valid transfer routes between supply chain actors. These routes will be checked by `TransferLedger.sol` before a transfer request is created.

## Valid Routes

| From Role | To Role | Meaning |
|---|---|---|
| MANUFACTURER_ROLE | DISTRIBUTOR_ROLE | Manufacturer transfers domestic vaccine batch to distributor |
| IMPORTER_ROLE | DISTRIBUTOR_ROLE | Importer transfers vaccine batch to distributor |
| DISTRIBUTOR_ROLE | CLINIC_ROLE | Distributor transfers vaccine to clinic |
| DISTRIBUTOR_ROLE | PHARMACY_ROLE | Distributor transfers vaccine to pharmacy |

## Invalid Routes

| From Role | To Role | Reason |
|---|---|---|
| MANUFACTURER_ROLE | IMPORTER_ROLE | Domestic manufacturers do not send products into the import flow |
| DISTRIBUTOR_ROLE | DISTRIBUTOR_ROLE | Distributor-to-distributor transfer is outside the current business flow |
| CLINIC_ROLE | CLINIC_ROLE | Clinic-to-clinic transfer is not supported in MVP |
| CLINIC_ROLE | DISTRIBUTOR_ROLE | Invalid reverse flow |
| PHARMACY_ROLE | DISTRIBUTOR_ROLE | Invalid reverse flow |
| CLINIC_ROLE | MANUFACTURER_ROLE | Invalid reverse flow |
| PHARMACY_ROLE | MANUFACTURER_ROLE | Invalid reverse flow |
| AUDITOR_ROLE | DISTRIBUTOR_ROLE | Auditor is not part of physical product transfer |

## Notes

- Routes are stored on-chain in `SupplyChainAccessControl.sol`.
- Admin can enable or disable routes by calling `setRoute`.
- `TransferLedger.sol` will call `isValidRoute` before creating a pending transfer.
