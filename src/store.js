import { useEffect, useState } from 'react';

const K = {
  users: 'gm_users',
  branches: 'gm_branches',
  surveys: 'gm_surveys',
  session: 'gm_session',
  resetAt: 'gm_resetAt',
  updatedAt: 'gm_updatedAt',
};

export const SMILE = {
  Excellent: 100,
  Good: 90,
  Neutral: 50,
  Bad: 30,
  Terrible: 0,
};

const listeners = new Set();
let shared = false;
let persistTimer = 0;
let syncRev = 0;
let pendingSave = false;
let persistLock = Promise.resolve();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function snapshot() {
  return {
    users: read(K.users, []),
    branches: read(K.branches, []),
    surveys: read(K.surveys, []),
    resetAt: read(K.resetAt, null),
    updatedAt: read(K.updatedAt, null),
  };
}

function coreState(data) {
  return JSON.stringify({
    users: data.users || [],
    branches: data.branches || [],
    surveys: data.surveys || [],
    resetAt: data.resetAt || null,
  });
}

function markDirty() {
  syncRev += 1;
  pendingSave = true;
  localStorage.setItem(K.updatedAt, JSON.stringify(new Date().toISOString()));
}

function applyRemote(data) {
  if (!data || !Array.isArray(data.users)) return;
  if (pendingSave) return;
  const next = {
    users: data.users,
    branches: data.branches || [],
    surveys: data.surveys || [],
    resetAt: data.resetAt || null,
    updatedAt: data.updatedAt || null,
  };
  if (coreState(snapshot()) === coreState(next)) {
    shared = !!data.shared;
    return;
  }
  localStorage.setItem(K.users, JSON.stringify(next.users));
  localStorage.setItem(K.branches, JSON.stringify(next.branches));
  localStorage.setItem(K.surveys, JSON.stringify(next.surveys));
  if (next.resetAt) localStorage.setItem(K.resetAt, JSON.stringify(next.resetAt));
  if (next.updatedAt) localStorage.setItem(K.updatedAt, JSON.stringify(next.updatedAt));
  shared = !!data.shared;
  listeners.forEach(fn => fn());
}

function write(key, value, immediate = false) {
  markDirty();
  localStorage.setItem(key, JSON.stringify(value));
  listeners.forEach(fn => fn());
  if (immediate) {
    clearTimeout(persistTimer);
    persistTimer = 0;
    persistFull().catch(() => {});
  } else {
    queuePersist();
  }
}

function queuePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = 0;
    persistFull().catch(() => {});
  }, 250);
}

async function persistFull() {
  persistLock = persistLock.then(runPersist, runPersist);
  return persistLock;
}

async function runPersist() {
  const rev = syncRev;
  try {
    const res = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot()),
    });
    if (!res.ok) {
      queuePersist();
      return;
    }
    const json = await res.json();
    shared = !!json.shared;
    if (syncRev === rev) pendingSave = false;
    else await runPersist();
  } catch {
    shared = false;
    queuePersist();
  }
}

export async function pullServer() {
  if (pendingSave || persistTimer) return false;
  const rev = syncRev;
  try {
    const res = await fetch('/api/state');
    if (!res.ok) return false;
    const data = await res.json();
    if (pendingSave || persistTimer || syncRev !== rev) return false;
    shared = !!data.shared;
    const local = snapshot();
    const remoteEmpty = (data.users || []).length <= 1 && !(data.branches || []).length && !(data.surveys || []).length;
    const localHas = local.users.length > 1 || local.branches.length || local.surveys.length;
    if (remoteEmpty && !data.resetAt && localHas) {
      pendingSave = true;
      await persistFull();
      return true;
    }
    applyRemote({ ...data, shared });
    return true;
  } catch {
    shared = false;
    return false;
  }
}

