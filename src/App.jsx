import { useState } from 'react';
import S from './survey.json';

const codes = ['+92', '+1', '+44', '+971'];

function blank() {
  return Object.fromEntries(S.questions.map(q => [
    q.id,
    q.type === 'choice' ? [] : q.type === 'contact' ? { order: '', code: '+92', phone: '' } : ''
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

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 64 64">
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

function Survey() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(blank);
  const [done, setDone] = useState(null);
  const qs = visible(answers);

  function pick(q, opt) {
    setAnswers(a => {
      const cur = a[q.id];
      const next = q.isMultiple
        ? (cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt])
        : [opt];
      return { ...a, [q.id]: next };
    });
  }

  function ready() {
    if (step === 0) return true;
    const q = qs[step - 1];
    if (!q) return true;
    if (q.type === 'contact') return phoneOk(answers[q.id].phone, q.phoneRequired);
    if (q.type === 'text' || q.type === 'input' || q.optional) return true;
    return answers[q.id].length > 0;
  }

  function go(n) {
    const next = step + n;
    if (next > qs.length) {
      const id = 'sbm_' + Math.random().toString(16).slice(2) + Date.now().toString(16);
      const at = new Date().toISOString();
      const list = JSON.parse(localStorage.getItem('surveys') || '[]');
      list.unshift({
        id, at,
        answers: qs.map(q => {
          let value = answers[q.id];
          if (q.type === 'contact') {
            const c = answers[q.id];
            value = [c.order && 'Order ' + c.order, c.phone && (c.code + ' ' + c.phone)].filter(Boolean).join(' · ');
          }
          return { id: q.id, text: q.text, isMultiple: q.isMultiple, value };
        })
      });
      localStorage.setItem('surveys', JSON.stringify(list));
      setDone({ id, at });
    }
    setStep(next);
  }

  let inner;
  if (step === 0) {
    inner = (
      <>
        <div className="body">
          <Logo />
          <p className="sub">{S.welcomeSub}</p>
          <h1>{S.welcomeTitle}</h1>
        </div>
        <div className="nav"><button className="next wide" onClick={() => go(1)}>Next <Arrow /></button></div>
      </>
    );
  } else if (step > qs.length) {
    inner = (
      <div className="body">
        <h1>{S.thanks}</h1>
        <Logo />
        <p className="meta">Survey completed at {new Date(done.at).toLocaleString()}<br />{done.id}</p>
      </div>
    );
  } else {
    const q = qs[step - 1];
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
            <div key={o} className={`opt${answers[q.id].includes(o) ? ' on' : ''}`} onClick={() => pick(q, o)}>{o}</div>
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
          <button className="next" disabled={!ready()} onClick={() => go(1)}>{step === qs.length ? 'Submit' : 'Next'} <Arrow /></button>
        </div>
      </>
    );
  }

  return (
    <div className="page-survey">
      <div className="shell">
        <div className="card">{inner}</div>
      </div>
    </div>
  );
}

function Admin() {
  const list = JSON.parse(localStorage.getItem('surveys') || '[]');
  const qMap = {};
  list.forEach(s => s.answers.forEach(a => {
    if (!qMap[a.id]) qMap[a.id] = { text: a.text, counts: {}, comments: [] };
    if (typeof a.value === 'string') { if (a.value) qMap[a.id].comments.push(a.value); }
    else (a.value || []).forEach(v => { qMap[a.id].counts[v] = (qMap[a.id].counts[v] || 0) + 1; });
  }));

  return (
    <div className="page-admin">
      <div className="wrap">
        <h1>CrispyGo Admin</h1>
        <p className="top">{list.length} responses · <a href="/">Back to survey</a></p>
        {!list.length && <div className="box">No responses yet.</div>}
        {Object.values(qMap).map(q => {
          const max = Math.max(1, ...Object.values(q.counts));
          return (
            <div className="box" key={q.text}>
              <h2>{q.text}</h2>
              {Object.entries(q.counts).map(([k, n]) => (
                <div className="bar" key={k}>
                  <span>{k}</span>
                  <div className="track"><div className="fill" style={{ width: `${n / max * 100}%` }} /></div>
                  <b>{n}</b>
                </div>
              ))}
              {q.comments.map((c, i) => <div className="row" key={i}>{c}</div>)}
            </div>
          );
        })}
        {!!list.length && (
          <div className="box">
            <h2>All submissions</h2>
            {list.map(s => (
              <div className="row" key={s.id}>
                <b>{new Date(s.at).toLocaleString()}</b>
                <div className="id">{s.id}</div>
                {s.answers.map(a => {
                  const v = Array.isArray(a.value) ? a.value.join(', ') : a.value;
                  return v ? <span key={a.id}>{a.text}: {v}<br /></span> : null;
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return window.location.pathname.includes('admin') ? <Admin /> : <Survey />;
}
