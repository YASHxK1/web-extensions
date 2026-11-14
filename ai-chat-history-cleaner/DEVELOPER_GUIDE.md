# Chat History Cleaner — Developer Guide

Version **1.2.0** supports ChatGPT and Claude in one Manifest V3 extension. See [User Guide](USER_GUIDE.md) for installation and everyday use.

## Setup and source map

Chrome loads plain JavaScript ES modules, HTML, and CSS directly. There is no bundler, build step, runtime dependency, API key, or backend server. The declared Chrome minimum is 116; Node.js 22+ is recommended for developer tooling. Load the extension folder unpacked and reload its Chrome extension card after runtime edits.

| File | Responsibility |
| --- | --- |
| `manifest.json`, `background.js` | MV3 permissions, panel entrypoint, CSP, and toolbar opening behavior. |
| `sidepanel.html`, `style.css`, `sidepanel.js` | Branding, provider-bound review state, rendering, selection, confirmation, queue lifecycle, progress, and logs. |
| `providers.js` | Exact-origin provider detection, provider capabilities/loaders, and bound-tab matching. |
| `api.js` | Select the provider adapter and inject it into the bound tab’s isolated world. |
| `adapters/chatgpt.js` | Self-contained ChatGPT session, list, project-name, and DELETE operations. |
| `adapters/claude.js` | Self-contained Claude account/workspace bootstrap, normalized history pages, and DELETE operation. |
| `core.js` | Separate conversation paginators, ChatGPT project pagination, retry policy, and shared deletion queue. |
| `grouping.js` | ChatGPT project classification, ordering, search, and section counts. |
| `tests/*.test.js` | Node tests for both providers, contracts, pagination, scope changes, retries, and grouping. |
| `tests/ui.mjs`, `tests/claude-ui.mjs` | Unpacked Chrome tests using mock API responses, including mock deletions. |
| `tools/inspect-network.mjs` | Optional sanitized read-only network observer. |
| `network-inspection.json`, `claude-inspection.json` | Sanitized discovery and verification evidence. |

The queue belongs to the panel document, not the service worker. Closing the panel destroys its timers and state; an already submitted network request can complete.

## Provider boundary and authentication

`providerForUrl(url)` accepts only exact HTTPS origins `https://chatgpt.com` and `https://claude.ai`. Provider detection occurs when Load chats is clicked. The provider registry supplies its name, origin, grouped/flat capability, and history loader. `contextMatches(binding, tab)` requires the bound tab ID and provider origin to match.

`request(tabId, operation, input, provider)` selects an adapter and uses `chrome.scripting.executeScript` with `world: 'ISOLATED'`. Unknown providers throw before injection. The default provider remains ChatGPT for existing callers/tests. `api.js` re-exports the original `tabRequest` name for compatibility.

Injected functions must be self-contained: Chrome serializes them, so they cannot capture imported helpers or module state. Each function checks its required page origin before making requests. All requests use existing cookies, `credentials: 'include'`, `cache: 'no-store'`, and a 30-second timeout.

### ChatGPT

Before each operation, GET `/api/auth/session` must provide `accessToken`, `user.id`, and `account.id`. Identity is `${user.id}:${account.id}`. Backend requests include the bearer token and `ChatGPT-Account-ID`; credentials remain inside the injected function.

| Operation | Request |
| --- | --- |
| `identity` | Session check only. |
| `list` | GET `/backend-api/conversations?expand=false&hide_snorlax=false&is_archived={boolean}&is_starred=false&limit=20&order=updated&offset={offset}` |
| `projects` | GET `/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0&limit=20&owned_only=false`, followed by cursor pages. |
| `delete` | DELETE `/backend-api/conversation/id/{encoded_id}` |

Project records are reduced inside the adapter from `item.gizmo.gizmo` to ID/name pairs and a cursor. Instructions, author details, files, and other project metadata never reach the panel. A deletion requires HTTP 204 or JSON `success === true`; there is no legacy PATCH fallback.

### Claude

Read only the non-credential `lastActiveOrg` cookie to identify the workspace selected on the website. Do not read, copy, or log Claude’s session-key cookies; fetch sends authentication cookies automatically.

Before each operation, GET:

```text
/api/bootstrap/{org}/app_start?statsig_hashing_algorithm=djb2&growthbook_format=sdk&include_system_prompts=false
```

The bootstrap must provide `account.uuid` and a membership whose `organization.uuid` matches the selected organization. Identity is `${account.uuid}:${org}`. A missing/invalid active organization or session fails closed; do not select another membership automatically. The active-org cookie is checked again after requests to detect workspace switches.

