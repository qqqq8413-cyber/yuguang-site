// 嶼光映像 · 器材租借下單 → 寫入 Airtable
// 需要在 Netlify 環境變數設定:
//   AIRTABLE_TOKEN      Airtable 個人存取權杖 (Personal Access Token)
//   AIRTABLE_BASE_ID    Airtable Base ID (app 開頭那串)
//   AIRTABLE_TABLE_NAME 資料表名稱 (預設「租借訂單」)

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || '租借訂單';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // 尚未設定 Airtable 時,回傳友善訊息(前端已有 Netlify 表單備援,訂單不會遺失)
  if (!TOKEN || !BASE) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'airtable-not-configured' }) };
  }

  let o;
  try {
    o = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'invalid-json' }) };
  }

  const fields = {
    '客戶姓名': o.name || '未具名',
    '聯絡方式': o.contact || '',
    '租借器材': o.items || '',
    '天數': Number(o.days) || null,
    '預估金額': Number(o.amount) || null,
    '狀態': '待處理'
  };
  if (o.start) fields['起租日'] = o.start;
  if (o.end) fields['迄租日'] = o.end;

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ records: [{ fields }], typecast: true })
      }
    );
    const data = await res.json();
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ ok: false, airtable: data }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, id: data.records && data.records[0] && data.records[0].id }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
