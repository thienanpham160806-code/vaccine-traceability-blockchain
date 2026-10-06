# Security review — smart contracts

Scope: `smart-contract/contracts/` (SupplyChainAccessControl, ProductRegistry,
TransferLedger, ColdChainRegistry, demo verifiers) at commit `28640b5` on
`main`.

Method:

1. Static analysis with **Slither 0.11.6** (102 detectors, `node_modules`
   filtered out). Reproduce:
   ```bash
   pip install slither-analyzer
   cd smart-contract && npx hardhat compile
   slither . --hardhat-ignore-compile --filter-paths node_modules
   ```
2. Manual review of the access-control and state-machine logic, with each
   suspected issue reproduced in a Hardhat test before being reported here.

## Summary

| Source | High | Medium | Low | Informational | Optimization | Total |
|---|---|---|---|---|---|---|
| Slither | 0 | 4 | 23 | 5 | 5 | 37 |
| Manual review | 1 | 2 | 4 | 4 | – | 11 |

None of the 37 Slither results are exploitable vulnerabilities. Each one is
classified below; the 5 `immutable-states` optimizations are valid but are
not applied, because the scope rule for this pass is "no contract changes
except real security fixes".

All three real security issues (H-1, M-1, M-2) came from manual review, not
from Slither. They are **fixed on branch `fix/contract-access-control`
(separate PR, with tests)**. That PR is not merged yet, and the contracts
currently deployed on Sepolia stay vulnerable until they are redeployed from
it.

| ID | Severity | Title | Status |
|---|---|---|---|
| H-1 | High | TransferLedger lot functions callable by anyone | Fixed in separate PR |
| M-1 | Medium | Recalled lot can still be dispensed through a sub-lot | Fixed in separate PR |
| M-2 | Medium | Revoking a role via `revokeRole`/`renounceRole` keeps the primary role | Fixed in separate PR |
| L-1 | Low | Mock proof check in `registerProduct` / `commissionLot` | Acknowledged (MVP) |
| L-2 | Low | Invalid-route flag is rolled back by the revert | Acknowledged |
| L-3 | Low | Pending transfer can only be cleared by the receiver | Acknowledged |
| L-4 | Low | Sub-lot root is not checked against the parent root | Acknowledged (partly mitigated by H-1 fix) |
| I-1 | Info | `DoubleScanDetected` is emitted but nothing consumes it | Recommendation |
| I-2 | Info | Caller-supplied timestamps on lot events | Acknowledged |
| I-3 | Info | Single admin key can rewire `transferLedger` | Recommendation |
| I-4 | Info | `getBatchSerials` returns an unbounded array | Acknowledged (view only) |

---

## Manual-review findings

### H-1 — TransferLedger lot functions are callable by any address (High)

`TransferLedger.recordEvent`, `anchorEnv`, `disaggregate` and
`decommissionUnit` forward straight to `ProductRegistry` /
`ColdChainRegistry`. Those contracts only check
`msg.sender == transferLedger`, and the ledger itself checks nothing, so the
effective access control was "anyone".

Reproduced on `main` with an account that holds no role:

1. `disaggregate(realLot, fakeSubLot, subLotRoot = victimUnitHash, …)` — creates
   a sub-lot whose Merkle root is the victim unit's own hash.
2. `decommissionUnit(victimUnitHash, fakeSubLot, proof = [], …)` — a
   single-leaf tree needs an empty proof, so the check passes and
   `unitDecommissioned[victim] = true`.

Impact: any vial can be marked as dispensed (so a real dispense later fails
and consumer verification shows it as already used). Fake custody events and
fake cold-chain compliance anchors can also be emitted. The backend's event
listener copies `UnitDecommissioned`, `LotDisaggregated` and `EnvAnchored`
into Firebase, so the forged state also shows up in the off-chain views.

Fix: role modifiers on the four functions that mirror the backend route
guards (admin is always allowed, because the backend falls back to the admin
key):

