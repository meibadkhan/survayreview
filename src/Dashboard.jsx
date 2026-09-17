import { useMemo, useState } from 'react';
import {
  SMILE,
  branchesForUser,
  greeting,
  inRange,
  periodRange,
  statsFor,
  surveysForUser,
  useData,
} from './store';

function ymd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${m}-${day}`;
}

function monthStart(now = new Date()) {
  return ymd(new Date(now.getFullYear(), now.getMonth(), 1));
}

function delta(cur, prev, kind) {
  if (kind === 'points') {
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return { dir: 'flat', text: '0.0' };
    return { dir: d > 0 ? 'up' : 'down', text: Math.abs(d).toFixed(1) };
  }
  if (prev === 0 && cur === 0) return { dir: 'flat', text: '0.0' };
  if (prev === 0) return { dir: cur > 0 ? 'up' : 'flat', text: '—' };
  const d = ((cur - prev) / prev) * 100;
  if (Math.abs(d) < 0.05) return { dir: 'flat', text: '0.0' };
  return { dir: d > 0 ? 'up' : 'down', text: Math.abs(d).toFixed(1) };
}

function SmileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#22c55e" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14c1.2 1.6 2.6 2.2 4 2.2s2.8-.6 4-2.2" />
      <circle cx="9" cy="10" r=".8" fill="#22c55e" stroke="none" />
      <circle cx="15" cy="10" r=".8" fill="#22c55e" stroke="none" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#64748b" strokeWidth="2">
      <path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#f59e0b" strokeWidth="2">
      <path d="M12 3l10 18H2L12 3z" />
      <path d="M12 10v5" />
      <circle cx="12" cy="17.5" r=".8" fill="#f59e0b" stroke="none" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#64748b" strokeWidth="2">
      <path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  );
}

export default function Dashboard({ user, onLogout }) {
  useData();
  const mine = branchesForUser(user);
  const mySurveys = surveysForUser(user);
  const [branchId, setBranchId] = useState('all');
  const [preset, setPreset] = useState('custom');
  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(() => ymd(new Date()));
  const range = periodRange(preset, new Date(), { from, to });

  const visibleIds = useMemo(() => {
    if (branchId === 'all') return mine.map(b => b.id);
    return mine.some(b => b.id === branchId) ? [branchId] : [];
  }, [mine, branchId]);

  const current = mySurveys.filter(s =>
    visibleIds.includes(s.branchId) && inRange(s.at, range.start, range.end)
  );
  const previous = mySurveys.filter(s =>
    visibleIds.includes(s.branchId) && inRange(s.at, range.prevStart, range.prevEnd)
  );
  const now = statsFor(current);
  const was = statsFor(previous);
  const smileDelta = was.total === 0 ? { dir: 'flat', text: '0.0' } : delta(now.smile, was.smile, 'points');
  const subDelta = delta(now.total, was.total, 'pct');
  const terribleDelta = delta(now.terrible, was.terrible, 'pct');
  const maxRating = Math.max(1, ...Object.values(now.byRating));

  function applyPreset(next) {
    setPreset(next);
    const today = new Date();
    if (next === 'month') {
      setFrom(monthStart(today));
      setTo(ymd(today));
    } else if (next === '7d') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      setFrom(ymd(start));
      setTo(ymd(today));
    } else if (next === 'all') {
      setFrom('');
      setTo('');
    } else {
      setPreset('custom');
    }
  }

  function changeFrom(value) {
    setFrom(value);
    setPreset(value && to ? 'custom' : 'all');
  }

  function changeTo(value) {
    setTo(value);
    setPreset(from && value ? 'custom' : 'all');
  }

  return (
    <div className="portal">
      <div className="portal-inner dash">
        <header className="portal-top">
          <div>
            <p className="dash-kicker">Default Dashboard View</p>
            <h1>{greeting(user.username)}</h1>
          </div>
          <div className="portal-actions">
            <button className="ghost-btn" onClick={onLogout}>Log out</button>
          </div>
        </header>

        {!mine.length ? (
          <div className="panel">
            <p className="muted">No restaurant branches are assigned to {user.username} yet. Ask super admin to assign HBK1, HBK2, HBK3 or other branches.</p>
          </div>
        ) : (
          <>
            <div className="filters">
              <div className="filter dates">
                <label>
                  From
                  <input type="date" value={from} onChange={e => changeFrom(e.target.value)} />
                </label>
                <label>
                  To
                  <input type="date" value={to} onChange={e => changeTo(e.target.value)} />
                </label>
              </div>
              <div className="date-presets">
                <button type="button" className={`check${preset === 'month' ? ' on' : ''}`} onClick={() => applyPreset('month')}>This month</button>
                <button type="button" className={`check${preset === '7d' ? ' on' : ''}`} onClick={() => applyPreset('7d')}>Last 7 days</button>
                <button type="button" className={`check${preset === 'all' ? ' on' : ''}`} onClick={() => applyPreset('all')}>All time</button>
              </div>
              <label className="filter">
                <PinIcon />
                <select value={branchId} onChange={e => setBranchId(e.target.value)}>
                  <option value="all">All assigned branches</option>
                  {mine.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            </div>

            <div className="kpis">
              <article className="kpi">
                <div className="kpi-label">Smile Score <SmileIcon /></div>
                <div className="kpi-value">{now.total ? Math.round(now.smile) : '—'}</div>
                <p className={`kpi-delta ${smileDelta.dir}`}>{smileDelta.dir === 'down' ? '↘' : smileDelta.dir === 'up' ? '↗' : '→'} {smileDelta.text} vs previous period</p>
              </article>
              <article className="kpi">
                <div className="kpi-label">Submissions <ChatIcon /></div>
                <div className="kpi-value">{now.total}</div>
                <p className={`kpi-delta ${subDelta.dir}`}>{subDelta.dir === 'down' ? '↘' : subDelta.dir === 'up' ? '↗' : '→'} {subDelta.text} vs previous period</p>
              </article>
              <article className="kpi">
                <div className="kpi-label">Terrible <WarnIcon /></div>
                <div className="kpi-value">{now.terrible}</div>
                <p className={`kpi-delta ${terribleDelta.dir}`}>{terribleDelta.dir === 'down' ? '↘' : terribleDelta.dir === 'up' ? '↗' : '→'} {terribleDelta.text} vs previous period</p>
              </article>
              <article className="kpi">
                <div className="kpi-label">Positive</div>
                <div className="kpi-value">{now.positive}</div>
                <p className="kpi-delta flat">Excellent and Good</p>
              </article>
            </div>

            <div className="panel">
              <div className="row-head">
                <h2>Smile Score</h2>
                <span className="target">Target: 95</span>
              </div>
              <p className="panel-sub">Excellent · Good · Neutral · Bad · Terrible</p>
              {Object.keys(SMILE).map(label => (
                <div className="bar" key={label}>
                  <span>{label}</span>
                  <div className="track"><div className={`fill r-${label.toLowerCase()}`} style={{ width: `${(now.byRating[label] / maxRating) * 100}%` }} /></div>
                  <b>{now.byRating[label]}</b>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
