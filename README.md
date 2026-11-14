# web-extensions

A collection of Chrome/Firefox browser extensions for a cleaner, more focused browsing experience.

This repository groups several independent extensions, each with its own focus:

- [DashTab](./DashTab) — a private, distraction-free Chrome new tab dashboard
- [ai-chat-history-cleaner](./ai-chat-history-cleaner) — removes old or unwanted AI chat history from ChatGPT and Claude
- [floattab](./floattab) — keeps a website visible in a floating window while you browse elsewhere

## Repository layout

```text
web-extensions/
├── DashTab/
│   ├── README.md
│   ├── manifest.json
│   ├── newtab.html
│   ├── script.js
│   └── styles.css
├── ai-chat-history-cleaner/
│   ├── README.md
│   ├── manifest.json
│   ├── background.js
│   ├── sidepanel.html
│   └── ...
├── floattab/
│   ├── README.md
│   ├── manifest.json
│   ├── background/
│   ├── content/
│   ├── popup/
│   └── shared/
├── README.md
└── LICENSE
```

## 1) DashTab

[DashTab](./DashTab) replaces Chrome's default new tab page with a calm workspace built around your most-used links, tasks, notes, and deadlines.

Highlights:
- shortcut grid for frequently visited sites
- live time/date display
- mini calendar with notes
- local to-do list
- countdowns and count-ups for important dates
- all data stays local in `chrome.storage.local`

Installation:
1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select the `DashTab` folder
5. Open a new tab

## 2) AI Chat History Cleaner

[ai-chat-history-cleaner](./ai-chat-history-cleaner) is a Chrome extension for cleaning chat history from ChatGPT and Claude without a backend or API key.

Highlights:
- works with signed-in ChatGPT and Claude sessions
- paginated history support
- keep/delete selection tools and bulk actions
- confirmation and sequential deletion flow
- retry and rate-limit handling during deletions
- private browser-tab execution with provider-specific adapters

Installation:
1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select the `ai-chat-history-cleaner` folder
5. Open a signed-in ChatGPT or Claude tab and load chats from the extension popup

For details, see the project documentation inside that folder.

## 3) FloatTab

[floattab](./floattab) keeps a website visible in a floating window so you can keep browsing while still watching or interacting with another page.

Highlights:
- floating browser window experience
- Chrome interactive mini-window mode with fallback to view-only mode
- Firefox popup window support
- browser-specific build outputs for Chrome and Firefox
- lightweight extension setup with no extra server required

Build and install:
```bash
npm run build
# or
npm run build:chrome
npm run build:firefox
```

Then load the generated build from the `dist` folder in Chrome or Firefox using the browser's extension loading flow.

## Purpose

Together, these projects are designed to improve daily browser workflows:
- reduce digital clutter and distractions
- keep AI chat history manageable
- stay productive without leaving the browser

## Notes

Each subfolder is intentionally self-contained and has its own README with more detailed usage, setup, and implementation notes.

If you want to explore a specific extension, start in the matching folder above and read its README first.
