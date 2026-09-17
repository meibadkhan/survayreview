import dns from 'dns';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { MongoClient } from 'mongodb';

dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

const DB_NAME = process.env.MONGODB_DB || 'guestmatrix';
const META_ID = 'app';

function loadLocalEnv() {
  if (process.env.MONGODB_URI) return;
  for (const file of ['.env.local', '.env']) {
    try {
      const text = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      for (const line of text.split('\n')) {
        const row = line.trim();
        if (!row || row.startsWith('#')) continue;
        const i = row.indexOf('=');
        if (i < 1) continue;
        const key = row.slice(0, i).trim();
        let value = row.slice(i + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"'))
          || (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
      }
    } catch {
      /* missing env file is fine */
    }
  }
}

loadLocalEnv();

function mongoUri() {
  return process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || '';
}

export function mongoConfigured() {
  return !!mongoUri();
}

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
  };
}

function nowIso() {
  return new Date().toISOString();
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function plain(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

function plainList(docs) {
  return (docs || []).map(plain);
}

const globalCache = globalThis;
if (!globalCache.__gmMongo) {
  globalCache.__gmMongo = { client: null, promise: null, indexed: false };
}

async function getDb() {
  const uri = mongoUri();
  if (!uri) throw httpError(500, 'MongoDB is not configured');
  const cache = globalCache.__gmMongo;
  if (!cache.promise) {
    cache.client = new MongoClient(uri, {
      maxPoolSize: 1,
      minPoolSize: 0,
      maxIdleTimeMS: 15000,
      serverSelectionTimeoutMS: 12000,
      connectTimeoutMS: 12000,
      tls: true,
    });
    cache.promise = cache.client.connect().catch(err => {
      cache.promise = null;
      cache.client = null;
      throw err;
    });
  }
  const client = await cache.promise;
  return client.db(DB_NAME);
}

async function collections() {
  const database = await getDb();
  if (!globalCache.__gmMongo.indexed) {
    await Promise.all([
      database.collection('users').createIndex({ id: 1 }, { unique: true }),
      database.collection('users').createIndex({ username: 1 }, { unique: true }),
      database.collection('branches').createIndex({ id: 1 }, { unique: true }),
      database.collection('surveys').createIndex({ id: 1 }, { unique: true }),
      database.collection('surveys').createIndex({ at: -1 }),
    ]).catch(() => {});
    globalCache.__gmMongo.indexed = true;
  }
  return {
    users: database.collection('users'),
    branches: database.collection('branches'),
    surveys: database.collection('surveys'),
    meta: database.collection('meta'),
  };
}

async function ensureSeed(cols) {
  const count = await cols.users.countDocuments();
  if (count) return;
  const seed = emptyState().users[0];
  await cols.users.insertOne({ ...seed, updatedAt: nowIso() });
}

async function touchMeta(cols, extra = {}) {
  const updatedAt = nowIso();
  await cols.meta.updateOne(
    { _id: META_ID },
    { $set: { ...extra, updatedAt } },
    { upsert: true },
  );
  return updatedAt;
}

async function loadMongoState() {
  const cols = await collections();
  await ensureSeed(cols);
  const [users, branches, surveys, meta] = await Promise.all([
    cols.users.find({}, { projection: { _id: 0 } }).toArray(),
    cols.branches.find({}, { projection: { _id: 0 } }).toArray(),
    cols.surveys.find({}, { projection: { _id: 0 } }).sort({ at: -1 }).toArray(),
    cols.meta.findOne({ _id: META_ID }),
  ]);
  return {
    users: plainList(users),
    branches: plainList(branches),
    surveys: plainList(surveys),
    resetAt: meta?.resetAt || null,
    updatedAt: meta?.updatedAt || null,
  };
}

async function findUserByName(cols, username) {
  return cols.users.findOne({
    username: { $regex: `^${escapeRegex(username)}$`, $options: 'i' },
  });
}

async function createUser(user) {
  const cols = await collections();
  await ensureSeed(cols);
  if (!user?.id || !user?.username || !user?.password) {
    throw httpError(400, 'Username and password are required');
  }
  if (await findUserByName(cols, user.username)) {
    throw httpError(409, 'That username already exists');
  }
  const doc = {
    id: user.id,
    username: String(user.username).trim(),
    password: String(user.password),
    role: 'user',
    branchIds: Array.isArray(user.branchIds) ? user.branchIds : [],
    updatedAt: user.updatedAt || nowIso(),
  };
  await cols.users.insertOne(doc);
  await touchMeta(cols);
  return loadMongoState();
}

async function updateUser(id, patch = {}) {
  const cols = await collections();
  const current = await cols.users.findOne({ id });
  if (!current) throw httpError(404, 'User not found');
  const next = { ...patch, updatedAt: nowIso() };
  delete next.id;
  delete next._id;
  if (current.role === 'superadmin' || current.role === 'admin') {
    next.role = 'superadmin';
    next.branchIds = [];
  }
  await cols.users.updateOne({ id }, { $set: next });
  await touchMeta(cols);
  return loadMongoState();
}

async function deleteUser(id) {
  const cols = await collections();
  const current = await cols.users.findOne({ id });
  if (!current) throw httpError(404, 'User not found');
  if (current.role === 'superadmin' || current.role === 'admin') {
    throw httpError(400, 'The super admin account cannot be deleted');
  }
  await cols.users.deleteOne({ id });
  await touchMeta(cols);
  return loadMongoState();
}

async function createBranch(branch) {
  const cols = await collections();
  await ensureSeed(cols);
  const name = String(branch?.name || '').trim();
  if (!branch?.id || !name) throw httpError(400, 'Branch name is required');
  const clash = await cols.branches.findOne({
    name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
  });
  if (clash) throw httpError(409, 'That branch already exists');
  await cols.branches.insertOne({
    id: branch.id,
    name,
    updatedAt: branch.updatedAt || nowIso(),
  });
  await touchMeta(cols);
  return loadMongoState();
}

async function deleteBranch(id) {
  const cols = await collections();
  await cols.branches.deleteOne({ id });
  await cols.users.updateMany({}, { $pull: { branchIds: id } });
  await touchMeta(cols);
  return loadMongoState();
}

async function assignBranches(userId, branchIds) {
  const cols = await collections();
  const unique = [...new Set(branchIds || [])];
  const at = nowIso();
  await cols.users.updateMany(
    { id: { $ne: userId }, role: { $nin: ['superadmin', 'admin'] } },
    { $pull: { branchIds: { $in: unique } }, $set: { updatedAt: at } },
  );
  await cols.users.updateOne(
    { id: userId, role: { $nin: ['superadmin', 'admin'] } },
    { $set: { branchIds: unique, updatedAt: at } },
  );
  await cols.users.updateMany(
    { role: { $in: ['superadmin', 'admin'] } },
    { $set: { branchIds: [], updatedAt: at } },
  );
  await touchMeta(cols);
  return loadMongoState();
}

async function resetPassword(id, password) {
  const cols = await collections();
  const current = await cols.users.findOne({ id });
  if (!current || current.role === 'superadmin' || current.role === 'admin') {
    throw httpError(400, 'Cannot reset this account');
  }
  if (!password) throw httpError(400, 'Password is required');
  await cols.users.updateOne({ id }, { $set: { password, updatedAt: nowIso() } });
  await touchMeta(cols);
  return loadMongoState();
}

async function saveSurvey(survey) {
  const cols = await collections();
  await ensureSeed(cols);
  if (!survey?.id) throw httpError(400, 'Survey is required');
  await cols.surveys.updateOne(
    { id: survey.id },
    { $set: { ...survey, updatedAt: survey.updatedAt || nowIso() } },
    { upsert: true },
  );
  await touchMeta(cols);
  return loadMongoState();
}

async function wipe(keep) {
  const cols = await collections();
  if (!keep?.id) throw httpError(400, 'Not allowed');
  const current = await cols.users.findOne({ id: keep.id }) || keep;
  const next = {
    id: current.id,
    username: current.username || keep.username,
    password: keep.password || current.password,
    role: 'superadmin',
    branchIds: [],
    updatedAt: nowIso(),
  };
  await cols.surveys.deleteMany({});
  await cols.branches.deleteMany({});
  await cols.users.deleteMany({});
  await cols.users.insertOne(next);
  const resetAt = nowIso();
  await cols.meta.updateOne(
    { _id: META_ID },
    { $set: { resetAt, updatedAt: resetAt } },
    { upsert: true },
  );
  return loadMongoState();
}

async function migrate(snapshot) {
  const cols = await collections();
  await ensureSeed(cols);
  const [branchCount, surveyCount, userCount] = await Promise.all([
    cols.branches.countDocuments(),
    cols.surveys.countDocuments(),
    cols.users.countDocuments(),
  ]);
  if (branchCount || surveyCount || userCount > 1) return loadMongoState();
  const users = Array.isArray(snapshot?.users) ? snapshot.users : [];
  const branches = Array.isArray(snapshot?.branches) ? snapshot.branches : [];
  const surveys = Array.isArray(snapshot?.surveys) ? snapshot.surveys : [];
  if (users.length) {
    await Promise.all(users.filter(u => u?.id).map(user => (
      cols.users.updateOne({ id: user.id }, { $set: { ...user, updatedAt: user.updatedAt || nowIso() } }, { upsert: true })
    )));
  }
  if (branches.length) {
    await Promise.all(branches.filter(b => b?.id).map(branch => (
      cols.branches.updateOne({ id: branch.id }, { $set: { ...branch, updatedAt: branch.updatedAt || nowIso() } }, { upsert: true })
    )));
  }
  if (surveys.length) {
    await Promise.all(surveys.filter(s => s?.id).map(survey => (
      cols.surveys.updateOne({ id: survey.id }, { $set: { ...survey, updatedAt: survey.updatedAt || survey.at || nowIso() } }, { upsert: true })
    )));
  }
  await touchMeta(cols);
  return loadMongoState();
}

async function handleMongoAction(body = {}) {
  const action = body.action || (body.survey ? 'saveSurvey' : '');
  if (action === 'saveSurvey') return saveSurvey(body.survey);
  if (action === 'createUser') return createUser(body.user);
  if (action === 'updateUser') return updateUser(body.id, body.patch || {});
  if (action === 'deleteUser') return deleteUser(body.id);
  if (action === 'createBranch') return createBranch(body.branch);
  if (action === 'deleteBranch') return deleteBranch(body.id);
  if (action === 'assignBranches') return assignBranches(body.userId, body.branchIds || []);
  if (action === 'resetPassword') return resetPassword(body.id, body.password);
  if (action === 'wipe') return wipe(body.keep);
  if (action === 'migrate') return migrate(body);
  throw httpError(400, 'Unknown action');
}

const KEY = 'gm_state';

export function kvConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function isSharedStore() {
  return mongoConfigured() || kvConfigured() || !process.env.VERCEL;
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

function stamp(item) {
  return Date.parse(item?.updatedAt || item?.at || 0) || 0;
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

function sortSurveys(list) {
  return [...(list || [])].sort((x, y) => String(y.at || '').localeCompare(String(x.at || '')));
}

function mergeState(current, incoming) {
  if (!incoming) return current;
  const incomingReset = incoming.resetAt || null;
  const currentReset = current.resetAt || null;
  if (incomingReset && (!currentReset || incomingReset > currentReset)) {
    return {
      users: incoming.users || [],
      branches: incoming.branches || [],
      surveys: incoming.surveys || [],
      resetAt: incomingReset,
      updatedAt: incoming.updatedAt || nowIso(),
    };
  }
  return {
    users: mergeList(current.users, incoming.users),
    branches: mergeList(current.branches, incoming.branches),
    surveys: sortSurveys(mergeList(current.surveys, incoming.surveys)),
    resetAt: currentReset || incomingReset,
    updatedAt: incoming.updatedAt || current.updatedAt || nowIso(),
  };
}

async function loadBlobState() {
  if (kvConfigured()) {
    const json = await kvCommand(['GET', KEY]);
    const raw = json?.result;
    if (!raw) return emptyState();
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  return readFileState() || emptyState();
}

async function saveBlobState(state) {
  const next = {
    users: state.users || [],
    branches: state.branches || [],
    surveys: state.surveys || [],
    resetAt: state.resetAt || null,
    updatedAt: state.updatedAt || nowIso(),
  };
  if (kvConfigured()) {
    await kvCommand(['SET', KEY, JSON.stringify(next)]);
    return next;
  }
  writeFileState(next);
  return next;
}

async function handleBlobAction(body = {}) {
  const action = body.action || (body.survey ? 'saveSurvey' : '');
  let state = await loadBlobState();
  const at = nowIso();
  if (action === 'saveSurvey') {
    if (!body.survey?.id) throw httpError(400, 'Survey is required');
    state.surveys = sortSurveys(mergeList(state.surveys, [body.survey]));
  } else if (action === 'createUser') {
    const user = body.user;
    if (!user?.id || !user?.username || !user?.password) {
      throw httpError(400, 'Username and password are required');
    }
    if (state.users.some(u => u.username.toLowerCase() === String(user.username).toLowerCase())) {
      throw httpError(409, 'That username already exists');
    }
    state.users = [...state.users, { ...user, role: 'user', updatedAt: user.updatedAt || at }];
  } else if (action === 'updateUser') {
    if (!state.users.some(u => u.id === body.id)) throw httpError(404, 'User not found');
    state.users = state.users.map(u => (u.id === body.id ? { ...u, ...(body.patch || {}), updatedAt: at } : u));
  } else if (action === 'deleteUser') {
    const current = state.users.find(u => u.id === body.id);
    if (!current) throw httpError(404, 'User not found');
    if (current.role === 'superadmin' || current.role === 'admin') {
      throw httpError(400, 'The super admin account cannot be deleted');
    }
    state.users = state.users.filter(u => u.id !== body.id);
  } else if (action === 'createBranch') {
    const branch = body.branch;
    const name = String(branch?.name || '').trim();
    if (!branch?.id || !name) throw httpError(400, 'Branch name is required');
    if (state.branches.some(b => b.name.toLowerCase() === name.toLowerCase())) {
      throw httpError(409, 'That branch already exists');
    }
    state.branches = [...state.branches, { ...branch, name, updatedAt: branch.updatedAt || at }];
  } else if (action === 'deleteBranch') {
    state.branches = state.branches.filter(b => b.id !== body.id);
    state.users = state.users.map(u => ({
      ...u,
      branchIds: (u.branchIds || []).filter(x => x !== body.id),
      updatedAt: at,
    }));
  } else if (action === 'assignBranches') {
    const unique = [...new Set(body.branchIds || [])];
    state.users = state.users.map(u => {
      let next = u;
      if (u.role === 'superadmin' || u.role === 'admin') next = { ...u, branchIds: [] };
      else if (u.id === body.userId) next = { ...u, branchIds: unique };
      else next = { ...u, branchIds: (u.branchIds || []).filter(id => !unique.includes(id)) };
      if (JSON.stringify(next.branchIds || []) === JSON.stringify(u.branchIds || [])) return u;
      return { ...next, updatedAt: at };
    });
  } else if (action === 'resetPassword') {
    const current = state.users.find(u => u.id === body.id);
    if (!current || current.role === 'superadmin' || current.role === 'admin') {
      throw httpError(400, 'Cannot reset this account');
    }
    if (!body.password) throw httpError(400, 'Password is required');
    state.users = state.users.map(u => (u.id === body.id ? { ...u, password: body.password, updatedAt: at } : u));
  } else if (action === 'wipe') {
    if (!body.keep?.id) throw httpError(400, 'Not allowed');
    state = {
      users: [{ ...body.keep, role: 'superadmin', branchIds: [], updatedAt: at }],
      branches: [],
      surveys: [],
      resetAt: at,
      updatedAt: at,
    };
  } else if (action === 'migrate') {
    state = mergeState(state, body);
  } else {
    throw httpError(400, 'Unknown action');
  }
  state.updatedAt = state.updatedAt || at;
  return saveBlobState(state);
}

async function upsertMongoSnapshot(incoming) {
  if (!incoming) return loadMongoState();
  const cols = await collections();
  await ensureSeed(cols);
  const incomingReset = incoming.resetAt || null;
  const meta = await cols.meta.findOne({ _id: META_ID });
  if (
    incomingReset
    && (!meta?.resetAt || incomingReset > meta.resetAt)
    && !(incoming.branches || []).length
    && !(incoming.surveys || []).length
  ) {
    return wipe(incoming.users?.[0] || emptyState().users[0]);
  }
  await Promise.all((incoming.users || []).filter(u => u?.id).map(user => (
    cols.users.updateOne({ id: user.id }, { $set: { ...user, updatedAt: user.updatedAt || nowIso() } }, { upsert: true })
  )));
  await Promise.all((incoming.branches || []).filter(b => b?.id).map(branch => (
    cols.branches.updateOne({ id: branch.id }, { $set: { ...branch, updatedAt: branch.updatedAt || nowIso() } }, { upsert: true })
  )));
  await Promise.all((incoming.surveys || []).filter(s => s?.id).map(survey => (
    cols.surveys.updateOne({ id: survey.id }, { $set: { ...survey, updatedAt: survey.updatedAt || survey.at || nowIso() } }, { upsert: true })
  )));
  await touchMeta(cols);
  return loadMongoState();
}

export async function loadState() {
  if (mongoConfigured()) return loadMongoState();
  return loadBlobState();
}

export async function handleAction(body = {}) {
  if (mongoConfigured()) return handleMongoAction(body);
  return handleBlobAction(body);
}

export async function applySnapshot(incoming) {
  if (mongoConfigured()) return upsertMongoSnapshot(incoming);
  const next = mergeState(await loadBlobState(), incoming);
  return saveBlobState(next);
}
