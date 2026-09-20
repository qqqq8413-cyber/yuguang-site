#!/usr/bin/env node
/* 由 content/*.json 產生「每個作品／器材一頁」的靜態頁面,以及 sitemap.xml
 *   /video/<影片ID>/     單一動態作品(標題、封面、播放器、製作團隊)
 *   /work/<分類>/        單一相簿(沒有專案時就是照片牆)
 *   /work/<分類>/<專案>/ 單一專案照片牆
 *   /rental/<器材代稱>/  單一器材(照片、日租價、規格、推薦用途、租借說明)
 * 目的:分享到 LINE／Facebook 時顯示該作品的標題與封面;Google 也能逐件收錄。
 * 產生的檔案不進版控(見 .gitignore),每次部署時重新產生。
 * 本機預覽:node scripts/build-pages.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'yuguang-site');
const SITE = 'https://phosofisle.com';
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const attr = (s) => esc(s).replace(/\n/g, ' ');
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const ytid = (s) => { const m = String(s || '').trim().match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : String(s || '').trim(); };
const cld = (u, t) => (u && u.includes('res.cloudinary.com') && u.includes('/upload/') ? u.replace('/upload/', `/upload/${t}/`) : u);
const img = (u, w) => cld(u, `f_auto,q_auto,w_${w}`) || u;
const gearImg = (u, w) => cld(u, `e_trim:10/c_limit,w_${w},h_${w}/f_auto,q_auto`) || u;
const abs = (u) => (!u ? `${SITE}/images/og.jpg` : /^https?:/.test(u) ? u : SITE + (u.startsWith('/') ? u : '/' + u));
const lines = (t) => String(t || '').split(/・|\n/).map((x) => x.trim()).filter(Boolean);

const pages = []; // { url, html, lastmod, priority }

function shell({ url, title, desc, image, type = 'article', jsonld, crumb, body }) {
  const head = [
    '<!DOCTYPE html>', '<html lang="zh-Hant">', '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<base href="/">',
    `<title>${esc(title)} · 嶼光映像</title>`,
    `<meta name="description" content="${attr(desc)}">`,
    `<link rel="canonical" href="${SITE}${url}">`,
    '<meta name="theme-color" content="#f3f1ec">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    `<meta property="og:type" content="${type}">`,
    '<meta property="og:site_name" content="嶼光映像 PHOS OF ISLE">',
    '<meta property="og:locale" content="zh_TW">',
    `<meta property="og:title" content="${attr(title)} · 嶼光映像">`,
    `<meta property="og:description" content="${attr(desc)}">`,
    `<meta property="og:url" content="${SITE}${url}">`,
    `<meta property="og:image" content="${attr(image)}">`,
    `<meta property="og:image:alt" content="${attr(title)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500&display=swap" media="print" onload="this.media=\'all\'">',
    '<link rel="stylesheet" href="assets/page.css">',
    '<link rel="stylesheet" href="assets/site.css">',
    '<script src="assets/site.js" defer></script>',
    '</head>', '<body>',
    '<svg width="0" height="0" style="position:absolute"><symbol id="logo" viewBox="0 0 192 208">',
    '<g fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="butt">',
    '<line x1="97" y1="8" x2="97" y2="200"/><line x1="127" y1="70" x2="165" y2="23"/>',
    '<line x1="99" y1="102" x2="184" y2="102"/><line x1="8" y1="94" x2="8" y2="200"/>',
    '<line x1="8" y1="200" x2="97" y2="200"/><line x1="97" y1="200" x2="184" y2="200"/>',
    '<line x1="184" y1="200" x2="184" y2="172"/></g></symbol></svg>',
    '<div class="topbar"><a class="mark" href="index.html"><svg><use href="#logo"/></svg><span class="name">嶼光映像</span></a></div>',
    '<div class="wrap">',
    `<nav class="crumb">${crumb}</nav>`,
  ].join('\n');
  return `${head}\n${body}\n</div>\n</body>\n</html>\n`;
}

const relatedList = (title, items) =>
  items.length ? `<section class="more"><h2>${esc(title)}</h2><ul>${items.map((i) => `<li><a href="${i.url}">${esc(i.label)}</a></li>`).join('')}</ul></section>` : '';

/* ── 動態作品 ── */
function buildVideos(videos) {
  const list = videos.filter((v) => v.yt);
  // Netlify 的網址不分大小寫(會轉成小寫),而 YouTube 影片 ID 分大小寫:
  // 路徑一律用小寫,萬一有兩支只差大小寫的 ID 就加序號
  const seen = new Map();
  const pathId = (id) => { const k = id.toLowerCase(); const n = (seen.get(k) || 0) + 1; seen.set(k, n); return n === 1 ? k : `${k}-${n}`; };
  list.forEach((v, n) => {
    const id = ytid(v.yt);
    const url = `/video/${pathId(id)}/`;
    const cover = v.cover ? abs(cld(v.cover, 'e_trim:20/f_auto,q_auto,w_1200')) : `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
    const meta = [v.client, v.year].filter(Boolean).join(' · ');   // 分類已顯示在上方 kicker
    const desc = clip(v.desc || `${v.title}｜${[v.cat, meta].filter(Boolean).join(' · ')}。嶼光映像的動態影像作品。`, 150);
    const credits = String(v.credits || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.search(/[:：|｜]/);
      return i < 0 ? { role: '', name: l } : { role: l.slice(0, i).trim(), name: l.slice(i + 1).trim() };
    }).filter((c) => c.name);
    const others = list.filter((x) => x !== v && x.cat === v.cat).slice(0, 5).map((x) => ({ url: `/video/${ytid(x.yt).toLowerCase()}/`, label: x.title || '作品' }));
    const body = [
      `<header class="phead"><div class="kicker">${esc(v.cat || 'Videography')}</div><h1>${esc(v.title || '動態作品')}</h1>`,
      v.sub ? `<div class="meta">${esc(v.sub)}</div>` : '',
      meta ? `<div class="meta">${esc(meta)}</div>` : '',
      v.desc ? `<p class="lead">${esc(v.desc)}</p>` : '', '</header>',
      `<div class="player"><iframe src="https://www.youtube.com/embed/${id}?rel=0" title="${attr(v.title)}" allow="encrypted-media; fullscreen" allowfullscreen loading="lazy"></iframe></div>`,
      credits.length ? `<section class="sec"><h2>製作團隊</h2><div class="credits">${credits.map((c) => `<div class="credit">${c.role ? `<div class="role">${esc(c.role)}</div>` : ''}<div class="name">${esc(c.name)}</div></div>`).join('')}</div></section>` : '',
      `<div class="cta"><a class="solid" href="lianluo.html?type=動態影像">預約諮詢</a><a href="dongtai.html?v=${id}">看更多動態作品</a></div>`,
      relatedList(`更多${v.cat || '作品'}`, others),
    ].join('\n');
    pages.push({
      url, priority: '0.8',
      html: shell({
        url, title: v.title || '動態作品', desc, image: cover, type: 'video.other', crumb: `<a href="index.html">首頁</a><span>›</span><a href="dongtai.html">動態作品</a><span>›</span>${esc(v.title || '')}`,
        jsonld: {
          '@context': 'https://schema.org', '@type': 'VideoObject', name: v.title || '動態作品', description: desc,
          thumbnailUrl: cover, embedUrl: `https://www.youtube.com/embed/${id}`, url: SITE + url,
          creator: { '@type': 'Organization', name: '嶼光映像', url: SITE + '/' },
        },
        body,
      }),
    });
  });
}

