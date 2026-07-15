// Turns raw samples into a small set of meaningful threads + a focus read.
// The whole product philosophy lives here: attention, not windows.

const POLL_MS = 4000;          // one sample ≈ this much dwell time
const MIN_ENGAGED_MS = 20000;  // below this a work thread is just a glance
const MAX_THREADS = 6;

const MEETING_APPS = new Set(['zoom.us', 'zoom', 'Microsoft Teams', 'Webex', 'Webex Meetings', 'RingCentral']);
const COMMS_APPS = new Set(['Slack', 'WhatsApp', 'Telegram', 'Messages', 'Discord', 'Mail', 'Microsoft Outlook', 'Mimestream']);
const MEETING_HOSTS = ['meet.google.com', 'zoom.us', 'teams.microsoft.com', 'teams.live.com'];
const COMMS_HOSTS = ['mail.google.com', 'chat.google.com', 'web.whatsapp.com', 'app.slack.com', 'discord.com', 'outlook.office.com', 'web.telegram.org'];
// Social / background: not real work threads — fold into the drawer so the board stays clean.
const BACKGROUND_HOSTS = ['facebook.com', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'reddit.com'];

function hostOf(url) { try { return new URL(url).host.replace(/^www\./, ''); } catch { return ''; } }
function pathOf(url) { try { return new URL(url).pathname; } catch { return ''; } }

function categorize(s) {
  const host = s.url ? hostOf(s.url) : '';
  if (MEETING_APPS.has(s.app) || MEETING_HOSTS.some(h => host.includes(h))) return 'meeting';
  const isHost = list => list.some(h => host === h || host.endsWith('.' + h));
  if (COMMS_APPS.has(s.app) || isHost(COMMS_HOSTS) || isHost(BACKGROUND_HOSTS)) return 'comms';
  return 'work';
}

// Derive a stable project key + human label from a work sample.
function projectKey(s) {
  if (s.url) {
    const host = hostOf(s.url), segs = pathOf(s.url).split('/').filter(Boolean);
    if (host === 'github.com' && segs.length >= 2) return { key: 'gh:' + segs[1].toLowerCase(), label: segs[1] };
    if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
      return { key: 'local:' + host, label: host };
    }
    const base = host + (segs[0] ? '/' + segs[0] : '');
    return { key: 'web:' + base.toLowerCase(), label: segs[0] || host };
  }
  const t = (s.title || '').trim();
  if (t) {
    // Editors put the project last: "settings.js — focus-timer".
    const parts = t.split(/\s+[—–\-]\s+/).map(x => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const folder = parts[parts.length - 1];
      return { key: 'proj:' + folder.toLowerCase(), label: folder };
    }
    return { key: 'app:' + s.app.toLowerCase() + ':' + t.toLowerCase().slice(0, 40), label: t.slice(0, 48) };
  }
  return { key: 'app:' + s.app.toLowerCase(), label: s.app };
}

