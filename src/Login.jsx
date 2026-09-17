import { useState } from 'react';
import { isSuper, login } from './store';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const user = await login(username, password);
      if (!user) {
        setError('Wrong username or password');
        return;
      }
      window.location.href = isSuper(user) ? '/admin' : '/dashboard';
    } catch {
      setError('Could not reach the database');
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
          {error && <p className="form-error">{error}</p>}
          <button className="btn-primary" type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}
