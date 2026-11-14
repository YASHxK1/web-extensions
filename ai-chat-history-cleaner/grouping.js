// Grouping changes presentation only; chat IDs and deletion selections stay intact.
export function groupChats(chats, projects = new Map(), query = '', selected = new Set()) {
  const groups = new Map();
  const unknownIds = [...new Set(chats.map(c => c.gizmoId).filter(id => id && (id.startsWith('g-p-') || projects.has(id)) && !projects.get(id)))].sort();
  const unknownNames = new Map(unknownIds.map((id, i) => [id, `Unnamed project ${i + 1} (name unavailable)`]));
  const search = query.trim().toLocaleLowerCase();
  for (const chat of chats) {
    const isProject = Boolean(chat.gizmoId && (projects.has(chat.gizmoId) || chat.gizmoId.startsWith('g-p-')));
    const id = isProject ? chat.gizmoId : 'general';
    const name = isProject ? projects.get(id) || unknownNames.get(id) || 'Unnamed project (name unavailable)' : 'General chats';
    if (!groups.has(id)) groups.set(id, { id, name, chats: [], total: 0, deleteCount: 0 });
    const group = groups.get(id);
    group.total++;
    if (selected.has(chat.id)) group.deleteCount++;
    if (!search || chat.title.toLocaleLowerCase().includes(search) || name.toLocaleLowerCase().includes(search)) group.chats.push(chat);
  }
  const time = value => { const parsed = Date.parse(value); return Number.isNaN(parsed) ? 0 : parsed; };
  return [...groups.values()].filter(g => g.chats.length).sort((a, b) =>
    a.id === 'general' ? -1 : b.id === 'general' ? 1 : a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  ).map(group => ({ ...group, chats: group.chats.sort((a, b) => time(b.updated) - time(a.updated) || a.id.localeCompare(b.id)) }));
}
