# New Tab Dashboard

A calm, private Chrome new tab page for the links, tasks, dates, and deadlines you actually care about.

New Tab Dashboard replaces Chrome's default new tab page with a fast dark workspace: your favorite shortcuts, a live clock, a mini calendar, a focused to-do list, and lightweight countdowns. No feeds. No ads. No analytics. Just the essentials every time you open a tab.

## Why It Exists

Chrome's default new tab page is built around suggestions. This dashboard is built around intention.

Open a tab and immediately see:

- Your hand-picked shortcut grid
- Today's time and date
- A mini calendar with date notes
- A simple local to-do list
- Countdowns and count-ups for important dates

Everything is stored on your device with `chrome.storage.local`.

## Features

### Fast Shortcut Grid

Add your most-used sites as clean, compact tiles. Each shortcut supports create, edit, and delete, with favicons loaded through Chrome's built-in favicon support and a letter fallback when no icon is available.

### Mini Calendar

See the current month at a glance. Click any day to add, edit, or remove a short note. Dates with notes get a subtle indicator so reminders are easy to spot.

### To-Do List

Capture tasks quickly, check them off when complete, edit text inline, and delete items when they are no longer useful.

### Countdowns

Track upcoming or ongoing dates. Count down to deadlines, or count up from starts, launches, habits, anniversaries, and milestones.

### Private by Design

The dashboard makes no third-party API calls for your data. Shortcuts, notes, tasks, and countdowns stay local in Chrome storage.

## Installation

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `C:\Users\ASUS\Documents\chrm`.
5. Open a new tab.

## Permissions

The extension requests only what it needs:

- `storage` to save your dashboard data locally
- `favicon` to show shortcut icons using Chrome's favicon system

No tracking scripts, no telemetry, no account, no cloud sync.

## Current Version

`1.1.0`

Built as a Manifest V3 Chrome extension with plain HTML, CSS, and JavaScript. No framework, no build step, no backend.

## Roadmap

Planned ideas:

- Drag-and-drop shortcut reordering
- Optional Chrome sync support
- Keyboard-first add flows
- Optional local dev-tip widget

The goal is to stay useful, quiet, and fast.
