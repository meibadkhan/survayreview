import { kvConfigured, loadState, mergeAndSave } from '../server/persist.js';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    if (req.method === 'GET') {
      const state = await loadState();
      return send(res, 200, { ...state, shared: kvConfigured() || !process.env.VERCEL });
    }

    const body = await readBody(req);

    if (req.method === 'POST' && body.survey) {
      const { next, saved } = await mergeAndSave({
        surveys: [body.survey],
        updatedAt: body.survey.at,
      });
      return send(res, 200, { ok: true, ...next, ...saved });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const { next, saved } = await mergeAndSave(body);
      return send(res, 200, { ok: true, ...next, ...saved });
    }

    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return send(res, 500, { error: err.message || 'Store failed' });
  }
}
