#!/usr/bin/env node
// 檢查每個 HTML 頁面內嵌的 <script> 與 assets/*.js 都沒有語法錯誤(只解析,不執行)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'yuguang-site');
let bad = 0, n = 0;
const parse = (code, label) => {
  n++;
  try { new vm.Script(code, { filename: label }); }
  catch (e) { bad++; console.log(`✗ ${label}：${e.message}`); }
};
for (const f of fs.readdirSync(root).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(root, f), 'utf8');
  let i = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="(?:application\/ld\+json|module)")[^>]*>([\s\S]*?)<\/script>/g)) {
    i++; if (m[1].trim()) parse(m[1], `${f} 第 ${i} 段 script`);
  }
}
for (const f of fs.readdirSync(path.join(root, 'assets')).filter((x) => x.endsWith('.js')))
  parse(fs.readFileSync(path.join(root, 'assets', f), 'utf8'), `assets/${f}`);
console.log(bad ? `\n${bad} 段程式有語法錯誤（共 ${n} 段）` : `✓ 程式語法全部正常（共 ${n} 段）`);
process.exit(bad ? 1 : 0);
