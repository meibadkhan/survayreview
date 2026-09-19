import { useEffect, useMemo, useState } from 'react';
import './dashboard.css';
import {
  INDUSTRY,
  branchesForUser,
  commentDetails,
  commentSubmissions,
  inRange,
  isIncident,
  periodRange,
  setIncidentStatus,
  setSmileTarget,
  statsFor,
  surveysForUser,
  useData,
} from './store';

const NAV = [
  { id: 'overview', label: 'Overview', icon: 'home' },
  { id: 'voc', label: 'Voice of Customer', icon: 'mic' },
  { id: 'customers', label: 'Customers', icon: 'people' },
  { id: 'incidents', label: 'Incidents', icon: 'flag' },
  { id: 'analytics', label: 'Incident Analytics', icon: 'chart' },
];

const TARGET_PRESETS = [90, 92, 95, 97, 98, 100];

const RATING_ROWS = [
  { key: 'Excellent', star: 5, color: '#6d5efc', face: 'excellent' },
  { key: 'Good', star: 4, color: '#22c55e', face: 'good' },
  { key: 'Neutral', star: 3, color: '#f59e0b', face: 'average' },
  { key: 'Bad', star: 2, color: '#fb923c', face: 'poor' },
  { key: 'Terrible', star: 1, color: '#ef4444', face: 'terrible' },
];

const STACK = [
  { key: 'Terrible', color: '#ef4444' },
  { key: 'Bad', color: '#fb923c' },
  { key: 'Neutral', color: '#f59e0b' },
  { key: 'Good', color: '#4ade80' },
  { key: 'Excellent', color: '#22c55e' },
];

