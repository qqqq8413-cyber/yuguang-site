// 嶼光映像 · 器材租借下單 → 寫入 Airtable
// 需要在 Netlify 環境變數設定:
//   AIRTABLE_TOKEN      Airtable 個人存取權杖 (Personal Access Token)
//   AIRTABLE_BASE_ID    Airtable Base ID (app 開頭那串)
//   AIRTABLE_TABLE_NAME 資料表名稱 (預設「租借訂單」)
//
// 前端只送「器材代稱 + 數量 + 日期 + 姓名 + LINE」;器材名稱、單價、天數、預估金額一律由後端
// 依正式的 gear.json 計算(lib/rental.js),前端送來的金額、天數會被忽略。
// gear.json 在部署時一起打包:後台改價格 → 重新部署 → 這裡的價格同步更新,與器材頁顯示一致。

const { quote } = require('./lib/rental');
const { gear: GEAR } = require('../../yuguang-site/content/gear.json');

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || '租借訂單';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let o;
  try {
    o = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { ok: false, error: 'invalid-json' });
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return json(400, { ok: false, error: 'invalid-json' });

  // 公開端點:蜜罐欄位有值即視為機器人,假裝成功、不寫入
  if (o['bot-field']) return json(200, { ok: true });

  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const name = cut(o.name, 100);
  const line = cut(o.line, 60);
  if (!line) return json(400, { ok: false, error: 'missing-contact' });

  const q = quote(GEAR, { items: o.items, start: o.start, end: o.end });
  if (!q.ok) return json(400, { ok: false, error: q.error, detail: q.detail });
  const summary = { days: q.days, amount: q.amount, dailyTotal: q.dailyTotal, unpriced: q.unpriced, items: q.items };

  // 尚未設定 Airtable 時回報 ok:false,前端會改用 Netlify 表單備援,訂單不會遺失
  if (!TOKEN || !BASE) return json(200, { ok: false, reason: 'airtable-not-configured', quote: summary });

  const fields = {
    '客戶姓名': name || '未具名',
    '聯絡方式': `LINE ${line}`,
    '租借器材': q.items,
    '天數': q.days,
    '預估金額': q.amount || null, // 全部未定價時留空,由站長報價
    '起租日': o.start,
    '迄租日': o.end,
    '狀態': '待處理',
  };

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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json(502, { ok: false, error: 'airtable-error', airtable: data });
    return json(200, { ok: true, id: data.records && data.records[0] && data.records[0].id, quote: summary });
  } catch (e) {
    return json(502, { ok: false, error: 'airtable-unreachable' });
  }
};
