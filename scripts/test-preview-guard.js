// 預覽版(deploy preview / branch deploy)不能寫入正式資料的自動測試
// 背景:2026-09-23 在預覽版後台存檔,寫進了正式站當時還不認得的欄位,導致正式站部署連續失敗。
// 執行:node scripts/test-preview-guard.js
const assert = require('assert');
const path = require('path');
const fs = require('fs');

process.env.ADMIN_PASSWORD = 'pw-for-test';
for (const k of ['GITHUB_TOKEN', 'AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) delete process.env[k];
global.fetch = async () => { throw new Error('測試中不應連外'); };

const FN_DIR = path.join(__dirname, '../netlify/functions');
const WRITE_FNS = ['save-content', 'update-order', 'delete-order', 'sign-upload']; // 會改到正式資料
const READ_FNS = ['get-content', 'list-orders'];                                    // 只讀,預覽版仍可用
const REQ = {
  'save-content': { httpMethod: 'POST', body: JSON.stringify({ path: 'yuguang-site/content/gear.json', data: { gear: [] } }) },
  'update-order': { httpMethod: 'POST', body: JSON.stringify({ id: 'recAAAAAAAAAAAAAA', status: '已報價' }) },
  'delete-order': { httpMethod: 'POST', body: JSON.stringify({ id: 'recAAAAAAAAAAAAAA' }) },
  'sign-upload': { httpMethod: 'POST' },
  'get-content': { httpMethod: 'GET', queryStringParameters: { path: 'yuguang-site/content/gear.json' } },
  'list-orders': { httpMethod: 'GET' },
};
// CONTEXT 在模組載入時讀取,每種情境都要重新載入函式
function load(context, fn) {
  if (context === undefined) delete process.env.CONTEXT; else process.env.CONTEXT = context;
  for (const k of Object.keys(require.cache)) if (k.includes('netlify/functions')) delete require.cache[k];
  return require(path.join(FN_DIR, fn)).handler;
}
const call = (context, fn, key = 'pw-for-test') =>
  load(context, fn)(Object.assign({}, REQ[fn], { headers: { 'x-admin-key': key, 'x-nf-client-connection-ip': '1.2.3.4' } }));
const body = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };

let passed = 0; const fails = [];
async function t(name, fn) { try { await fn(); passed++; } catch (e) { fails.push(`✗ ${name}\n    ${e.message}`); } }

(async () => {
  for (const ctx of ['deploy-preview', 'branch-deploy']) {
    for (const fn of WRITE_FNS) {
      await t(`${ctx}:${fn} 被擋下(403)並說明原因`, async () => {
        const r = await call(ctx, fn);
        assert.strictEqual(r.statusCode, 403);
        const d = body(r);
        assert.strictEqual(d.error, 'preview-readonly');
        assert.ok(/預覽版/.test(d.message) && /phosofisle\.com/.test(d.message), '訊息沒說清楚要去哪裡操作：' + d.message);
      });
    }
    for (const fn of READ_FNS) {
      await t(`${ctx}:${fn} 仍可讀取`, async () => {
        const r = await call(ctx, fn);
        assert.ok(![403].includes(r.statusCode), `被擋了：${r.statusCode} ${r.body}`);
      });
    }
    await t(`${ctx}:密碼錯誤時先擋密碼,不洩漏環境資訊`, async () => {
      const r = await call(ctx, 'save-content', 'wrong');
      assert.strictEqual(r.statusCode, 401);
    });
  }
  for (const fn of WRITE_FNS.concat(READ_FNS)) {
    await t(`正式站(production):${fn} 照常運作`, async () => {
      const r = await call('production', fn);
      assert.notStrictEqual(r.statusCode, 403);
    });
    await t(`沒有 CONTEXT(本機／其他環境):${fn} 照常運作`, async () => {
      const r = await call(undefined, fn);
      assert.notStrictEqual(r.statusCode, 403);
    });
  }
  await t('後台頁面本身也會先擋(IS_PREVIEW)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../yuguang-site/後台.html'), 'utf8');
    assert.ok(/const IS_PREVIEW=/.test(src), '後台沒有判斷預覽版');
    for (const f of ['saveContent', 'uploadImage', 'deleteOrder', 'setOrderStatus']) {
      const i = src.indexOf('function ' + f);
      assert.ok(i > 0, `找不到 ${f}`);
      assert.ok(src.slice(i, i + 400).includes('IS_PREVIEW'), `${f} 沒有先擋預覽版`);
    }
  });

  if (fails.length) { console.error(fails.join('\n')); console.error(`\n${passed} 項通過、${fails.length} 項失敗`); process.exit(1); }
  console.log(`✓ 預覽版唯讀測試全部通過（共 ${passed} 項）`);
})();
