# Chat History Cleaner

[GitHub repository](https://github.com/YASHxK1/ai-chat-history-cleaner)

Version **1.2.0** adds basic **Claude** support to the existing ChatGPT extension. Plain JavaScript, Chrome Manifest V3, no build step, API key, or separate server.

## Documentation

- [User Guide](USER_GUIDE.md): installation, provider selection, reviewing chats, confirmation, updates, and troubleshooting.
- [Developer Guide](DEVELOPER_GUIDE.md): provider adapters, verified API contracts, pagination, isolation, tests, and releases.

## Load unpacked

1. Extract `chat-history-cleaner.zip`, or clone this repository. The repository root is ready to load unpacked.
2. Open `chrome://extensions` in Chrome 116 or newer and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Make a signed-in `https://chatgpt.com` or `https://claude.ai` tab active.
5. Pin **Chat History Cleaner**, click its icon, then click **Load chats**.

The panel detects the provider at load time and names it in the header and confirmation. For an existing unpacked installation, replace the files in the folder Chrome actually loaded, reload its extension card, then reopen the panel. Chrome may request the newly added Claude site permission.

## Features

| Behavior | ChatGPT | Claude |
| --- | --- | --- |
| Existing signed-in browser session | Yes | Yes |
| Paginated normal and archived history | Yes | Yes |
| Keep by default, title search, Select All, Invert, Keep All | Yes | Yes |
| Existing project grouping and project-name search | Yes | Deferred; flat conversation list |
| General chats Select All to Delete button | Yes | Use the main Select All toolbar button |
| Confirmation, sequential deletion, rate limiting, retries, progress, Stop, logs | Yes | Yes |

Claude project conversations appear in the flat list when returned by its history API. The extension does not move chats, delete projects, or manage Claude Code/Cowork sessions separately.

Global selection tools affect all search matches. ChatGPT’s General chats button instead marks every general chat, including those hidden by search, while preserving project selections. Hidden selections count toward confirmation. Every fresh load resets selection to Keep.

**Save & Proceed** saves a provider/tab/account/workspace-bound plan and shows the exact count. Only **Delete marked chats** starts deletion. Cancel or Escape sends no deletion requests. Deletion cannot be undone by this extension.

Keep the originating site tab, panel, and Chrome open. Switching the active tab or navigating the bound tab to another site invalidates the review and stops further queue work. An already submitted request can finish. Account/workspace identity is rechecked before confirmation and every write. A new load is required after a context change; provider selections are never combined.

## Queue and privacy

Deletion is serial, with a 1.2-second delay between conversations. Network errors, HTTP 429, and server errors receive up to three retries after the initial attempt, with exponential backoff and `Retry-After` handling. Stop interrupts waits; submitted network requests have a 30-second timeout. Protocol/acknowledgement failures stop the batch instead of being retried as network failures.

The only host permissions are `https://chatgpt.com/*` and `https://claude.ai/*`. Requests run in the bound site tab’s isolated world. ChatGPT’s bearer token and Claude’s authentication cookies are not returned to the panel or stored in plans/logs. There is no telemetry or external backend.

Both integrations use private website APIs. Their request contracts can change independently.

## Development and verification

Core tests require no package installation:

```bash
npm test
```

For optional browser tests, install `puppeteer-core` and use a local Chrome supporting unpacked-extension debugging:

```bash
npm install --no-save puppeteer-core
CHROME_PATH=/usr/bin/google-chrome node tests/ui.mjs
CHROME_PATH=/usr/bin/google-chrome node tests/claude-ui.mjs
```

These tests substitute mock API responses, including deletion responses. They exercise both providers, selection isolation, confirmation, retries, cancellation, and incomplete-load failures. Screenshots use mock conversations.

The Claude adapter was verified read-only in a signed-in Chrome isolated world and the installed extension UI: **182 conversations across 11 normal/archive page requests**, with no archived conversations in that account. The frontend source confirmed the deletion endpoint and response parser. **No real chats were deleted**; deletion behavior was tested with mocks. Counts are verification snapshots, not expected totals for other accounts.

See `network-inspection.json` and `claude-inspection.json` for sanitized evidence. Repeat read-only inspection with `tools/inspect-network.mjs`; the Developer Guide explains setup and limits.