function ymd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${m}-${day}`;
}

function prettyDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function prettyShort(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function fmtPct(n, digits = 1) {
  const v = Number(n) || 0;
  if (v === 0) return '0%';
  if (v >= 10 || digits === 0) return `${v.toFixed(digits === 0 ? 0 : 1)}%`;
  if (v >= 1) return `${v.toFixed(1)}%`;
  return `${v.toFixed(2)}%`;
}

function smileTone(score) {
  if (score >= 95) return 'great';
  if (score >= 90) return 'ok';
  return 'low';
}

function delta(cur, prev, kind) {
  if (kind === 'points') {
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return { dir: 'flat', text: '0.0', raw: 0 };
    return { dir: d > 0 ? 'up' : 'down', text: Math.abs(d).toFixed(1), raw: d };
  }
  if (kind === 'abs') {
    const d = cur - prev;
    if (d === 0) return { dir: 'flat', text: '0', raw: 0 };
    return { dir: d > 0 ? 'up' : 'down', text: fmtNum(Math.abs(d)), raw: d };
  }
  if (kind === 'pp') {
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return { dir: 'flat', text: '0.0%', raw: 0 };
    return { dir: d > 0 ? 'up' : 'down', text: `${Math.abs(d).toFixed(1)}%`, raw: d };
  }
  if (prev === 0 && cur === 0) return { dir: 'flat', text: '0.0', raw: 0 };
  if (prev === 0) return { dir: cur > 0 ? 'up' : 'flat', text: '—', raw: cur };
  const d = ((cur - prev) / prev) * 100;
  if (Math.abs(d) < 0.05) return { dir: 'flat', text: '0.0', raw: 0 };
  return { dir: d > 0 ? 'up' : 'down', text: Math.abs(d).toFixed(1), raw: d };
}

function daysBetween(start, end) {
  if (!start || !end) return [];
  const out = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (d <= last) {
    out.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function dailyBuckets(list, start, end) {
  const days = daysBetween(start, end);
  const capped = days.length > 45 ? days.slice(-30) : days;
  const map = Object.fromEntries(capped.map(day => [day, {
    day,
    Excellent: 0,
    Good: 0,
    Neutral: 0,
    Bad: 0,
    Terrible: 0,
    total: 0,
    smileSum: 0,
    smileN: 0,
  }]));
  list.forEach(s => {
    const day = ymd(s.at);
    if (!map[day]) return;
    const key = s.experience;
    if (map[day][key] != null) map[day][key] += 1;
    map[day].total += 1;
    if (typeof s.smile === 'number') {
      map[day].smileSum += s.smile;
      map[day].smileN += 1;
    }
  });
  return capped.map(day => {
    const row = map[day];
    return { ...row, smile: row.smileN ? row.smileSum / row.smileN : null };
  });
}

function Icon({ name }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  const paths = {
    home: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />,
    mic: <><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
    people: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14 19a4.5 4.5 0 0 1 6.5-4" /></>,
    flag: <path d="M5 4v16M5 5h11l-2 3.5L16 12H5" />,
    chart: <path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-7" />,
    waves: <path d="M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />,
    list: <><path d="M8 7h12M8 12h12M8 17h12" /><circle cx="4" cy="7" r=".8" fill="currentColor" /><circle cx="4" cy="12" r=".8" fill="currentColor" /><circle cx="4" cy="17" r=".8" fill="currentColor" /></>,
    user: <><circle cx="12" cy="8" r="3.2" /><path d="M5 19a7 7 0 0 1 14 0" /></>,
    pin: <><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.2" /></>,
    search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-3.5-3.5" /></>,
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14c1.2 1.6 2.6 2.2 4 2.2s2.8-.6 4-2.2" /><circle cx="9" cy="10" r=".8" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r=".8" fill="currentColor" stroke="none" /></>,
    chat: <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />,
    warn: <><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 17.5h.01" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    download: <><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></>,
    cal: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  };
  return <svg className="voc-ico" {...common}>{paths[name]}</svg>;
}

function Face({ kind, size = 16 }) {
  const colors = {
    terrible: '#ef4444',
    poor: '#fb923c',
    average: '#f59e0b',
    good: '#4ade80',
    excellent: '#22c55e',
  };
  const c = colors[kind] || '#94a3b8';
  const mouth = kind === 'excellent' || kind === 'good'
    ? 'M8 14c1.2 1.6 2.6 2.2 4 2.2s2.8-.6 4-2.2'
    : kind === 'average'
      ? 'M8.5 14.5h7'
      : 'M8 16c1.2-1.4 2.6-2 4-2s2.8.6 4 2';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r=".9" fill={c} stroke="none" />
      <circle cx="15" cy="10" r=".9" fill={c} stroke="none" />
      <path d={mouth} />
    </svg>
  );
}

function Delta({ value, invert = false }) {
  if (!value || value.dir === 'flat') {
    return <span className="voc-delta flat">→ {value?.text || '0'}</span>;
  }
  const good = invert ? value.dir === 'down' : value.dir === 'up';
  return (
    <span className={`voc-delta ${good ? 'up' : 'down'}`}>
      {value.dir === 'down' ? '↘' : '↗'} {value.text}
    </span>
  );
}

function Kpi({ label, icon, value, deltaValue, invert, accent }) {
  return (
    <article className={`voc-kpi voc-kpi-${accent}`}>
      <div className="voc-kpi-top">
        <span>{label}</span>
        <span className="voc-kpi-icon"><Icon name={icon} /></span>
      </div>
      <div className="voc-kpi-value">{value}</div>
      <p className="voc-kpi-sub"><Delta value={deltaValue} invert={invert} /> vs previous period</p>
    </article>
  );
}

function SmileGauge({ score, target = 95 }) {
  const v = Math.max(0, Math.min(100, score || 0));
  const r = 58;
  const c = 2 * Math.PI * r;
  const dash = c * (v / 100);
  return (
    <div className="voc-gauge">
      <svg viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#eef2f7" strokeWidth="12" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="#22c55e"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 80 80)"
        />
      </svg>
      <div className="voc-gauge-label">
        <b>{score ? Math.round(score) : '—'}</b>
        <span>Smile Score</span>
      </div>
      <span className="voc-target">Target: {target}</span>
    </div>
  );
}

function TargetControl({ value, onChange }) {
  const preset = TARGET_PRESETS.includes(value) ? String(value) : 'custom';
  return (
    <label className="voc-target-edit">
      Target
      <select
        value={preset}
        onChange={e => onChange(e.target.value === 'custom' ? value : Number(e.target.value))}
        aria-label="Smile score target"
      >
        {TARGET_PRESETS.map(n => <option key={n} value={n}>{n}</option>)}
        <option value="custom">Custom</option>
      </select>
      {preset === 'custom' && (
        <input
          type="number"
          min="1"
          max="100"
          value={value}
          onChange={e => onChange(Number(e.target.value) || 95)}
          aria-label="Custom smile score target"
        />
      )}
    </label>
  );
}

function RatingBreakdown({ stats }) {
  const total = stats.total || 1;
  return (
    <div className="voc-ratings">
      {RATING_ROWS.map(row => {
        const n = stats.byRating[row.key] || 0;
        const pct = stats.total ? (n / total) * 100 : 0;
        return (
          <div className="voc-rate-row" key={row.key}>
            <span className="voc-star">{row.star}</span>
            <Face kind={row.face} />
            <div className="voc-rate-track">
              <div className="voc-rate-fill" style={{ width: `${Math.max(pct, n ? 1.2 : 0)}%`, background: row.color }} />
            </div>
            <span className="voc-rate-pct">{fmtPct(pct, pct < 1 ? 2 : 1)}</span>
            <span className="voc-rate-n">{fmtNum(n)}</span>
          </div>
        );
      })}
    </div>
  );
}

function SubmissionChart({ series }) {
  const max = Math.max(1, ...series.map(d => d.total));
  const smiles = series.map(d => d.smile).filter(n => n != null);
  const lineMax = 100;
  const w = 100;
  const h = 100;
  const pts = series.map((d, i) => {
    const x = series.length === 1 ? 50 : (i / (series.length - 1)) * w;
    const y = d.smile == null ? null : h - (d.smile / lineMax) * h;
    return { x, y };
  }).filter(p => p.y != null);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  const ticks = series.filter((_, i) => i === 0 || i === series.length - 1 || i % Math.ceil(series.length / 6) === 0);
  return (
    <div className="voc-chart">
      <div className="voc-chart-plot">
        <div className="voc-y">
          <span>{fmtNum(max)}</span>
          <span>{fmtNum(Math.round(max / 2))}</span>
          <span>0</span>
        </div>
        <div className="voc-bars">
          {series.map(d => (
            <div className="voc-bar" key={d.day} title={`${prettyShort(d.day)} · ${d.total}`}>
              {STACK.map(s => (
                <span
                  key={s.key}
                  style={{ height: `${(d[s.key] / max) * 100}%`, background: s.color }}
                />
              ))}
            </div>
          ))}
          {!!pts.length && (
            <svg className="voc-line" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
              <path d={path} fill="none" stroke="#6d5efc" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>
        <div className="voc-y voc-y-r">
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
      </div>
      <div className="voc-x">
        {ticks.map(d => <span key={d.day}>{prettyShort(d.day)}</span>)}
      </div>
      <div className="voc-legend">
        <span><Face kind="terrible" size={14} /> Terrible</span>
        <span><Face kind="poor" size={14} /> Poor</span>
        <span><Face kind="average" size={14} /> Average</span>
        <span><Face kind="good" size={14} /> Good</span>
        <span><Face kind="excellent" size={14} /> Excellent</span>
        <span className="voc-legend-line">■</span>
      </div>
    </div>
  );
}

function Benchmark({ label, value, vs, better }) {
  return (
    <article className="voc-bench">
      <p>{label}</p>
      <div className="voc-bench-val">
        <b>{value}</b>
        <span>vs {vs}</span>
      </div>
      <span className={`voc-ahead ${better ? 'yes' : 'no'}`}>{better ? '↗ Ahead' : '↘ Behind'}</span>
    </article>
  );
}

function locationRow(r) {
  const smile = r.now.total ? Math.round(r.now.smile) : 0;
  return { smile, face: smile >= 95 ? 'excellent' : smile >= 90 ? 'good' : 'average' };
}

function LocationsTable({ rows, minSubs, setMinSubs, mode, setMode, target, onSelect, selectedId }) {
  const filtered = rows.filter(r => r.now.total >= minSubs);
  const shown = mode === 'under'
    ? filtered.filter(r => (r.now.total ? r.now.smile : 100) < target)
    : filtered;
  const [page, setPage] = useState(0);
  const searched = shown;
  const size = 8;
  const pages = Math.max(1, Math.ceil(searched.length / size));
  const cur = Math.min(page, pages - 1);
  const slice = searched.slice(cur * size, cur * size + size);

  function exportCsv() {
    const header = ['Location', 'Smile Score', 'Submissions', '% Positive Feedback', 'Incidents', '% Incidents', 'Unresolved Incidents'];
    const lines = [header.join(',')].concat(searched.map(r => [
      `"${r.branch.name}"`,
      r.now.total ? Math.round(r.now.smile) : '',
      r.now.total,
      r.now.positivePct.toFixed(1),
      r.now.incidents,
      r.now.incidentPct.toFixed(1),
      r.now.unresolved,
    ].join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'locations.csv';
    a.click();
  }

  return (
    <section className="voc-card voc-table-card">
      <div className="voc-table-tools">
        <label className="voc-min">
          <input type="checkbox" checked={minSubs > 0} onChange={e => setMinSubs(e.target.checked ? Math.max(minSubs, 1) : 0)} />
          Show locations with more than
          <input type="number" min="0" value={minSubs} onChange={e => setMinSubs(Math.max(0, Number(e.target.value) || 0))} />
          submissions
        </label>
        <div className="voc-table-right">
          <select value={mode} onChange={e => { setMode(e.target.value); setPage(0); }}>
            <option value="under">Underperforming</option>
            <option value="all">All locations</option>
          </select>
          <button type="button" className="voc-export" onClick={exportCsv}><Icon name="download" /> Export</button>
        </div>
      </div>
      <div className="voc-table-wrap">
        <table className="voc-table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Smile Score</th>
              <th>Submissions</th>
              <th>% Positive Feedback</th>
              <th>Incidents</th>
              <th>% Incidents</th>
              <th>Unresolved Incidents</th>
            </tr>
          </thead>
          <tbody>
            {slice.map(r => {
              const { smile, face } = locationRow(r);
              return (
                <tr
                  key={r.branch.id}
                  className={selectedId === r.branch.id ? 'on' : ''}
                  onClick={() => onSelect(r)}
                >
                  <td className="voc-loc">{r.branch.name} <span>→</span></td>
                  <td>
                    <span className={`voc-smile ${smileTone(smile)}`}>
                      <Face kind={face} size={15} />
                      {r.now.total ? smile : '—'}
                    </span>
                    {r.now.total ? <Delta value={delta(r.now.smile, r.was.smile, 'points')} /> : null}
                  </td>
                  <td>
                    {fmtNum(r.now.total)}
                    <Delta value={delta(r.now.total, r.was.total, 'abs')} />
                  </td>
                  <td>
                    {r.now.total ? fmtPct(r.now.positivePct) : '—'}
                    {r.now.total ? <Delta value={delta(r.now.positivePct, r.was.positivePct, 'pp')} /> : null}
                  </td>
                  <td>
                    {fmtNum(r.now.incidents)}
                    <Delta value={delta(r.now.incidents, r.was.incidents, 'abs')} invert />
                  </td>
                  <td>
                    {r.now.total ? fmtPct(r.now.incidentPct) : '—'}
                    {r.now.total ? <Delta value={delta(r.now.incidentPct, r.was.incidentPct, 'pp')} invert /> : null}
                  </td>
                  <td>
                    {fmtNum(r.now.unresolved)}
                    {r.now.unresolved !== r.was.unresolved
                      ? <Delta value={delta(r.now.unresolved, r.was.unresolved, 'abs')} invert />
                      : <span className="voc-delta flat" />}
                  </td>
                </tr>
              );
            })}
            {!slice.length && (
              <tr><td colSpan={7} className="voc-empty">No locations match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="voc-loc-cards">
        {slice.map(r => {
          const { smile, face } = locationRow(r);
          return (
            <button
              type="button"
              key={r.branch.id}
              className={`voc-loc-card${selectedId === r.branch.id ? ' on' : ''}`}
              onClick={() => onSelect(r)}
            >
              <div className="voc-loc-card-top">
                <b>{r.branch.name}</b>
                <span className="voc-smile">
                  <Face kind={face} size={16} />
                  {r.now.total ? smile : '—'}
                </span>
              </div>
              <div className="voc-loc-grid">
                <span>Submissions <b>{fmtNum(r.now.total)}</b> <Delta value={delta(r.now.total, r.was.total, 'abs')} /></span>
                <span>Positive <b>{r.now.total ? fmtPct(r.now.positivePct) : '—'}</b></span>
                <span>Incidents <b>{fmtNum(r.now.incidents)}</b> <Delta value={delta(r.now.incidents, r.was.incidents, 'abs')} invert /></span>
                <span>Unresolved <b>{fmtNum(r.now.unresolved)}</b></span>
              </div>
            </button>
          );
        })}
        {!slice.length && <p className="voc-muted">No locations match these filters.</p>}
      </div>
      <div className="voc-table-foot">
        <span>Showing {searched.length ? cur * size + 1 : 0} - {Math.min(searched.length, cur * size + slice.length)} of {searched.length} record(s).</span>
        <span className="voc-pager">
          <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
          <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
        </span>
      </div>
      <p className="voc-tip">Pro Tip! Click a row to see more insights.</p>
    </section>
  );
}

function IncidentCard({ s }) {
  const d = commentDetails(s);
  const status = s.resolution === 'satisfied'
    ? 'Resolved · Satisfied'
    : s.resolution === 'unsatisfied'
      ? 'Not satisfied'
      : 'Unresolved';
  return (
    <article className="voc-inc">
      <div>
        <b>{s.branchName}</b>
        <span>{s.experience} · {new Date(s.at).toLocaleString()}</span>
      </div>
      <p>{d.comment || d.food || 'No comment left'}</p>
      {d.phone && <p className="voc-inc-contact">{d.phone}{d.order ? ` · Order ${d.order}` : ''}</p>}
      <em>{status}</em>
      <div className="voc-inc-actions">
        <button
          type="button"
          className={`voc-sat${s.resolution === 'satisfied' ? ' on' : ''}`}
          onClick={() => setIncidentStatus(s.id, 'satisfied')}
        >
          Satisfied
        </button>
        <button
          type="button"
          className={`voc-unsat${s.resolution === 'unsatisfied' ? ' on' : ''}`}
          onClick={() => setIncidentStatus(s.id, 'unsatisfied')}
        >
          Not satisfied
        </button>
      </div>
    </article>
  );
}

function CommentCards({ list }) {
  if (!list.length) return <div className="voc-card"><p className="voc-muted">No comments in this date range.</p></div>;
  return (
    <div className="voc-comments">
      {list.map(s => {
        const d = commentDetails(s);
        return (
          <article className="voc-comment" key={s.id}>
            <div className="voc-comment-top">
              <b>{s.branchName}</b>
              <span>{new Date(s.at).toLocaleString()}</span>
            </div>
            {s.experience && <p className="voc-pill">{s.experience}</p>}
            <p><span>What food items can we improve?</span>{d.food || '—'}</p>
            <p><span>Comment</span>{d.comment || '—'}</p>
            <p><span>Order number</span>{d.order || '—'}</p>
            <p><span>Phone number</span>{d.phone || '—'}</p>
          </article>
        );
      })}
    </div>
  );
}

export default function Dashboard({ user, onLogout }) {
  const { error: dbError } = useData();
  const mine = branchesForUser(user);
  const mySurveys = surveysForUser(user);
  const [page, setPage] = useState('voc');
  const [preset, setPreset] = useState('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [locQuery, setLocQuery] = useState('all');
  const [minSubs, setMinSubs] = useState(0);
  const [mode, setMode] = useState('all');
  const [selected, setSelected] = useState(null);
  const [menu, setMenu] = useState(false);
  const range = periodRange(preset === 'custom' ? 'custom' : preset, new Date(), { from, to });

  useEffect(() => {
    document.body.classList.toggle('voc-lock', menu);
    return () => document.body.classList.remove('voc-lock');
  }, [menu]);

  const scoped = useMemo(() => {
    if (locQuery === 'all') return mySurveys;
    return mySurveys.filter(s => s.branchId === locQuery);
  }, [mySurveys, locQuery]);
  const current = useMemo(() => scoped.filter(s => inRange(s.at, range.start, range.end)), [scoped, range]);
  const previous = useMemo(() => scoped.filter(s => inRange(s.at, range.prevStart, range.prevEnd)), [scoped, range]);
  const now = statsFor(current);
  const was = statsFor(previous);
  const series = useMemo(() => {
    const start = range.start || (current.length
      ? new Date(Math.min(...current.map(s => new Date(s.at).getTime())))
      : new Date());
    const end = range.end || new Date();
    return dailyBuckets(current, start, end);
  }, [current, range]);
  const comments = commentSubmissions(current);
  const incidents = current.filter(isIncident);

  const rows = useMemo(() => {
    const list = locQuery === 'all' ? mine : mine.filter(b => b.id === locQuery);
    return list.map(branch => {
      const cur = current.filter(s => s.branchId === branch.id);
      const prev = previous.filter(s => s.branchId === branch.id);
      return { branch, now: statsFor(cur), was: statsFor(prev), surveys: cur };
    });
  }, [mine, current, previous, locQuery]);

  const target = Number(user.smileTarget) > 0 ? Number(user.smileTarget) : 95;

  const smileDelta = was.total === 0 ? { dir: 'flat', text: '0.0' } : delta(now.smile, was.smile, 'points');
  const subDelta = delta(now.total, was.total, 'pct');
  const incDelta = delta(now.incidents, was.incidents, 'pct');
  const resDelta = delta(now.resolvedPct, was.resolvedPct, 'points');

  const aheadSmile = (now.total ? now.smile : 0) >= target;
  const aheadRating = now.avgRating >= INDUSTRY.avgRating;
  const aheadInc = now.incidentPct / 100 <= INDUSTRY.incidentRate;
  const aheadReview = now.reviewPct / 100 >= INDUSTRY.reviewRate;
  const aheadRes = now.resolvedPct / 100 >= INDUSTRY.resolutionRate;

  function applyPreset(next) {
    setPreset(next);
    if (next !== 'custom') {
      setFrom('');
      setTo('');
    }
  }

  const dateLabel = range.start && range.end
    ? `${prettyDate(range.start)} - ${prettyDate(range.end)}`
    : 'All time';
  const dateShort = range.start && range.end
    ? `${prettyShort(range.start)} – ${prettyShort(range.end)}`
    : 'All time';

  const vocMain = (
    <>
      <div className="voc-kpis">
        <Kpi label="Smile Score" icon="smile" value={now.total ? Math.round(now.smile) : '—'} deltaValue={smileDelta} accent="smile" />
        <Kpi label="Submissions" icon="chat" value={fmtNum(now.total)} deltaValue={subDelta} accent="subs" />
        <Kpi label="Total Incidents" icon="warn" value={fmtNum(now.incidents)} deltaValue={incDelta} invert accent="inc" />
        <Kpi label="Resolved" icon="check" value={now.incidents ? `${now.resolvedPct.toFixed(2)}%` : '—'} deltaValue={resDelta} accent="res" />
      </div>

      <div className="voc-grid-2">
        <section className="voc-card">
          <div className="voc-card-head">
            <h2>Smile Score</h2>
            <TargetControl value={target} onChange={n => setSmileTarget(user.id, n)} />
          </div>
          <SmileGauge score={now.total ? now.smile : 0} target={target} />
        </section>
        <section className="voc-card">
          <div className="voc-card-head"><h2>Rating Breakdown</h2></div>
          <RatingBreakdown stats={now} />
        </section>
      </div>

      <div className="voc-grid-2">
        <section className="voc-card">
          <div className="voc-card-head">
            <div>
              <h2>Submission Ratings</h2>
              <p>Distribution of customer submission ratings over the selected period.</p>
            </div>
          </div>
          {series.length ? <SubmissionChart series={series} /> : <p className="voc-muted">No submissions in this period.</p>}
        </section>
        <section className="voc-card">
          <div className="voc-card-head"><h2>Industry Benchmarks</h2></div>
          <div className="voc-benches">
            <Benchmark label="Smile Score" value={now.total ? Math.round(now.smile) : '—'} vs={target} better={aheadSmile} />
            <Benchmark label="Avg Submission Rating" value={now.total ? now.avgRating.toFixed(1) : '—'} vs={INDUSTRY.avgRating} better={aheadRating} />
            <Benchmark label="Incident Rate" value={now.total ? fmtPct(now.incidentPct) : '—'} vs={fmtPct(INDUSTRY.incidentRate * 100)} better={aheadInc} />
            <Benchmark label="Incident Review Rate" value={`${Math.round(now.reviewPct)}%`} vs={`${Math.round(INDUSTRY.reviewRate * 100)}%`} better={aheadReview} />
            <Benchmark label="Incident Resolution Rate" value={`${Math.round(now.resolvedPct)}%`} vs={`${Math.round(INDUSTRY.resolutionRate * 100)}%`} better={aheadRes} />
            <Benchmark label="Avg Reply Time" value="—" vs="1h 12m" better={false} />
          </div>
        </section>
      </div>

      <LocationsTable
        rows={rows}
        minSubs={minSubs}
        setMinSubs={setMinSubs}
        mode={mode}
        setMode={setMode}
        target={target}
        onSelect={row => setSelected(row)}
        selectedId={selected?.branch?.id}
      />

      {selected && (
        <section className="voc-card">
          <div className="voc-card-head">
            <h2>{selected.branch.name} insights</h2>
            <button type="button" className="voc-text-btn" onClick={() => setSelected(null)}>Close</button>
          </div>
          <div className="voc-kpis voc-kpis-mini">
            <Kpi label="Smile Score" icon="smile" value={selected.now.total ? Math.round(selected.now.smile) : '—'} deltaValue={delta(selected.now.smile, selected.was.smile, 'points')} accent="smile" />
            <Kpi label="Submissions" icon="chat" value={fmtNum(selected.now.total)} deltaValue={delta(selected.now.total, selected.was.total, 'pct')} accent="subs" />
            <Kpi label="Incidents" icon="warn" value={fmtNum(selected.now.incidents)} deltaValue={delta(selected.now.incidents, selected.was.incidents, 'pct')} invert accent="inc" />
            <Kpi label="Positive" icon="check" value={selected.now.total ? fmtPct(selected.now.positivePct) : '—'} deltaValue={delta(selected.now.positivePct, selected.was.positivePct, 'pp')} accent="res" />
          </div>
          <RatingBreakdown stats={selected.now} />
          <h3 className="voc-h3">Comments</h3>
          <CommentCards list={commentSubmissions(selected.surveys)} />
        </section>
      )}
    </>
  );

  let body;
  if (!mine.length) {
    body = <div className="voc-card"><p className="voc-muted">No restaurant branches are assigned to {user.username} yet.</p></div>;
  } else if (page === 'customers') {
    body = (
      <section className="voc-card">
        <div className="voc-card-head"><h2>Customers</h2></div>
        <p className="voc-muted">{comments.length} submissions with comments, food items, phone or order number.</p>
        <CommentCards list={comments} />
      </section>
    );
  } else if (page === 'incidents' || page === 'analytics') {
    body = (
      <>
        <div className="voc-kpis">
          <Kpi label="Total Incidents" icon="warn" value={fmtNum(now.incidents)} deltaValue={incDelta} invert accent="inc" />
          <Kpi label="Resolved" icon="check" value={now.incidents ? `${now.resolvedPct.toFixed(2)}%` : '—'} deltaValue={resDelta} accent="res" />
          <Kpi label="Unresolved" icon="flag" value={fmtNum(now.unresolved)} deltaValue={delta(now.unresolved, was.unresolved, 'abs')} invert accent="subs" />
          <Kpi label="Incident Rate" icon="chart" value={now.total ? fmtPct(now.incidentPct) : '—'} deltaValue={delta(now.incidentPct, was.incidentPct, 'pp')} invert accent="smile" />
        </div>
        {page === 'analytics' && (
          <section className="voc-card">
            <div className="voc-card-head">
              <div>
                <h2>Incident Analytics</h2>
                <p>Bad and Terrible ratings over the selected period.</p>
              </div>
            </div>
            {series.length ? <SubmissionChart series={series} /> : <p className="voc-muted">No data in this period.</p>}
          </section>
        )}
        <section className="voc-card">
          <div className="voc-card-head"><h2>Incidents</h2></div>
          {!incidents.length && <p className="voc-muted">No incidents in this date range.</p>}
          <div className="voc-inc-list">
            {incidents.map(s => <IncidentCard key={s.id} s={s} />)}
          </div>
        </section>
      </>
    );
  } else {
    body = vocMain;
  }

  return (
    <div className={`voc${menu ? ' nav-open' : ''}`}>
      <aside className={`voc-side${menu ? ' open' : ''}`}>
        <div className="voc-brand-row">
          <div className="voc-brand">Guest Matrix</div>
          <button type="button" className="voc-close" onClick={() => setMenu(false)} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>
        {NAV.map(item => (
          <button
            type="button"
            key={item.id}
            className={page === item.id ? 'on' : ''}
            onClick={() => { setPage(item.id); setMenu(false); }}
          >
            <Icon name={item.icon} /> {item.label}
          </button>
        ))}
        <button type="button" className="voc-logout" onClick={onLogout}>Log out</button>
      </aside>
      {menu && <button type="button" className="voc-scrim" onClick={() => setMenu(false)} aria-label="Close menu" />}
      <div className="voc-main">
        <header className="voc-top">
          <button type="button" className="voc-menu" onClick={() => setMenu(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <label className="voc-date">
            <Icon name="cal" />
            <span className="voc-date-long">{dateLabel}</span>
            <span className="voc-date-short">{dateShort}</span>
            <select value={preset} onChange={e => applyPreset(e.target.value)} aria-label="Date range">
              <option value="30d">Last 30 Days</option>
              <option value="7d">Last 7 days</option>
              <option value="month">This month</option>
              <option value="all">All time</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {preset === 'custom' && (
            <div className="voc-custom">
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
              <input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          )}
          <label className="voc-search">
            <Icon name="pin" />
            <select value={locQuery} onChange={e => setLocQuery(e.target.value)} aria-label="Branches">
              <option value="all">All branches</option>
              {mine.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        </header>
        {dbError && <p className="voc-error">{dbError}</p>}
        {body}
      </div>
    </div>
  );
}
