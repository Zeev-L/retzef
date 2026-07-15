// Passive capture via AppleScript — no native deps.
// Returns { ts, app, title, url|null } for the frontmost window, or null on failure.
const { execFile } = require('child_process');

function osa(script, timeout = 2500) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(String(stdout).replace(/\n$/, ''));
    });
  });
}

// Chromium-family browsers expose the same scripting dictionary.
const CHROMIUM = [
  'Google Chrome', 'Google Chrome Canary', 'Google Chrome Beta',
  'Brave Browser', 'Microsoft Edge', 'Arc', 'Vivaldi', 'Chromium', 'Opera'
];
const SAFARI = ['Safari', 'Safari Technology Preview'];

const APP_TITLE = `
tell application "System Events"
  set p to first application process whose frontmost is true
  set appName to name of p
  set winTitle to ""
  try
    set winTitle to name of front window of p
  end try
end tell
return appName & "|~|" & winTitle
`;

async function capture() {
  const res = await osa(APP_TITLE);
  if (!res) return null;
  const sep = res.indexOf('|~|');
  const app = sep === -1 ? res : res.slice(0, sep);
  const title = sep === -1 ? '' : res.slice(sep + 3);
  let url = null;
  if (CHROMIUM.includes(app)) {
    url = await osa(`tell application "${app}" to get URL of active tab of front window`);
  } else if (SAFARI.includes(app)) {
    url = await osa(`tell application "${app}" to get URL of front document`);
  }
  return { ts: Date.now(), app: app.trim(), title: title.trim(), url: url ? url.trim() : null };
}

// Open a url or reveal a file/app — best-effort "resume".
function resume(target) {
  if (!target) return;
  if (/^https?:\/\//i.test(target)) {
    execFile('open', [target]);
  } else if (target.startsWith('/')) {
    execFile('open', ['-R', target]);
  } else {
    execFile('open', ['-a', target]); // treat as app name
  }
}

module.exports = { capture, resume };
