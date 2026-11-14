import { fetchAll, fetchClaudeAll } from './core.js';
export const providers = Object.freeze({
  chatgpt: Object.freeze({ id: 'chatgpt', name: 'ChatGPT', origin: 'https://chatgpt.com', grouped: true, load: fetchAll }),
  claude: Object.freeze({ id: 'claude', name: 'Claude', origin: 'https://claude.ai', grouped: false, load: fetchClaudeAll })
});
export function providerForUrl(url) {
  try { const origin = new URL(url).origin; return Object.values(providers).find(provider => provider.origin === origin) || null; } catch { return null; }
}
export function contextMatches(binding, tab) {
  return Boolean(binding && tab && tab.id === binding.tabId && providerForUrl(tab.url)?.id === binding.provider);
}