| Function | Allowed primary roles |
|---|---|
| `recordEvent`, `anchorEnv` | manufacturer, importer, distributor, clinic, pharmacy |
| `disaggregate` | manufacturer, importer, distributor |
| `decommissionUnit` | clinic, pharmacy, recall authority |

Cost: +12.4k to +15.8k gas per call on the admin path (worst case, every
check evaluated), measured with hardhat-gas-reporter.

### M-1 — Recalled lot can still be dispensed through a sub-lot (Medium)

`decommissionUnit` checks `lots[lotIdHash].recalled`. Sub-lots created by
`disaggregate` have no `Lot` entry (only `lotToParent` / `lotToSubRoot`), so
their `recalled` flag is always `false`, and `recallLot` cannot target them
because it requires `lots[id].exists`. Result: after `recallLot(parent)`,
units in any sub-lot of that parent could still be dispensed. That is a
patient-safety issue for a vaccine recall.

Fix: also require `!lots[lotToParent[lotIdHash]].recalled`. Sub-lots are only
one level deep, because `disaggregate` requires the parent to be a commissioned
lot.

### M-2 — Primary role survives `revokeRole` / `renounceRole` (Medium)

`TransferLedger.createTransferRequest` authorises by
`accessControl.getPrimaryRole(...)` and never calls `hasRole`. Only
`revokeUserRole` cleared `primaryRoles`; the inherited OpenZeppelin
`revokeRole` (callable by the admin from a block explorer, for example) and
`renounceRole` did not. A distributor whose key was compromised and whose role
was revoked that way could keep shipping the stock it held.

Fix: override `_revokeRole` in `SupplyChainAccessControl` so every revocation
path clears a matching primary role. `revokeUserRole` still emits
`PrimaryRoleSet` exactly once (tested).

### L-1 — Mock proof check (Low, acknowledged)

`ProductRegistry.verifyProof` returns true for any non-empty `zkpProof`. It is
used by `registerProduct` (importer path) and `commissionLot`, and the
importer path then sets `zkpVerified = true`. The code documents this as an
MVP mock. The real verification path is `registerImportedProductZK`, which
calls an `IImportZKPVerifier` (currently `DemoImportZKPVerifier`, which only
checks the inputs are well-formed; the Groth16 verifier from
`circuits/import_registration.circom` is not deployed yet).
Recommendation: label `zkpVerified` from the mock path differently in the UI,
or remove the mock path once the generated verifier is deployed.

### L-2 — Invalid-route flag is rolled back (Low, acknowledged)

`createTransferRequest` calls `flagProductFromLedger(..., INVALID_ROUTE)` and
emits `TransferRejected`, then executes `revert("Invalid route")`. The revert
undoes both, so a product is never actually flagged for an invalid route, and
the `FLAGGED` status cannot be reached through the real ledger. This is a
functional bug, not a vulnerability: the invalid transfer is still blocked.
It is covered by the test *"an invalid route reverts atomically"*. Fixing it
changes behaviour (return instead of revert), so the team should decide on it
separately.

### L-3 — Only the receiver can clear a pending transfer (Low, acknowledged)

`rejectTransfer` is receiver-only, and there is no sender cancel or timeout.
If the receiver loses its key or never acts, the product stays `IN_TRANSIT`
and the sender cannot re-route it. Recommendation: let the sender cancel after
a timeout.

### L-4 — Sub-lot root is not checked against the parent (Low, acknowledged)

`disaggregate` stores whatever `subLotRoot` the caller provides; nothing
proves that the sub-lot's units are a subset of the parent's. After the H-1
fix this needs a sender role (manufacturer, importer or distributor) **and** a
dispenser role acting together, so it is no longer open to arbitrary
accounts. A full fix (verifying units against the parent root as well) would
change the proof format the backend builds in `services/lotResolution.ts`.

### I-1 — `DoubleScanDetected` has no consumer (Informational)

