import { createAccount, createClient } from 'genlayer-js';
import { formatEther } from 'viem';
import { chain, explorer, reader, read, fund, wait, execution, succeeded } from './chain.js';
import deployment from './deployment.json';

const $ = id => document.getElementById(id);
const el = (tag, content) => Object.assign(document.createElement(tag), { textContent: content });
const button = (name, action) => Object.assign(el('button', name), { onclick: action });
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
let wallet, trial, trialId, active = 0n, busy = false;
const demo = [];
const providers = new Map();
const address = deployment.address;
const txLink = hash => Object.assign(el('a', 'View transaction'), { href: explorer + hash, target: '_blank', rel: 'noopener' });
function status(message, hash) {
  $('status').replaceChildren(el('span', message));
  if (hash) $('status').append(' · ', txLink(hash));
}
async function guarded(action) {
  try { await action(); } catch (error) { status(error.shortMessage || error.message); }
}
function panel(id) {
  document.querySelectorAll('.panel').forEach(node => { node.hidden = node.id !== id; });
  document.querySelectorAll('[data-panel]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.panel === id)));
}
document.querySelectorAll('[data-panel]').forEach(node => node.onclick = () => panel(node.dataset.panel));
panel('records');
function showTrial() {
  const target = $('trial');
  const actions = $('actions');
  target.replaceChildren();
  actions.replaceChildren();
  if (!trial) { target.append('No trial selected.'); return; }
  const fields = el('dl', '');
  const next = { OPEN: 'Candidate submits their playbook.', SUBMITTED: 'Desk owner starts independent consensus.',
    PROMOTED: 'Promoted revision. The desk can dispatch if this revision is still active.',
    REJECTED: 'At least one expected route failed. The active revision is unchanged.' };
  for (const [key, value] of Object.entries({ Owner: trial.owner, Candidate: trial.candidate,
    Status: trial.status, 'Base revision': String(trial.base_revision), 'Next step': next[trial.status] })) {
    fields.append(el('dt', key), el('dd', value));
  }
  target.append(el('h3', 'Trial #' + trialId), fields);
  if (trial.playbook) target.append(el('p', 'Playbook · ' + trial.playbook));
  const stageLinks = deployment.trials?.[String(trialId)] ?? [];
  if (stageLinks.length) {
    const links = el('div', '');
    links.className = 'receipts';
    for (const [label, hash] of stageLinks) {
      const link = txLink(hash);
      link.textContent = label;
      links.append(link);
    }
    target.append(links);
  }
  const trace = trial.trace ? JSON.parse(trial.trace) : [];
  JSON.parse(trial.cases).forEach(([ticket, expected], index) => {
    const row = el('div', '');
    row.className = 'case';
    row.append(el('p', ticket), el('small', 'Expected ' + expected + ' / Observed ' + (trace[index] ?? 'pending')));
    target.append(row);
  });
  if (trial.status === 'OPEN' && wallet && same(trial.candidate, wallet.address)) {
    const input = el('textarea', '');
    input.placeholder = 'Describe how the agent should route tickets.';
    input.setAttribute('aria-label', 'Candidate playbook');
    input.maxLength = 800;
    actions.append(input, button('Submit playbook', () => transact('Submit playbook', 'submit', [trialId, input.value])));
  }
  if (trial.status === 'SUBMITTED' && wallet && same(trial.owner, wallet.address)) {
    actions.append(button('Run consensus trial', () => transact('Evaluate and potentially promote revision', 'evaluate', [trialId])));
  }
}
async function refresh(selected) {
  if (!address) { status('No verified deployment is configured.'); showTrial(); return; }
  const [trials, tickets] = (await read(address, 'totals')).map(BigInt);
  trialId = selected === 0n ? trials : selected ?? (trialId || trials);
  trial = trialId ? await read(address, 'get_trial', [trialId]) : null;
  active = wallet ? BigInt(await read(address, 'active_revision', [wallet.address])) : 0n;
  $('revision').textContent = active ? 'Dispatch with active revision #' + active : 'Connect a desk with a promoted revision to dispatch.';
  showTrial();
  const ticketIds = Array.from({length: Number(tickets > 10n ? 10n : tickets)}, (_, index) => tickets - BigInt(index));
  const rows = await Promise.all(ticketIds.map(async id => {
    const [owner, revision, ticket, queue] = JSON.parse(await read(address, 'get_ticket', [id]));
    return { id, owner, revision, ticket, queue };
  }));
  $('tickets').replaceChildren(...['INCIDENT', 'SUPPORT', 'REVIEW'].map(queue => {
    const lane = el('section', '');
    lane.className = 'lane';
    lane.append(el('h4', queue));
    const list = rows.filter(row => row.queue === queue);
    if (!list.length) lane.append(el('p', 'No recent tickets'));
    for (const row of list) {
      const item = el('article', '');
      item.append(el('p', '#' + row.id + ' · ' + row.ticket), el('small', 'Revision ' + row.revision + ' · ' + row.owner));
      const hash = deployment.tickets?.[String(row.id)];
      if (hash) item.append(el('br'), txLink(hash));
      lane.append(item);
    }
    return lane;
  }));
}
async function identify() {
  const current = wallet;
  if (!current) $('identity').textContent = 'Read-only visitor';
  else {
    const network = current.provider ? Number(await current.provider.request({method:'eth_chainId'})) : chain.id;
    const balance = await reader.getBalance({address:current.address});
    if (current === wallet) $('identity').textContent = current.mode + ' · ' + current.address + ' · Chain ' + network +
      ' · ' + formatEther(balance) + ' test GEN' + (network !== chain.id ? ' · Switch network before writing' : '');
  }
  await refresh();
}
async function select(next) {
  if (wallet?.provider) {
    wallet.provider.removeListener?.('accountsChanged', accountChange);
    wallet.provider.removeListener?.('chainChanged', networkChange);
  }
  wallet = next;
  if (wallet?.provider) {
    wallet.provider.on?.('accountsChanged', accountChange);
    wallet.provider.on?.('chainChanged', networkChange);
  }
  $('wallet').close();
  await identify();
}
function accountChange(accounts) {
  if (wallet?.provider) guarded(() => select(accounts[0] ? {...wallet,address:accounts[0]} : null));
}
function networkChange() { guarded(identify); }
function drawWallets() {
  $('providers').replaceChildren(...[...providers.values()].map(({info, provider}) => button(info.name, () => guarded(async () => {
    const [account] = await provider.request({method:'eth_requestAccounts'});
    if (!account) throw new Error('Wallet did not return an account.');
    await select({mode:info.name, address:account, provider});
  }))));
  if (!providers.size) $('providers').append(el('p','Install MetaMask or OKX Wallet to connect an extension.'));
  $('demo').replaceChildren(button('Create demo wallet', () => guarded(async () => {
    const signer = createAccount();
    const entry = {mode:'Demo wallet ' + (demo.length + 1), address:signer.address, signer};
    demo.push(entry);
    await select(entry);
  })), ...demo.map(entry => button(entry.mode, () => guarded(() => select(entry)))),
  button('Fund selected demo wallet', () => guarded(async () => {
    if (!wallet?.signer) throw new Error('Select a demo wallet first.');
    await fund(wallet.address);
    await identify();
  })), button('Reset demo wallets', () => guarded(async () => {
    demo.length = 0;
    if (wallet?.signer) await select(null);
    drawWallets();
  })));
}
window.addEventListener('eip6963:announceProvider', ({detail}) => {
  providers.set(detail.info.rdns, detail);
  if ($('wallet').open) drawWallets();
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
for (const [rdns, name, provider] of [['com.okxwallet','OKX Wallet',window.okxwallet],
  ['io.metamask','MetaMask',window.ethereum?.isMetaMask ? window.ethereum : null],
  ['injected','Browser wallet',window.ethereum?.isMetaMask ? null : window.ethereum]]) {
  if (provider && ![...providers.values()].some(entry => entry.provider === provider)) providers.set(rdns,{info:{name},provider});
}
$('wallet-open').onclick = () => { drawWallets(); $('wallet').showModal(); };
$('disconnect').onclick = () => guarded(() => select(null));
$('switch').onclick = () => guarded(async () => {
  const provider = wallet?.provider;
  if (!provider) throw new Error('Connect an extension wallet first.');
  const chainId = '0xf22f';
  try { await provider.request({method:'wallet_switchEthereumChain', params:[{chainId}]}); }
  catch (error) {
    if (error.code !== 4902) throw error;
    await provider.request({method:'wallet_addEthereumChain', params:[{chainId, chainName:'GenLayer Stable Studionet',
      nativeCurrency:{name:'GEN',symbol:'GEN',decimals:18}, rpcUrls:chain.rpcUrls.default.http}]});
  }
  await identify();
});
async function transact(purpose, functionName, args) {
  if (busy) return;
  if (!wallet) { status('Connect a wallet to sign this operation.'); return; }
  if (!address) { status('No verified deployment is configured.'); return; }
  busy = true;
  const current = wallet;
  let hash;
  try {
    if (!window.confirm(purpose + '\nStable Studionet (61999)\n' + current.address)) {
      status('Signing canceled.');
      return;
    }
    if (current.provider) {
      const [accounts, network] = await Promise.all([current.provider.request({method:'eth_accounts'}),
        current.provider.request({method:'eth_chainId'})]);
      if (wallet !== current || !same(accounts[0], current.address) || Number(network) !== chain.id) throw new Error('Account or network changed. Select the correct account on Studionet.');
    }
    status('Waiting for signature · ' + purpose);
    const signer = createClient({chain, account:current.signer ?? current.address, provider:current.provider});
    hash = await signer.writeContract({address, functionName, args, value:0n, fees:await reader.estimateTransactionFees()});
    status('Submitted · Waiting for finality', hash);
    let receipt;
    try { receipt = await wait(hash); }
    catch (error) { status('Submitted · Finality could not be confirmed. Check Explorer before retrying.', hash); return; }
    if (!succeeded(receipt)) { status('Finalized · Execution rejected (' + execution(receipt) + ')', hash); return; }
    try {
      await refresh(functionName === 'open_trial' ? BigInt((await read(address,'totals'))[0]) : undefined);
      if (functionName !== 'route') panel('records');
      status('Finalized · Execution succeeded · State refreshed', hash);
    } catch {
      status('Execution succeeded · Refresh chain to read final state', hash);
    }
  } catch (error) { status(error.code === 4001 ? 'Signing canceled.' : error.shortMessage || error.message, hash); }
  finally { busy = false; }
}
$('open-form').onsubmit = event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  transact('Lock regression cases', 'open_trial', [data.get('candidate'),
    JSON.stringify([[data.get('incident'),'INCIDENT'],[data.get('support'),'SUPPORT']])]);
};
$('route-form').onsubmit = event => {
  event.preventDefault();
  if (!active) { status('A promoted revision is required.'); return; }
  transact('Route this public test ticket', 'route', [active, new FormData(event.currentTarget).get('ticket')]);
};
$('refresh').onclick = () => guarded(() => refresh());
$('inspect').onclick = () => guarded(() => refresh($('lookup').value ? BigInt($('lookup').value) : 0n));
guarded(() => refresh());
