import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createAccount, createClient } from 'genlayer-js';
import { chain, reader, read, fund, wait, execution, succeeded } from '../src/chain.js';

const filename = 'evidence/studionet.json';
const evidence = JSON.parse(readFileSync(filename, 'utf8'));
const address = evidence.address;
const save = () => writeFileSync(filename, JSON.stringify(evidence,
  (_, value) => typeof value === 'bigint' ? String(value) : value, 2) + '\n');

if (evidence.readback.ticket) throw new Error('Dispatch evidence is already present');
const previous = await wait(evidence.transactions.evaluate_2.hash);
evidence.transactions.evaluate_2.execution = execution(previous);
assert(succeeded(previous));
const trial = await read(address, 'get_trial', [2n]);
assert.equal(trial.status, 'REJECTED');
evidence.readback.trial_2 = trial;
assert.equal(BigInt(await read(address, 'active_revision', [evidence.owner])), 1n);
save();

const owner = createAccount();
const candidate = createAccount();
evidence.dispatchDemo = {owner:owner.address,candidate:candidate.address};
save();
const clients = [owner, candidate].map(account => createClient({chain,account}));
await Promise.all([owner, candidate].map(account => fund(account.address)));
const fees = await reader.estimateTransactionFees();
for (const account of [owner, candidate]) {
  for (let i = 0; i < 15; i++) {
    if (await reader.getBalance({address:account.address}) > fees.feeValue) break;
    if (i === 14) throw new Error('Faucet funding did not settle');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}
const ids = (await read(address, 'totals')).map(BigInt);
const trialId = ids[0] + 1n;
const tasks = [];
async function submit(label, client, functionName, args, expected = true) {
  const hash = await client.writeContract({address,functionName,args,value:0n,fees});
  evidence.transactions[label] = {hash};
  save();
  console.log(label,hash);
  tasks.push(wait(hash).then(receipt => {
    evidence.transactions[label] = {hash,status:receipt.statusName ?? receipt.status,execution:execution(receipt)};
    save();
    console.log(label,evidence.transactions[label]);
    return succeeded(receipt) === expected;
  }));
  const decided = await reader.waitForTransactionReceipt({hash,waitUntil:'decided',interval:1800,retries:100,fullTransaction:true});
  assert.equal(succeeded(decided),expected);
}
try {
  const cases = JSON.stringify([
    ['All customers receive server errors and cannot sign in.', 'INCIDENT'],
    ['Where can I download last month’s invoice?', 'SUPPORT'],
  ]);
  await submit('dispatch_trial_open',clients[0],'open_trial',[candidate.address,cases]);
  await submit('dispatch_trial_submit',clients[1],'submit',[trialId,evidence.readback.trial_1.playbook]);
  await submit('dispatch_trial_evaluate',clients[0],'evaluate',[trialId]);
  await submit('stale_route',clients[0],'route',[2n,'All customers cannot sign in due to server errors.'],false);
  await submit('route_active',clients[0],'route',[trialId,'All customers cannot sign in due to server errors.']);
} finally {
  const outcomes = await Promise.all(tasks);
  assert(outcomes.every(Boolean));
}
evidence.readback.dispatchRevision = await read(address,'active_revision',[owner.address]);
evidence.readback.ticket = JSON.parse(await read(address,'get_ticket',[ids[1]+1n]));
assert.equal(BigInt(evidence.readback.dispatchRevision),trialId);
assert.equal(evidence.readback.ticket[3],'INCIDENT');
save();
