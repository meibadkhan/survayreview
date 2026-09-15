import { useState } from 'react';
import {
  assignBranches,
  createBranch,
  createUser,
  deleteBranch,
  deleteUser,
  ownerOfBranch,
  resetPassword,
  useData,
} from './store';

function surveyLink(branchId) {
  return `${window.location.origin}/?branch=${branchId}`;
}

export default function AdminPanel({ user, onLogout }) {
  const { users, branches, surveys } = useData();
  const [tab, setTab] = useState('branches');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userBranches, setUserBranches] = useState([]);
  const [branchName, setBranchName] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const staff = users.filter(u => u.role === 'user');

  function flash(msg, isError = false) {
    setError(isError ? msg : '');
    setNotice(isError ? '' : msg);
  }

  function toggleBranch(id) {
    setUserBranches(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  function addUser(e) {
    e.preventDefault();
    if (!userBranches.length) return flash('Assign at least one branch to this user', true);
    const res = createUser({ username, password, branchIds: userBranches });
    if (res.error) return flash(res.error, true);
    setUsername('');
    setPassword('');
    setUserBranches([]);
    flash(`Created ${res.user.username} · password ${res.user.password}. Surveys from ${userBranches.length} branch${userBranches.length === 1 ? '' : 'es'} go only to this user.`);
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
              <p className="panel-sub">Add locations such as HBK1, HBK2, HBK3. Then assign one or more of them to a user. Guest surveys from a branch go only to that user.</p>
              <label className="field">
                <span>Branch name</span>
                <input value={branchName} onChange={e => setBranchName(e.target.value)} placeholder="HBK1" />
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
                </div>
              );
            })}
            {!branches.length && <div className="panel"><p className="muted">No branches yet. Add HBK1, HBK2, HBK3, then assign them to a user.</p></div>}
          </>
        )}

        {tab === 'users' && (
          <>
            <form className="panel" onSubmit={addUser}>
              <h2>Create user</h2>
              <p className="panel-sub">Assign multiple branches to one user. Example: give ibadkhan HBK1, HBK2 and HBK3. Only ibadkhan will see those surveys on a greeting dashboard.</p>
              <label className="field">
                <span>Username</span>
                <input value={username} onChange={e => setUsername(e.target.value)} placeholder="ibadkhan" />
              </label>
              <label className="field">
                <span>Password</span>
                <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank to auto-create" />
              </label>
              <div className="field">
                <span>Assign branches (select one or more)</span>
                {!branches.length && <p className="muted">Add branches first, then come back here.</p>}
                <div className="checks">
                  {branches.map(b => {
                    const owner = ownerOfBranch(b.id);
                    const taken = owner && !userBranches.includes(b.id);
                    return (
                      <label key={b.id} className="check">
                        <input type="checkbox" checked={userBranches.includes(b.id)} onChange={() => toggleBranch(b.id)} />
                        {b.name}{taken ? ` · now ${owner.username}` : ''}
                      </label>
                    );
                  })}
                </div>
              </div>
              <button className="btn-primary" type="submit">Create user and assign branches</button>
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
                        {names.length ? names.join(', ') : 'No branches'}
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
                  <div className="checks">
                    {branches.map(b => (
                      <label key={b.id} className="check">
                        <input
                          type="checkbox"
                          checked={(u.branchIds || []).includes(b.id)}
                          onChange={e => setUserBranch(u.id, b.id, e.target.checked)}
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
                  {!branches.length && <p className="muted">No branches yet.</p>}
                </div>
              );
            })}
            {!staff.length && <div className="panel"><p className="muted">No users yet. Create a user and assign HBK1, HBK2, HBK3 to them.</p></div>}
          </>
        )}

        <p className="signed-as">Signed in as super admin {user.username}</p>
      </div>
    </div>
  );
}
