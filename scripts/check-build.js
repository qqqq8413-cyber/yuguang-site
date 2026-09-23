#!/usr/bin/env node
// 檢查部署時產生的頁面與 sitemap(先跑 node scripts/build-pages.js)
//   1. 每個產生的頁面:canonical、og:url 等於自己的網址,標題與 h1 都有
//   2. sitemap.xml:網址都是正式網域、沒有重複、都指到存在的頁面;產生的頁面都有列進去
//   3. 網址穩定:把相簿/專案/器材/影片的順序反過來、中文名稱全部改掉,產生的網址必須完全相同
//   4. 產生的檔案沒有被 commit 進 repo(它們每次部署都會重新產生)
//   5. 主要 7 頁:不靠 JS 就有導覽列、聯絡資訊與作品連結(prerender-main.js 的成果)
//   6. 標題:每頁都要有、不可重複(重複只提醒);結構化資料語意:器材是「出租」(LeaseOut、按日計價);影片有上傳日期(缺的只提醒,不擋)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { generate, loadContent, SITE, ROOT } = require('./build-pages');

const errs = [], warns = [];
const bad = (m) => errs.push(m);
const warn = (m) => warns.push(m);
const GEN_DIRS = ['work', 'video', 'rental'];

// ---------- 1. 產生的頁面 ----------
const walk = (rel) => {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(rel, e.name)) : e.name === 'index.html' ? [rel] : []);
};
const built = GEN_DIRS.flatMap((d) => walk(d)).map((rel) => '/' + rel.split(path.sep).join('/') + '/');
const titles = new Map(); // 搜尋結果用的標題 → 用了這個標題的頁面
if (!built.length) bad('找不到產生的頁面,請先執行 node scripts/build-pages.js');

const attrOf = (html, re) => { const m = html.match(re); return m ? m[1] : null; };
for (const url of built) {
  const html = fs.readFileSync(path.join(ROOT, url, 'index.html'), 'utf8');
  const canon = attrOf(html, /<link rel="canonical" href="([^"]*)">/);
  const ogUrl = attrOf(html, /<meta property="og:url" content="([^"]*)">/);
  if (canon !== SITE + url) bad(`${url}：canonical 是「${canon}」，應為「${SITE + url}」`);
  if (ogUrl !== SITE + url) bad(`${url}：og:url 是「${ogUrl}」，應為「${SITE + url}」`);
  const tm = html.match(/<title>([^<]+) · 嶼光映像<\/title>/);
  if (!tm) bad(`${url}：缺少頁面標題`);
  else titles.set(tm[1], (titles.get(tm[1]) || []).concat(url));
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) bad(`${url}：h1 應該剛好 1 個，目前 ${h1} 個`);
  // Netlify 會把網址轉小寫,所以一律小寫;影片用 YouTube ID(可能有 _),其餘用代稱
  const okUrl = /^\/video\/[a-z0-9_-]+\/$/.test(url) || /^\/(work|rental)\/[a-z0-9-]+\/([a-z0-9-]+\/)?$/.test(url);
  if (!okUrl) bad(`${url}：網址格式不對（只能有小寫英數、-，影片可有 _）`);

  // 5. 結構化資料語意
  const ldm = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let ld = null; try { ld = ldm && JSON.parse(ldm[1]); } catch (e) { bad(`${url}：結構化資料不是合法 JSON`); }
  if (ld && ld['@type'] === 'VideoObject') {
    if (!ld.uploadDate) warn(`${url}（${ld.name}）：沒有上傳日期，Google 不會把它當成影片結果顯示。請在後台該影片填「YouTube 上傳日期」`);
    else if (isNaN(Date.parse(ld.uploadDate))) bad(`${url}：uploadDate「${ld.uploadDate}」不是有效日期`);
  }
  if (ld && ld['@type'] === 'Product' && ld.offers) {
    const o = ld.offers, ps = o.priceSpecification || {};
    if (o.businessFunction !== 'http://purl.org/goodrelations/v1#LeaseOut') bad(`${url}：器材的 offers 要標明出租（businessFunction LeaseOut），否則會被當成出售`);
    if (ps.unitCode !== 'DAY') bad(`${url}：器材價格要標明「每日」（priceSpecification.unitCode = DAY）`);
  }
}

// 標題重複:Google 會分不出這幾頁的差別。多半是內容的名稱重複(例如兩個專案同名),
// 所以只提醒、不擋,請在後台把名稱改得有區別。
for (const [t, urls] of titles) {
  if (urls.length > 1) warn(`有 ${urls.length} 頁的標題都是「${t}」：${urls.join('、')}　→ 建議在後台把名稱改得有區別（例如加上客戶或年份）`);
}

