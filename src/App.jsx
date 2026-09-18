import { lazy, Suspense, useEffect, useState } from 'react';
import Survey from './Survey.jsx';
import { branchIdFromLocation, isSuper, logout, seed, useData } from './store';

const Login = lazy(() => import('./Login.jsx'));
const AdminPanel = lazy(() => import('./AdminPanel.jsx'));
const Dashboard = lazy(() => import('./Dashboard.jsx'));

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

function StaffRoutes({ path }) {
  const { session, ready } = useData();

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

  if (path === 'login') {
    return (
      <Suspense fallback={null}>
        <Login onEnter={go} />
      </Suspense>
    );
  }
  if (path === 'admin') {
    if (!session || !isSuper(session)) return null;
    return (
      <Suspense fallback={null}>
        <AdminPanel user={session} onLogout={onLogout} />
      </Suspense>
    );
  }
  if (path === 'dashboard') {
    if (!session || isSuper(session)) return null;
    return (
      <Suspense fallback={null}>
        <Dashboard user={session} onLogout={onLogout} />
      </Suspense>
    );
  }
  return <Survey />;
}

export default function App() {
  const [path, setPath] = useState(pathOf);

  useEffect(() => {
    const onPop = () => setPath(pathOf());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (path === 'survey') return <Survey />;
  return <StaffRoutes path={path} />;
}
