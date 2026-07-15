# רצף · Retzef

A quiet menu-bar memory for people who switch a lot. Retzef passively remembers what you were
working on across dozens of app-switches and gives you a clean glance back — plus a daily focus
read. Everything stays on your Mac. No screenshots, ever.

> Built because context re-entry — "wait, where was I?" — is the single most expensive tax on a
> multi-threaded workday, and nothing lightweight solves it.

---

## The idea

Most tools fight your switching (blockers, timers). Retzef doesn't. It assumes switching is your
normal state and removes the cost of it: the remembering is no longer on you.

Its core principle is **attention, not windows**. It tracks what you actually *engaged* with
(focus + dwell time), not everything that happens to be open. You can have 40 windows open; if
you really worked in 3, you get 3 threads.

---

## What it does

**A pull-only board** (click the menu-bar icon):
- Your recent work **threads**, each with the files/tabs you touched and how long.
- A **✦ next step** line per thread — a one-line "what you did + what's next", written by your
  local `claude` CLI.
- Communication apps (Slack, WhatsApp, mail) collapse into one drawer; meetings become time
  markers — they never masquerade as work threads.

**A focus read** (the second tab):
- Context switches today (counted at the **thread** level, not window level — so jumping between
  an editor and its own browser tab doesn't inflate the number).
- Your longest uninterrupted block, and how many threads you juggled.
- A per-hour focus chart, and one kind recommendation ("your mornings are sharpest — protect
  them").

No pop-ups. No nudges. You glance when you want to.

---

## How it works

1. **Capture** — every ~4 seconds, Retzef reads the frontmost app, its window title, and (for
   browsers) the active tab URL, via AppleScript (`osascript`). It's one line of text — not a
   screenshot, not the page content.
2. **Classify** — samples are grouped into threads by project (an editor and its GitHub tab for
   the same repo merge into one), filtered by dwell time, and bucketed into work / comms /
   meeting.
3. **Summarize** — for the top threads, the file/tab names are handed to your local `claude` CLI,
   which returns the one-line next-step. Uses your existing plan; no API key, ~zero marginal cost.

Everything runs locally and is stored as JSON in the app's data directory (auto-pruned after
3 days).

---

## Install & run

```bash
git clone https://github.com/Zeev-L/retzef.git
cd retzef
npm install
npm start
```

Look for the small **thread-loop icon** in your menu bar; click it to open the board.

### Permissions (one-time)

Retzef needs macOS permission to read window titles and browser URLs:

- **Accessibility** — to read the frontmost window title.
- **Automation** (per browser) — to read the active tab URL.

macOS prompts on first use. This is the only setup friction.

### The next-step line

The ✦ line uses the [`claude` CLI](https://claude.com/claude-code) if it's installed and on your
PATH. If it isn't, the board works exactly the same — just without that one line.

---

## Privacy

- **No screenshots, no screen recording** — only names of windows, tabs, and files.
- **Never reads content** — not your documents, not page bodies.
- **Nothing leaves your Mac** — no cloud, no telemetry. The next-step line runs through your own
  local `claude`.

---

## Tech

Electron · AppleScript capture (no native deps) · local JSON store · dependency-free tray icon
generator.

Scripts:

```bash
npm start           # run the app
npm run classify-test   # unit-test the classification engine
npm run capture-test    # print one live capture (debug)
npm run dist            # build a .dmg
```

---

## Roadmap

- [ ] Restore the full **window cluster** on "Open" (currently reopens the last tab/file only).
- [ ] Morning "continue from yesterday" card, surfaced in [The Bridge](https://zeev-l.github.io/bridge).
- [ ] Manual merge / split for threads the heuristics get wrong.
- [ ] Package as a signed `.dmg` so it runs without a terminal.

---

Part of a personal toolbox — see the rest at [zeev-l.github.io/my-toolbox](https://zeev-l.github.io/my-toolbox).
