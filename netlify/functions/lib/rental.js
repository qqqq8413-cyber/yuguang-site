// 租借報價:以正式的 gear.json 為準,由後端計算天數與金額
// 前端算的數字只拿來即時顯示,不再寫進訂單;送進 Airtable 的器材清單、天數、預估金額都由這裡產生。
// 純函式、不碰網路,方便單獨測試(scripts/test-create-order.js)。

const MAX_ITEMS = 30;   // 一張單最多幾種器材
const MAX_DAYS = 365;   // 租期上限,超過請直接 LINE 聯絡

// 可租數量:未填視為 1;0 = 暫停出租(與器材頁 qicai.html 的規則相同)
function maxQ(g) {
  const q = g.qty;
  return q === undefined || q === null || q === '' ? 1 : Math.max(0, Math.floor(+q) || 0);
}
const hasPrice = (g) => typeof g.price === 'number' && g.price > 0;

// 真實存在的日期(擋掉 2026-02-30 這種)
function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// 台灣日期(UTC+8,沒有夏令時間)
function taipeiDate(now = new Date(), offsetDays = 0) {
  return new Date(now.getTime() + 8 * 3600e3 + offsetDays * 864e5).toISOString().slice(0, 10);
}

// gearList:gear.json 的 gear 陣列
// input:{ items:[{slug, qty}], start:'YYYY-MM-DD', end:'YYYY-MM-DD' }
// 回傳 { ok:true, days, dailyTotal, amount, unpriced, items(文字), lines } 或 { ok:false, error, detail }
function quote(gearList, input, now = new Date()) {
  const fail = (error, detail) => ({ ok: false, error, detail });
  const items = input && input.items;
  if (!Array.isArray(items) || !items.length) return fail('no-items');
  if (items.length > MAX_ITEMS) return fail('too-many-items');

  const bySlug = new Map(gearList.filter((g) => g && g.slug).map((g) => [g.slug, g]));
  const seen = new Set();
  const lines = [];
  for (const it of items) {
    const slug = it && typeof it.slug === 'string' ? it.slug : '';
    const g = bySlug.get(slug);
    if (!g) return fail('unknown-item', slug.slice(0, 60));
    if (seen.has(slug)) return fail('duplicate-item', slug);
    seen.add(slug);
    const q = it.qty;
    if (!Number.isInteger(q) || q < 1) return fail('invalid-qty', slug);
    const m = maxQ(g);
    if (m === 0) return fail('unavailable', slug);
    if (q > m) return fail('qty-exceeds-stock', slug);
    lines.push({ g, q });
  }

  const { start, end } = input;
  if (!isDate(start) || !isDate(end)) return fail('invalid-date');
  // 前端以訪客當地的「今天」為下限;人在時區比台灣晚的地方,當地今天可能是台灣昨天,所以寬限一天
  if (start < taipeiDate(now, -1)) return fail('start-in-past');
  if (end < start) return fail('end-before-start');
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1; // 含取件日與歸還日
  if (days > MAX_DAYS) return fail('too-long');

  const dailyTotal = lines.reduce((s, { g, q }) => s + (hasPrice(g) ? g.price * q : 0), 0);
  return {
    ok: true,
    days,
    dailyTotal,
    amount: dailyTotal * days,
    unpriced: lines.some(({ g }) => !hasPrice(g)),
    items: lines.map(({ g, q }) => `${g.name} ×${q}（${hasPrice(g) ? 'NT$' + g.price + '/日' : '價格另計'}）`).join('、'),
    lines: lines.map(({ g, q }) => ({ slug: g.slug, name: g.name, qty: q, price: hasPrice(g) ? g.price : null })),
  };
}

module.exports = { quote, maxQ, isDate, taipeiDate, MAX_ITEMS, MAX_DAYS };
