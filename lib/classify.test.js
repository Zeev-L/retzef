// Verify classify against a synthetic day. Run: npm run classify-test
const { buildThreads, metrics, POLL_MS } = require('./classify');

const DAY = new Date(2026, 6, 15, 0, 0, 0).getTime();
const at = (h, m) => DAY + (h * 60 + m) * 60000;

// helper: N samples of the same window, POLL_MS apart, starting at t
function run(t, n, s) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ ts: t + i * POLL_MS, ...s });
  return out;
}

const samples = [
  // 09:10 — deep block on focus-timer (editor + its github tab), ~10 min
  ...run(at(9, 10), 80, { app: 'Code', title: 'settings.js — focus-timer', url: null }),
  ...run(at(9, 20), 20, { app: 'Google Chrome', title: 'issue #12', url: 'https://github.com/Zeev-L/focus-timer/issues/12' }),
  // quick Slack glance (should NOT become its own big thread)
  ...run(at(9, 22), 2, { app: 'Slack', title: 'general', url: null }),
  // back to focus-timer
  ...run(at(9, 23), 40, { app: 'Code', title: 'timer.js — focus-timer', url: null }),
  // 10:05 — my-toolbox work
  ...run(at(10, 5), 60, { app: 'Code', title: 'index.html — my-toolbox', url: null }),
  // 11:00 — Google Meet (meeting)
  ...run(at(11, 0), 90, { app: 'Google Chrome', title: 'Meet', url: 'https://meet.google.com/abc-defg-hij' }),
  // 14:00 — scattered afternoon: comms + short work bursts
  ...run(at(14, 0), 15, { app: 'WhatsApp', title: 'chat', url: null }),
  ...run(at(14, 5), 8, { app: 'Code', title: 'main.js — retzef', url: null }),
  ...run(at(14, 8), 12, { app: 'Slack', title: 'random', url: null }),
  ...run(at(14, 15), 10, { app: 'Code', title: 'renderer.js — retzef', url: null }),
];

const { threads, comms, meeting, currentKey } = buildThreads(samples, at(14, 30));
const m = metrics(samples);

const min = ms => Math.round(ms / 60000);
console.log('THREADS (work):');
for (const t of threads) console.log(`  • ${t.label.padEnd(16)} engaged=${min(t.engagedMs)}m  last="${t.lastSample.title}"`);
console.log('COMMS drawer:', comms ? `${min(comms.engagedMs)}m` : 'none');
console.log('MEETINGS:', meeting ? `${meeting.meetingSegs.length} block(s)` : 'none');
console.log('currentKey:', currentKey);
console.log('\nMETRICS:');
console.log('  contextSwitches:', m.contextSwitches);
console.log('  longestBlock:', min(m.longestBlockMs) + 'm');
console.log('  threadCount:', m.threadCount);
console.log('  perHour:', m.perHour.map(h => `${h.hour}:${Math.round(h.focus * 100)}%`).join('  '));
console.log('  recommendation:', m.recommendation);

// --- assertions
let fail = 0;
const assert = (cond, msg) => { if (!cond) { console.error('  ✗ FAIL:', msg); fail++; } };
console.log('\nCHECKS:');
assert(threads.some(t => t.label === 'focus-timer'), 'focus-timer thread exists');
assert(threads.some(t => t.label === 'my-toolbox'), 'my-toolbox thread exists');
assert(!threads.some(t => t.label.toLowerCase().includes('slack')), 'slack is NOT a work thread');
assert(comms && comms.engagedMs > 0, 'comms collapsed into one drawer');
assert(meeting && meeting.meetingSegs.length >= 1, 'meeting captured as marker');
const ft = threads.find(t => t.label === 'focus-timer');
assert(ft && min(ft.engagedMs) >= 8, 'focus-timer engaged time is substantial');
assert(m.threadCount === 3, 'exactly 3 distinct work threads (editor+its github tab merged)');
assert(m.contextSwitches === 2, 'context switches counted at thread level, not window level');
assert(min(ft.engagedMs) >= 12, 'focus-timer time includes its merged github tab');
const ftNames = ft.details.map(d => d.name);
console.log('  focus-timer details:', ftNames.join(', '));
assert(ftNames.includes('settings.js') && ftNames.includes('timer.js'), 'thread summarizes the files it touched');
const ftTargets = ft.targets.map(x => x.value);
console.log('  focus-timer targets:', ftTargets.join(' | '));
assert(ftTargets.some(v => v.includes('github.com/Zeev-L/focus-timer')), 'cluster targets include the github tab url');
assert(ftTargets.some(v => v === 'Code'), 'cluster targets include the editor app');
assert(ft.targets.length >= 2, 'cluster has multiple openable targets');
if (!fail) console.log('  ✓ all checks passed');
process.exit(fail ? 1 : 0);
