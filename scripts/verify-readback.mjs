import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chain, reader, read, wait, execution, succeeded } from '../src/chain.js';

const filename = 'evidence/studionet.json';
const source = JSON.parse(fs.readFileSync(filename, 'utf8'));
const address = source.address;
assert.equal(chain.id, 61999, 'Readback must target Stable Studionet 61999');
assert.match(address, /^0x[0-9a-fA-F]{40}$/);

const [trialTotal, ticketTotal] = (await read(address, 'totals')).map(BigInt);
console.log('Live Studionet counters:', { trialTotal: String(trialTotal), ticketTotal: String(ticketTotal) });
assert(trialTotal >= 3n, 'Expected the three recorded trials');
assert(ticketTotal >= 1n, 'Expected at least one finalized dispatch record');

const trials = {};
for (let id = 1n; id <= trialTotal; id++) {
  trials[String(id)] = await read(address, 'get_trial', [id]);
}
const tickets = {};
const ticketOwners = {};
for (let id = 1n; id <= ticketTotal; id++) {
  const raw = await read(address, 'get_ticket', [id]);
  tickets[String(id)] = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const ticketOwner = tickets[String(id)][0];
  ticketOwners[String(id)] = {
    owner: ticketOwner,
    activeRevision: String(await read(address, 'active_revision', [ticketOwner]))
  };
}
const ownerActive = String(await read(address, 'active_revision', [source.owner]));
const dispatchOwnerActive = String(await read(address, 'active_revision', [source.dispatchDemo.owner]));
console.log('Live trial readbacks:', JSON.stringify(trials));
console.log('Live ticket readbacks:', JSON.stringify(tickets));
console.log('Live active revisions:', { originalOwner: ownerActive, dispatchOwner: dispatchOwnerActive });

assert.equal(trials['1'].status, 'PROMOTED');
assert.equal(trials['2'].status, 'REJECTED');
assert.equal(trials['3'].status, 'PROMOTED');
assert.equal(ownerActive, '1');
assert.equal(dispatchOwnerActive, '3');
for (const [id, ticket] of Object.entries(tickets)) {
  assert(['INCIDENT', 'SUPPORT', 'REVIEW'].includes(ticket[3]), `Ticket ${id} has an invalid queue`);
  assert(BigInt(ticket[1]) <= BigInt(ticketOwners[id].activeRevision), `Ticket ${id} references a future revision`);
}

const transactionLabels = [
  'deploy', 'open_1', 'unauthorized_submission', 'submit_1', 'evaluate_1',
  'open_2', 'submit_2', 'evaluate_2', 'dispatch_trial_open',
  'dispatch_trial_submit', 'dispatch_trial_evaluate', 'stale_route_trial_3', 'route_active_trial_3'
];
const receipts = {};
for (const label of transactionLabels) {
  const record = source.transactions[label];
  assert(record?.hash, `Missing preserved transaction hash: ${label}`);
  const receipt = await wait(record.hash);
  receipts[label] = {
    hash: record.hash,
    status: receipt.statusName ?? receipt.status ?? 'UNKNOWN',
    execution: execution(receipt)
  };
  const expectedSuccess = label !== 'unauthorized_submission' && label !== 'stale_route_trial_3';
  assert.equal(succeeded(receipt), expectedSuccess, `Unexpected execution result: ${label}`);
}

const audit = {
  chainId: chain.id,
  contract: address,
  trials: { count: String(trialTotal), records: trials, activeRevisionByOwner: {
    [source.owner]: ownerActive,
    [source.dispatchDemo.owner]: dispatchOwnerActive
  }},
  tickets: { count: String(ticketTotal), records: tickets, ownerActiveRevisions: ticketOwners },
  receipts,
  evidenceLimitations: source.evidenceGaps
};
fs.writeFileSync('evidence/readback-audit.json', JSON.stringify(audit, null, 2) + '\n');
console.log('SWITCHYARD_READBACK_AUDIT_BEGIN');
console.log(JSON.stringify(audit, null, 2));
console.log('SWITCHYARD_READBACK_AUDIT_END');
