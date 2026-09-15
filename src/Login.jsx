import { useState } from 'react';
import { isSuper, login } from './store';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function submit(e) {
    e.preventDefault();
    const user = login(username, password);
    if (!user) {
      setError('Wrong username or password');
      return;
    }
    window.location.href = isSuper(user) ? '/admin' : '/dashboard';
  }

  return (
    <div className="portal">
      <div className="login-wrap">
        <p className="dash-kicker">Guest Matrix</p>
        <h1 className="login-title">Staff login</h1>
        <p className="login-sub">Super admin creates branches and users. Each user only sees surveys from the branches assigned to them.</p>
        <form className="panel" onSubmit={submit}>
          <label className="field">
            <span>Username</span>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="ibadkhan" autoComplete="username" />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn-primary" type="submit">Sign in</button>
        </form>
        <p className="login-hint">Super admin: <b>superadmin</b> / <b>admin123</b></p>
        <a className="text-link" href="/">Back to guest survey</a>
      </div>
    </div>
  );
}
