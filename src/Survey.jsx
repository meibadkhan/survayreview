import { useEffect, useState } from 'react';
import S from './survey.json';
import { branchIdFromLocation, saveSurvey, useData } from './store';

const codes = ['+92', '+1', '+44', '+971'];
const MAX_SUBS = 2;
const DEVICE_KEY = 'gm_device';
const SUBS_KEY = 'gm_device_subs';

function blank() {
  return Object.fromEntries(S.questions.map(q => [
    q.id,
    q.type === 'choice' ? [] : q.type === 'contact' ? { order: '', code: '+92', phone: '' } : '',
  ]));
}

function visible(answers) {
  return S.questions.filter(q => {
    if (!q.showIf) return true;
    const got = answers[q.showIf.id];
    const arr = Array.isArray(got) ? got : [];
    return q.showIf.any.some(v => arr.includes(v));
  });
}

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = 'de_' + Math.random().toString(16).slice(2) + Date.now().toString(16);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'de_unknown';
  }
}

function readSubs() {
  try {
    return JSON.parse(localStorage.getItem(SUBS_KEY) || '{}');
  } catch {
    return {};
  }
}

function countFor(branchId) {
  if (!branchId) return 0;
  return Number(readSubs()[branchId] || 0);
}

function recordSub(branchId) {
  if (!branchId) return;
  const map = readSubs();
  map[branchId] = Number(map[branchId] || 0) + 1;
  localStorage.setItem(SUBS_KEY, JSON.stringify(map));
}

function Logo({ className = '' }) {
  return (
    <svg className={`logo ${className}`} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="32" fill="#fff4e5" />
      <text x="32" y="40" textAnchor="middle" fontSize="28">🍔</text>
    </svg>
  );
}

function Line({ placeholder, value, onChange }) {
  return (
    <label className="line">
      <span>›</span>
      <input placeholder={placeholder} value={value} onChange={onChange} />
    </label>
  );
}

function Arrow({ dir }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'left'
        ? <path d="M15 6l-6 6 6 6" />
        : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}

function digits(s) {
  return (s || '').replace(/\D/g, '');
}

function phoneOk(s, required) {
  const d = digits(s);
  if (!d) return !required;
  return d.length >= 10 && d.length <= 15;
}

export default function Survey() {
  const { branches } = useData();
  const [branchId] = useState(() => branchIdFromLocation());
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(blank);
  const [done, setDone] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const qs = visible(answers);
  const branch = branches.find(b => b.id === branchId) || null;
  const activeBranchId = branch?.id || '';
  const device = deviceId();

  useEffect(() => {
    if (!branchId) window.location.replace('/login');
    else if (branches.length && !branch) window.location.replace('/login');
  }, [branch, branchId, branches.length]);

  useEffect(() => {
    if (activeBranchId && countFor(activeBranchId) >= MAX_SUBS) setBlocked(true);
  }, [activeBranchId]);

  function pick(q, opt) {
    setAnswers(a => {
      const cur = a[q.id];
      const next = q.isMultiple
        ? (cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt])
        : [opt];
      return { ...a, [q.id]: next };
    });
    if (q.advanceOnPick && !q.isMultiple) setStep(s => s + 1);
  }

  function ready() {
    if (step === 0) return !!branch;
    const q = qs[step - 1];
    if (!q) return true;
    if (q.type === 'contact') return phoneOk(answers[q.id].phone, q.phoneRequired);
    if (q.type === 'text' || q.type === 'input' || q.optional) return true;
    return answers[q.id].length > 0;
  }

  function go(n) {
    const next = step + n;
    if (next > qs.length) {
      if (countFor(activeBranchId) >= MAX_SUBS) {
        setBlocked(true);
        return;
      }
      const survey = saveSurvey({
        branchId: activeBranchId,
        answers: qs.map(q => {
          let value = answers[q.id];
          if (q.type === 'contact') {
            const c = answers[q.id];
            value = [c.order && 'Order ' + c.order, c.phone && (c.code + ' ' + c.phone)].filter(Boolean).join(' · ');
          }
          return { id: q.id, text: q.text, isMultiple: q.isMultiple, value };
        }),
      });
      recordSub(activeBranchId);
      setDone({ id: survey.id, at: survey.at });
    }
    setStep(next);
  }

  let inner;
  if (!branch) {
    inner = null;
  } else if (blocked) {
    inner = (
      <div className="body done">
        <p className="oops">{S.oops}</p>
        <h1>{S.limitTitle}</h1>
        <p className="meta">Device ID: {device}</p>
      </div>
    );
  } else if (step === 0) {
    inner = (
      <>
        <div className="body">
          <p className="sub">{S.welcomeSub}{branch ? ` · ${branch.name}` : ''}</p>
          <h1>{S.welcomeTitle}</h1>
        </div>
        <div className="nav"><button className="next wide" onClick={() => go(1)}>Next <Arrow /></button></div>
      </>
    );
  } else if (step > qs.length) {
    inner = (
      <div className="body done">
        <h1>{S.thanks}</h1>
        <Logo />
        <p className="meta">Survey completed at {new Date(done.at).toLocaleString()}<br />{done.id}</p>
      </div>
    );
  } else {
    const q = qs[step - 1];
    const auto = !!q.advanceOnPick;
    let fields;
    if (q.type === 'text') {
      fields = (
        <textarea
          placeholder={q.placeholder || ''}
          value={answers[q.id]}
          onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
        />
      );
    } else if (q.type === 'input') {
      fields = (
        <div className="fields">
          <Line
            placeholder={q.placeholder || ''}
            value={answers[q.id]}
            onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
          />
        </div>
      );
    } else if (q.type === 'contact') {
      const c = answers[q.id];
      fields = (
        <div className="fields">
          <Line placeholder="Order Number" value={c.order} onChange={e => setAnswers(a => ({ ...a, [q.id]: { ...c, order: e.target.value } }))} />
          <div className="phone">
            <select value={c.code} onChange={e => setAnswers(a => ({ ...a, [q.id]: { ...c, code: e.target.value } }))}>
              {codes.map(x => <option key={x}>{x}</option>)}
            </select>
            <input
              type="tel"
              inputMode="numeric"
              placeholder={q.phoneRequired ? 'Phone Number *' : 'Phone Number'}
              value={c.phone}
              onChange={e => setAnswers(a => ({ ...a, [q.id]: { ...c, phone: digits(e.target.value) } }))}
            />
          </div>
          {c.phone && !phoneOk(c.phone, true) && <p className="hint">Enter a valid phone number</p>}
        </div>
      );
    } else {
      fields = (
        <div className="opts">
          {q.options.map(o => (
            <button type="button" key={o} className={`opt${answers[q.id].includes(o) ? ' on' : ''}`} onClick={() => pick(q, o)}>{o}</button>
          ))}
        </div>
      );
    }
    inner = (
      <>
        <div className="body">
          <Logo />
          <p className="sub">{q.label}</p>
          <h1>{q.text}</h1>
          {fields}
        </div>
        <div className="nav">
          <button className="back" onClick={() => go(-1)}><Arrow dir="left" /> Previous</button>
          {!auto && (
            <button className="next" disabled={!ready()} onClick={() => go(1)}>{step === qs.length ? 'Submit' : 'Next'} <Arrow /></button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className={`page-survey${step === 0 && !blocked ? ' start' : ''}`}>
      {step === 0 && !blocked && <Logo className="out" />}
      <div className="shell">
        <div className="card">{inner}</div>
      </div>
      {step === 0 && !blocked && <p className="visit">Thank You For Visiting Us!</p>}
    </div>
  );
}
