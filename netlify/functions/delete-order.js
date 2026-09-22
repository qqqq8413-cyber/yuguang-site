// 刪除訂單(需後台密碼,驗證見 lib/auth.js)
const { requireAdmin } = require('./lib/auth');
const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || '租借訂單';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const denied = await requireAdmin(event); // 共用驗證:比對密碼、錯誤次數限制(lib/auth.js)
  if (denied) return denied;
  if (!TOKEN || !BASE) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'airtable-not-configured' }) };
  }
  let o;
  try { o = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'invalid-json' }) };
  }
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(o.id || ''))) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'bad-id' }) };
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}/${o.id}`,
      { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN}` } }
    );
    const data = await res.json();
    if (!res.ok) return { statusCode: 502, body: JSON.stringify({ ok: false, airtable: data }) };
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