export function isShared() {
  return shared;
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

export function surveyPath(branchId) {
  return `/b/${encodeURIComponent(branchId)}`;
}

export function surveyLink(branchId) {
  return `${window.location.origin}${surveyPath(branchId)}`;
}

export function branchIdFromLocation(loc = window.location) {
  const path = (loc.pathname || '').replace(/\/+$/, '') || '/';
  const fromPath = path.match(/^\/b\/([^/]+)$/);
  if (fromPath) return decodeURIComponent(fromPath[1]);
  return new URLSearchParams(loc.search).get('branch') || '';
}

export function seed() {
  const users = read(K.users, null);
  if (users == null) {
    localStorage.setItem(K.users, JSON.stringify([{
      id: 'usr_superadmin',
      username: 'superadmin',
      password: 'admin123',
      role: 'superadmin',
      branchIds: [],
    }]));
  } else {
    const next = users.map(u => {
      if (u.role === 'admin' || u.username === 'admin') {
        return { ...u, role: 'superadmin', username: 'superadmin' };
      }
      return u;
    });
    if (JSON.stringify(next) !== JSON.stringify(users)) {
      localStorage.setItem(K.users, JSON.stringify(next));
    }
  }
  if (read(K.branches, null) == null) localStorage.setItem(K.branches, '[]');
  if (read(K.surveys, null) == null) {
    const old = read('surveys', []);
    localStorage.setItem(K.surveys, JSON.stringify(Array.isArray(old) ? old : []));
  }
  pullServer().then(ok => {
    if (!ok) persistFull().catch(() => {});
  });
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
  localStorage.setItem(K.session, JSON.stringify(user.id));
  listeners.forEach(fn => fn());
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
  const pass = (password || '').trim();
  if (!pass) return { error: 'Password is required' };
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
  write(K.users, [...users, user], true);
  if ((branchIds || []).length) assignBranches(user.id, branchIds);
  return { user: getUsers().find(u => u.id === user.id) };
}

export function assignBranches(userId, branchIds) {
  const unique = [...new Set(branchIds || [])];
  write(K.users, getUsers().map(u => {
    if (isSuper(u)) return { ...u, branchIds: [] };
    if (u.id === userId) return { ...u, branchIds: unique };
    return { ...u, branchIds: (u.branchIds || []).filter(id => !unique.includes(id)) };
  }), true);
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
  write(K.users, users.filter(u => u.id !== id), true);
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
  write(K.branches, [...branches, branch], true);
  return { branch };
}

export function deleteBranch(id) {
  write(K.branches, getBranches().filter(b => b.id !== id), true);
  write(K.users, getUsers().map(u => ({
    ...u,
    branchIds: (u.branchIds || []).filter(x => x !== id),
  })), true);
  return { ok: true };
}

export function clearAllData(actor) {
  if (!isSuper(actor)) return { error: 'Not allowed' };
  const current = getUsers().find(u => u.id === actor.id) || actor;
  const keep = {
    id: current.id,
    username: current.username,
    password: current.password,
    role: 'superadmin',
    branchIds: [],
  };
  markDirty();
  localStorage.setItem(K.users, JSON.stringify([keep]));
  localStorage.setItem(K.branches, JSON.stringify([]));
  localStorage.setItem(K.surveys, JSON.stringify([]));
  localStorage.setItem(K.resetAt, JSON.stringify(new Date().toISOString()));
  localStorage.setItem(K.session, JSON.stringify(keep.id));
  listeners.forEach(fn => fn());
  clearTimeout(persistTimer);
  persistTimer = 0;
  persistFull().catch(() => {});
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
  fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ survey }),
  }).then(async res => {
    if (!res.ok) return;
    const json = await res.json();
    shared = !!json.shared;
  }).catch(() => {});
  return survey;
}

export function greeting(username) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${username}`;
}

export function periodRange(preset, now = new Date(), custom = {}) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (preset === 'custom' && custom.from && custom.to) {
    const start = new Date(`${custom.from}T00:00:00`);
    const stop = new Date(`${custom.to}T23:59:59.999`);
    const from = start <= stop ? start : stop;
    const to = start <= stop ? stop : start;
    const span = to.getTime() - from.getTime();
    const prevEnd = new Date(from.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - span);
    return { start: from, end: to, prevStart, prevEnd };
  }
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

export function answerValue(survey, id) {
  const a = (survey.answers || []).find(x => x.id === id);
  if (!a || a.value == null) return '';
  if (Array.isArray(a.value)) return a.value.filter(Boolean).join(', ');
  if (typeof a.value === 'object') {
    const c = a.value;
    return [c.order && 'Order ' + c.order, c.phone && ((c.code || '') + ' ' + c.phone).trim()]
      .filter(Boolean)
      .join(' · ');
  }
  return String(a.value).trim();
}

export function commentDetails(survey) {
  const food = answerValue(survey, 'q9');
  const comment = answerValue(survey, 'q4');
  const raw = answerValue(survey, 'q5') || answerValue(survey, 'q10');
  let order = '';
  let phone = '';
  String(raw).split(' · ').forEach(part => {
    const bit = part.trim();
    if (!bit) return;
    if (bit.toLowerCase().startsWith('order ')) order = bit.slice(6).trim();
    else phone = bit;
  });
  return { food, comment, order, phone };
}

export function commentSubmissions(list) {
  return list.filter(s => {
    const d = commentDetails(s);
    return d.food || d.comment || d.order || d.phone;
  });
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
  useEffect(() => {
    pullServer();
    const t = setInterval(pullServer, 8000);
    return () => clearInterval(t);
  }, []);
  return {
    users: getUsers(),
    branches: getBranches(),
    surveys: getSurveys(),
    session: getSession(),
    shared: isShared(),
  };
}
