// Phase 2 — the "next step" line, via the local `claude` CLI (uses your plan; no API key).
const { execFile, execFileSync } = require('child_process');

// Resolve the claude binary once against a login shell so it works even when
// Electron's PATH is minimal.
let CLAUDE_BIN = 'claude';
try {
  const p = execFileSync(process.env.SHELL || '/bin/zsh', ['-lc', 'command -v claude'], { encoding: 'utf8' }).trim();
  if (p) CLAUDE_BIN = p;
} catch { /* keep default; feature just stays off if missing */ }

function ask(prompt, timeout = 30000) {
  return new Promise((resolve) => {
    execFile(CLAUDE_BIN, ['-p', prompt], { timeout, maxBuffer: 512 * 1024 }, (err, stdout) => {
      if (err) return resolve(null);
      const line = String(stdout).trim().split('\n').find(Boolean) || '';
      resolve(line.slice(0, 140) || null);
    });
  });
}

// One short Hebrew "what you did + next step" line for a work thread.
async function summarizeThread(thread) {
  const files = (thread.details || []).map(d => d.name).slice(0, 8).join(', ');
  if (!files) return null;
  const prompt =
    `עבדתי בפרויקט "${thread.label}" ונגעתי בקבצים/טאבים: ${files}. ` +
    `נסח בעברית שורה אחת קצרה (עד 12 מילים) מה כנראה עשיתי ומה הצעד הבא הסביר. ` +
    `פורמט מדויק: "עבדת על <תיאור> · הצעד הבא: <משהו>". החזר רק את השורה, בלי הקדמה ובלי מרכאות.`;
  return ask(prompt);
}

module.exports = { summarizeThread, CLAUDE_BIN };
