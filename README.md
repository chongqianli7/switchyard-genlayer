# Switchyard

Switchyard is a regression desk for public support-ticket routing agents. An operations owner freezes a small benchmark and invites a separate candidate wallet. The candidate signs a playbook. GenLayer validates the playbook by running the same classifier against every benchmark ticket independently on the leader and validators. Only a full match promotes the revision.

[Open the dispatch desk](https://chongqianli7.github.io/switchyard-genlayer/) · [Inspect the contract on Studionet](https://explorer-studio.genlayer.com/address/0x3a44e9E866dE0811aeAb81a6CA2BDDEBfa08efAF)

## Workflow

1. Open a trial with an incident and a routine support example. Use synthetic tickets and keep private data off-chain.
2. Switch to the invited wallet and submit the candidate playbook.
3. Return to the owner wallet and evaluate the trial. Inspect the expected and observed queue on each row.
4. Dispatch a new ticket using the current promoted revision. The contract binds the dispatch to that revision and stores the selected queue. A failed upgrade leaves the previous revision active.

The contract partitions active revisions by owner. Submissions and evaluations are single-use. A trial started on an older revision cannot overwrite a newer promotion. The allowed queues are incident, support, and manual review. Invalid model output goes to manual review, and model disagreement prevents updating state.

## Run locally

Use Node.js 24, then run `npm ci` and `npm run dev`. The app reads finalized state and sends transactions only to GenLayer Stable Studionet, chain 61999. Connect MetaMask or OKX Wallet, or create two session-only demo wallets and fund them using the Studio faucet.

`node scripts/verify.mjs` deploys a fresh contract and exercises the normal, regression, and unauthorized paths with in-memory test accounts. It writes receipts and readbacks under `evidence/`.

## Validation

- [Deployment bytes and source hash](evidence/source-match.json)
- [Finalized receipts and state readbacks](evidence/studionet.json) and [browser checks](evidence/README.md)
- [Earlier deployment and failed trial transaction](evidence/studionet-v1.json)
- [Official GenVM lint and validation](evidence/genvm-lint.txt)

Run `python -m unittest discover -s tests -v` to check duplicate data, replay handling, stale trials, malformed classifier responses, and simulated validator disagreement. The Python test doubles exercise state transitions locally.

## Scope

The benchmark establishes behavior on author-selected examples. Outcomes outside the benchmark depend on the validator models. This is a public testnet queue for synthetic examples. It does not send tickets to commercial helpdesk services.
