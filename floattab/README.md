# FloatTab

FloatTab keeps a website visible in a floating window while you browse other tabs. Just click the extension icon on any page, and it pops out into a mini-window that stays on top. In Chrome, it tries to make the window interactive, but falls back to view-only if the site blocks it. In Firefox, it opens a compact popup you can use normally.

## How it works

**Chrome:** Tries to show websites in an interactive mini-window. If a site blocks this (like banking sites often do), it shows a view-only version instead.

**Firefox:** Opens a compact popup window that you can interact with normally. Firefox doesn't have the same mini-window features as Chrome.

## What to expect

| Browser | What you get | Always on top? |
|---|---|---|
| Chrome 116+ | Interactive if possible, view-only as backup | Yes |
| Firefox 128+ | Interactive popup | Not guaranteed |

Some sites won't work in mini-window mode because they block it for security reasons. Chrome will automatically switch to view-only mode when this happens.

Chrome might only let you have one mini-window at a time. FloatTab tries to keep track, but this is controlled by Chrome itself.

## Building from source

No extra packages needed. Just run:

```powershell
npm run build
```

Or build for a specific browser:

```powershell
npm run build:chrome
npm run build:firefox
```

Your extension will be in:

```text
dist/
  chrome/
  firefox/
```

## Installing

**Chrome:**
1. Run `npm run build:chrome`
2. Go to `chrome://extensions`
3. Turn on **Developer mode**
4. Click **Load unpacked**
5. Select `dist/chrome`

**Firefox:**
1. Run `npm run build:firefox`
2. Go to `about:debugging`
3. Click **This Firefox**
4. Click **Load Temporary Add-on**
5. Select `dist/firefox/manifest.json`

## Things to know

- Can't float browser settings pages, extension pages, or special Chrome/Firefox pages
- DRM-protected videos (like Netflix) might show up blank in Chrome's view-only mode
- Firefox's popup works like a normal window - it won't stay on top automatically
- Some websites might not work even if the extension tries, due to their own restrictions

## Project structure

```text
background/   Core extension logic for both browsers
content/      Chrome's mini-window implementation
offscreen/    Chrome's view-only backup
popup/        Extension popup menu
shared/       Shared code between browsers
manifests/    Browser-specific configuration
scripts/      Build tools
tests/        Testing files
```

For more details about Firefox support, check [FIREFOX_COMPATIBILITY.md](FIREFOX_COMPATIBILITY.md).
