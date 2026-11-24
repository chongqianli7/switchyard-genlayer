# Switchyard validation

The deployment and lifecycle tests used GenLayer Stable Studionet (61999) and two independent in-memory test wallets. [Receipts and finalized readbacks](studionet.json) preserve the transaction IDs that remain available and the contract outputs. Prefix a transaction ID with `https://explorer-studio.genlayer.com/transactions/` to open the corresponding receipt.

[Source comparison](source-match.json) was made against the deployment transaction payload. [Official GenVM checks](genvm-lint.txt) were run against the same bytes. The Python SDK dependency is pinned in the source header.

## Read-only verification

Run `node scripts/verify-readback.mjs` to query every existing trial and ticket, check the active revision, and re-check the preserved transaction receipts. This script does not deploy a contract or submit a transaction.

## Evidence limitation

The original successful dispatch transaction hash for Ticket 1 was overwritten when the later dispatch verification reused the `route_active` evidence key. The current evidence therefore does not claim a transaction hash for Ticket 1. The first run's script asserted that Ticket 1 was stored in the INCIDENT queue under revision 1, but its readback object was subsequently replaced by the Ticket 2 readback. Ticket 2's successful dispatch hash is preserved separately as `route_active_trial_3`. No missing hash or readback has been reconstructed.

The second dispatch scenario creates Trial 3 and Ticket 2. Its preserved transaction records are named `dispatch_trial_open`, `dispatch_trial_submit`, `dispatch_trial_evaluate`, `stale_route_trial_3`, and `route_active_trial_3`. Run the read-only verification script to obtain the full Trial 3 state directly from Studionet.

## Browser checks

| Viewport | Test |
| --- | --- |
| 1440 × 1000 | [Desktop capture](desktop.png) |
| 390 × 844 | [Narrow capture](narrow.png) |

Chromium verified no horizontal overflow, finalized trial readback, the new-trial form, EIP-6963 discovery, network switching and account changes using a controlled provider, and creation and disconnect of a browser demo wallet. The browser harness relayed actual RPC responses because its direct egress was unavailable. Physical mobile hardware and real extension signing were outside this run. The chain receipts were signed by independent in-memory SDK wallets.
