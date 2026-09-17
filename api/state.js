import { isSharedStore, loadState, handleAction, applySnapshot } from '../server/persist.js';

export const config = { runtime: 'nodejs' };

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function withShare(state) {
  return { ...state, shared: isSharedStore() };
}

function publicError(err) {
  const msg = err?.message || 'Store failed';
  if (/SSL|TLS|tlsv1|CERT|ENOTFOUND|ECONN|ETIMEOUT|server selection|MongoNetwork/i.test(msg)) {
    return 'Could not connect to MongoDB. Allow 0.0.0.0/0 in Atlas Network Access, then redeploy.';
  }
  if (/auth|authentication|bad auth/i.test(msg)) {
    return 'MongoDB username or password is wrong. Set MONGODB_URI on Vercel with meibadkhan_db_user and the Atlas password, plus authSource=admin, then redeploy.';
  }
  return msg;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    if (req.method === 'GET') {
      const state = await loadState();
      return send(res, 200, withShare(state));
    }

    const body = await readBody(req);

    if (req.method === 'POST' && (body.action || body.survey)) {
      const next = await handleAction(body);
      return send(res, 200, { ok: true, ...withShare(next) });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      if (body.action || body.survey) {
        const next = await handleAction(body);
        return send(res, 200, { ok: true, ...withShare(next) });
      }
      if (body.users || body.branches || body.surveys) {
        const next = await applySnapshot(body);
        return send(res, 200, { ok: true, ...withShare(next) });
      }
      const state = await loadState();
      return send(res, 200, { ok: true, ...withShare(state) });
    }

    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return send(res, err.status || 500, { error: publicError(err) });
  }
}
