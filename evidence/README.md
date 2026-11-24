# Switchyard validation

The deployment and lifecycle tests used GenLayer Stable Studionet (61999) and independent in-memory test wallets. [Receipts and finalized readbacks](studionet.json) preserve the deployment, trial, rejection, stale-revision, and successful dispatch evidence. Prefix a transaction ID with `https://explorer-studio.genlayer.com/transactions/` to open its receipt.

[Source comparison](source-match.json) was made against the deployment transaction payload. [Official GenVM checks](genvm-lint.txt) were run against the same bytes. The Python SDK dependency is pinned in the source header.

## Live read-only verification

The GitHub Actions validation workflow runs `npm run verify:readback` after unit tests and the production build. This script submits no transactions. It reads all existing trials and tickets from Studionet, checks active revisions, and rechecks each preserved transaction receipt. The successful audit artifact records the full live readback.

The verified state contains three trials: Trial 1 PROMOTED, Trial 2 REJECTED, and Trial 3 PROMOTED. The original desk owner's active revision is 1; the separate dispatch desk's active revision is 3. The contract currently contains one dispatch record: Ticket 1, created by Trial 3 using Revision 3, routed to INCIDENT.

## Evidence limitation

An earlier `route_active` evidence key was overwritten when the later dispatch verification reused the same key. Its earlier transaction hash is not retained and is not reconstructed. The current live contract has one dispatch record, Ticket 1 under Revision 3. No separate Revision 1 dispatch is claimed. The retained `route_active_trial_3` receipt is the verified transaction for the current Ticket 1.

## Browser checks

| Viewport | Test |
| --- | --- |
| 1440 × 1000 | [Desktop capture](desktop.png) |
| 390 × 844 | [Narrow capture](narrow.png) |

Chromium verified no horizontal overflow, finalized trial readback, the new-trial form, EIP-6963 discovery, network switching and account changes using a controlled provider, and creation and disconnect of a browser demo wallet. The browser harness relayed actual RPC responses because its direct egress was unavailable. Physical mobile hardware and real extension signing were outside this run. The chain receipts were signed by independent in-memory SDK wallets.