| Operation | Request |
| --- | --- |
| `identity` | Workspace bootstrap and identity check only. |
| `list` | GET `/api/organizations/{org}/chat_conversations_v2?limit=20&offset={offset}&archived={boolean}&consistency=strong` |
| `delete` | DELETE `/api/organizations/{org}/chat_conversations/{encoded_id}` |

The observed history response is `{ data: [...], has_more: boolean, search_incomplete?: boolean | null }`. `search_incomplete: true` rejects the page. The adapter returns only:

```js
{
  identity,
  data: {
    items: [{ id, title, updated, archived, gizmoId: null }],
    hasMore: boolean
  }
}
```

It maps upstream `uuid`, `name`, `updated_at`/`created_at`, and `is_archived`. Summaries, settings, and project metadata are discarded. Claude project conversations remain in the flat list when returned by history; no Claude project APIs or grouping are used. Claude Code/Cowork sessions are not separately enumerated or deleted.

The loaded frontend’s single-conversation mutation used the DELETE route above. Its shared mutation wrapper sends JSON variables with `Content-Type: application/json`; the adapter sends the conversation identifier as `{ "uuid": id }`. Its shared response parser explicitly accepts an empty successful DELETE body. The adapter accepts a successful HTTP status with an empty body or a valid JSON object, rejecting HTML, non-object JSON, and explicit failure payloads. This contract was verified from loaded frontend code and mocks, not a real deletion response. No live deletion was sent.

### Results and failures

An identity-only operation returns `{ identity }`; other successful operations return `{ identity, data }`. The injected boundary returns `{ error, status, retryAfter }` on failure. The bridge throws an Error carrying the status and retry delay in milliseconds.

HTTP errors retain their status; origin/account/workspace changes use 409. Network failures/timeouts use 0. Unexpected schemas, JSON, or acknowledgements use non-retryable 422. Do not turn a protocol failure into status 0: that would retry an unknown destructive response and potentially continue to other chats. Error response bodies are not forwarded or logged.

Both providers use private website endpoints. Verify changed contracts from the signed-in website instead of substituting public inference API endpoints or guessing routes.

## Loading, pagination, and rendering

Both loaders return `{ identity, conversations }`, where conversations normalize to `{ id, title, updated, archived, gizmoId }`. Each loads normal and archived history separately and deduplicates IDs across those scopes. Identity must remain stable throughout loading. Repeated IDs within a scope, malformed pages, and pagination beyond 10,000 pages fail closed.

**ChatGPT pagination:** offset advances by the actual item count. Validate a returned offset if present. A reported total must be a nonnegative integer, but need not stay fixed: live totals grew as 21, 41, 61 on successive 20-item pages. Use each page’s hint for continuation. Without a total, a short/empty page ends that scope. An empty page before the current total is reached is incomplete.

**Claude pagination:** advance offset by actual item count and continue while `hasMore` is true, even for short pages. Missing/non-boolean continuation flags are invalid. An empty page with `hasMore: true` is incomplete. Never infer completion only from a short page.

ChatGPT project names load after history. Cursor pagination rejects repeated cursors and checks identity on every page. Non-identity project failures log a warning and use distinct numbered fallback headings; a 409 aborts the load. A partial failed project catalog is discarded.

ChatGPT groups use catalog membership or the `g-p-` prefix; other custom GPT chats stay General. General sorts first, projects alphabetically, and chats newest first. Search matches titles/project names, with total/deletion counts covering the whole group. Native details sections preserve collapsed IDs across filtering; a fresh load resets them.

Claude renders one non-collapsible flat section, newest first, and searches titles only. There is no Claude General section/button. Both renderers insert remote labels with `textContent`.

## Review isolation and queue lifecycle

Selections are a Set of IDs belonging only to the loaded review. A binding contains provider, origin, tab ID, and account/workspace identity. Every panel-level API operation checks that the bound tab is still active and belongs to that provider. The adapter independently checks origin and identity.

Tab activation, bound-tab removal, and cross-origin navigation invalidate the review, clear selections, close any confirmation, and stop further queue work. A generation counter prevents stale async loads/preflights from reopening or completing a different review. Account/workspace identity is rechecked at confirmation preflight, deletion preflight, and before every write. Loading another provider always starts with Keep defaults and resets search/logs.

Global Select All, Invert, and Keep All operate on all search matches, including collapsed ChatGPT sections. ChatGPT’s General Select All to Delete intentionally uses the unfiltered General group, preserving existing project selections. Selection handlers do not call deletion APIs.

