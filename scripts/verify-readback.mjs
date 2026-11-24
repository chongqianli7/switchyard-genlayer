import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chain, reader, read, wait, execution, succeeded } from '../src/chain.js';

const filename = 'evidence/studionet.json';
const source = JSON.parse(fs.readFileSync(filename, 'utf8'));
const address = source.address;
assert.equal(chain.id, 61999, 'Readback must target Stable Studionet 61999');
assert.match(address, /^0x[0-9a-fA-F]{40}$/);

const [trialTotal, ticketTotal] = (await read(address, 'totals')).map(BigInt);
assert(trialTotal >= 3n, 'Expected the three recorded trials');
assert(ticketTotal >= 2n, 'Expected both dispatch records');

const trials = {};
for (let id = 1n; id <= trialTotal; id++) {
  trials[String(id)] = await read(address, 'get_trial', [id]);
}
const tickets = {};
for (let id = 1n; id <= ticketTotal; id++) {
  const raw = await read(address, 'get_ticket', [id]);
  tickets[String(id)] = typeof raw === 'string' ? JSON.parse(raw) : raw;
}
const owner = trials['1'].owner;
const activeRevision = BigInt(await read(address, 'active_revision', [owner]));

assert.equal(trials['1'].status, 'PROMOTED');
assert.equal(trials['2'].status, 'REJECTED');
assert.equal(trials['3'].status, 'PROMOTED');
assert.equal(activeRevision, 3n);
assert.equal(Number(tickets['1'][1]), 1);
assert.equal(Number(tickets['2'][1]), 3);
assert.equal(String(tickets['1'][0]).toLowerCase(), String(owner).toLowerCase());
assert.equal(String(tickets['2'][0]).toLowerCase(), String(source.dispatchDemo.owner).toLowerCase());
assert.equal(tickets['1'][3], 'INCIDENT');
assert.equal(tickets['2'][3], 'INCIDENT');

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
  const expectedSuccess = label !== 'unauthorized_submission' && label !== 'stale_route';
  assert.equal(succeeded(receipt), expectedSuccess, `Unexpected execution result: ${label}`);
}

const audit = {
  chainId: chain.id,
  contract: address,
  trials: {
    count: String(trialTotal),
    records: trials,
    activeRevision: String(activeRevision)
  },
  tickets: {
    count: String(ticketTotal),
    records: tickets
  },
  receipts,
  evidenceNote: {
    ticket1DispatchReceipt: null,
    explanation: 'The original ticket-1 dispatch hash was overwritten when the later dispatch script reused the route_active evidence key. Ticket 1 remains independently verifiable through the finalized get_ticket(1) state readback; no missing transaction hash is inferred.'
  }
};
fs.writeFileSync('evidence/readback-audit.json', JSON.stringify(audit, null, 2) + '\n');
console.log('SWITCHYARD_READBACK_AUDIT_BEGIN');
console.log(JSON.stringify(audit, null, 2));
console.log('SWITCHYARD_READBACK_AUDIT_END');
