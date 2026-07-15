const $ = sel => document.querySelector(sel);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

let aiText = {};       // thread key -> AI "next step" line (persists across re-renders)
let enriching = false; // guard against overlapping claude runs

function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'ממש עכשיו';
  if (m < 60) return `לפני ${m} דק'`;
  const h = Math.round(m / 60);
  return `לפני ${h} שע'`;
}
const fmtMin = ms => `${Math.max(1, Math.round(ms / 60000))}′`;

// The one specific cue that helps you re-enter: the last file / tab / thing.
function lastDetail(t) {
  const s = t.lastSample;
  if (!s) return '';
  if (s.url) {
    try {
      const u = new URL(s.url);
      const segs = u.pathname.split('/').filter(Boolean);
      const last = segs[segs.length - 1];
      if (last && !/^\d+$/.test(last)) return decodeURIComponent(last);
      return u.host.replace(/^www\./, '');
    } catch { /* */ }
  }
  const title = (s.title || '').trim();
  if (title && title.toLowerCase() !== (t.label || '').toLowerCase()) return title.slice(0, 44);
  return '';
}
function resumeTarget(t) { const s = t.lastSample; return (s && (s.url || s.app)) || ''; }

function threadRow(t, isCurrent) {
  const row = el('div', 'row' + (isCurrent ? ' current' : ''));

  const targets = (t.targets || []).map(x => x.value);
  const btn = el('button', 'open', targets.length > 1 ? `פתח · ${targets.length}` : 'פתח');
  btn.title = targets.length > 1 ? 'פותח מחדש את כל צביר החלונות' : 'חזור לחוט';
  btn.onclick = () => window.retzef.resumeCluster(targets.length ? targets : [resumeTarget(t)]);

  const main = el('div', 'row-main');
  const line1 = el('div', 'row-title');
  line1.appendChild(el('span', 'label', t.label));
  if (isCurrent) line1.appendChild(el('span', 'chip-now', 'עכשיו'));

  main.appendChild(line1);

  // Summary: the things you actually touched in this thread.
  const names = (t.details || []).map(d => d.name);
  if (names.length) {
    const what = names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
    main.appendChild(el('div', 'row-sub', (isCurrent ? 'עכשיו: ' : 'עבדת על ') + what));
  } else {
    main.appendChild(el('div', 'row-sub', isCurrent ? 'פעיל עכשיו' : 'עבדת כאן'));
  }

  // How long + when.
  const when = isCurrent ? 'פעיל עכשיו' : timeAgo(t.lastSeen);
  main.appendChild(el('div', 'row-meta2', `${minText(t.engagedMs)} · ${when}`));

  // AI "next step" line (fills in async; blank until ready).
  main.appendChild(el('div', 'ai-line' + (aiText[t.key] ? '' : ' hidden'), aiText[t.key] || ''));

  row.dataset.key = t.key;
  row.appendChild(main);
  row.appendChild(btn);
  return row;
}
function minText(ms) { return Math.max(1, Math.round(ms / 60000)) + ' דק׳'; }

function drawerRow(label, sub, cls) {
  const row = el('div', 'row drawer ' + cls);
  const main = el('div', 'row-main');
  main.appendChild(el('div', 'row-title', label));
  main.appendChild(el('div', 'row-sub', sub));
  row.appendChild(main);
  return row;
}

function renderThreads(data) {
  const view = $('#view-threads');
  view.innerHTML = '';
  const { board } = data;
  const hasAny = board.threads.length || board.comms || board.meeting;

  if (!hasAny) {
    const empty = el('div', 'empty');
    empty.appendChild(el('p', 'empty-title', 'עוד אין חוטים'));
    empty.appendChild(el('p', 'empty-sub', 'רצף לוכד ברקע. חזור לפה אחרי קצת עבודה ותראה איפה עצרת.'));
    view.appendChild(empty);
    return;
  }
  view.appendChild(el('div', 'hint', 'מה עבדת עליו לאחרונה. «פתח» מחזיר אותך לשם.'));
  for (const t of board.threads) view.appendChild(threadRow(t, t.key === board.currentKey));
  if (board.comms) {
    view.appendChild(drawerRow('תקשורת', 'הודעות ומיילים · ' + timeAgo(board.comms.lastSeen), 'comms'));
  }
  if (board.meeting) {
    const n = board.meeting.meetingSegs.length;
    view.appendChild(drawerRow('פגישות', `${n} ${n === 1 ? 'פגישה' : 'פגישות'} היום · ${timeAgo(board.meeting.lastSeen)}`, 'meeting'));
  }
}

function renderFocus(data) {
  const view = $('#view-focus');
  view.innerHTML = '';
  const m = data.metrics;

  const stats = el('div', 'stats');
  const stat = (num, lbl) => { const s = el('div', 'stat'); s.appendChild(el('div', 'stat-num', num)); s.appendChild(el('div', 'stat-lbl', lbl)); return s; };
  stats.appendChild(stat(String(m.contextSwitches), 'מעברי הקשר'));
  stats.appendChild(stat(fmtMin(m.longestBlockMs), 'בלוק הכי ארוך'));
  stats.appendChild(stat(String(m.threadCount), 'חוטים'));
  view.appendChild(stats);

  if (m.perHour.length) {
    view.appendChild(el('div', 'section-lbl', 'מתי היית ממוקד'));
    const chart = el('div', 'chart');
    for (const h of m.perHour) {
      const col = el('div', 'bar-col');
      const bar = el('div', 'bar ' + (h.focus >= 0.55 ? 'deep' : 'scatter'));
      bar.style.height = Math.max(6, Math.round(h.focus * 70)) + 'px';
      col.appendChild(bar);
      col.appendChild(el('div', 'bar-lbl', String(h.hour)));
      chart.appendChild(col);
    }
    view.appendChild(chart);
  }

  const rec = el('div', 'rec');
  rec.appendChild(el('div', 'rec-txt', m.recommendation));
  view.appendChild(rec);
}

function renderBanner(data) {
  const b = $('#banner');
  if (data.permOK === false) {
    b.className = 'banner warn';
    b.innerHTML = '';
    b.appendChild(el('span', null, 'רצף צריך הרשאת Accessibility כדי לקרוא כותרות חלונות.'));
    const btn = el('button', 'banner-btn', 'פתח הגדרות');
    btn.onclick = () => window.retzef.resume('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    b.appendChild(btn);
  } else {
    b.className = 'banner hidden';
  }
}

async function refresh() {
  const data = await window.retzef.getBoard();
  renderBanner(data);
  renderThreads(data);
  renderFocus(data);
  $('#status').textContent = data.permOK === false ? 'צריך הרשאה' : 'רץ ומקשיב ברקע';
  enrich();
}

function applyAi() {
  document.querySelectorAll('#view-threads .row').forEach(row => {
    const text = aiText[row.dataset.key];
    const line = row.querySelector('.ai-line');
    if (line && text) { line.textContent = text; line.classList.remove('hidden'); }
  });
}

async function enrich() {
  if (enriching) return;
  enriching = true;
  try {
    const map = await window.retzef.summarize();
    if (map) { aiText = { ...aiText, ...map }; applyAi(); }
  } catch { /* AI layer is best-effort */ }
  finally { enriching = false; }
}

// tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const which = tab.dataset.tab;
    $('#view-threads').classList.toggle('hidden', which !== 'threads');
    $('#view-focus').classList.toggle('hidden', which !== 'focus');
  };
});
$('#quit').onclick = () => window.retzef.quit();
window.retzef.onRefresh(() => refresh());

refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 5000);
