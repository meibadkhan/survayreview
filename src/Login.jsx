import { useState } from 'react';
import { isSuper, login, useData } from './store';

export default function Login({ onEnter }) {
  const { error: dbError } = useData();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(username, password);
      if (!user) {
        setError('Wrong username or password');
        return;
      }
      const next = isSuper(user) ? '/admin' : '/dashboard';
      if (onEnter) onEnter(next);
      else window.location.href = next;
    } catch {
      setError('Could not reach the database');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal">
      <div className="login-wrap">
        <div className="brand-mark" aria-hidden="true">GM</div>
        <p className="dash-kicker">Guest Matrix</p>
        <h1 className="login-title">Staff login</h1>
        <p className="login-sub">Sign in to view guest feedback for your restaurant.</p>
        <form className="panel" onSubmit={submit}>
          <label className="field">
            <span>Username</span>
            <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          {(error || dbError) && <p className="form-error">{error || dbError}</p>}
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
