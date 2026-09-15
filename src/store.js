import { useEffect, useState } from 'react';

const K = {
  users: 'gm_users',
  branches: 'gm_branches',
  surveys: 'gm_surveys',
  session: 'gm_session',
};

export const SMILE = {
  Excellent: 100,
  Good: 90,
  Neutral: 50,
  Bad: 30,
  Terrible: 0,
};

const listeners = new Set();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  listeners.forEach(fn => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function uid(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export function isSuper(user) {
  return user?.role === 'superadmin' || user?.role === 'admin';
}

export function seed() {
  const users = read(K.users, null);
  if (users == null) {
    write(K.users, [{
      id: 'usr_superadmin',
      username: 'superadmin',
      password: 'admin123',
      role: 'superadmin',
      branchIds: [],
    }]);
  } else {
    const next = users.map(u => {
      if (u.role === 'admin' || u.username === 'admin') {
        return { ...u, role: 'superadmin', username: 'superadmin' };
      }
      return u;
    });
    if (JSON.stringify(next) !== JSON.stringify(users)) write(K.users, next);
  }
  if (read(K.branches, null) == null) write(K.branches, []);
  if (read(K.surveys, null) == null) {
    const old = read('surveys', []);
    write(K.surveys, Array.isArray(old) ? old : []);
  }
}

export function getUsers() {
  return read(K.users, []);
}

export function getBranches() {
  return read(K.branches, []);
}

export function getSurveys() {
  return read(K.surveys, []);
}

export function getSession() {
  const id = read(K.session, null);
  if (!id) return null;
  return getUsers().find(u => u.id === id) || null;
}

export function login(username, password) {
  const name = (username || '').trim().toLowerCase();
  const user = getUsers().find(u => {
    if (u.password !== password) return false;
    if (u.username.toLowerCase() === name) return true;
    return isSuper(u) && (name === 'admin' || name === 'superadmin');
  });
  if (!user) return null;
  write(K.session, user.id);
  return user;
}

export function logout() {
  localStorage.removeItem(K.session);
  listeners.forEach(fn => fn());
}

function tempPassword() {
  return 'welcome' + Math.floor(1000 + Math.random() * 9000);
}

export function createUser({ username, password, branchIds }) {
  const name = (username || '').trim();
  if (!name) return { error: 'Username is required' };
  const pass = (password || '').trim() || tempPassword();
  if (pass.length < 4) return { error: 'Password must be at least 4 characters' };
  const users = getUsers();
  if (users.some(u => u.username.toLowerCase() === name.toLowerCase())) {
    return { error: 'That username already exists' };
  }
  const user = {
    id: uid('usr'),
    username: name,
    password: pass,
    role: 'user',
    branchIds: branchIds || [],
  };
  write(K.users, [...users, user]);
  if ((branchIds || []).length) assignBranches(user.id, branchIds);
  return { user: getUsers().find(u => u.id === user.id) };
}

export function assignBranches(userId, branchIds) {
  const unique = [...new Set(branchIds || [])];
  write(K.users, getUsers().map(u => {
    if (isSuper(u)) return { ...u, branchIds: [] };
    if (u.id === userId) return { ...u, branchIds: unique };
    return { ...u, branchIds: (u.branchIds || []).filter(id => !unique.includes(id)) };
  }));
}

export function ownerOfBranch(branchId) {
  return getUsers().find(u => !isSuper(u) && (u.branchIds || []).includes(branchId)) || null;
}

export function branchesForUser(user) {
  if (!user || isSuper(user)) return [];
  const ids = user.branchIds || [];
  return getBranches().filter(b => ids.includes(b.id));
}

export function surveysForUser(user) {
  const ids = new Set(branchesForUser(user).map(b => b.id));
  return getSurveys().filter(s => ids.has(s.branchId));
}

export function updateUser(id, patch) {
  const users = getUsers();
  if (!users.some(u => u.id === id)) return { error: 'User not found' };
  write(K.users, users.map(u => (u.id === id ? { ...u, ...patch } : u)));
  return { ok: true };
}

export function resetPassword(id) {
  const users = getUsers();
  const target = users.find(u => u.id === id);
  if (!target || isSuper(target)) return { error: 'Cannot reset this account' };
  const password = tempPassword();
  write(K.users, users.map(u => (u.id === id ? { ...u, password } : u)));
  return { password, username: target.username };
}

export function deleteUser(id) {
  const users = getUsers();
  const target = users.find(u => u.id === id);
  if (!target) return { error: 'User not found' };
  if (isSuper(target)) return { error: 'The super admin account cannot be deleted' };
  write(K.users, users.filter(u => u.id !== id));
  const sessionId = read(K.session, null);
  if (sessionId === id) localStorage.removeItem(K.session);
  listeners.forEach(fn => fn());
  return { ok: true };
}

export function createBranch(name) {
  const label = (name || '').trim();
  if (!label) return { error: 'Branch name is required' };
  const branches = getBranches();
  if (branches.some(b => b.name.toLowerCase() === label.toLowerCase())) {
    return { error: 'That branch already exists' };
  }
  const branch = { id: uid('br'), name: label };
  write(K.branches, [...branches, branch]);
  return { branch };
}

export function deleteBranch(id) {
  write(K.branches, getBranches().filter(b => b.id !== id));
  write(K.users, getUsers().map(u => ({
    ...u,
    branchIds: (u.branchIds || []).filter(x => x !== id),
  })));
  return { ok: true };
}

export function experienceOf(answers) {
  const q1 = (answers || []).find(a => a.id === 'q1');
  if (!q1) return null;
  return Array.isArray(q1.value) ? (q1.value[0] || null) : (q1.value || null);
}

export function saveSurvey({ answers, branchId }) {
  const branches = getBranches();
  const branch = branches.find(b => b.id === branchId);
  const experience = experienceOf(answers);
  const survey = {
    id: uid('sbm'),
    at: new Date().toISOString(),
    branchId: branch ? branch.id : null,
    branchName: branch ? branch.name : 'Unassigned',
    experience,
    smile: experience in SMILE ? SMILE[experience] : null,
    answers,
  };
  write(K.surveys, [survey, ...getSurveys()]);
  return survey;
}

export function greeting(username) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${username}`;
}

export function periodRange(preset, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (preset === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const prevEnd = new Date(start);
    prevEnd.setMilliseconds(-1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - 6);
    prevStart.setHours(0, 0, 0, 0);
    return { start, end, prevStart, prevEnd };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(start);
    prevEnd.setMilliseconds(-1);
    return { start, end, prevStart, prevEnd };
  }
  return { start: null, end: null, prevStart: null, prevEnd: null };
}

export function inRange(iso, start, end) {
  if (!start || !end) return true;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export function statsFor(list) {
  const total = list.length;
  const terrible = list.filter(s => s.experience === 'Terrible').length;
  const scores = list.map(s => s.smile).filter(n => typeof n === 'number');
  const smile = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;
  const byRating = Object.fromEntries(Object.keys(SMILE).map(k => [
    k,
    list.filter(s => s.experience === k).length,
  ]));
  const positive = (byRating.Excellent || 0) + (byRating.Good || 0);
  return { total, terrible, smile, byRating, positive };
}

export function useData() {
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump(n => n + 1)), []);
  return {
    users: getUsers(),
    branches: getBranches(),
    surveys: getSurveys(),
    session: getSession(),
  };
}
