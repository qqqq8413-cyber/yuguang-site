// 租借下單的自動測試:報價計算(lib/rental.js)+ 下單函式(create-order.js)
// 不連 Airtable:用假的 fetch 攔下要寫入的資料來檢查。執行:node scripts/test-create-order.js
const assert = require('assert');
const path = require('path');
const { quote, taipeiDate } = require('../netlify/functions/lib/rental');

let passed = 0;
const fails = [];
async function t(name, fn) {
  try { await fn(); passed++; } catch (e) { fails.push(`✗ ${name}\n    ${e.message}`); }
}
const D = (n) => taipeiDate(new Date(), n); // 台灣日期,今天 + n 天

// ---------- 報價計算:用固定的測試器材 ----------
const G = [
  { slug: 'cam', name: '相機', price: 300 },            // 未填數量 = 1 台
  { slug: 'light', name: '燈', price: 700, qty: 2 },
  { slug: 'paused', name: '暫停的', price: 100, qty: 0 },
  { slug: 'free', name: '未定價', price: null },
];
const ok = (items, start = D(3), end = D(6)) => quote(G, { items, start, end });

(async () => {
  await t('正常報價:天數含頭尾、金額 = 日租合計 × 天數', () => {
    const q = ok([{ slug: 'cam', qty: 1 }, { slug: 'light', qty: 2 }]);
    assert.strictEqual(q.ok, true);
    assert.strictEqual(q.days, 4);
    assert.strictEqual(q.dailyTotal, 300 + 1400);
    assert.strictEqual(q.amount, 1700 * 4);
    assert.strictEqual(q.items, '相機 ×1（NT$300/日）、燈 ×2（NT$700/日）');
  });
  await t('同一天取還 = 1 天', () => assert.strictEqual(ok([{ slug: 'cam', qty: 1 }], D(2), D(2)).days, 1));
  await t('未定價器材:不計入金額並標記', () => {
    const q = ok([{ slug: 'free', qty: 1 }, { slug: 'cam', qty: 1 }]);
    assert.strictEqual(q.amount, 300 * 4); assert.strictEqual(q.unpriced, true);
    assert.ok(q.items.includes('未定價 ×1（價格另計）'));
  });
  const bad = (name, items, err, s, e) => t(name, () => assert.strictEqual(ok(items, s, e).error, err));
  await bad('不存在的代稱', [{ slug: 'nope', qty: 1 }], 'unknown-item');
  await bad('代稱不是文字', [{ slug: 5, qty: 1 }], 'unknown-item');
  await bad('暫停出租(qty=0)', [{ slug: 'paused', qty: 1 }], 'unavailable');
  await bad('數量 0', [{ slug: 'cam', qty: 0 }], 'invalid-qty');
  await bad('數量負數', [{ slug: 'cam', qty: -1 }], 'invalid-qty');
  await bad('數量小數', [{ slug: 'light', qty: 1.5 }], 'invalid-qty');
  await bad('數量是文字', [{ slug: 'cam', qty: '1' }], 'invalid-qty');
  await bad('超過可租數量(未填=1)', [{ slug: 'cam', qty: 2 }], 'qty-exceeds-stock');
  await bad('超過可租數量(2 台租 3)', [{ slug: 'light', qty: 3 }], 'qty-exceeds-stock');
  await bad('重複品項', [{ slug: 'cam', qty: 1 }, { slug: 'cam', qty: 1 }], 'duplicate-item');
  await bad('沒有品項', [], 'no-items');
  await bad('品項不是陣列', 'cam ×1', 'no-items');
  await bad('品項太多', Array.from({ length: 31 }, (_, i) => ({ slug: 'x' + i, qty: 1 })), 'too-many-items');
  await bad('迄日早於起日', [{ slug: 'cam', qty: 1 }], 'end-before-start', D(5), D(4));
  await bad('起租日已過', [{ slug: 'cam', qty: 1 }], 'start-in-past', D(-3), D(2));
  await bad('不存在的日期', [{ slug: 'cam', qty: 1 }], 'invalid-date', '2031-02-30', '2031-03-02');
  await bad('日期格式錯', [{ slug: 'cam', qty: 1 }], 'invalid-date', '2031/3/1', '2031-03-02');
  await bad('租期超過一年', [{ slug: 'cam', qty: 1 }], 'too-long', D(1), D(400));
  await t('台灣昨天仍接受(時區寬限一天)', () => assert.strictEqual(ok([{ slug: 'cam', qty: 1 }], D(-1), D(1)).ok, true));

  // ---------- 下單函式:用正式的 gear.json ----------
  const fnPath = path.join(__dirname, '../netlify/functions/create-order.js');
  const load = (env) => {
    Object.assign(process.env, { AIRTABLE_TOKEN: '', AIRTABLE_BASE_ID: '' }, env);
    delete require.cache[require.resolve(fnPath)];
    require('../netlify/functions/lib/ratelimit')._reset(); // 測試之間不要互相踩到節流額度
    return require(fnPath).handler;
  };
  let sent = [];
  let airtable = { ok: true, status: 200, body: { records: [{ id: 'recTEST' }] } };
  global.fetch = async (url, opt) => {
    sent.push({ url, body: JSON.parse(opt.body) });
    if (airtable.throw) throw new Error('network down');
    return { ok: airtable.ok, status: airtable.status, json: async () => airtable.body };
  };
  const call = async (handler, body, method = 'POST') => {
    const r = await handler({ httpMethod: method, body: typeof body === 'string' ? body : JSON.stringify(body) });
    let data = {}; try { data = JSON.parse(r.body); } catch {}
    return { status: r.statusCode, data };
  };
  const gear = require('../yuguang-site/content/gear.json').gear;
  const one = gear.find((g) => g.qty === undefined && typeof g.price === 'number');   // 未填數量(=1)的器材
  const two = gear.find((g) => g.qty === 2 && typeof g.price === 'number');           // 有 2 台的器材
  const base = { name: '測試', line: 'test_line', start: D(3), end: D(6), items: [{ slug: one.slug, qty: 1 }, { slug: two.slug, qty: 2 }] };
  const h = load({ AIRTABLE_TOKEN: 'tok', AIRTABLE_BASE_ID: 'appTEST' });

  await t('下單成功:寫入 Airtable 的金額、天數、品項由後端計算', async () => {
    sent = [];
    const r = await call(h, base);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.data.ok, true);
    const f = sent[0].body.records[0].fields;
    const daily = one.price + two.price * 2;
    assert.strictEqual(f['天數'], 4);
    assert.strictEqual(f['預估金額'], daily * 4);
    assert.strictEqual(f['租借器材'], `${one.name} ×1（NT$${one.price}/日）、${two.name} ×2（NT$${two.price}/日）`);
    assert.strictEqual(f['聯絡方式'], 'LINE test_line');
    assert.strictEqual(f['起租日'], base.start); assert.strictEqual(f['迄租日'], base.end);
    assert.strictEqual(f['狀態'], '待處理');
    assert.strictEqual(r.data.quote.amount, daily * 4);
  });
  await t('偽造的金額、天數、品項文字會被忽略', async () => {
    sent = [];
    const r = await call(h, Object.assign({}, base, { amount: 1, days: 30, dailyTotal: 1, contact: '偽造', }));
    assert.strictEqual(r.status, 200);
    const f = sent[0].body.records[0].fields;
    assert.notStrictEqual(f['預估金額'], 1); assert.strictEqual(f['天數'], 4);
    assert.strictEqual(f['聯絡方式'], 'LINE test_line');
  });
  await t('舊格式(items 是文字)→ 400,不寫入', async () => {
    sent = [];
    const r = await call(h, Object.assign({}, base, { items: 'Sony FX3 ×10' }));
    assert.strictEqual(r.status, 400); assert.strictEqual(sent.length, 0);
  });
  await t('超過可租數量 → 400 並回報原因,不寫入', async () => {
    sent = [];
    const r = await call(h, Object.assign({}, base, { items: [{ slug: two.slug, qty: 3 }] }));
    assert.strictEqual(r.status, 400); assert.strictEqual(r.data.error, 'qty-exceeds-stock'); assert.strictEqual(sent.length, 0);
  });
  await t('沒填 LINE → 400', async () => {
    const r = await call(h, Object.assign({}, base, { line: '  ' }));
    assert.strictEqual(r.status, 400); assert.strictEqual(r.data.error, 'missing-contact');
  });
  await t('JSON 壞掉 → 400', async () => assert.strictEqual((await call(h, '{oops')).status, 400));
  await t('送陣列 → 400', async () => assert.strictEqual((await call(h, '[]')).status, 400));
  await t('GET → 405', async () => assert.strictEqual((await call(h, base, 'GET')).status, 405));
  await t('機器人(蜜罐欄位)→ 假裝成功、不寫入', async () => {
    sent = [];
    const r = await call(h, Object.assign({}, base, { 'bot-field': 'x' }));
    assert.strictEqual(r.status, 200); assert.strictEqual(sent.length, 0);
  });
  await t('姓名太長會截斷', async () => {
    sent = [];
    await call(h, Object.assign({}, base, { name: '長'.repeat(500) }));
    assert.strictEqual(sent[0].body.records[0].fields['客戶姓名'].length, 100);
  });
  await t('Airtable 回錯誤 → 502(前端改用表單備援)', async () => {
    airtable = { ok: false, status: 422, body: { error: 'x' } };
    const r = await call(h, base);
    assert.strictEqual(r.status, 502);
    airtable = { ok: true, status: 200, body: { records: [{ id: 'recTEST' }] } };
  });
  await t('Airtable 連不上 → 502', async () => {
    airtable.throw = true;
    const r = await call(h, base);
    assert.strictEqual(r.status, 502);
    delete airtable.throw;
  });
  await t('Airtable 未設定 → ok:false 並附後端報價(前端用它寫表單備援)', async () => {
    sent = [];
    const h2 = load({});
    const r = await call(h2, base);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.data.ok, false);
    assert.strictEqual(r.data.quote.days, 4); assert.strictEqual(sent.length, 0);
  });
  // ---------- LINE ID 白名單:後台會把它放進 HTML,含引號的值等於可執行的程式碼 ----------
  const lineCase = (v) => call(h, Object.assign({}, base, { line: v }));
  const badLine = (name, v) => t(name, async () => {
    const r = await lineCase(v);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.data.error, 'invalid-line-id');
  });
  await badLine('LINE ID 含單引號(XSS 的入口)', "a',alert(1),'");
  await badLine('LINE ID 含角括號', 'ab<script>');
  await badLine('LINE ID 含雙引號', 'ab"cd');
  await badLine('LINE ID 含空白', 'abc def');
  await badLine('LINE ID 是中文', '嶼光映像');
  await badLine('LINE ID 太短', 'abc');
  await badLine('LINE ID 太長', 'a'.repeat(21));
  await badLine('LINE ID 含 @ 在中間', 'ab@cd');
  await t('合法 LINE ID 通過', async () => {
    require('../netlify/functions/lib/ratelimit')._reset(); // 這裡要連送 4 筆成功的,先清掉前面用掉的額度
    for (const v of ['abc_123', '@abc.def', 'A-b_c.1', '0912345678']) {
      const r = await lineCase(v);
      assert.strictEqual(r.status, 200, `${v} 應該通過,卻得到 ${r.status}`);
      assert.strictEqual(r.data.ok, true);
    }
  });

  // ---------- 節流:同一來源 10 分鐘內最多 5 筆 ----------
  await t('同一來源連送 6 筆:第 6 筆 429 並附 Retry-After', async () => {
    const rl = require('../netlify/functions/lib/ratelimit');
    rl._reset();
    const ip = { 'x-nf-client-connection-ip': '203.0.113.9' };
    const one6 = () => h({ httpMethod: 'POST', headers: ip, body: JSON.stringify(base) });
    for (let i = 0; i < 5; i++) assert.strictEqual((await one6()).statusCode, 200, `第 ${i + 1} 筆應該成功`);
    const r = await one6();
    assert.strictEqual(r.statusCode, 429);
    assert.strictEqual(JSON.parse(r.body).error, 'too-many-requests');
    assert.ok(Number(r.headers['Retry-After']) > 0);
    rl._reset();
  });
  await t('不同來源各自計算,不會被別人用完額度', async () => {
    const rl = require('../netlify/functions/lib/ratelimit');
    rl._reset();
    const post = (ip) => h({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': ip }, body: JSON.stringify(base) });
    for (let i = 0; i < 5; i++) await post('198.51.100.1');
    assert.strictEqual((await post('198.51.100.1')).statusCode, 429);
    assert.strictEqual((await post('198.51.100.2')).statusCode, 200);
    rl._reset();
  });
  await t('時間窗過了就回復額度', async () => {
    const rl = require('../netlify/functions/lib/ratelimit');
    rl._reset();
    let t0 = 1e12;
    rl._cfg.now = () => t0;
    const post = () => h({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': '192.0.2.7' }, body: JSON.stringify(base) });
    for (let i = 0; i < 5; i++) await post();
    assert.strictEqual((await post()).statusCode, 429);
    t0 += 10 * 60 * 1000 + 1;
    assert.strictEqual((await post()).statusCode, 200);
    rl._cfg.now = () => Date.now();
    rl._reset();
  });
  await t('內容有誤不佔額度:先送 6 筆壞資料,再送好資料仍成功', async () => {
    const rl = require('../netlify/functions/lib/ratelimit');
    rl._reset();
    const ip = { 'x-nf-client-connection-ip': '198.51.100.55' };
    for (let i = 0; i < 6; i++) {
      const r = await h({ httpMethod: 'POST', headers: ip, body: JSON.stringify(Object.assign({}, base, { items: [] })) });
      assert.strictEqual(r.statusCode, 400);
    }
    assert.strictEqual((await h({ httpMethod: 'POST', headers: ip, body: JSON.stringify(base) })).statusCode, 200);
    rl._reset();
  });

  await t('未設定 Airtable 時,內容有誤仍回 400', async () => {
    const h2 = load({});
    assert.strictEqual((await call(h2, Object.assign({}, base, { items: [] }))).status, 400);
  });

  if (fails.length) { console.error(fails.join('\n')); console.error(`\n${passed} 項通過、${fails.length} 項失敗`); process.exit(1); }
  console.log(`✓ 租借下單測試全部通過（共 ${passed} 項）`);
})();
