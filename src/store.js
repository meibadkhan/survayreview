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
let mutating = 0;

const cache = {
  users: [],
  branches: [],
  surveys: [],
  resetAt: null,
  updatedAt: null,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function snapshot() {
  return {
    users: cache.users,
    branches: cache.branches,
    surveys: cache.surveys,
    resetAt: cache.resetAt,
    updatedAt: cache.updatedAt,
  };
}

function persistCache() {
  localStorage.setItem(K.users, JSON.stringify(cache.users));
  localStorage.setItem(K.branches, JSON.stringify(cache.branches));
  localStorage.setItem(K.surveys, JSON.stringify(cache.surveys));
  if (cache.resetAt) localStorage.setItem(K.resetAt, JSON.stringify(cache.resetAt));
  if (cache.updatedAt) localStorage.setItem(K.updatedAt, JSON.stringify(cache.updatedAt));
}

function hydrate() {
  cache.users = read(K.users, []);
  cache.branches = read(K.branches, []);
  cache.surveys = read(K.surveys, []);
  cache.resetAt = read(K.resetAt, null);
  cache.updatedAt = read(K.updatedAt, null);
}

function notify() {
  persistCache();
  listeners.forEach(fn => fn());
}

function applyState(data) {
  if (!data || !Array.isArray(data.users)) return;
  cache.users = data.users;
  cache.branches = data.branches || [];
  cache.surveys = data.surveys || [];
  cache.resetAt = data.resetAt || null;
  cache.updatedAt = data.updatedAt || null;
  shared = data.shared !== false;
  notify();
}

async function callApi(payload, method = 'POST') {
  const res = await fetch('/api/state', {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || 'Save failed');
    err.status = res.status;
    throw err;
  }
  return json;
}

async function mutate(action, extra = {}) {
  mutating += 1;
  try {
    const json = await callApi({ action, ...extra });
    applyState(json);
    return json;
  } catch (err) {
    await pullServer().catch(() => {});
    throw err;
  } finally {
    mutating -= 1;
  }
}

function queueMutate(action, extra = {}) {
  mutate(action, extra).catch(() => {});
}

export async function pullServer() {
  if (mutating) return false;
  try {
    const data = await callApi(null, 'GET');
    shared = true;
    const local = snapshot();
    const remoteEmpty = !(data.branches || []).length
      && !(data.surveys || []).length
      && (data.users || []).length <= 1;
    const localHas = local.branches.length || local.surveys.length || local.users.length > 1;
    if (remoteEmpty && localHas) {
      mutating += 1;
      try {
        const migrated = await callApi({
          action: 'migrate',
          users: local.users,
          branches: local.branches,
          surveys: local.surveys,
        });
        applyState(migrated);
      } finally {
        mutating -= 1;
      }
      return true;
    }
    applyState({ ...data, shared: true });
    return true;
  } catch {
    shared = false;
    notify();
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
  hydrate();
  if (!cache.users.length) {
    cache.users = [{
      id: 'usr_superadmin',
      username: 'superadmin',
      password: 'admin123',
      role: 'superadmin',
      branchIds: [],
    }];
    persistCache();
  }
  pullServer().catch(() => {});
}

export function getUsers() {
  return cache.users;
}

export function getBranches() {
  return cache.branches;
}

export function getSurveys() {
  return cache.surveys;
}

export function getSession() {
  const id = read(K.session, null);
  if (!id) return null;
  return getUsers().find(u => u.id === id) || null;
}

export async function login(username, password) {
  await pullServer();
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
  if (getUsers().some(u => u.username.toLowerCase() === name.toLowerCase())) {
    return { error: 'That username already exists' };
  }
  const user = {
    id: uid('usr'),
    username: name,
    password: pass,
    role: 'user',
    branchIds: branchIds || [],
    updatedAt: nowIso(),
  };
  cache.users = [...cache.users, user];
  notify();
  queueMutate('createUser', { user });
  if ((branchIds || []).length) assignBranches(user.id, branchIds);
  return { user: getUsers().find(u => u.id === user.id) };
}

export function assignBranches(userId, branchIds) {
  const unique = [...new Set(branchIds || [])];
  const at = nowIso();
  cache.users = getUsers().map(u => {
    let next = u;
    if (isSuper(u)) next = { ...u, branchIds: [] };
    else if (u.id === userId) next = { ...u, branchIds: unique };
    else next = { ...u, branchIds: (u.branchIds || []).filter(id => !unique.includes(id)) };
    if (JSON.stringify(next.branchIds || []) === JSON.stringify(u.branchIds || [])) return u;
    return { ...next, updatedAt: at };
  });
  notify();
  queueMutate('assignBranches', { userId, branchIds: unique });
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
  if (!getUsers().some(u => u.id === id)) return { error: 'User not found' };
  cache.users = getUsers().map(u => (u.id === id ? { ...u, ...patch, updatedAt: nowIso() } : u));
  notify();
  queueMutate('updateUser', { id, patch });
  return { ok: true };
}

export function resetPassword(id) {
  const target = getUsers().find(u => u.id === id);
  if (!target || isSuper(target)) return { error: 'Cannot reset this account' };
  const password = tempPassword();
  cache.users = getUsers().map(u => (u.id === id ? { ...u, password, updatedAt: nowIso() } : u));
  notify();
  queueMutate('resetPassword', { id, password });
  return { password, username: target.username };
}

export function deleteUser(id) {
  const target = getUsers().find(u => u.id === id);
  if (!target) return { error: 'User not found' };
  if (isSuper(target)) return { error: 'The super admin account cannot be deleted' };
  cache.users = getUsers().filter(u => u.id !== id);
  const sessionId = read(K.session, null);
  if (sessionId === id) localStorage.removeItem(K.session);
  notify();
  queueMutate('deleteUser', { id });
  return { ok: true };
}

export function createBranch(name) {
  const label = (name || '').trim();
  if (!label) return { error: 'Branch name is required' };
  if (getBranches().some(b => b.name.toLowerCase() === label.toLowerCase())) {
    return { error: 'That branch already exists' };
  }
  const branch = { id: uid('br'), name: label, updatedAt: nowIso() };
  cache.branches = [...cache.branches, branch];
  notify();
  queueMutate('createBranch', { branch });
  return { branch };
}

export function deleteBranch(id) {
  cache.branches = getBranches().filter(b => b.id !== id);
  const at = nowIso();
  cache.users = getUsers().map(u => {
    const branchIds = (u.branchIds || []).filter(x => x !== id);
    if (branchIds.length === (u.branchIds || []).length) return u;
    return { ...u, branchIds, updatedAt: at };
  });
  notify();
  queueMutate('deleteBranch', { id });
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
    updatedAt: nowIso(),
  };
  cache.users = [keep];
  cache.branches = [];
  cache.surveys = [];
  cache.resetAt = nowIso();
  localStorage.setItem(K.session, JSON.stringify(keep.id));
  notify();
  queueMutate('wipe', { keep });
  return { ok: true };
}

export function experienceOf(answers) {
  const q1 = (answers || []).find(a => a.id === 'q1');
  if (!q1) return null;
  return Array.isArray(q1.value) ? (q1.value[0] || null) : (q1.value || null);
}

export function saveSurvey({ answers, branchId }) {
  const branch = getBranches().find(b => b.id === branchId);
  const experience = experienceOf(answers);
  const survey = {
    id: uid('sbm'),
    at: new Date().toISOString(),
    updatedAt: nowIso(),
    branchId: branch ? branch.id : null,
    branchName: branch ? branch.name : 'Unassigned',
    experience,
    smile: experience in SMILE ? SMILE[experience] : null,
    answers,
  };
  cache.surveys = [survey, ...cache.surveys];
  notify();
  queueMutate('saveSurvey', { survey });
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
