#!/usr/bin/env node
// 檢查每個 HTML 頁面(含產生的頁面)內嵌的 <script> 與 assets/*.js 都沒有語法錯誤(只解析,不執行),
// 確認結構化資料(JSON-LD)是合法 JSON,
// 並確認沒有人把字串資料組進 onclick 之類的行內事件(那等於把資料當程式碼執行)。
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
// 行內事件屬性(onclick="…")裡,不可以在 JS 字串中間插入資料:
//   onclick="copyText('${esc(x)}')" → x 只要含一個單引號就跳出字串,變成可執行的程式碼。
//   屬性層的 &#39; 擋不住:瀏覽器會先解碼屬性值,才把內容交給 JS。
//   正確做法是 data-* 屬性 + 事件委派(見 後台.html 的 data-copy)。
// 判斷方式:單引號在屬性值裡成對計算,出現在「字串內」的 ${…} 或 \' 就是把資料當程式碼。
const inlineHandlerRisk = (val) => {
  let inStr = false;
  for (let i = 0; i < val.length; i++) {
    if (val[i] === '\\' && val[i + 1] === "'") return "行內事件裡用 \\' 組字串";
    if (val[i] === "'") { inStr = !inStr; continue; }
    if (inStr && val[i] === '$' && val[i + 1] === '{') return '行內事件的 JS 字串裡插入了 ${…}';
  }
  return null;
};

// 含部署時產生的 /work/、/video/、/rental/ 頁面(先跑 build-pages.js 才會有)
const walk = (dir, rel = '') => fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(dir, path.join(rel, e.name)) : e.name.endsWith('.html') ? [path.join(rel, e.name)] : []);
for (const f of walk(root)) {
  const html = fs.readFileSync(path.join(root, f), 'utf8');
  let i = 0, j = 0;
  // 部署時寫進頁面的內容資料(<script type="application/json" id="yg-data-…">)必須是合法 JSON
  for (const m of html.matchAll(/<script[^>]*type="application\/json"[^>]*id="(yg-data-[a-z]+)"[^>]*>([\s\S]*?)<\/script>/g)) {
    n++;
    try { JSON.parse(m[2]); } catch (e) { bad++; console.log(`✗ ${f} 的 ${m[1]}：不是合法 JSON（${e.message}）`); }
  }
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="(?:application\/ld\+json|application\/json|module)")[^>]*>([\s\S]*?)<\/script>/g)) {
    i++; if (m[1].trim()) parse(m[1], `${f} 第 ${i} 段 script`);
  }
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    j++; parseLd(m[1], `${f} 第 ${j} 段結構化資料`);
  }
  for (const m of html.matchAll(/\son[a-z]+="([^"]*)"/g)) {
    n++;
    const why = inlineHandlerRisk(m[1]);
    if (why) { bad++; console.log(`✗ ${f}：${why} → ${m[1].slice(0, 90)}`); }
  }
}
for (const f of fs.readdirSync(path.join(root, 'assets')).filter((x) => x.endsWith('.js')))
  parse(fs.readFileSync(path.join(root, 'assets', f), 'utf8'), `assets/${f}`);
console.log(bad ? `\n${bad} 處有問題（共檢查 ${n} 處）` : `✓ 程式語法與行內事件全部正常（共檢查 ${n} 處）`);
process.exit(bad ? 1 : 0);
