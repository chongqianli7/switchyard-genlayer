import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createAccount, createClient } from 'genlayer-js';
import { chain, reader, read, fund, wait, execution, succeeded } from '../src/chain.js';

const source = readFileSync(new URL('../contracts/switchyard.py', import.meta.url), 'utf8');
mkdirSync('evidence', { recursive: true });
const owner = createAccount();
const candidate = createAccount();
const author = createClient({ chain, account: owner });
const builder = createClient({ chain, account: candidate });
const evidence = { chainId: chain.id, sourceSha256: createHash('sha256').update(source).digest('hex'),
  owner: owner.address, candidate: candidate.address, transactions: {}, readback: {} };
const save = () => writeFileSync('evidence/studionet.json', JSON.stringify(evidence,
  (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
async function record(label, promise, expected = true) {
  const hash = await promise;
  evidence.transactions[label] = { hash };
  save();
  console.log(label, hash);
  const receipt = await wait(hash);
  evidence.transactions[label] = { hash, status: receipt.statusName ?? receipt.status, execution: execution(receipt) };
  save();
  console.log(evidence.transactions[label]);
  assert.equal(succeeded(receipt), expected);
  return receipt;
}
try {
  evidence.schema = await reader.getContractSchemaForCode(source);
  save();
  for (const account of [owner, candidate]) {
    await fund(account.address);
    await new Promise(resolve => setTimeout(resolve, 3200));
    const balance = await reader.getBalance({ address: account.address });
    console.log('Funded', account.address, balance);
    assert(balance > 0n);
  }
  const fees = await reader.estimateTransactionFees();
  console.log("Fee deposit", fees.feeValue);
  const receipt = await record('deploy', author.deployContract({ code: source, args: [], fees }));
  const address = receipt.contractAddress ?? receipt.data?.contract_address ?? receipt.to_address;
  assert.match(address, /^0x[0-9a-fA-F]{40}$/);
  evidence.address = address;
  save();
  const write = (client, functionName, args = []) => client.writeContract({ address, functionName, args, value: 0n, fees });
  const cases = JSON.stringify([
    ['All customers receive server errors and cannot sign in.', 'INCIDENT'],
    ['Where can I download last month’s invoice?', 'SUPPORT']
  ]);
  for (const [id, playbook] of [
    [1n, 'Route a widespread outage or an all-customer login failure to INCIDENT. Route invoice downloads and routine billing requests to SUPPORT.'],
    [2n, 'Route every ticket to SUPPORT, including widespread outages, unavailable login, and invoice downloads. Never use INCIDENT.']
  ]) {
    await record('open_' + id, write(author, 'open_trial', [candidate.address, cases]));
    if (id === 1n) await record('unauthorized_submission', write(author, 'submit', [id, playbook]), false);
    await record('submit_' + id, write(builder, 'submit', [id, playbook]));
    await record('evaluate_' + id, write(author, 'evaluate', [id]));
    const trial = await read(address, 'get_trial', [id]);
    evidence.readback['trial_' + id] = trial;
    evidence.readback.active = await read(address, 'active_revision', [owner.address]);
    save();
    assert.equal(trial.status, id === 1n ? 'PROMOTED' : 'REJECTED');
    assert.equal(BigInt(evidence.readback.active), 1n);
  }
  await record('stale_route', write(author, 'route', [2n, 'All customers cannot sign in due to server errors.']), false);
  await record('route_active', write(author, 'route', [1n, 'All customers cannot sign in due to server errors.']));
  evidence.readback.ticket = JSON.parse(await read(address, 'get_ticket', [1n]));
  assert.equal(evidence.readback.ticket[3], 'INCIDENT');
  save();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
