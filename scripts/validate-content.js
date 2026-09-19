#!/usr/bin/env node
// 檢查 yuguang-site/content/*.json 是否符合格式(規則在 netlify/functions/lib/content-schema.js)
// 用法:node scripts/validate-content.js      → 全部通過回傳 0,有錯回傳 1 並列出錯誤
const fs = require('fs');
const path = require('path');
const { validateContent } = require('../netlify/functions/lib/content-schema');

const dir = path.join(__dirname, '..', 'yuguang-site', 'content');
let failed = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
  catch (e) { console.log(`✗ ${f}：不是有效的 JSON（${e.message}）`); failed++; continue; }
  const errs = validateContent(f, data);
  if (errs.length) { failed++; console.log(`✗ ${f}`); errs.forEach((e) => console.log(`    ${e}`)); }
  else console.log(`✓ ${f}`);
}
process.exit(failed ? 1 : 0);
