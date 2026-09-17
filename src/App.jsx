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

export default function App() {
  const [path, setPath] = useState(pathOf);
  const { session } = useData();

  useEffect(() => {
    const onPop = () => setPath(pathOf());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if ((path === 'admin' || path === 'dashboard') && !session) {
      window.location.replace('/login');
    } else if (path === 'admin' && session && !isSuper(session)) {
      window.location.replace('/dashboard');
    } else if (path === 'dashboard' && session && isSuper(session)) {
      window.location.replace('/admin');
    }
  }, [path, session]);

  function onLogout() {
    logout();
    window.location.href = '/login';
  }

  if (path === 'login') return <Login />;
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
