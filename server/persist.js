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
  };
  if (kvConfigured()) {
    await kvCommand(['SET', KEY, JSON.stringify(next)]);
    return { shared: true };
  }
  writeFileState(next);
  return { shared: !process.env.VERCEL };
}
