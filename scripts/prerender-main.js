#!/usr/bin/env node
/* 把 7 個主要頁面「原本只有 JS 才看得到」的內容，在部署時直接寫進 HTML。
 *
 * 為什麼：首頁、作品、器材、流程、關於、聯絡這幾頁的內容都是瀏覽器用 JS 從 content/*.json
 * 載入的。Google 會執行 JS，但 AI 搜尋的爬蟲（GPTBot、ClaudeBot、PerplexityBot）不會，
 * 它們看到的「關於嶼光」只有 88 個字。而且首頁的靜態 HTML 完全沒有連到 43 個作品／器材頁，
 * 那些頁面只能靠 sitemap 被發現。
 *
 * 做法：每頁在固定位置放 <!--pre:名稱--> … <!--/pre:名稱--> 兩個註解，這支程式把中間換成
 * 由 content/*.json 產生的 HTML。JS 照常運作（載入後會重畫同樣的內容），畫面不變。
 * 可重複執行：每次都是整段取代。執行：node scripts/prerender-main.js（build-pages 之後）
 */
const fs = require('fs');
const path = require('path');
const { generate, loadContent, ROOT } = require('./build-pages');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));
const NAV = [['pingmian.html', '平面作品'], ['dongtai.html', '動態作品'], ['qicai.html', '器材租賃'],
  ['liucheng.html', '製作流程'], ['wenda.html', '常見問題'], ['guanyu.html', '關於嶼光'], ['lianluo.html', '聯絡我們']];

const site = read('site.json');
const about = read('about.json');
const process_ = read('process.json');
const pages = generate(loadContent());
const of = (kind) => pages.filter((p) => p.kind === kind);

/* 導覽列：site.js 會在沒有 .sitenav 時才自己建一個，所以這裡先放好就不會重複 */
function nav(here) {
  return `<nav class="sitenav" id="sitenav" aria-label="主選單">` +
    NAV.map(([href, label]) =>
      `<a href="${href}"${href === here ? ' aria-current="page"' : ''}${label === '聯絡我們' ? ' class="cta"' : ''}>${esc(label)}</a>`).join('') +
    `</nav>`;
}

/* 頁尾：與 site.js 產生的內容相同（JS 載入後會換成同樣的一份） */
function foot() {
  const lid = String(site.line || '').replace(/^[@＠]/, '');
  const items = [
    site.email && `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`,
    lid && `<a href="https://line.me/R/ti/p/~${encodeURIComponent(lid)}" target="_blank" rel="noopener">LINE ${esc(lid)}</a>`,
    site.phone && `<a href="tel:${esc(String(site.phone).replace(/\s/g, ''))}">${esc(String(site.phone).replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3'))}</a>`,
  ].filter(Boolean);
  return `<div class="brand"><span class="zh">${esc(site.brandZh || '嶼光映像')}</span><span class="en">${esc(site.brandEn || 'PHOS OF ISLE')}</span></div>` +
    (items.length ? `<div class="contact">${items.join('')}</div>` : '') +
    (site.address ? `<div class="addr">${esc(site.address)}</div>` : '') +
    `<div class="copy">© ${new Date().getFullYear()} ${esc(site.brandZh || '嶼光映像')}</div>`;
}

/* 作品／器材清單:讓每個預先產生的頁面都有真正的 <a> 連結(原本只能靠 sitemap 找到);
   依分類分組,對訪客也是一份好掃讀的目錄 */
function linkGroups(heading, note, groups) {
  return `<section class="sitelinks"><h2>${esc(heading)}</h2>` +
    (note ? `<p class="note">${esc(note)}</p>` : '') +
    `<div class="grps">` + groups.map((g) =>
      `<div class="grp"><h3>${g.url ? `<a href="${g.url}">${esc(g.label)}</a>` : esc(g.label)}</h3>` +
      `<ul>${g.items.map((i) => `<li><a href="${i.url}">${esc(i.label)}</a>${i.meta ? `<span>${esc(i.meta)}</span>` : ''}</li>`).join('')}</ul></div>`).join('') +
    `</div></section>`;
}

