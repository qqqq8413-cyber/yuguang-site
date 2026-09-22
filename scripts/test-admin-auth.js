// 後台密碼驗證的自動測試(lib/auth.js + 6 支後台函式)
// 不連任何外部服務:GitHub／Airtable／Cloudinary 的環境變數不設定,函式通過驗證後會回「未設定」。
// 執行:node scripts/test-admin-auth.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.ADMIN_PASSWORD = 'correct-horse-battery';
for (const k of ['GITHUB_TOKEN', 'AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) delete process.env[k];
global.fetch = async () => { throw new Error('測試中不應連外'); };

const auth = require('../netlify/functions/lib/auth');
auth._cfg.delayMs = 0;
let clock = 1_800_000_000_000;
auth._cfg.now = () => clock;

const FN_DIR = path.join(__dirname, '../netlify/functions');
const ADMIN_FNS = ['get-content', 'save-content', 'sign-upload', 'list-orders', 'update-order', 'delete-order'];
// 每支函式的「正常請求」:通過驗證後不應再是 401/429
const REQ = {
  'get-content': { httpMethod: 'GET', queryStringParameters: { path: 'yuguang-site/content/gear.json' } },
  'save-content': { httpMethod: 'POST', body: JSON.stringify({ path: 'yuguang-site/content/gear.json', data: { gear: [] } }) },
  'sign-upload': { httpMethod: 'POST' },
  'list-orders': { httpMethod: 'GET' },
  'update-order': { httpMethod: 'POST', body: JSON.stringify({ id: 'recAAAAAAAAAAAAAA', status: '已報價' }) },
  'delete-order': { httpMethod: 'POST', body: JSON.stringify({ id: 'recAAAAAAAAAAAAAA' }) },
};
const call = (fn, key, ip = '1.1.1.1') => require(path.join(FN_DIR, fn)).handler(Object.assign({}, REQ[fn], {
  headers: Object.assign({ 'x-nf-client-connection-ip': ip }, key === undefined ? {} : { 'x-admin-key': key }),
}));
const body = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };

let passed = 0; const fails = [];
async function t(name, fn) { auth._reset(); try { await fn(); passed++; } catch (e) { fails.push(`✗ ${name}\n    ${e.message}`); } }

(async () => {
  // ---- 靜態檢查:每支後台函式都用共用驗證,沒有自己比對密碼 ----
  await t('6 支後台函式都呼叫 requireAdmin,且沒有自己比對密碼', () => {
    for (const fn of ADMIN_FNS) {
      const src = fs.readFileSync(path.join(FN_DIR, fn + '.js'), 'utf8');
      assert.ok(/await requireAdmin\(event\)/.test(src), `${fn} 沒有呼叫 requireAdmin`);
      assert.ok(!/x-admin-key|ADMIN_PASSWORD\s*\)|!==\s*PW/.test(src.replace(/^\/\/.*$/gm, '')), `${fn} 仍自己讀密碼`);
    }
  });

  for (const fn of ADMIN_FNS) {
    await t(`${fn}:正確密碼通過`, async () => {
      const r = await call(fn, 'correct-horse-battery');
      assert.ok(![401, 429].includes(r.statusCode), `回 ${r.statusCode} ${r.body}`);
    });
    await t(`${fn}:錯誤密碼 401`, async () => assert.strictEqual((await call(fn, 'wrong')).statusCode, 401));
    await t(`${fn}:沒帶密碼 401`, async () => assert.strictEqual((await call(fn, undefined)).statusCode, 401));
  }

  await t('錯 4 次仍 401 並告知剩餘次數,第 5 次起 429', async () => {
    for (let i = 1; i <= 4; i++) {
      const r = await call('list-orders', 'wrong' + i);
      assert.strictEqual(r.statusCode, 401); assert.strictEqual(body(r).remaining, 5 - i);
    }
    const r5 = await call('list-orders', 'wrong5');
    assert.strictEqual(r5.statusCode, 429);
    assert.strictEqual(r5.headers['Retry-After'], '900');
  });
  await t('鎖定期間,正確密碼也不接受', async () => {
    for (let i = 0; i < 5; i++) await call('list-orders', 'x');
    const r = await call('list-orders', 'correct-horse-battery');
    assert.strictEqual(r.statusCode, 429); assert.strictEqual(body(r).error, 'too-many-attempts');
  });
  await t('15 分鐘後解鎖', async () => {
    for (let i = 0; i < 5; i++) await call('list-orders', 'x');
    clock += 14 * 60 * 1000;
    assert.strictEqual((await call('list-orders', 'correct-horse-battery')).statusCode, 429);
    clock += 60 * 1000 + 1;
    assert.strictEqual((await call('list-orders', 'correct-horse-battery')).statusCode, 200);
  });
  await t('只鎖輸錯的那個來源,其他來源不受影響', async () => {
    for (let i = 0; i < 5; i++) await call('list-orders', 'x', '6.6.6.6');
    assert.strictEqual((await call('list-orders', 'correct-horse-battery', '6.6.6.6')).statusCode, 429);
    assert.strictEqual((await call('list-orders', 'correct-horse-battery', '2.2.2.2')).statusCode, 200);
  });
  await t('輸對一次就把錯誤次數歸零', async () => {
    for (let i = 0; i < 4; i++) await call('list-orders', 'x');
    assert.strictEqual((await call('list-orders', 'correct-horse-battery')).statusCode, 200);
    assert.strictEqual(body(await call('list-orders', 'x')).remaining, 4);
  });
  await t('沒帶密碼不算一次嘗試', async () => {
    for (let i = 0; i < 10; i++) await call('list-orders', undefined);
    assert.strictEqual((await call('list-orders', 'correct-horse-battery')).statusCode, 200);
  });
  await t('密碼長度不同也能安全比對(不會丟例外)', async () => {
    assert.strictEqual((await call('list-orders', 'a')).statusCode, 401);
    assert.strictEqual((await call('list-orders', 'x'.repeat(5000))).statusCode, 401);
  });
  await t('沒設定 ADMIN_PASSWORD 時一律拒絕', async () => {
    const pw = process.env.ADMIN_PASSWORD; delete process.env.ADMIN_PASSWORD;
    try { assert.strictEqual((await call('list-orders', '')).statusCode, 401); assert.strictEqual((await call('list-orders', 'undefined')).statusCode, 401); }
    finally { process.env.ADMIN_PASSWORD = pw; }
  });
  await t('輸錯時會延遲(拖慢逐一嘗試)', async () => {
    auth._cfg.delayMs = 150;
    const t0 = Date.now(); await call('list-orders', 'x'); const dt = Date.now() - t0;
    auth._cfg.delayMs = 0;
    assert.ok(dt >= 140, `只延遲了 ${dt}ms`);
  });

  if (fails.length) { console.error(fails.join('\n')); console.error(`\n${passed} 項通過、${fails.length} 項失敗`); process.exit(1); }
  console.log(`✓ 後台密碼驗證測試全部通過（共 ${passed} 項）`);
})();