Save & Proceed writes a snapshot under a unique per-panel session-storage key `deletionPlan:{random UUID}`:

```js
{ provider, origin, tabId, identity, ids: [...selected], createdAt: Date.now() }
```

Confirmation displays the provider and exact count. No titles, content, or credentials are stored. The queue consumes the in-memory snapshot, never a plan discovered in storage. Per-panel keys prevent one provider/window from overwriting another panel’s plan. Cancel, completion, invalidation, and fresh load remove the current panel’s plan. An abandoned plan can remain until the browser session ends, but is never resumed automatically.

Deletion is serial. Success removes a chat/selection; ordinary failures and unprocessed IDs remain selected for a new confirmation. Identity/context invalidation instead requires a fresh load. Progress counts processed results and reports success/failure/unprocessed totals separately.

Retryable statuses are 0, 429, and 5xx, with four attempts total. Backoff is:

```js
Math.max(retryAfter || 0, 1500 * 2 ** attempt + Math.random() * 500)
```

Retry-After accepts seconds or an HTTP date and is not capped. There is a 1,200 ms wait between conversations. An exhausted retryable error is logged and can allow the next conversation; non-retryable failures stop the queue. Stop checks during waits at intervals of at most 250 ms and prevents the next request. It does not undo or abort an already submitted request.

Logs include provider labels, generic errors, timestamps, and sometimes conversation IDs. They remain in panel memory unless explicitly downloaded and reset on a fresh load.

## Testing, inspection, and release

Core/adapter tests need no npm dependencies:

```bash
npm test
```

Optional browser tests use a local Chrome supporting extension debugging:

```bash
npm install --no-save puppeteer-core
CHROME_PATH=/usr/bin/google-chrome node tests/ui.mjs
CHROME_PATH=/usr/bin/google-chrome node tests/claude-ui.mjs
```

`PUPPETEER_MODULE` can supply a module path/URL if installed elsewhere. Browser tests load the unpacked extension into separate headless profiles and substitute API responses. They cover both providers, pagination, defaults, grouping/flat rendering, General-only selection, search, confirmation IDs/counts, scoped plans, provider/tab/account changes, retries, Stop, failed loads, progress, and logs. DELETEs are mocked. They regenerate mock screenshots `preview.png` and `preview-claude.png`.

For read-only endpoint discovery, sign in to a separate debugging profile:

```bash
google-chrome --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 --user-data-dir=/tmp/chat-history-inspection \
  https://claude.ai
PROVIDER=claude node tools/inspect-network.mjs
```

Use `PROVIDER=chatgpt` for ChatGPT. `CHROME_DEBUG_URL` overrides localhost. The observer reloads the selected tab, listens for 60 seconds, and prints sanitized paths, statuses, query-key names, and schema keys. It generates no deletion requests. Keep the debugging endpoint local. Never package browser profiles, credentials, authenticated captures, or private chat content.

The production Claude adapter/paginator was verified read-only in a signed-in Chrome isolated world: 182 conversations across 11 normal/archive pages, zero archived chats in that account. Historical ChatGPT verification loaded 230 chats across General and 12 named project sections. Counts are snapshots, not constants. The supplied inspection reports distinguish observed requests, source-verified deletion contracts, mocked deletion tests, and live read-only verification.

For release, update the manifest version, guides, and evidence; run appropriate core and browser checks; verify the actual Chrome installation path and reload it. Adding Claude introduces only the `https://claude.ai/*` host permission alongside existing ChatGPT access. Chrome may require acknowledging the added permission. Package the top-level `chat-history-cleaner/` folder and guides, excluding node_modules, profiles, and scratch data. No runtime build is needed.


### Git checkout and source ZIP

The repository is [YASHxK1/ai-chat-history-cleaner](https://github.com/YASHxK1/ai-chat-history-cleaner). Its root contains `manifest.json` and can be loaded directly as an unpacked extension.

```bash
git clone https://github.com/YASHxK1/ai-chat-history-cleaner.git
cd ai-chat-history-cleaner
npm test
```

Create distributable ZIPs from the reviewed, committed tree:

```bash
git archive --format=zip --prefix=chat-history-cleaner/ \
  --output=../chat-history-cleaner.zip HEAD
```

`git archive` includes only committed files and excludes the `.git` directory. Commit intended source changes before packaging. The `.gitignore` excludes local dependencies, credentials/configuration, debugging profiles, scratch data, backups, logs, and ZIPs; inspect the staged file list before committing so those files never enter the committed tree. Do not ZIP the whole working directory with a recursive filesystem archiver.