const byCat = (list) => {
  const m = new Map();
  list.forEach((x) => { const k = x.cat || '其他'; if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return m;
};

const workList = () => {
  const albums = of('album'), works = of('work');
  const groups = albums.map((a) => ({
    label: a.title, url: a.url,
    items: works.filter((w) => w.cat === a.title).map((w) => ({ url: w.url, label: w.title, meta: w.sub || '' })),
  }));
  // 沒有專案的相簿本身就是一頁(分類頁不存在)
  const solo = works.filter((w) => !albums.some((a) => a.title === w.cat));
  if (solo.length) groups.push({ label: '其他', items: solo.map((w) => ({ url: w.url, label: w.title, meta: w.cat })) });
  return linkGroups('所有平面作品', '依分類列出,點進去可看完整照片牆。', groups);
};
const videoList = () => linkGroups('所有動態作品', '每支影片都有獨立頁面,含製作團隊與播放器。',
  [...byCat(of('video'))].map(([cat, vs]) => ({ label: cat, items: vs.map((v) => ({ url: v.url, label: v.title })) })));
const gearList = () => linkGroups('所有可租器材', '點進去可看規格、推薦用途與租借說明。',
  [...byCat(of('gear'))].map(([cat, gs]) => ({
    label: cat, items: gs.map((g) => ({ url: g.url, label: g.title, meta: g.price ? `NT$ ${g.price.toLocaleString('en-US')} / 日` : '價格另計' })) })));

/* 關於、流程、聯絡:寫進 JS 本來就會填的同一個容器,JS 載入後會換成同樣的內容,畫面不會重複 */
const values = () => (about.values || []).map((v) =>
  `<div class="value"><div class="en">${esc(v.en || '')}</div><h3>${esc(v.zh || '')}</h3><p>${esc(v.desc || '')}</p></div>`).join('');
const story = () => (about.story || []).map((t) => `<p>${esc(t)}</p>`).join('') +
  (about.sign ? `<p class="sign">${esc(about.sign)}</p>` : '');
const steps = () => (process_.steps || []).map((s) =>
  `<div class="step"><div class="txt"><div class="en">${esc(s.en || '')}</div><h3>${esc(s.zh || '')}</h3><p>${esc(s.desc || '')}</p></div></div>`).join('');
const lineId = () => String(site.line || '').replace(/^[@＠]/, '');
const socials = () => [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['google', 'Google 商家']]
  .filter(([k]) => site[k]).map(([k, label]) => `<a href="${esc(site[k])}" target="_blank" rel="noopener">${label}</a>`).join('');
/* 關於頁的「工作室資訊」與「合作單位」:給訪客也給 AI 的具體事實 */
const facts = () => {
  const f = about.facts || [], c = about.clients || [];
  if (!f.length && !c.length) return '';
  return (f.length ? `<h2>工作室資訊</h2><ul class="facts-list">${f.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '') +
    (c.length ? `<h2>合作單位</h2><ul class="clients">${c.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
};

const BLOCKS = {
  'index.html': { nav: nav(''), foot: foot() },
  'pingmian.html': { nav: nav('pingmian.html'), foot: foot(), list: workList() },
  'dongtai.html': { nav: nav('dongtai.html'), foot: foot(), list: videoList() },
  'qicai.html': { nav: nav('qicai.html'), foot: foot(), list: gearList() },
  'liucheng.html': { nav: nav('liucheng.html'), foot: foot(), steps: steps() },
  'guanyu.html': { nav: nav('guanyu.html'), foot: foot(), manifesto: esc(about.manifesto || ''), story: story(), values: values(), facts: facts() },
  'wenda.html': { nav: nav('wenda.html'), foot: foot() },
  'lianluo.html': {
    nav: nav('lianluo.html'), foot: foot(),
    email: esc(site.email || ''), line: esc(lineId()), phone: esc(site.phone || ''), address: esc(site.address || ''), socials: socials(),
  },
};

let filled = 0, missing = [];
for (const [file, blocks] of Object.entries(BLOCKS)) {
  const p = path.join(ROOT, file);
  let html = fs.readFileSync(p, 'utf8');
  for (const [key, content] of Object.entries(blocks)) {
    const re = new RegExp(`(<!--pre:${key}-->)[\\s\\S]*?(<!--/pre:${key}-->)`);
    if (!re.test(html)) { missing.push(`${file} 少了 <!--pre:${key}--> 標記`); continue; }
    html = html.replace(re, `$1\n${content}\n$2`);
    filled++;
  }
  fs.writeFileSync(p, html);
}
if (missing.length) { missing.forEach((m) => console.log('✗ ' + m)); process.exit(1); }
console.log(`✓ 主要頁面已寫入靜態內容（${Object.keys(BLOCKS).length} 頁、${filled} 個區塊）`);
