// 讀取 Airtable 訂單(需通過 ADMIN_PASSWORD 驗證)
const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || '租借訂單';
const PW = process.env.ADMIN_PASSWORD;

exports.handler = async (event) => {
  const key = event.headers['x-admin-key'] || '';
  if (!PW || key !== PW) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) };
  }
  if (!TOKEN || !BASE) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'airtable-not-configured' }) };
  }
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}?pageSize=100`,
      { headers: { 'Authorization': `Bearer ${TOKEN}` } }
    );
    const data = await res.json();
    if (!res.ok) return { statusCode: 502, body: JSON.stringify({ ok: false, airtable: data }) };
    const orders = (data.records || []).map(r => Object.assign({ id: r.id, _created: r.createdTime }, r.fields));
    return { statusCode: 200, body: JSON.stringify({ ok: true, orders }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
