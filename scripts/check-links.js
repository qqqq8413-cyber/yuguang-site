#!/usr/bin/env node
// 檢查網站內部連結:HTML 裡的 href/src 與 site.js 導覽列指到的檔案都要存在(含子資料夾裡產生的頁面)
// 外部網址、#錨點、mailto/tel、程式組出來的網址(含 ${ })不檢查
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'yuguang-site');
const exists = (p) => {
  const f = path.join(root, decodeURIComponent(p));
  if (fs.existsSync(f) && fs.statSync(f).isFile()) return true;
  if (fs.existsSync(f + '.html')) return true; // Netlify 可省略 .html(例如 /後台)
  if (fs.existsSync(path.join(f, 'index.html'))) return true;
  return false;
};
const skip = (u) => !u || /^(https?:|\/\/|#|mailto:|tel:|data:|javascript:)/.test(u) || u.includes('${');

let bad = 0, total = 0;
const report = (file, u) => { bad++; console.log(`✗ ${file}：找不到「${u}」`); };

// 含部署時產生的 /work/、/video/、/rental/ 頁面(先跑 build-pages.js 才會有);
// 這些頁面都有 <base href="/">,連結同樣以網站根目錄為準
const walk = (dir, rel = '') => fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(dir, path.join(rel, e.name)) : e.name.endsWith('.html') ? [path.join(rel, e.name)] : []);
for (const file of walk(root)) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const u = m[1].trim();
    if (skip(u)) continue;
    total++;
    // 所有頁面都在網站根目錄,相對路徑與 / 開頭的路徑都以根目錄為準
    const p = u.split(/[?#]/)[0].replace(/^\//, '');
    if (p && !exists(p)) report(file, u);
  }
}
// site.js 導覽列的頁面清單
const siteJs = fs.readFileSync(path.join(root, 'assets', 'site.js'), 'utf8');
for (const m of siteJs.matchAll(/\['([a-z0-9_-]+\.html)'/g)) { total++; if (!exists(m[1])) report('assets/site.js', m[1]); }

console.log(bad ? `\n${bad} 個連結有問題（共檢查 ${total} 個）` : `✓ 內部連結全部正常（共 ${total} 個）`);
process.exit(bad ? 1 : 0);
