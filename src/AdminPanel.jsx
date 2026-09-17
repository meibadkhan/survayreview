import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  assignBranches,
  clearAllData,
  createBranch,
  createUser,
  deleteBranch,
  deleteUser,
  ownerOfBranch,
  resetPassword,
  surveyLink,
  useData,
} from './store';

function fileSafe(name) {
  return String(name || 'branch').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function BranchQr({ url, name }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#111827', light: '#ffffff' },
    }).then(data => {
      if (live) setSrc(data);
    }).catch(() => {
      if (live) setSrc('');
    });
    return () => { live = false; };
  }, [url]);

  function downloadQr() {
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `${fileSafe(name)}-survey-qr.png`;
    a.click();
  }

  function printQr() {
    if (!src) return;
    const w = window.open('', '_blank', 'width=480,height=680');
    if (!w) return;
    w.document.write(`<!doctype html><title>${escapeHtml(name)} survey QR</title>
      <body style="font-family:system-ui,sans-serif;text-align:center;padding:32px;color:#111827">
        <p style="letter-spacing:.08em;text-transform:uppercase;font-size:12px;color:#6b7280;margin:0 0 8px">Guest Matrix</p>
        <h1 style="margin:0 0 8px;font-size:28px">${escapeHtml(name)}</h1>
        <p style="margin:0 0 20px;color:#4b5563">Scan to open this branch survey</p>
        <img src="${src}" width="280" height="280" alt="${escapeHtml(name)} survey QR" />
        <p style="word-break:break-all;font-size:12px;color:#6b7280;margin-top:16px">${escapeHtml(url)}</p>
      </body>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="qr-row">
      {src
        ? <img className="qr-img" src={src} width={168} height={168} alt={`${name} survey QR code`} />
        : <div className="qr-img" />}
      <div className="qr-actions">
        <p className="muted">Guests scan this code to open the {name} survey.</p>
        <button type="button" className="ghost-btn" onClick={downloadQr}>Download QR</button>
        <button type="button" className="ghost-btn" onClick={printQr}>Print QR</button>
      </div>
    </div>
  );
}

function BranchPicks({ branches, selectedIds, onToggle }) {
  return (
    <div className="checks">
      {branches.map(b => {
        const on = selectedIds.includes(b.id);
        const owner = ownerOfBranch(b.id);
        const taken = owner && !on;
        return (
          <button
            type="button"
            key={b.id}
            className={`check${on ? ' on' : ''}`}
            onClick={() => onToggle(b.id, !on)}
          >
            {b.name}{taken ? ` · ${owner.username}` : ''}
          </button>
        );
      })}
    </div>
  );
}

export default function AdminPanel({ user, onLogout }) {
  const { users, branches, surveys } = useData();
  const [tab, setTab] = useState('branches');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [branchName, setBranchName] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [wipeText, setWipeText] = useState('');

  const staff = users.filter(u => u.role === 'user');

  function flash(msg, isError = false) {
    setError(isError ? msg : '');
    setNotice(isError ? '' : msg);
  }

  function addUser(e) {
    e.preventDefault();
    const res = createUser({ username, password, branchIds: [] });
    if (res.error) return flash(res.error, true);
    setUsername('');
    setPassword('');
    flash(`Created ${res.user.username}. Now tap branches one by one below to assign them.`);
  }

  function addBranch(e) {
    e.preventDefault();
    const res = createBranch(branchName);
    if (res.error) return flash(res.error, true);
    setBranchName('');
    flash(`Added ${res.branch.name}`);
  }

  async function copyLink(id) {
    const url = surveyLink(id);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this survey link', url);
    }
    setCopied(id);
    setTimeout(() => setCopied(''), 1600);
  }

  function wipeAll() {
    if (wipeText !== 'DELETE') return flash('Type DELETE to confirm', true);
    if (!window.confirm('Delete all branches, users, comments and surveys? Your login will stay.')) return;
    const res = clearAllData(user);
    if (res.error) return flash(res.error, true);
    setWipeText('');
    flash('All branches, users, comments and surveys were deleted.');
  }

  function setUserBranch(userId, branchId, on) {
    const target = users.find(u => u.id === userId);
    if (!target) return;
    const next = on
      ? [...new Set([...(target.branchIds || []), branchId])]
      : (target.branchIds || []).filter(x => x !== branchId);
    assignBranches(userId, next);
  }

  return (
    <div className="portal">
      <div className="portal-inner">
        <header className="portal-top">
          <div>
            <p className="dash-kicker">Super admin</p>
            <h1>Create branches and users</h1>
          </div>
          <button className="ghost-btn" onClick={onLogout}>Log out</button>
        </header>

        <div className="tabs">
          {['branches', 'users'].map(id => (
            <button key={id} className={`tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
              {id[0].toUpperCase() + id.slice(1)}
            </button>
          ))}
        </div>

        {(notice || error) && <p className={error ? 'form-error' : 'form-ok'}>{error || notice}</p>}

        {tab === 'branches' && (
          <>
            <form className="panel" onSubmit={addBranch}>
              <h2>Add restaurant branch</h2>
              <p className="panel-sub">Add a location. Each branch gets its own survey link and QR code. Create QRs from your live site so phones open the public URL, not localhost.</p>
              <label className="field">
                <span>Branch name</span>
                <input value={branchName} onChange={e => setBranchName(e.target.value)} placeholder="Branch name" />
              </label>
              <button className="btn-primary" type="submit">Add branch</button>
            </form>
            {branches.map(b => {
              const count = surveys.filter(s => s.branchId === b.id).length;
              const owner = ownerOfBranch(b.id);
              return (
                <div className="panel" key={b.id}>
                  <div className="row-head">
                    <div>
                      <h2>{b.name}</h2>
                      <p className="muted">
                        {count === 1 ? '1 submission' : `${count} submissions`}
                        {' · '}
                        {owner ? `Goes only to ${owner.username}` : 'Not assigned yet'}
                      </p>
                    </div>
                    <button className="danger-btn" onClick={() => deleteBranch(b.id)}>Remove</button>
                  </div>
                  <div className="link-row">
                    <code>{surveyLink(b.id)}</code>
                    <button className="ghost-btn" onClick={() => copyLink(b.id)}>{copied === b.id ? 'Copied' : 'Copy survey link'}</button>
                  </div>
                  <BranchQr url={surveyLink(b.id)} name={b.name} />
                </div>
              );
            })}
            {!branches.length && <div className="panel"><p className="muted">No branches yet. Add a location, then assign it to a user.</p></div>}
          </>
        )}

        {tab === 'users' && (
          <>
            <form className="panel" onSubmit={addUser}>
              <h2>Create user</h2>
              <p className="panel-sub">First create a username and password. After the user is created, tap each branch below one by one to assign it. Selected branches stay highlighted.</p>
              <label className="field">
                <span>Username</span>
                <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
              </label>
              <label className="field">
                <span>Password</span>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter a password" />
              </label>
              <button className="btn-primary" type="submit">Create user</button>
            </form>

            {staff.map(u => {
              const names = branches.filter(b => (u.branchIds || []).includes(b.id)).map(b => b.name);
              const count = surveys.filter(s => (u.branchIds || []).includes(s.branchId)).length;
              return (
                <div className="panel" key={u.id}>
                  <div className="row-head">
                    <div>
                      <h2>{u.username}</h2>
                      <p className="muted">
                        {names.length ? names.join(', ') : 'Tap branches below to assign'}
                        {' · '}
                        {count === 1 ? '1 survey goes only to this user' : `${count} surveys go only to this user`}
                      </p>
                    </div>
                    <div className="portal-actions">
                      <button className="ghost-btn" onClick={() => {
                        const res = resetPassword(u.id);
                        if (res.error) return flash(res.error, true);
                        flash(`New password for ${res.username}: ${res.password}`);
                      }}>New password</button>
                      <button className="danger-btn" onClick={() => deleteUser(u.id)}>Remove</button>
                    </div>
                  </div>
                  <p className="panel-sub">Tap a branch to assign or remove it for {u.username}.</p>
                  {!!branches.length && (
                    <BranchPicks
                      branches={branches}
                      selectedIds={u.branchIds || []}
                      onToggle={(id, on) => setUserBranch(u.id, id, on)}
                    />
                  )}
                  {!branches.length && <p className="muted">No branches yet.</p>}
                </div>
              );
            })}
            {!staff.length && <div className="panel"><p className="muted">No users yet. Create a username and password, then assign branches.</p></div>}
          </>
        )}

        <form className="panel danger-panel" onSubmit={e => { e.preventDefault(); wipeAll(); }}>
          <h2>Delete all data</h2>
          <p className="panel-sub">Removes every branch, user, comment, and survey from this app. Your super admin login stays so you can set things up again.</p>
          <label className="field">
            <span>Type DELETE to confirm</span>
            <input value={wipeText} onChange={e => setWipeText(e.target.value)} placeholder="DELETE" autoComplete="off" />
          </label>
          <button className="danger-btn wide" type="submit">Delete everything</button>
        </form>

        <p className="signed-as">Signed in as {user.username}</p>
      </div>
    </div>
  );
}
