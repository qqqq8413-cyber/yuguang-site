// 更新訂單狀態(需通過 ADMIN_PASSWORD 驗證)
const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || '租借訂單';
const PW = process.env.ADMIN_PASSWORD;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const key = event.headers['x-admin-key'] || '';
  if (!PW || key !== PW) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) };
  }
  if (!TOKEN || !BASE) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'airtable-not-configured' }) };
  }
  let o;
  try { o = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'invalid-json' }) };
  }
  if (!o.id) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'no-id' }) };
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}/${o.id}`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { '狀態': o.status }, typecast: true })
      }
    );
    const data = await res.json();
    if (!res.ok) return { statusCode: 502, body: JSON.stringify({ ok: false, airtable: data }) };
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