// ---------- 主要頁面的靜態內容 ----------
// AI 搜尋的爬蟲不執行 JS。這幾頁若退回「只有標題」的狀態,等於對 AI 隱形,所以這裡把關。
const MAIN = {
  'index.html': { nav: true, min: 150 },
  'pingmian.html': { nav: true, min: 250, deep: '/work/' },
  'dongtai.html': { nav: true, min: 300, deep: '/video/' },
  'qicai.html': { nav: true, min: 300, deep: '/rental/' },
  'liucheng.html': { nav: true, min: 400 },
  'guanyu.html': { nav: true, min: 400 },
  'lianluo.html': { nav: true, min: 300 },
  'xuzhi.html': { nav: true, min: 1800 },   // 純靜態頁:內容本來就全在 HTML 裡
};
for (const [file, want] of Object.entries(MAIN)) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) { bad(`找不到 ${file}`); continue; }
  const html = fs.readFileSync(p, 'utf8');
  if (/<!--pre:([a-z]+)-->\s*<!--\/pre:\1-->/.test(html)) bad(`${file}：有空的 <!--pre:…--> 區塊，請先執行 node scripts/prerender-main.js`);
  if (want.nav && !/<nav class="sitenav"/.test(html)) bad(`${file}：靜態 HTML 沒有導覽列（AI 爬蟲會找不到其他頁面）`);
  // 去掉標籤與 script/style 後的純文字長度
  const text = html.replace(/<(script|style|svg)[^>]*>[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < want.min) bad(`${file}：不執行 JS 時只有 ${text.length} 字（至少要 ${want.min}），靜態內容可能沒寫進去`);
  if (want.deep) {
    const n = (html.match(new RegExp(`href="${want.deep}`, 'g')) || []).length;
    if (n < 5) bad(`${file}：只有 ${n} 個連到 ${want.deep} 的靜態連結，作品頁會只能靠 sitemap 被發現`);
  }
}

// ---------- 2. sitemap ----------
const smPath = path.join(ROOT, 'sitemap.xml');
if (!fs.existsSync(smPath)) bad('找不到 sitemap.xml');
else {
  const xml = fs.readFileSync(smPath, 'utf8');
  if (!xml.startsWith('<?xml')) bad('sitemap.xml：開頭不是 XML 宣告');
  const open = (xml.match(/<url>/g) || []).length, close = (xml.match(/<\/url>/g) || []).length;
  if (open !== close) bad(`sitemap.xml：<url> 開關標籤數量不一致（${open} / ${close}）`);
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/.test(xml)) bad('sitemap.xml：有未跳脫的 & 符號');
  // 沒有真正的修改日期就不放 lastmod(每次部署都填今天,Google 會不再相信);image:title/caption 已被 Google 停用
  if (/<lastmod>/.test(xml)) bad('sitemap.xml：不應放 lastmod（沒有真正的頁面修改日期）');
  if (/<image:(title|caption)>/.test(xml)) bad('sitemap.xml：image:title／image:caption 已被 Google 停用，只放 image:loc');
  const locs = [...xml.matchAll(/<url><loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  if (locs.length !== open) bad(`sitemap.xml：有 ${open} 筆 <url> 但只找到 ${locs.length} 個 <loc>`);
  const seen = new Set();
  for (const loc of locs) {
    if (seen.has(loc)) bad(`sitemap.xml：重複的網址 ${loc}`);
    seen.add(loc);
    if (!loc.startsWith(SITE + '/')) { bad(`sitemap.xml：不是正式網域的網址 ${loc}`); continue; }
    const p = decodeURIComponent(loc.slice(SITE.length));
    const file = p.endsWith('/') ? path.join(ROOT, p, 'index.html') : path.join(ROOT, p);
    if (!fs.existsSync(file)) bad(`sitemap.xml：${loc} 指到不存在的頁面`);
  }
  for (const url of built) if (!seen.has(SITE + url)) bad(`sitemap.xml：漏掉產生的頁面 ${url}`);
}

// ---------- 3. 網址穩定 ----------
const content = loadContent();
const urlsOf = (c) => generate(c).map((p) => p.url);
const base = urlsOf(content);
const dup = base.filter((u, i) => base.indexOf(u) !== i);
if (dup.length) bad(`有兩個頁面產生了同一個網址：${[...new Set(dup)].join('、')}`);
const shuffled = JSON.parse(JSON.stringify(content));
shuffled.videos.reverse().forEach((v, i) => { v.title = `改名影片${i}`; v.cat = `改名分類${i % 3}`; });
shuffled.albums.reverse().forEach((a, i) => {
  a.zh = `改名相簿${i}`; a.en = `Renamed ${i}`;
  (a.projects || []).reverse().forEach((p, j) => { p.zh = `改名專案${j}`; p.en = `Renamed ${j}`; });
});
shuffled.gear.reverse().forEach((g, i) => { g.name = `改名器材 ${i}`; g.cat = `改名分類${i % 2}`; });
const after = urlsOf(shuffled);
const sortU = (a) => [...a].sort().join('\n');
if (sortU(base) !== sortU(after)) {
  const gone = base.filter((u) => !after.includes(u)), added = after.filter((u) => !base.includes(u));
  bad(`調整順序或改名後網址變了。消失：${gone.join('、') || '無'}；新增：${added.join('、') || '無'}`);
}
if (built.length && sortU(base) !== sortU(built)) bad('產生的頁面與目前內容不一致，請重新執行 node scripts/build-pages.js');

// ---------- 4. 產生的檔案不進 repo ----------
try {
  const tracked = execSync(`git ls-files ${GEN_DIRS.map((d) => 'yuguang-site/' + d).join(' ')} yuguang-site/sitemap.xml`,
    { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
  if (tracked) bad(`這些產生的檔案不應該 commit 進 repo（見 .gitignore）：\n    ${tracked.split('\n').slice(0, 5).join('\n    ')}`);
} catch (e) { /* 沒有 git 的環境就略過 */ }

warns.forEach((m) => console.log('△ ' + m));
if (errs.length) {
  errs.forEach((m) => console.log('✗ ' + m));
  console.log(`\n${errs.length} 個問題`);
  process.exit(1);
}
console.log(`✓ 產生的頁面檢查通過（${built.length} 頁；sitemap 正常；調整順序與改名後網址不變）`);
