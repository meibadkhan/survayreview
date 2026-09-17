import fs from 'fs';
import path from 'path';

const KEY = 'gm_state';

export function emptyState() {
  return {
    users: [{
      id: 'usr_superadmin',
      username: 'superadmin',
      password: 'admin123',
      role: 'superadmin',
      branchIds: [],
    }],
    branches: [],
    surveys: [],
    resetAt: null,
    updatedAt: null,
    removed: { users: {}, branches: {}, surveys: {} },
  };
}

function stamp(item) {
  return Date.parse(item?.updatedAt || item?.at || 0) || 0;
}

function mergeRemoved(a = {}, b = {}) {
  const out = { ...a };
  Object.entries(b || {}).forEach(([id, ts]) => {
    if (!out[id] || Date.parse(ts) >= Date.parse(out[id])) out[id] = ts;
  });
  return out;
}

function mergeList(a = [], b = []) {
  const map = new Map();
  [...a, ...b].forEach(item => {
    if (!item?.id) return;
    const prev = map.get(item.id);
    if (!prev || stamp(item) >= stamp(prev)) map.set(item.id, item);
  });
  return [...map.values()];
}

function applyRemoved(list, removed = {}) {
  return (list || []).filter(item => {
    const ts = removed[item.id];
    if (!ts) return true;
    return stamp(item) > Date.parse(ts);
  });
}

export function mergeState(current, incoming) {
  if (!incoming) return current;
  const incomingReset = incoming.resetAt || null;
  const currentReset = current.resetAt || null;
  if (incomingReset && (!currentReset || incomingReset > currentReset)) {
    return {
      users: incoming.users || [],
      branches: incoming.branches || [],
      surveys: incoming.surveys || [],
      resetAt: incomingReset,
      updatedAt: incoming.updatedAt || new Date().toISOString(),
      removed: incoming.removed || { users: {}, branches: {}, surveys: {} },
    };
  }
  const removed = {
    users: mergeRemoved(current.removed?.users, incoming.removed?.users),
    branches: mergeRemoved(current.removed?.branches, incoming.removed?.branches),
    surveys: mergeRemoved(current.removed?.surveys, incoming.removed?.surveys),
  };
  return {
    users: applyRemoved(mergeList(current.users, incoming.users), removed.users),
    branches: applyRemoved(mergeList(current.branches, incoming.branches), removed.branches),
    surveys: applyRemoved(mergeList(current.surveys, incoming.surveys), removed.surveys)
      .sort((x, y) => String(y.at || '').localeCompare(String(x.at || ''))),
    resetAt: currentReset || incomingReset,
    updatedAt: incoming.updatedAt || current.updatedAt || new Date().toISOString(),
    removed,
  };
}

export function kvConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kvCommand(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) return null;
  return res.json();
}

function filePath() {
  const dir = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), '.data');
  return path.join(dir, 'state.json');
}

function readFileState() {
  try {
    return JSON.parse(fs.readFileSync(filePath(), 'utf8'));
  } catch {
    return null;
  }
}

function writeFileState(state) {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state));
}

export async function loadState() {
  if (kvConfigured()) {
    const json = await kvCommand(['GET', KEY]);
    const raw = json?.result;
    if (!raw) return emptyState();
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  return readFileState() || emptyState();
}

export async function saveState(state) {
  const next = {
    users: state.users || [],
    branches: state.branches || [],
    surveys: state.surveys || [],
    resetAt: state.resetAt || null,
    updatedAt: state.updatedAt || null,
    removed: state.removed || { users: {}, branches: {}, surveys: {} },
  };
  if (kvConfigured()) {
    await kvCommand(['SET', KEY, JSON.stringify(next)]);
    return { shared: true };
  }
  writeFileState(next);
  return { shared: !process.env.VERCEL };
}

function sameIds(a = [], b = []) {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map(item => item.id));
  return b.every(item => ids.has(item.id));
}

export async function mergeAndSave(incoming) {
  let next = mergeState(await loadState(), incoming);
  let saved = await saveState(next);
  const after = await loadState();
  const again = mergeState(after, incoming);
  if (
    !sameIds(after.users, again.users) ||
    !sameIds(after.branches, again.branches) ||
    !sameIds(after.surveys, again.surveys)
  ) {
    next = again;
    saved = await saveState(next);
  }
  return { next, saved };
}
