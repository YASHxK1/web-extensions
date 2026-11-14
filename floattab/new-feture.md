## Feature Ideas

### 1. Float Manager and Workspaces
**What it does:** Expand the popup into a list of floating tabs showing title, favicon, mode, and controls to close, focus, or close all. Users could save groups such as “Coding” or “Monitoring” and restore them later.

**Why it fits:** Multi-tab PiP and a central `pipRegistry` already exist, but users can currently manage only the active tab.

**Implementation complexity:** Medium

**Where to add it:** [popup.js](E:/floattab/popup/popup.js), [popup.html](E:/floattab/popup/popup.html), [service_worker.js](E:/floattab/background/service_worker.js); add `chrome.storage`.

### 2. Per-Site Float Profiles
**What it does:** Remember preferred dimensions, aspect ratio, interactive/mirror preference, zoom, and toolbar visibility per domain.

**Why it fits:** A video, documentation page, chat, and dashboard each need different window shapes. The current `854×480` size is fixed for every site.

**Implementation complexity:** Medium

**Where to add it:** [content.js](E:/floattab/content/content.js:226), popup settings UI, and a new storage-backed profile module.

### 3. PiP Navigation Toolbar
**What it does:** Add back, forward, reload, open in full tab, copy URL, and zoom controls inside the floating window. Mirror mode could operate these controls on the captured source tab.

**Why it fits:** Interactive PiP currently presents a bare iframe, so navigation can leave users trapped or force them back to Chrome.

**Implementation complexity:** Medium

**Where to add it:** `resetPipDocument()` and `openDocumentPiP()` in [content.js](E:/floattab/content/content.js); tab operations routed through [service_worker.js](E:/floattab/background/service_worker.js).

### 4. Float a Page Region
**What it does:** Let users select a video, chart, chat panel, or arbitrary rectangle instead of floating the entire page. A context-menu command could launch a visual element picker.

**Why it fits:** Most users float a page for one component, while the rest of the page wastes limited PiP space.

**Implementation complexity:** High

**Where to add it:** New selector module under `content/`; rendering and capture cropping in [content.js](E:/floattab/content/content.js); context-menu setup in the service worker.

### 5. Watch Mode
**What it does:** Monitor a selected page element and visually pulse the float, play an optional sound, or update the toolbar badge when its content changes.

**Why it fits:** FloatTab is well suited to chats, build dashboards, delivery trackers, auctions, and support queues where users care about changes rather than continuous viewing.

**Implementation complexity:** Medium

**Where to add it:** `MutationObserver` logic in a new `content/watch.js`, notification state in the service worker, and controls in the PiP toolbar.

### 6. Keyboard and Context-Menu Controls
**What it does:** Provide shortcuts for float/close current tab, close all floats, and switch between floating sessions. Add “Float this tab” to the page context menu.

**Why it fits:** Opening the popup repeatedly works against the product’s multitasking purpose.

**Implementation complexity:** Low

**Where to add it:** `commands` and `contextMenus` in [manifest.json](E:/floattab/manifest.json), handlers in [service_worker.js](E:/floattab/background/service_worker.js).

### 7. Mirror Audio Controls
**What it does:** Offer opt-in tab audio with mute and volume controls in view-only mode, while correctly routing captured audio so the original tab does not unexpectedly become silent.

**Why it fits:** Mirror mode is already capture-based, but currently requests video only. Tutorials, meetings, and live streams benefit significantly from audio.

**Implementation complexity:** Medium

**Where to add it:** `getUserMedia()` and audio routing in [content.js](E:/floattab/content/content.js) and [offscreen.js](E:/floattab/offscreen/offscreen.js), plus PiP controls.

### 8. Privacy Pause and Snapshot
**What it does:** A shortcut or PiP button temporarily freezes or blanks a floating window without closing it. Snapshot mode could preserve a reference frame while capture is stopped.

**Why it fits:** Users may share their screen, enter sensitive data, or want a static reference without continuing tab capture.

**Implementation complexity:** Medium

**Where to add it:** Session lifecycle methods in [content.js](E:/floattab/content/content.js), [offscreen.js](E:/floattab/offscreen/offscreen.js), and commands in the service worker.

## Quick Code Observations

- **Architecture:** `pipRegistry` is memory-only, so an MV3 service-worker restart loses active session state and badge accuracy. Persist or reconcile it with live extension contexts.
- **Code quality:** UI, styles, state handling, and SVG mutation are concentrated in the popup files. Small UI/state modules would make upcoming features easier.
- **Performance:** The content script runs on every HTTP page and is also injected programmatically. The initialization guard prevents duplication, but broad automatic injection is unnecessary overhead.
- **Security/privacy:** `<all_urls>` host access and permanent content-script injection are broader than needed. Prefer optional host permissions or `activeTab`-driven injection.
- **Correctness:** The embeddability check treats `X-Frame-Options: SAMEORIGIN` and CSP `frame-ancestors 'self'` as blocked, although the PiP document and page can share an origin. This may send compatible sites into mirror mode.
- **Error handling:** Many failures are converted to generic strings, making permission, capture, framing, and user-gesture failures difficult to distinguish.
- **Testing:** No automated tests are present. Embeddability parsing and registry lifecycle behavior are good first unit-test targets.