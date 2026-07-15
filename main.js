const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const { capture, resume } = require('./lib/capture');
const { buildThreads, metrics } = require('./lib/classify');
const { summarizeThread } = require('./lib/summarize');
const Store = require('./lib/store');

const POLL_MS = 4000;
const SAVE_MS = 30000;
const PRUNE_MS = 3 * 24 * 3600 * 1000;

let store, tray = null, win = null;
let permOK = null, lastCapture = null, nullStreak = 0;

function trayImage() {
  const p = path.join(__dirname, 'assets', 'trayTemplate.png');
  try {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) { img.setTemplateImage(true); return img; }
  } catch { /* fall through */ }
  return nativeImage.createEmpty();
}

function createWindow() {
  win = new BrowserWindow({
    width: 380, height: 560, show: false, frame: false, resizable: false,
    fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
    transparent: true, hasShadow: true, roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  win.loadFile('index.html');
  win.on('blur', () => { if (win && !win.webContents.isDevToolsOpened()) win.hide(); });
}

function positionWindow() {
  const b = tray.getBounds();
  const wb = win.getBounds();
  let x = Math.round(b.x + b.width / 2 - wb.width / 2);
  const y = Math.round(b.y + b.height + 4);
  win.setPosition(x, y, false);
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) return win.hide();
  positionWindow();
  win.show();
  win.focus();
}

async function tick() {
  const s = await capture();
  lastCapture = s;
  if (s && s.app) {
    permOK = true; nullStreak = 0;
    store.add(s);
  } else {
    nullStreak++;
    if (permOK === null && nullStreak >= 3) permOK = false;
  }
}

app.whenReady().then(() => {
  store = new Store(path.join(app.getPath('userData'), 'samples.json'));
  if (app.dock) app.dock.hide();          // menu-bar only, no dock icon
  createWindow();

  tray = new Tray(trayImage());
  tray.setToolTip('רצף — מה פתוח אצלך');
  tray.on('click', toggleWindow);
  tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate([
    { label: 'רענן', click: () => win && win.webContents.send('refresh') },
    { type: 'separator' },
    { label: 'יציאה מרצף', click: () => app.quit() }
  ])));

  tick();
  setInterval(tick, POLL_MS);
  setInterval(() => { store.prune(PRUNE_MS); store.save(); }, SAVE_MS);
});

app.on('window-all-closed', () => { /* stay alive in the menu bar */ });
app.on('before-quit', () => { if (store) store.save(); });

ipcMain.handle('get-board', () => ({
  board: buildThreads(store.samples),
  metrics: metrics(store.samples),
  permOK, lastCapture, sampleCount: store.samples.length
}));
ipcMain.handle('resume', (_e, target) => { resume(target); return true; });
ipcMain.on('quit', () => app.quit());

// Phase 2: AI "next step" for the top threads, cached by thread signature so
// `claude` is only called when a thread actually changed.
const aiCache = new Map();
const AI_TOP = 3;
const sigOf = t => `${t.lastSeen}:${(t.details || []).length}`;

ipcMain.handle('summarize', async () => {
  const { threads } = buildThreads(store.samples);
  await Promise.all(threads.slice(0, AI_TOP).map(async (t) => {
    const sig = sigOf(t);
    const cached = aiCache.get(t.key);
    if (cached && cached.sig === sig) return;
    const text = await summarizeThread(t);
    if (text) aiCache.set(t.key, { sig, text });
  }));
  const out = {};
  for (const t of threads) { const c = aiCache.get(t.key); if (c) out[t.key] = c.text; }
  return out;
});
