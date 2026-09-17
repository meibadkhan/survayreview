import { useEffect, useState } from 'react';
import AdminPanel from './AdminPanel.jsx';
import Dashboard from './Dashboard.jsx';
import Login from './Login.jsx';
import Survey from './Survey.jsx';
import { branchIdFromLocation, isSuper, logout, seed, useData } from './store';

seed();

function pathOf() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const branch = branchIdFromLocation();
  if (path.startsWith('/b/') || (path === '/' && branch)) return 'survey';
  if (path === '/login' || path === '/') return 'login';
  if (path === '/admin') return 'admin';
  if (path === '/dashboard') return 'dashboard';
  return 'survey';
}

function go(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function App() {
  const [path, setPath] = useState(pathOf);
  const { session, ready } = useData();

  useEffect(() => {
    const onPop = () => setPath(pathOf());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if ((path === 'admin' || path === 'dashboard') && !session) {
      go('/login');
    } else if (path === 'admin' && session && !isSuper(session)) {
      go('/dashboard');
    } else if (path === 'dashboard' && session && isSuper(session)) {
      go('/admin');
    }
  }, [path, session, ready]);

  function onLogout() {
    logout();
    go('/login');
  }

  if (!ready && (path === 'admin' || path === 'dashboard')) {
    return (
      <div className="portal">
        <div className="login-wrap">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (path === 'login') return <Login onEnter={go} />;
  if (path === 'admin') {
    if (!session || !isSuper(session)) return null;
    return <AdminPanel user={session} onLogout={onLogout} />;
  }
  if (path === 'dashboard') {
    if (!session || isSuper(session)) return null;
    return <Dashboard user={session} onLogout={onLogout} />;
  }
  return <Survey />;
}
