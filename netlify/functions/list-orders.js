// 讀取 Airtable 訂單(需後台密碼,驗證見 lib/auth.js)
const { requireAdmin } = require('./lib/auth');
const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || '租借訂單';

exports.handler = async (event) => {
  const denied = await requireAdmin(event); // 共用驗證:比對密碼、錯誤次數限制(lib/auth.js)
  if (denied) return denied;
  if (!TOKEN || !BASE) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'airtable-not-configured' }) };
  }
  try {
    // Airtable 每頁最多 100 筆,依 offset 取完全部(原本只取第一頁,超過 100 筆的訂單會看不到)
    const records = [];
    let offset = '';
    for (let page = 0; page < 50; page++) {
      const res = await fetch(
        `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}?pageSize=100${offset ? '&offset=' + encodeURIComponent(offset) : ''}`,
        { headers: { 'Authorization': `Bearer ${TOKEN}` } }
      );
      const data = await res.json();
      if (!res.ok) return { statusCode: 502, body: JSON.stringify({ ok: false, airtable: data }) };
      records.push(...(data.records || []));
      if (!data.offset) break;
      offset = data.offset;
    }
    const orders = records.map(r => Object.assign({ id: r.id, _created: r.createdTime }, r.fields));
    return { statusCode: 200, body: JSON.stringify({ ok: true, orders }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
