#!/usr/bin/env node
/* 產生主要頁面的分享預覽圖 yuguang-site/images/share-card.jpg(1200×630)。
 *
 * 版面照搬首頁主視覺:照片滿版＋同樣的暗色漸層,左邊 LOGO、嶼光映像、PHOS OF ISLE、標語,
 * 底下一條細線,左邊服務項目、右邊網址(對應主視覺底部那一列)。
 * 底圖用主視覺輪播裡沒有人像的「好屏友市集」夜景;封面左上、右上角有活動主辦的標誌,
 * 所以照片放大到 1560px 寬、往左上對齊再往上推 80px:上方兩個角落的標誌裁掉,亮燈的攤位移到右半邊,
 * 左邊夜空的暗處留給文字(攤位或路人壓在字後面會看不清楚)。
 *
 * 用本機的 Chrome 開一個 1200×630 的頁面截圖(不是每次部署都跑,改了文案或想換底圖時手動執行):
 *   node scripts/make-share-card.mjs
 * 換底圖:改下面的 PHOTO(Cloudinary 網址);換了之後記得看一眼成品,避開人像與別人的標誌。
 * 換完圖檔檔名最好也改(例如 share-card-2.jpg,並更新各頁的 og:image):LINE、Facebook 會記住舊圖,
 * 檔名不變的話,已經分享過的網址很久都不會更新。
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'yuguang-site');
const OUT = path.join(ROOT, 'images', 'share-card.jpg');
const PHOTO = 'https://res.cloudinary.com/wy6xqh42/image/upload/e_trim:20/f_jpg,q_90,w_2400/v1788184813/cxckswzccoyupvsdkaug.jpg';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TEXT = '嶼光映像以光為筆，紀錄島嶼的每一道影像平面攝影動態影片器材租賃·PHOSOFISLEphosofisle.com';

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500&display=block&text=${encodeURIComponent(TEXT)}">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1200px;height:630px;overflow:hidden;background:#171613}
  .card{position:relative;width:1200px;height:630px;overflow:hidden;color:#f3f1ec;font-family:"Noto Serif TC",serif}
  .bg{position:absolute;inset:0;background:url("${PHOTO}") no-repeat 0 -80px/1560px auto}
  /* 與首頁 .hero::after 相同的漸層,左側再加深一點:分享圖在 LINE 裡很小,字要更清楚 */
  .card::after{content:"";position:absolute;inset:0;
    background:linear-gradient(to bottom,rgba(20,18,15,.35),rgba(20,18,15,0) 28%,rgba(20,18,15,.15) 50%,rgba(20,18,15,.8)),
               linear-gradient(to right,rgba(20,18,15,.78),rgba(20,18,15,.35) 45%,rgba(20,18,15,0) 70%)}
  .inner{position:absolute;z-index:2;left:80px;top:74px}
  .logo{display:block;width:62px;height:auto;aspect-ratio:192/208;margin-bottom:26px}
  h1{font-weight:500;font-size:84px;letter-spacing:22px;line-height:1.1}
  .latin{font-size:17px;letter-spacing:9px;opacity:.82;margin-top:18px}
  .tagline{font-size:27px;letter-spacing:4px;margin-top:30px;opacity:.94}
  .foot{position:absolute;z-index:2;left:80px;right:80px;bottom:44px;display:flex;justify-content:space-between;align-items:flex-end;
    border-top:1px solid rgba(243,241,236,.28);padding-top:18px;font-size:17px;letter-spacing:5px;opacity:.9}
  .foot .url{letter-spacing:3px;opacity:.8}
</style></head><body>
<div class="card">
  <div class="bg"></div>
  <div class="inner">
    <svg class="logo" viewBox="0 0 192 208"><g fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="butt">
      <line x1="97" y1="8" x2="97" y2="200"/><line x1="127" y1="70" x2="165" y2="23"/>
      <line x1="99" y1="102" x2="184" y2="102"/><line x1="8" y1="94" x2="8" y2="200"/>
      <line x1="8" y1="200" x2="97" y2="200"/><line x1="97" y1="200" x2="184" y2="200"/>
      <line x1="184" y1="200" x2="184" y2="172"/></g></svg>
    <h1>嶼光映像</h1>
    <div class="latin">PHOS OF ISLE</div>
    <p class="tagline">以光為筆，紀錄島嶼的每一道影像</p>
  </div>
  <div class="foot"><span>平面攝影 · 動態影片 · 器材租賃</span><span class="url">phosofisle.com</span></div>
</div></body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), 'share-card-'));
const port = 9500 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let tabs;
  for (let i = 0; i < 50 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); } }
  if (!tabs) throw new Error('Chrome 沒有啟動,可用環境變數 CHROME 指定路徑');
  const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = {};
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  const frameId = (await send('Page.getFrameTree')).frameTree.frame.id;
  await send('Page.setDocumentContent', { frameId, html });
  // 等字型與底圖都載入,缺一個就不要輸出(不然會產生沒有字型或沒有照片的圖)
  const ok = await ev(`(async()=>{await document.fonts.load('500 84px "Noto Serif TC"','嶼光映像');await document.fonts.ready;
    const img=new Image();img.src=${JSON.stringify(PHOTO)};await img.decode();
    const loaded=[...document.fonts].filter(f=>/Noto Serif TC/.test(f.family)&&f.status==='loaded').map(f=>f.weight);
    return !!document.querySelector('.card h1')&&loaded.includes('400')&&loaded.includes('500')})()`);
  if (!ok) throw new Error('Noto Serif TC 沒有載入成功(需要網路),沒有輸出圖檔');
  await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(`✓ 已輸出 ${path.relative(process.cwd(), OUT)}(1200×630)`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(dir, { recursive: true, force: true });
}
