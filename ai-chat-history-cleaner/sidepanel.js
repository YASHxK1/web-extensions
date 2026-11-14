import { groupChats } from './grouping.js';
import { request } from './api.js';
import { fetchProjects, withRetry, deleteQueue, sleep } from './core.js';
import { providers, providerForUrl, contextMatches } from './providers.js';
const $ = id => document.getElementById(id);
const planKey = `deletionPlan:${crypto.randomUUID()}`;
let chats = [], selected = new Set(), provider = null, binding = null, busy = false, complete = false, stopped = false, plan = null, logs = [], generation = 0;
let projects = new Map();
const collapsed = new Set();
function groups() {
  if (provider !== 'claude') return groupChats(chats, projects, $('search').value, selected);
  const [group] = groupChats(chats, new Map(), '', selected);
  if (!group) return [];
  const query = $('search').value.trim().toLocaleLowerCase();
  group.chats = group.chats.filter(chat => chat.title.toLocaleLowerCase().includes(query));
  return group.chats.length ? [{ ...group, id: 'claude', name: 'Claude chats' }] : [];
}
const status = message => { $('status').textContent = message; };
function log(message) {
  logs.push(`${new Date().toISOString()} [${providers[provider]?.name || 'Extension'}] ${message}`);
  $('errorCount').textContent = logs.length; $('log').textContent = logs.join('\n');
}
function visible() { return groups().flatMap(group => group.chats); }
function brand() {
  const name = providers[provider]?.name;
  $('provider').textContent = name ? `${name.toUpperCase()} · HISTORY TOOLS` : 'CHATGPT + CLAUDE · HISTORY TOOLS';
  $('searchLabel').textContent = provider === 'claude' ? 'Find a conversation' : 'Find a conversation or project';
  $('search').placeholder = provider === 'claude' ? 'Search chat titles…' : 'Search chats or projects…';
  $('selectionHint').textContent = `Selection tools affect all search matches${provider === 'claude' ? '' : ', including collapsed sections'}. Select All marks them Delete.`;
}
const changed = () => Object.assign(new Error('The active tab, site, account, or workspace changed. Load chats again.'), { status: 409 });
async function assertContext(context) {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!contextMatches(context, active)) throw changed();
}
async function call(context, operation, input) {
  await assertContext(context);
  return request(context.tabId, operation, input, context.provider);
}
async function invalidate(message) {
  if (!binding) return;
  generation++; stopped = true; complete = false; binding = null; selected.clear(); chats = []; projects = new Map(); collapsed.clear();
  if ($('confirm').open) { $('confirm').close(); busy = false; }
  plan = null; $('list').replaceChildren(); render(); status(message);
  try { await chrome.storage.session.remove(planKey); } catch (error) { log(error.message); }
}
async function checkActive() {
  const context = binding;
  if (!context) return;
  try { await assertContext(context); } catch { if (binding === context) await invalidate('Tab changed. Load chats again to start a fresh review.'); }
}
chrome.tabs.onActivated.addListener(checkActive);
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (binding && binding.tabId === id && info.url && !contextMatches(binding, tab)) invalidate('The bound tab changed sites. Load chats again.');
});
chrome.tabs.onRemoved.addListener(id => { if (binding?.tabId === id) invalidate('The bound tab was closed. Open a supported site and load again.'); });
function controls() {
  for (const id of ['load', 'search', 'select', 'invert', 'keep']) $(id).disabled = busy || (id !== 'load' && !complete);
  $('proceed').disabled = busy || !complete || !selected.size;
  $('marked').textContent = `${selected.size} marked for deletion`;
  $('counts').textContent = `${chats.length} chats · ${chats.length - selected.size} keep · ${selected.size} delete · ${visible().length} shown`;
}
function render() {
  for (const section of $('list').querySelectorAll('.chat-group')) {
    section.open ? collapsed.delete(section.dataset.groupId) : collapsed.add(section.dataset.groupId);
  }
  const fragment = document.createDocumentFragment();
  for (const group of groups()) {
    const grouped = providers[provider]?.grouped !== false;
    const section = document.createElement(grouped ? 'details' : 'section'); section.className = grouped ? 'chat-group' : 'flat-list'; section.dataset.groupId = group.id;
    if (grouped) section.open = !collapsed.has(group.id);
    const summary = document.createElement(grouped ? 'summary' : 'h2');
    if (!grouped) summary.className = 'flat-heading';
    const heading = document.createElement('span'); heading.className = 'group-name'; heading.textContent = group.name;
    const count = document.createElement('span'); count.className = 'group-count'; count.textContent = `${group.total} chats · ${group.deleteCount} delete`;
    summary.append(heading, count); section.append(summary);
    if (group.id === 'general') {
      const actions = document.createElement('div'); actions.className = 'group-actions';
      const selectGeneral = document.createElement('button'); selectGeneral.id = 'select-general';
      selectGeneral.textContent = 'Select All to Delete'; selectGeneral.disabled = busy || !complete;
      selectGeneral.setAttribute('aria-label', 'Select all general chats for deletion');
      selectGeneral.addEventListener('click', () => {
        if (busy || !complete) return;
        const general = groupChats(chats, projects).find(item => item.id === 'general')?.chats || [];
        general.forEach(chat => selected.add(chat.id));
        status(`Marked all ${general.length} general chats for deletion. Review your selections, then Save & Proceed.`);
        render();
      });
      const hint = document.createElement('p'); hint.className = 'hint';
      hint.textContent = 'Marks every general chat, including those hidden by search. Project selections stay unchanged.';
      actions.append(selectGeneral, hint); section.append(actions);
    }
    if (grouped) section.addEventListener('toggle', () => { if (!section.isConnected) return; section.open ? collapsed.delete(group.id) : collapsed.add(group.id); });
    for (const chat of group.chats) {
      const row = document.createElement('div'); row.className = `row${selected.has(chat.id) ? ' marked' : ''}`;
      const info = document.createElement('div'); info.className = 'chat';
      const title = document.createElement('div'); title.className = 'title'; title.textContent = chat.title;
      const meta = document.createElement('div'); meta.className = 'meta';
      const date = new Date(chat.updated);
      meta.textContent = `${chat.archived ? 'Archived' : 'History'}${Number.isNaN(date.getTime()) ? '' : ` · ${date.toLocaleDateString()}`}`;
      info.append(title, meta);
      const label = document.createElement('label'); label.className = 'toggle';
      const box = document.createElement('input'); box.type = 'checkbox'; box.checked = selected.has(chat.id); box.disabled = busy || !complete;
      box.setAttribute('aria-label', `Mark ${chat.title} for deletion`);
      const state = document.createElement('span'); state.textContent = box.checked ? 'Delete' : 'Keep';
      box.addEventListener('change', () => {
        box.checked ? selected.add(chat.id) : selected.delete(chat.id);
        state.textContent = box.checked ? 'Delete' : 'Keep'; row.classList.toggle('marked', box.checked);
        const markedCount = group.deleteCount + (box.checked ? 1 : -1); group.deleteCount = markedCount;
        count.textContent = `${group.total} chats · ${markedCount} delete`; controls();
      });
      label.append(box, state); row.append(info, label); section.append(row);
    }
    fragment.append(section);
  }
  if (!fragment.childNodes.length) {
    const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = complete ? 'No matching conversations.' : 'Load your chats to start reviewing.'; fragment.append(empty);
  }
  $('list').replaceChildren(fragment); controls();
}
// Backoff remains interruptible. Submitted requests have a 30-second timeout.
async function wait(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until && !stopped) await sleep(Math.min(250, until - Date.now()));
}
$('load').addEventListener('click', async () => {
  const run = ++generation;
  busy = true; stopped = false; complete = false; selected.clear(); chats = []; projects = new Map(); collapsed.clear(); binding = null; plan = null;
  $('list').replaceChildren(); provider = null; brand(); $('search').value = ''; logs = []; $('log').textContent = ''; $('errorCount').textContent = '0'; $('activity').hidden = true; render();
  try {
    await chrome.storage.session.remove(planKey);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const site = providerForUrl(tab?.url);
    if (!site) throw new Error('Make a signed-in chatgpt.com or claude.ai tab active, then load again.');
    provider = site.id; brand();
    const context = { provider, origin: site.origin, tabId: tab.id };
    binding = context;
    const result = await site.load(async (operation, input) => {
      if (run !== generation) throw changed();
      const response = await withRetry(() => call(context, operation, input), {
        wait, stopped: () => stopped,
        onRetry: (e, n, delay) => log(`List: ${e.message}; retry ${n} in ${Math.ceil(delay / 1000)}s`)
      });
      await wait(400);
      return response;
    }, (count, archived) => status(`Loading ${site.name} ${archived ? 'archived chats' : 'history'}… ${count} found.`));
    if (run !== generation) throw changed();
    context.identity = result.identity; chats = result.conversations;
    let projectWarning = false;
    if (site.grouped) {
      status(`Loaded ${chats.length} chats. Loading project names…`);
      try {
        projects = await fetchProjects((operation, input) => withRetry(() => call(context, operation, input), {
          wait, stopped: () => stopped, onRetry: (e, n, delay) => log(`Projects: ${e.message}; retry ${n} in ${Math.ceil(delay / 1000)}s`)
        }), context.identity);
      } catch (error) {
        if (error.status === 409 || run !== generation) throw error;
        projectWarning = true; log(`Warning: project names unavailable: ${error.message}. Project chats use fallback labels.`);
      }
    }
    await assertContext(context);
    if (run !== generation) throw changed();
    complete = true;
    $('connection').textContent = `${site.name} · connected to the loaded account/workspace`;
    status(`Loaded ${chats.length} chats, including archives. All are set to Keep.${projectWarning ? ' Project names unavailable; fallback labels are shown.' : ''}`);
  } catch (error) {
    complete = false; chats = []; selected.clear(); status(error.message); log(`Load failed: ${error.message}`);
    $('connection').textContent = 'Load a signed-in ChatGPT or Claude tab to connect.';
  } finally { busy = false; render(); }
});
$('search').addEventListener('input', render);
$('select').addEventListener('click', () => { visible().forEach(chat => selected.add(chat.id)); render(); });
$('invert').addEventListener('click', () => { visible().forEach(chat => selected.has(chat.id) ? selected.delete(chat.id) : selected.add(chat.id)); render(); });
$('keep').addEventListener('click', () => { visible().forEach(chat => selected.delete(chat.id)); render(); });
$('proceed').addEventListener('click', async () => {
  if (busy || !complete || !selected.size || !binding) return;
  const run = generation, context = { ...binding };
  busy = true; render();
  try {
    await call(context, 'identity', { identity: context.identity });
    if (run !== generation) throw changed();
    plan = { ...context, ids: [...selected], createdAt: Date.now() };
    await chrome.storage.session.set({ [planKey]: plan });
    if (run !== generation) throw changed();
    $('deleteCount').textContent = plan.ids.length;
    $('confirmContext').textContent = `${providers[plan.provider].name} · loaded account/workspace`;
    $('confirm').showModal();
  } catch (error) {
    plan = null; await chrome.storage.session.remove(planKey); busy = false;
    if (error.status === 409 || error.status === 401 || error.status === 403) await invalidate(error.message);
    status(error.message); log(`Confirmation blocked: ${error.message}`); render();
  }
});
async function cancel() {
  plan = null; busy = false; $('confirm').close(); render();
  try { await chrome.storage.session.remove(planKey); } catch (error) { log(error.message); }
}
$('cancel').addEventListener('click', cancel);
$('confirm').addEventListener('cancel', event => { event.preventDefault(); cancel(); });
$('confirmDelete').addEventListener('click', async () => {
  if (!busy || !plan?.ids.length) return;
  const snapshot = plan; plan = null;
  $('confirm').close(); stopped = false;
  let done = 0, failed = 0, reloadRequired = null;
  $('activity').hidden = false; $('progress').max = snapshot.ids.length; $('progress').value = 0; $('stop').disabled = false;
  const progress = () => { $('progressText').textContent = `${done + failed} / ${snapshot.ids.length} processed · ${done} deleted · ${failed} failed`; };
  progress(); status(`Deleting marked ${providers[snapshot.provider].name} conversations. Keep this panel open.`);
  try {
    await call(snapshot, 'identity', { identity: snapshot.identity });
    await deleteQueue(snapshot.ids, id => call(snapshot, 'delete', { id, identity: snapshot.identity }), {
      stopped: () => stopped, wait,
      onRetry: (id, error, n, delay) => { log(`${id}: ${error.message}; retry ${n} in ${Math.ceil(delay / 1000)}s`); status(`Rate limit or temporary error. Retrying in ${Math.ceil(delay / 1000)}s…`); },
      onResult: (id, error) => {
        if (error) { failed++; log(`${id}: ${error.message}`); if (error.status === 409) reloadRequired = error.message; }
        else { done++; selected.delete(id); chats = chats.filter(chat => chat.id !== id); }
        $('progress').value = done + failed; progress(); render();
      }
    });
    const remaining = snapshot.ids.length - done - failed;
    status(`${stopped || remaining ? 'Stopped' : 'Finished'}: ${done} deleted, ${failed} failed, ${remaining} unprocessed. Remaining selections require a new confirmation.`);
    if (reloadRequired) await invalidate(reloadRequired);
  } catch (error) { status(`Stopped: ${error.message}`); log(error.message); if (error.status === 409) await invalidate(error.message); }
  finally {
    busy = false; $('stop').disabled = true;
    try { await chrome.storage.session.remove(planKey); } catch (error) { log(error.message); }
    render();
  }
});
$('stop').addEventListener('click', () => { stopped = true; $('stop').disabled = true; status('Stopping after the current request…'); });
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([logs.join('\n')], { type: 'text/plain' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'chat-history-cleaner.log'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
brand(); controls();