`TransferLedger._checkDoubleScan` emits `DoubleScanDetected` when the same
serial is scanned at a different location within 30 minutes. The event does
not block the transfer, and `backend/src/services/eventListener.ts` does not
subscribe to it. Recommendation: add a listener that raises a risk flag in
Firebase.

### I-2 — Caller-supplied timestamps (Informational)

`commissionLot`, `recordEvent`, `disaggregate`, `decommissionUnit` and
`anchorEnv` take a `timestamp` argument and put it in events without checking
it, so events can be back-dated or future-dated by an authorised caller. Use
`block.timestamp` where the event time should be trusted.

### I-3 — Centralisation (Informational)

One `DEFAULT_ADMIN_ROLE` account can grant any role, change routes, and call
`ProductRegistry.setTransferLedger`. Pointing that at an EOA would let that
account rewrite any product's owner or status. Recommendation: use a multisig
or timelock as admin for any non-demo deployment.

### I-4 — Unbounded `getBatchSerials` (Informational)

It is a view function and is never called on-chain, so it cannot lock funds or
state. Each serial adds about 2,275 gas to the `eth_call` (see
[gas report](../README.md#gas)), so very large batches will hit RPC
`eth_call` gas caps. `recallBatch` itself is O(1).

---

## Slither results (37)

| # | Detector | Impact | Where | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `incorrect-equality` | Medium | `TransferLedger.confirmTransfer` — `receiverLocationHash == pendingTransfer.toLocationHash` | False positive | The detector targets strict equality on balances or timestamps that an attacker can nudge. This compares two `bytes32` location hashes, where exact equality is the intended check. |
| 2–4 | `reentrancy-no-eth` | Medium | `confirmTransfer` (state written after `completeTransfer`), `createTransferRequest` (after `flagProductFromLedger`, `markInTransit`) | False positive | The external callee is `productRegistry`, set once in the constructor to the project's own `ProductRegistry`. None of the called functions make external calls or callbacks, so nothing can re-enter. No ETH moves. The `flagProductFromLedger` path always reverts (L-2). Moving the state writes before the call (checks-effects-interactions) would be harmless defence in depth. |
| 5 | `reentrancy-benign` | Low | `confirmTransfer` writes `lastScans` / `transferHistory` after the call | False positive | Same trusted callee as 2–4. |
| 6–9 | `reentrancy-events` | Low | Events after external calls in `confirmTransfer`, `createTransferRequest` (×2), `rejectTransfer` | False positive | Same trusted callee; event order cannot be changed by an attacker. |
| 10–27 | `timestamp` | Low | 14 functions in `ProductRegistry`, 4 in `TransferLedger` | False positive (17) / accepted (1) | 17 of 18 flag comparisons such as `products[id].exists` or `status == …` only because the struct also contains a timestamp field; no timestamp is compared. The genuine one is `_checkDoubleScan` (`block.timestamp - previous < 30 minutes`). Since the Merge a proposer can shift `block.timestamp` by seconds at most, which does not matter against a 30-minute window. |
| 28–32 | `missing-inheritance` | Informational | e.g. `ProductRegistry` should inherit `IProductRegistry` | Accepted (style) | Each consumer declares the minimal interface it needs next to itself. A shared `interfaces/` file that the implementations inherit would let the compiler catch signature drift. Not a vulnerability. |
| 33–37 | `immutable-states` | Optimization | `accessControl` / `productRegistry` in `TransferLedger`, `ProductRegistry`, `ColdChainRegistry` | Valid, not applied | Assigned only in the constructor. Marking them `immutable` was measured on a throw-away build: −2,100 gas on `registerProduct`, −4,320 on `createTransferRequest`, −2,106 on `confirmTransfer`, −2,115 on `recallBatch`. Not applied here because it changes bytecode and needs a redeploy; it fits well with the redeploy for H-1. |

Slither did not report the H-1, M-1 or M-2 issues: they are authorisation
logic spread across three contracts, which pattern-based detectors do not
model.