/* ── 平面作品 ── */
function photoWall(photos, alt) {
  return `<div class="shots">${photos.map((p, i) => {
    const w = p.w, h = p.h;
    return `<figure><img src="${attr(img(p.image, 900))}" srcset="${[600, 900, 1400].map((x) => `${img(p.image, x)} ${x}w`).join(', ')}" sizes="(max-width:520px) 92vw, (max-width:900px) 46vw, 31vw" alt="${attr(p.caption || `${alt} ${String(i + 1).padStart(2, '0')}`)}"${w && h ? ` width="${w}" height="${h}"` : ''} loading="${i < 3 ? 'eager' : 'lazy'}" decoding="async"></figure>`;
  }).join('')}</div>`;
}
function buildAlbums(albums) {
  albums.forEach((a, ai) => {
    const aSlug = a.slug || `album-${ai}`;
    const projects = a.projects || [];
    const albumUrl = `/work/${aSlug}/`;
    const firstImg = (n) => (n.cover ? n.cover : (n.photos && n.photos[0] && n.photos[0].image) || (n.projects || []).map((p) => (p.photos || [])[0] && p.photos[0].image).find(Boolean));
    const mk = (node, url, title, parentCrumb, photos, related) => {
      const cover = abs(img(firstImg(node) || '', 1200));
      const desc = clip(`${title}｜${a.zh}．嶼光映像平面攝影作品（屏東），共 ${photos.length} 張照片。`, 150);
      const body = [
        `<header class="phead"><div class="kicker">${esc(a.en || 'Photography')}</div><h1>${esc(title)}</h1>`,
        `<div class="meta">${esc(a.zh)}${photos.length ? ` · ${photos.length} 張照片` : ''}</div></header>`,
        photos.length ? `<section class="sec">${photoWall(photos, title)}</section>` : '',
        `<div class="cta"><a class="solid" href="lianluo.html?type=平面攝影">預約拍攝</a><a href="pingmian.html?album=${encodeURIComponent(aSlug)}">看更多平面作品</a></div>`,
        relatedList('同系列', related),
      ].join('\n');
      pages.push({
        url, priority: '0.7',
        html: shell({
          url, title, desc, image: cover, crumb: parentCrumb,
          jsonld: {
            '@context': 'https://schema.org', '@type': 'ImageGallery', name: title, description: desc, url: SITE + url,
            image: photos.slice(0, 10).map((p) => abs(img(p.image, 1200))),
            author: { '@type': 'Organization', name: '嶼光映像', url: SITE + '/' },
          },
          body,
        }),
      });
    };
    const baseCrumb = `<a href="index.html">首頁</a><span>›</span><a href="pingmian.html">平面作品</a>`;
    if (projects.length) {
      projects.forEach((p, pi) => {
        const pSlug = p.slug || `project-${pi}`;
        const others = projects.filter((x) => x !== p).map((x, i) => ({ url: `/work/${aSlug}/${x.slug || `project-${i}`}/`, label: x.zh || '專案' })).slice(0, 6);
        mk(p, `/work/${aSlug}/${pSlug}/`, p.zh || a.zh, `${baseCrumb}<span>›</span><a href="${albumUrl}">${esc(a.zh)}</a><span>›</span>${esc(p.zh || '')}`, p.photos || [], others);
      });
      // 分類頁:列出各專案
      const body = [
        `<header class="phead"><div class="kicker">${esc(a.en || 'Photography')}</div><h1>${esc(a.zh)}</h1>`,
        `<div class="meta">${projects.length} 個專案</div></header>`,
        `<section class="sec"><div class="shots">${projects.map((p, pi) => {
          const c = firstImg(p); const u = `/work/${aSlug}/${p.slug || `project-${pi}`}/`;
          return `<figure><a href="${u}">${c ? `<img src="${attr(img(c, 900))}" alt="${attr(p.zh || '')}" loading="lazy" decoding="async">` : ''}<figcaption class="meta">${esc(p.zh || '')}</figcaption></a></figure>`;
        }).join('')}</div></section>`,
        `<div class="cta"><a class="solid" href="lianluo.html?type=平面攝影">預約拍攝</a><a href="pingmian.html?album=${encodeURIComponent(aSlug)}">在作品集中瀏覽</a></div>`,
      ].join('\n');
      pages.push({
        url: albumUrl, priority: '0.7',
        html: shell({
          url: albumUrl, title: a.zh, desc: clip(`${a.zh}｜嶼光映像平面攝影作品（屏東），共 ${projects.length} 個專案。`, 150),
          image: abs(img(firstImg(a) || '', 1200)), crumb: `${baseCrumb}<span>›</span>${esc(a.zh)}`,
          jsonld: {
            '@context': 'https://schema.org', '@type': 'CollectionPage', name: a.zh, url: SITE + albumUrl,
            hasPart: projects.map((p, pi) => ({ '@type': 'ImageGallery', name: p.zh || '', url: `${SITE}/work/${aSlug}/${p.slug || `project-${pi}`}/` })),
          },
          body,
        }),
      });
    } else {
      mk(a, albumUrl, a.zh, `${baseCrumb}<span>›</span>${esc(a.zh)}`, a.photos || [], []);
    }
  });
}

