// This function is serialized by executeScript. Keep every dependency inside it.
// Runs in the tab's ISOLATED world: credentials never enter the panel or storage.
export async function tabRequest(operation, input = {}) {
  if (location.origin !== 'https://chatgpt.com') return { error: 'The bound tab changed sites. Load chats again.', status: 409 };
  const read = async (url, options = {}) => {
    const response = await fetch(url, { ...options, credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      const raw = response.headers.get('retry-after');
      const seconds = raw && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
      const retryAfter = Number.isFinite(seconds) ? seconds * 1000 : raw ? Math.max(0, Date.parse(raw) - Date.now()) : 0;
      throw Object.assign(new Error(`HTTP ${response.status}${response.status === 401 ? ': sign in again.' : response.status === 403 ? ': access denied; open ChatGPT and resolve any verification.' : ''}`), { status: response.status, retryAfter: Number.isFinite(retryAfter) ? retryAfter : 0 });
    }
    if (response.status === 204) return null;
    try { return await response.json(); } catch { throw new Error('Expected JSON; open ChatGPT and check your session.'); }
  };
  try {
    const session = await read('/api/auth/session');
    if (!session?.accessToken || !session?.user?.id || !session?.account?.id) throw Object.assign(new Error('Sign in to ChatGPT, then load again.'), { status: 401 });
    const identity = `${session.user.id}:${session.account.id}`;
    if (input.identity && identity !== input.identity) throw Object.assign(new Error('Account changed. Reload conversations before continuing.'), { status: 409 });
    if (operation === 'identity') return { identity };
    const headers = { Authorization: `Bearer ${session.accessToken}`, 'ChatGPT-Account-ID': session.account.id };
    let path, options;
    if (operation === 'list') {
      const params = new URLSearchParams({ expand: 'false', hide_snorlax: 'false', is_archived: String(Boolean(input.archived)), is_starred: 'false', limit: '20', order: 'updated', offset: String(input.offset || 0) });
      path = `/backend-api/conversations?${params}`;
      options = { headers };
    } else if (operation === 'projects') {
      const params = new URLSearchParams({ conversations_per_gizmo: '0', limit: '20', owned_only: 'false' });
      if (input.cursor) params.set('cursor', input.cursor);
      path = `/backend-api/gizmos/snorlax/sidebar?${params}`;
      options = { headers };
    } else if (operation === 'delete' && typeof input.id === 'string' && input.id.length > 0) {
      path = `/backend-api/conversation/id/${encodeURIComponent(input.id)}`;
      options = { method: 'DELETE', headers };
    } else throw new Error('Unsupported operation.');
    const data = await read(path, options);
    if (operation === 'projects') {
      if (!Array.isArray(data?.items) || data.cursor != null && typeof data.cursor !== 'string') throw new Error('Project API changed: invalid project page.');
      const items = data.items.map(item => {
        const project = item?.gizmo?.gizmo;
        if (typeof project?.id !== 'string' || !project.id) throw new Error('Project API returned an invalid ID.');
        return { id: project.id, name: typeof project.display?.name === 'string' ? project.display.name : '' };
      });
      return { identity, data: { items, cursor: data.cursor || null } };
    }
    if (operation === 'delete' && data !== null && data?.success !== true) throw new Error('Deletion was not acknowledged (expected success: true). Reload to verify before retrying.');
    return { identity, data };
  } catch (error) {
    return { error: error.message, status: error.status ?? (error instanceof TypeError || error.name === 'TimeoutError' || error.name === 'AbortError' ? 0 : 422), retryAfter: error.retryAfter || 0 };
  }
}
