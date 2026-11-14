# Firefox Compatibility Report

## Outcome

FloatTab now has separate Chrome and Firefox packages. The Firefox manifest uses
`background.scripts`, contains only supported permissions and resources, and
uses a compact interactive browser window instead of Chrome-only Picture-in-
Picture APIs.

Build the Firefox package with:

```powershell
npm run build:firefox
```

Load `dist/firefox/manifest.json` from:

```text
about:debugging -> This Firefox -> Load Temporary Add-on
```

## Issues and Resolutions

| Compatibility issue | Root cause | Resolution |
|---|---|---|
| `background.service_worker is currently disabled` | Firefox does not enable extension service-worker backgrounds in the same way as Chrome | Firefox manifest uses `background.scripts` and a dedicated background script |
| `chrome.offscreen` unavailable | Offscreen documents are a Chrome extension API | Offscreen code is excluded from the Firefox package |
| `chrome.tabCapture` unavailable | Firefox has no equivalent stream-ID capture pipeline | Firefox duplicates the tab into an interactive popup window |
| Document Picture-in-Picture unavailable | Firefox does not expose arbitrary HTML Document PiP | Firefox uses `windows.create({ type: "popup" })` |
| Chromium capture constraints unsupported | `chromeMediaSource`, `chromeMediaSourceId`, and `consumerTabId` are Chromium-specific | These paths exist only in the Chrome package |
| Browser namespace differences | Firefox's preferred `browser.*` API is Promise-based | Shared popup selects `browser` or `chrome`; Firefox background uses `browser.*` |
| Unsupported Firefox permissions | `tabCapture` and `offscreen` fail or provide no value | Firefox manifest contains only `activeTab`, `tabs`, and `storage` |
| Chrome content scripts unnecessary | Firefox compact windows are ordinary browser tabs | Firefox package contains no content scripts |
| Chrome web-accessible resources unnecessary | The Firefox path does not load the offscreen page | Firefox manifest declares no web-accessible resources |
| Background suspension can lose memory state | Firefox background pages may be unloaded | Compact-window mappings are saved in `storage.session` and reconciled on startup |
| Restricted URL differences | Firefox has `about:` and `moz-extension:` pages | Shared URL checks reject privileged schemes for both browsers |
| Remote popup font | Extension CSP and offline use make remote fonts unreliable | Popup uses the system font stack and makes no network requests |
| Alarms | The project does not use alarms | No compatibility adapter is required |

## Firefox Data Flow

1. The popup requests platform capabilities from the Firefox background script.
2. The user selects **Open Compact Window**.
3. Firefox duplicates the active tab, preserving its browsing session and
   contextual identity.
4. The duplicate is moved into an `854 x 480` popup window.
5. FloatTab stores `{ sourceTabId, floatTabId, windowId }` in `storage.session`.
6. Closing the source tab, duplicate tab, or popup window removes the session
   and updates the toolbar badge.
7. Opening FloatTab again for the same source focuses its existing popup.

If window creation fails after duplication, FloatTab removes the duplicate so
no orphan tab remains.

## Chrome Reliability Changes

- Multi-window PiP is documented and displayed as best-effort.
- The service worker probes tab-hosted and offscreen sessions before reporting
  state or badge counts.
- Browser-replaced and stale PiP sessions are removed from the registry.
- Native video PiP is no longer described as guaranteeing a separate OS window.

## Frame Policy Changes

The previous check incorrectly rejected every `SAMEORIGIN` and
`frame-ancestors 'self'` response. The new policy evaluator:

- Blocks `X-Frame-Options: DENY`.
- Allows `SAMEORIGIN` for the same-origin page embedded by its opener.
- Blocks CSP `frame-ancestors 'none'`.
- Allows `'self'`, matching explicit origins, matching schemes, `*`, and valid
  matching wildcard hosts.
- Rejects malformed or unsupported policies conservatively.
- Keeps runtime iframe validation and Chrome's capture fallback.

## Files Added or Changed

- `manifests/manifest.chrome.json`: Chrome source manifest.
- `manifests/manifest.firefox.json`: Firefox source manifest with
  `background.scripts` and Gecko metadata.
- `background/service_worker.js`: Chrome capability reporting, frame policy, and
  live session reconciliation.
- `background/firefox_background.js`: Firefox compact-window lifecycle.
- `shared/`: browser API selection, policy parsing, and capability helpers.
- `popup/`: cross-browser UI and platform routing.
- `scripts/build.js`: browser-specific packaging.
- `icons/`: new SVG identity and generated PNG sizes.
- `README.md`: build, loading, behavior, and limitation documentation.

The Chrome-only `content/` and `offscreen/` directories are intentionally absent
from `dist/firefox`.

## Remaining Platform Limitations

- Firefox cannot guarantee that compact windows remain always-on-top.
- Firefox cannot reproduce Chrome's view-only tab capture through supported
  WebExtension APIs.
- Firefox built-in video PiP applies to video elements, not arbitrary
  interactive websites.
- Chrome and operating systems may limit the number of simultaneous PiP
  windows.

## Verification Status

- Source files pass JavaScript syntax checks.
- Browser-specific packages build successfully.
- Generated Firefox package contains no Chrome content, offscreen, or capture
  files.
- Automated `web-ext lint` was not run because downloading the validator was not
  approved in this environment.
- Final temporary-install and UI behavior should be manually checked in the
  target Firefox profile.