/* ── 器材 ── */
function buildGear(gear) {
  gear.forEach((g, gi) => {
    const slug = g.slug || `gear-${gi}`;
    const url = `/rental/${slug}/`;
    const has = typeof g.price === 'number' && g.price > 0;
    const cover = g.image ? abs(gearImg(g.image, 1200)) : `${SITE}/images/og.jpg`;
    const desc = clip(g.desc || `${g.name}｜嶼光映像影像器材日租（屏東）。${has ? `日租 NT$ ${g.price}。` : ''}`, 150);
    const others = gear.filter((x) => x !== g && x.cat === g.cat).slice(0, 5).map((x, i) => ({ url: `/rental/${x.slug || `gear-${i}`}/`, label: x.name }));
    const body = [
      '<div class="gearhead">',
      g.image ? `<div class="shot"><img src="${attr(gearImg(g.image, 1000))}" alt="${attr(g.name)}" loading="eager" decoding="async"></div>` : '<div></div>',
      `<div><header class="phead" style="border:0;padding-bottom:0"><div class="kicker">${esc(g.cat || 'Rental')}</div><h1>${esc(g.name)}</h1>`,
      `<div class="price"><b>${has ? 'NT$ ' + g.price.toLocaleString('en-US') : '價格另計'}</b>${has ? '<span>/ 日</span>' : ''}</div>`,
      g.desc ? `<p class="lead">${esc(g.desc)}</p>` : '', '</header>',
      `<div class="cta"><a class="solid" href="qicai.html?item=${encodeURIComponent(slug)}">加入租借</a><a href="lianluo.html?type=器材租賃">詢問搭配</a></div></div></div>`,
      lines(g.uses).length ? `<section class="sec"><h2>推薦用途</h2><ul class="specs">${lines(g.uses).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '',
      lines(g.spec).length ? `<section class="sec"><h2>規格重點</h2><ul class="specs">${lines(g.spec).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '',
      g.note ? `<section class="sec"><h2>租借說明</h2><p class="note">${esc(g.note)}</p></section>` : '',
      relatedList(`其他${g.cat || '器材'}`, others),
    ].join('\n');
    const jsonld = {
      '@context': 'https://schema.org', '@type': 'Product', name: g.name, description: desc, url: SITE + url,
      category: g.cat, image: g.image ? [cover] : undefined,
      brand: { '@type': 'Brand', name: String(g.name).split(' ')[0] },
    };
    if (has) jsonld.offers = {
      '@type': 'Offer', url: SITE + url, priceCurrency: 'TWD', price: String(g.price),
      availability: (g.qty === 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock'),
      priceSpecification: { '@type': 'UnitPriceSpecification', price: String(g.price), priceCurrency: 'TWD', unitText: '日' },
      seller: { '@type': 'Organization', name: '嶼光映像' },
    };
    pages.push({
      url, priority: '0.8',
      html: shell({
        url, title: g.name, desc, image: cover, type: 'product',
        crumb: `<a href="index.html">首頁</a><span>›</span><a href="qicai.html">器材租賃</a><span>›</span>${esc(g.name)}`,
        jsonld, body,
      }),
    });
  });
}

/* ── 輸出 ── */
function write() {
  // 先清掉上次產生的頁面,避免改了代稱之後留下舊網址
  for (const d of ['video', 'work', 'rental']) fs.rmSync(path.join(ROOT, d), { recursive: true, force: true });
  const today = new Date().toISOString().slice(0, 10);
  for (const p of pages) {
    const dir = path.join(ROOT, p.url.replace(/^\/|\/$/g, ''));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), p.html);
  }
  const statics = [['/', '1.0'], ['/pingmian.html', '0.9'], ['/dongtai.html', '0.9'], ['/qicai.html', '0.9'],
    ['/liucheng.html', '0.6'], ['/guanyu.html', '0.6'], ['/lianluo.html', '0.7']];
  const urls = statics.concat(pages.map((p) => [p.url, p.priority]));
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
    ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
      .concat(urls.map(([u, pr]) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><priority>${pr}</priority></url>`))
      .concat('</urlset>', '').join('\n'));
  console.log(`✓ 產生 ${pages.length} 個單頁、sitemap 共 ${urls.length} 筆`);
}

buildVideos(read('videos.json').videos || []);
buildAlbums(read('albums.json').albums || []);
buildGear(read('gear.json').gear || []);
write();
