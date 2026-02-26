// netlify/functions/investments.js
// GET  → read all saved investment records from Upstash Redis
// POST → write (overwrite) all saved investment records

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY         = 'cse-investments-v1';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function redisGet() {
  const res = await fetch(`${REDIS_URL}/get/${KEY}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  if (!res.ok) throw new Error('Redis GET failed: ' + res.status);
  const json = await res.json();
  // Upstash returns { result: "<stringified-JSON>" } or { result: null }
  if (!json.result) return [];
  return JSON.parse(json.result);
}

async function redisSet(data) {
  // Upstash REST SET: POST /set/<key>  with body = the value (as a JSON string)
  const res = await fetch(`${REDIS_URL}/set/${KEY}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(JSON.stringify(data)),
  });
  if (!res.ok) throw new Error('Redis SET failed: ' + res.status);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const data = await redisGet();
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '[]');
      if (!Array.isArray(body)) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ ok: false, error: 'Expected JSON array' }) };
      }
      await redisSet(body);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[investments]', err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
