// Serialized into a claude.ai tab's isolated world. Keep all dependencies inside.
export async function claudeTabRequest(operation, input = {}) {
  if (location.origin !== 'https://claude.ai') return { error: 'The bound tab changed sites. Load chats again.', status: 409 };
  const activeOrg = () => {
    const cookie = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('lastActiveOrg='));
    try { return cookie ? decodeURIComponent(cookie.slice('lastActiveOrg='.length)) : null; } catch { return null; }
  };
  const read = async (path, options = {}) => {
    const response = await fetch(path, { ...options, credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      const raw = response.headers.get('retry-after');
      const seconds = raw && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
      const retryAfter = Number.isFinite(seconds) ? seconds * 1000 : raw ? Math.max(0, Date.parse(raw) - Date.now()) : 0;
      throw Object.assign(new Error(`HTTP ${response.status}${response.status === 401 ? ': sign in to Claude again.' : response.status === 403 ? ': open Claude and resolve access or browser verification.' : ''}`), { status: response.status, retryAfter: Number.isFinite(retryAfter) ? retryAfter : 0 });
    }
    const text = await response.text();
    // Claude's loaded FE response parser explicitly accepts an empty DELETE body.
    if (options.method === 'DELETE' && !text.trim()) return null;
    try { return JSON.parse(text); } catch { throw new Error('Unexpected Claude response. Open Claude and reload chats.'); }
  };
  try {
    const org = activeOrg();
    if (!org || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(org)) throw Object.assign(new Error('Open Claude, sign in, and select a workspace before loading.'), { status: 401 });
    const bootstrap = await read(`/api/bootstrap/${encodeURIComponent(org)}/app_start?statsig_hashing_algorithm=djb2&growthbook_format=sdk&include_system_prompts=false`);
    if (!bootstrap?.account?.uuid || !Array.isArray(bootstrap.account.memberships) || !bootstrap.account.memberships.some(member => member.organization?.uuid === org)) throw Object.assign(new Error('Claude session or workspace is unavailable. Sign in and reload.'), { status: 401 });
    const identity = `${bootstrap.account.uuid}:${org}`;
    const checkOrg = () => { if (activeOrg() !== org) throw Object.assign(new Error('Claude workspace changed. Load chats again.'), { status: 409 }); };
    checkOrg();
    if (input.identity && identity !== input.identity) throw Object.assign(new Error('Claude account or workspace changed. Load chats again.'), { status: 409 });
    if (operation === 'identity') return { identity };
    if (operation === 'list') {
      if (!Number.isInteger(input.offset) || input.offset < 0) throw new Error('Invalid Claude page offset.');
      const params = new URLSearchParams({ limit: '20', offset: String(input.offset), archived: String(Boolean(input.archived)), consistency: 'strong' });
      const data = await read(`/api/organizations/${encodeURIComponent(org)}/chat_conversations_v2?${params}`);
      checkOrg();
      if (!Array.isArray(data?.data) || typeof data.has_more !== 'boolean' || data.search_incomplete != null && typeof data.search_incomplete !== 'boolean') throw new Error('Claude history API changed: invalid page.');
      if (data.search_incomplete === true) throw new Error('Claude returned an incomplete history page. Reload before selecting chats.');
      const items = data.data.map(item => {
        if (typeof item?.uuid !== 'string' || !item.uuid) throw new Error('Claude history returned an invalid conversation ID.');
        return { id: item.uuid, title: typeof item.name === 'string' && item.name ? item.name : 'Untitled chat', updated: typeof item.updated_at === 'string' ? item.updated_at : item.created_at, archived: typeof item.is_archived === 'boolean' ? item.is_archived : Boolean(input.archived), gizmoId: null };
      });
      return { identity, data: { items, hasMore: data.has_more } };
    }
    if (operation === 'delete' && typeof input.id === 'string' && input.id) {
      checkOrg();
      const data = await read(`/api/organizations/${encodeURIComponent(org)}/chat_conversations/${encodeURIComponent(input.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid: input.id }) });
      checkOrg();
      // Match the frontend's HTTP + parsed JSON/empty-body acknowledgement, but
      // reject explicit error payloads rather than counting an ambiguous deletion.
      if (data !== null && (typeof data !== 'object' || Array.isArray(data) || data.error || data.type === 'error' || data.success === false)) throw new Error('Claude deletion was not acknowledged. Reload to verify before retrying.');
      return { identity, data: { success: true } };
    }
    throw new Error('Unsupported Claude operation.');
  } catch (error) { return { error: error.message, status: error.status ?? (error instanceof TypeError || error.name === 'TimeoutError' || error.name === 'AbortError' ? 0 : 422), retryAfter: error.retryAfter || 0 }; }
}