// The specific "thing" a sample was on: filename, tab name, or page — for summaries.
function sampleDetail(s) {
  if (s.url) {
    try {
      const u = new URL(s.url);
      const segs = u.pathname.split('/').filter(Boolean);
      const last = segs[segs.length - 1];
      if (last && !/^\d+$/.test(last)) return decodeURIComponent(last);
      return u.host.replace(/^www\./, '');
    } catch { /* */ }
  }
  const t = (s.title || '').trim();
  const parts = t.split(/\s+[—–\-]\s+/).map(x => x.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[0] : t;   // "settings.js — focus-timer" -> "settings.js"
}

function annotate(samples) {
  return [...samples].sort((a, b) => a.ts - b.ts).map(x => {
    const cat = categorize(x);
    let key, label;
    if (cat === 'comms') { key = '__comms__'; label = 'תקשורת'; }
    else if (cat === 'meeting') { key = '__meeting__'; label = 'פגישות'; }
    else {
      const pk = projectKey(x);
      label = pk.label;
      // Merge by normalized project name so the editor and its own browser
      // tab (e.g. GitHub for the same repo) collapse into one thread.
      key = 'w:' + label.toLowerCase().trim();
    }
    return { ...x, cat, key, label };
  });
}

// Collapse consecutive same-key samples into segments.
function segmentize(ann) {
  const segs = [];
  for (const a of ann) {
    const last = segs[segs.length - 1];
    if (last && last.key === a.key) { last.endTs = a.ts; last.count++; last.lastSample = a; }
    else segs.push({ key: a.key, cat: a.cat, label: a.label, startTs: a.ts, endTs: a.ts, count: 1, lastSample: a });
  }
  return segs;
}

const durMs = seg => (seg.endTs - seg.startTs) + POLL_MS;

function buildThreads(samples, now = Date.now()) {
  const ann = annotate(samples);
  const segs = segmentize(ann);
  const map = new Map();
  for (const seg of segs) {
    let t = map.get(seg.key);
    if (!t) {
      t = { key: seg.key, cat: seg.cat, label: seg.label, engagedMs: 0, lastSeen: 0, firstSeen: seg.startTs, lastSample: seg.lastSample, meetingSegs: [], details: [], targets: [], _det: new Map(), _tgt: new Map() };
      map.set(seg.key, t);
    }
    t.engagedMs += durMs(seg);
    t.firstSeen = Math.min(t.firstSeen, seg.startTs);
    if (seg.endTs >= t.lastSeen) { t.lastSeen = seg.endTs; t.lastSample = seg.lastSample; t.label = seg.label; }
    if (seg.cat === 'meeting') t.meetingSegs.push({ startTs: seg.startTs, endTs: seg.endTs, app: seg.lastSample.app });
  }
  // Collect the distinct things touched per work thread (from every sample, not just segments).
  for (const a of ann) {
    if (a.cat !== 'work') continue;
    const t = map.get(a.key);
    if (!t) continue;
    // Openable target (url or app) for restoring the whole cluster on "Open".
    const tv = a.url || a.app;
    if (tv) { const pt = t._tgt.get(tv); if (!pt || a.ts > pt.ts) t._tgt.set(tv, { type: a.url ? 'url' : 'app', ts: a.ts }); }
    // Distinct detail (filename / tab) for the summary line.
    const d = sampleDetail(a);
    if (!d || d.toLowerCase() === t.label.toLowerCase()) continue;
    const prev = t._det.get(d);
    if (!prev || a.ts > prev.ts) t._det.set(d, { ts: a.ts, ms: (prev ? prev.ms : 0) + POLL_MS });
    else prev.ms += POLL_MS;
  }
  for (const t of map.values()) {
    t.details = [...t._det.entries()].map(([name, v]) => ({ name, ts: v.ts, ms: v.ms })).sort((a, b) => b.ts - a.ts);
    t.targets = [...t._tgt.entries()].map(([value, v]) => ({ value, type: v.type, ts: v.ts })).sort((a, b) => b.ts - a.ts).slice(0, 10);
    delete t._det; delete t._tgt;
  }
  const all = [...map.values()];
  const currentKey = segs.length ? segs[segs.length - 1].key : null;
  const threads = all
    .filter(t => t.cat === 'work' && (t.engagedMs >= MIN_ENGAGED_MS || t.key === currentKey))
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, MAX_THREADS);
  return {
    threads,
    comms: all.find(t => t.cat === 'comms') || null,
    meeting: all.find(t => t.cat === 'meeting') || null,
    currentKey,
    now
  };
}

// Phase 2 — focus read from the same samples.
function metrics(samples) {
  const segs = segmentize(annotate(samples));
  const workSeq = segs.filter(x => x.cat === 'work').map(x => x.key);
  const collapsed = [];
  for (const k of workSeq) if (collapsed[collapsed.length - 1] !== k) collapsed.push(k);

  const contextSwitches = Math.max(0, collapsed.length - 1);       // thread jumps, NOT window jumps
  const longestBlockMs = segs.filter(x => x.cat === 'work').reduce((m, x) => Math.max(m, durMs(x)), 0);
  const threadCount = new Set(workSeq).size;

  const byHour = {};
  for (const seg of segs) {
    const h = new Date(seg.startTs).getHours();
    byHour[h] = byHour[h] || { work: 0, comms: 0, meeting: 0, total: 0 };
    byHour[h][seg.cat] += durMs(seg);
    byHour[h].total += durMs(seg);
  }
  const perHour = Object.keys(byHour).map(Number).sort((a, b) => a - b).map(h => ({
    hour: h,
    focus: byHour[h].total ? byHour[h].work / byHour[h].total : 0,
    totalMs: byHour[h].total
  }));

  return { contextSwitches, longestBlockMs, threadCount, perHour, recommendation: recommend(perHour) };
}

function recommend(perHour) {
  const solid = perHour.filter(h => h.totalMs >= 4 * POLL_MS);
  if (solid.length < 2) return 'עוד מעט data ונוכל לזהות את שעות השיא שלך.';
  const best = solid.reduce((a, b) => (b.focus > a.focus ? b : a));
  const worst = solid.reduce((a, b) => (b.focus < a.focus ? b : a));
  const hh = h => String(h).padStart(2, '0') + ':00';
  if (best.focus - worst.focus < 0.15) return 'הקשב שלך היום היה די אחיד — יפה.';
  return `הכי חד סביב ${hh(best.hour)} — שווה לשמור שם עבודה עמוקה. סביב ${hh(worst.hour)} הקשב מתפזר.`;
}

module.exports = { buildThreads, metrics, categorize, projectKey, POLL_MS, MIN_ENGAGED_MS };
