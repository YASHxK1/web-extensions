export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function retryable(error) { return error.status === 429 || error.status >= 500 || error.status === 0; }
export async function withRetry(task, { wait = sleep, onRetry = () => {}, stopped = () => false, attempts = 4 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (stopped()) throw new Error('Stopped.');
    try { return await task(); } catch (error) {
      if (!retryable(error) || attempt === attempts - 1) throw error;
      // Honor Retry-After without capping it; stop remains responsive during waits.
      const delay = Math.max(error.retryAfter || 0, 1500 * 2 ** attempt + Math.random() * 500);
      onRetry(error, attempt + 1, delay);
      await wait(delay);
    }
  }
}

export async function fetchAll(call, onProgress = () => {}) {
  const conversations = new Map();
  let identity;
  for (const archived of [false, true]) {
    let offset = 0;
    const seen = new Set();
    for (let page = 0; page < 10000; page++) {
      const result = await call('list', { archived, offset, identity });
      if (!result.identity || identity && identity !== result.identity) throw new Error('Account changed during load.');
      identity = result.identity;
      const data = result.data;
      if (!data || !Array.isArray(data.items)) throw new Error('Conversation API changed: expected items array.');
      if (data.total !== undefined && (!Number.isInteger(data.total) || data.total < 0)) throw new Error('Invalid conversation total.');
      // ChatGPT may report a lower bound (offset + limit + 1), not a
      // fixed snapshot total. Use this page's hint to decide whether to continue.
      const pageTotal = data.total;
      if (data.offset !== undefined && data.offset !== offset) throw new Error('Conversation API returned an unexpected page offset.');
      if (data.items.some(item => typeof item.id !== 'string' || !item.id)) throw new Error('Conversation API returned an invalid ID.');
      if (data.items.some(item => seen.has(item.id))) throw new Error('Pagination repeated a conversation. Reload when history is stable.');
      for (const item of data.items) {
        seen.add(item.id);
        conversations.set(item.id, { id: item.id, title: typeof item.title === 'string' ? item.title : 'Untitled chat', updated: item.update_time, archived, gizmoId: typeof item.gizmo_id === 'string' ? item.gizmo_id : null });
      }
      offset += data.items.length;
      onProgress(conversations.size, archived);
      if (pageTotal !== undefined && offset >= pageTotal) break;
      if (!data.items.length || pageTotal === undefined && data.items.length < 20) {
        if (pageTotal !== undefined && offset < pageTotal) throw new Error('Incomplete conversation list. Deletion is disabled; reload.');
        break;
      }
      if (page === 9999) throw new Error('Pagination safety limit reached.');
    }
  }
  return { identity, conversations: [...conversations.values()] };
}

export async function deleteQueue(ids, call, { stopped = () => false, onResult = () => {}, onRetry = () => {}, wait = sleep } = {}) {
  for (const id of ids) {
    if (stopped()) break;
    try {
      await withRetry(() => call(id), { stopped, wait, onRetry: (e, n, delay) => onRetry(id, e, n, delay) });
      onResult(id, null);
    } catch (error) {
      if (stopped()) break;
      onResult(id, error);
      // Authentication/schema failures stop the entire batch. Do not keep sending bad requests.
      if (!retryable(error)) break;
    }
    if (!stopped()) await wait(1200);
  }
}

export async function fetchProjects(call, identity) {
  const projects = new Map(), cursors = new Set();
  let cursor = null;
  for (let page = 0; page < 10000; page++) {
    const result = await call('projects', { identity, cursor });
    if (result.identity !== identity) throw Object.assign(new Error('Account changed while loading projects.'), { status: 409 });
    const data = result.data;
    if (!Array.isArray(data?.items) || data.cursor != null && typeof data.cursor !== 'string') throw new Error('Invalid project page.');
    for (const item of data.items) {
      if (typeof item.id !== 'string' || !item.id || typeof item.name !== 'string') throw new Error('Invalid project metadata.');
      projects.set(item.id, item.name.trim());
    }
    cursor = data.cursor || null;
    if (!cursor) return projects;
    if (cursors.has(cursor)) throw new Error('Project pagination repeated a cursor.');
    cursors.add(cursor);
  }
  throw new Error('Project pagination safety limit reached.');
}

export async function fetchClaudeAll(call, onProgress = () => {}) {
  const conversations = new Map();
  let identity;
  for (const archived of [false, true]) {
    const seen = new Set();
    let offset = 0;
    for (let page = 0; page < 10000; page++) {
      const result = await call('list', { archived, offset, identity });
      if (!result.identity || identity && result.identity !== identity) throw Object.assign(new Error('Claude account or workspace changed during loading.'), { status: 409 });
      identity = result.identity;
      const data = result.data;
      if (!Array.isArray(data?.items) || typeof data.hasMore !== 'boolean') throw new Error('Invalid Claude pagination response.');
      if (data.hasMore && !data.items.length) throw new Error('Claude returned an incomplete empty page. Reload chats.');
      for (const item of data.items) {
        if (typeof item?.id !== 'string' || !item.id) throw new Error('Invalid Claude conversation ID.');
        if (seen.has(item.id)) throw new Error('Claude pagination repeated a conversation. Reload when history is stable.');
        seen.add(item.id); conversations.set(item.id, item);
      }
      offset += data.items.length;
      onProgress(conversations.size, archived);
      if (!data.hasMore) break;
      if (page === 9999) throw new Error('Claude pagination safety limit reached.');
    }
  }
  return { identity, conversations: [...conversations.values()] };
}
