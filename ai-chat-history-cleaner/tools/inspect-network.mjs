// Optional developer tool. npm install --no-save puppeteer-core
// Prints schema metadata, never cookies, bearer values, user IDs or chat content.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9222' });
try {
  const host = process.env.PROVIDER === 'chatgpt' ? 'chatgpt.com' : process.env.PROVIDER === 'claude' ? 'claude.ai' : null;
  const candidates = (await browser.pages()).filter(page => {
    try { const hostname = new URL(page.url()).hostname; return host ? hostname === host : ['chatgpt.com', 'claude.ai'].includes(hostname); } catch { return false; }
  });
  const page = candidates[0];
  if (!page) throw new Error('Open a signed-in supported tab; optionally set PROVIDER=chatgpt or PROVIDER=claude.');
  page.on('response', async response => {
    const url = new URL(response.url());
    if (!['https://chatgpt.com', 'https://claude.ai'].includes(url.origin)) return;
    if (!/^\/(?:api\/auth\/session|backend-api\/conversations?(?:\/|$)|backend-api\/gizmos\/snorlax\/sidebar|api\/bootstrap(?:\/|$)|api\/organizations\/[^/]+\/chat_conversations(?:_v2)?(?:\/|$))/.test(url.pathname)) return;
    const request = response.request();
    const path = url.pathname.replace(/\/(conversation\/id|conversation|chat_conversations)\/[^/]+/g, '/$1/:ID').replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi, ':ID');
    const record = { provider: url.hostname, method: request.method(), path, status: response.status(), queryKeys: [...url.searchParams.keys()] };
    if (response.ok() && request.method() === 'GET' && /conversations(?:_v2)?$|snorlax\/sidebar$/.test(url.pathname)) {
      try { const data = await response.json(); const items = data.items || data.data; record.responseKeys = Object.keys(data); record.itemCount = items?.length; record.itemKeys = items?.[0] ? Object.keys(items[0]) : []; } catch {}
    }
    console.log(JSON.stringify(record));
  });
  console.log('Observing read-only navigation for 60 seconds. No deletion requests are generated.');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(resolve => setTimeout(resolve, 60000));
} finally { await browser.disconnect(); }
