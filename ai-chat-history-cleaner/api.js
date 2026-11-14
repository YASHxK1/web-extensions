import { tabRequest } from './adapters/chatgpt.js';
import { claudeTabRequest } from './adapters/claude.js';
export { tabRequest } from './adapters/chatgpt.js';
export { claudeTabRequest } from './adapters/claude.js';

export async function request(tabId, operation, input, provider = 'chatgpt') {
  const func = provider === 'chatgpt' ? tabRequest : provider === 'claude' ? claudeTabRequest : null;
  if (!func) throw Object.assign(new Error('Unsupported provider.'), { status: 409 });
  const results = await chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', func, args: [operation, input] });
  const result = results[0]?.result;
  if (!result) throw new Error('No response from the bound chat tab. Keep it open and reload the list.');
  if (result.error) throw Object.assign(new Error(result.error), { status: result.status, retryAfter: result.retryAfter });
  return result;
}
