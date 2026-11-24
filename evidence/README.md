# Switchyard validation

The deployment and lifecycle tests used GenLayer Stable Studionet (61999) and two independent in-memory test wallets. [Receipts and finalized readbacks](studionet.json) preserve the actual transaction IDs and the contract outputs. Prefix a transaction ID with `https://explorer-studio.genlayer.com/transactions/` to open the corresponding receipt.

[Source comparison](source-match.json) was made against the deployment transaction payload. [Official GenVM checks](genvm-lint.txt) were run against the same bytes. The Python SDK dependency is pinned in the source header.

## Browser checks

| Viewport | Test |
| --- | --- |
| 1440 × 1000 | [Desktop capture](desktop.png) |
| 390 × 844 | [Narrow capture](narrow.png) |

Chromium verified no horizontal overflow, finalized trial readback, the new-trial form, EIP-6963 discovery, network switching and account changes using a controlled provider, and creation and disconnect of a browser demo wallet. The browser harness relayed actual RPC responses because its direct egress was unavailable. Physical mobile hardware and real extension signing were outside this run. The chain receipts were signed by independent in-memory SDK wallets.
