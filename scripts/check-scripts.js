#!/usr/bin/env node
// 檢查每個 HTML 頁面(含產生的頁面)內嵌的 <script> 與 assets/*.js 都沒有語法錯誤(只解析,不執行),
// 並確認結構化資料(JSON-LD)是合法 JSON
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
// 結構化資料(JSON-LD)必須是合法 JSON,且有 @context 與 @type,否則 Google 會整段忽略
const parseLd = (code, label) => {
  n++;
  try {
    const d = JSON.parse(code);
    if (!d || !d['@context'] || !(d['@type'] || d['@graph'])) throw new Error('缺少 @context 或 @type');
  } catch (e) { bad++; console.log(`✗ ${label}：${e.message}`); }
};
// 含部署時產生的 /work/、/video/、/rental/ 頁面(先跑 build-pages.js 才會有)
const walk = (dir, rel = '') => fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(dir, path.join(rel, e.name)) : e.name.endsWith('.html') ? [path.join(rel, e.name)] : []);
for (const f of walk(root)) {
  const html = fs.readFileSync(path.join(root, f), 'utf8');
  let i = 0, j = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="(?:application\/ld\+json|module)")[^>]*>([\s\S]*?)<\/script>/g)) {
    i++; if (m[1].trim()) parse(m[1], `${f} 第 ${i} 段 script`);
  }
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    j++; parseLd(m[1], `${f} 第 ${j} 段結構化資料`);
  }
}
for (const f of fs.readdirSync(path.join(root, 'assets')).filter((x) => x.endsWith('.js')))
  parse(fs.readFileSync(path.join(root, 'assets', f), 'utf8'), `assets/${f}`);
console.log(bad ? `\n${bad} 段程式有語法錯誤（共 ${n} 段）` : `✓ 程式語法全部正常（共 ${n} 段）`);
process.exit(bad ? 1 : 0);
