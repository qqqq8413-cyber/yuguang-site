#!/usr/bin/env node
/* 產生主要頁面的分享預覽圖 yuguang-site/images/share-card.jpg(1200×630)。
 *
 * 設計:不用照片(刻意不放人像),深色底、左邊「嶼光映像／PHOS OF ISLE／標語」,右邊是用光畫出來的 LOGO——
 * 線條帶一點光暈,那道「光」(斜線)最亮,呼應標語「以光為筆」與首頁的進站動畫。
 * 底下一條細線,左邊服務項目、右邊網址。字級刻意放大:LINE 裡的預覽只有約 230px 寬。
 *
 * 用本機的 Chrome 開一個 1200×630 的頁面截圖(不是每次部署都跑,改了文案時手動執行):
 *   node scripts/make-share-card.mjs
 * 改完圖最好連檔名一起改(例如 share-card-2.jpg,並更新各頁的 og:image):LINE、Facebook 會依網址記住舊圖,
 * 檔名不變的話,已經分享過的網址很久都不會更新。
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'yuguang-site');
const OUT = path.join(ROOT, 'images', 'share-card.jpg');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TEXT = '嶼光映像以光為筆，紀錄島嶼的每一道影像平面攝影動態影片器材租賃·PHOSOFISLEphosofisle.com';

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500&display=block&text=${encodeURIComponent(TEXT)}">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1200px;height:630px;overflow:hidden;background:#141311}
  .card{position:relative;width:1200px;height:630px;overflow:hidden;background:#141311;color:#f3f1ec;font-family:"Noto Serif TC",serif}
  /* 光從 LOGO 那道斜線附近散出來,整體再帶一點點亮 */
  .card::before{content:"";position:absolute;inset:0;
    background:radial-gradient(circle 150px at 1012px 178px,rgba(255,238,210,.10),rgba(255,238,210,0)),
               radial-gradient(ellipse 520px 420px at 930px 260px,rgba(243,241,236,.05),rgba(243,241,236,0))}
  .txt{position:absolute;left:84px;top:150px;z-index:2}
  h1{font-weight:500;font-size:86px;letter-spacing:22px;line-height:1.1}
  .latin{font-size:16px;letter-spacing:10px;opacity:.7;margin-top:20px}
  .tag{font-size:25px;letter-spacing:4px;opacity:.92;margin-top:40px}
  .logo{position:absolute;right:104px;top:92px;height:388px;width:auto;aspect-ratio:192/208;overflow:visible}
  .logo .b{stroke:rgba(243,241,236,.9);filter:drop-shadow(0 0 3px rgba(255,240,215,.35))}
  .logo .r{stroke:#fff6e6;filter:drop-shadow(0 0 4px rgba(255,236,200,.95)) drop-shadow(0 0 14px rgba(255,226,180,.7))}
  .foot{position:absolute;left:84px;right:84px;bottom:48px;display:flex;justify-content:space-between;
    border-top:1px solid rgba(243,241,236,.2);padding-top:18px;font-size:15px;letter-spacing:5px;opacity:.72}
  .foot .url{letter-spacing:3px}
</style></head><body>
<div class="card">
  <svg class="logo" viewBox="0 0 192 208"><g fill="none" stroke-width="2.4">
    <g class="b"><line x1="97" y1="8" x2="97" y2="200"/><line x1="99" y1="102" x2="184" y2="102"/><line x1="8" y1="94" x2="8" y2="200"/>
      <line x1="8" y1="200" x2="97" y2="200"/><line x1="97" y1="200" x2="184" y2="200"/><line x1="184" y1="200" x2="184" y2="172"/></g>
    <g class="r"><line x1="127" y1="70" x2="165" y2="23"/></g></g></svg>
  <div class="txt">
    <h1>嶼光映像</h1>
    <div class="latin">PHOS OF ISLE</div>
    <p class="tag">以光為筆，紀錄島嶼的每一道影像</p>
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
  // 等兩個字重(400、500)都真的載入;字型樣式表是非同步抓的,所以最多輪詢 15 秒。
  // 沒載入就不要輸出,不然會產生用系統字型的圖
  const ok = await ev(`(async()=>{const want=['400','500'],t0=Date.now();
    while(Date.now()-t0<15000){
      await Promise.all([document.fonts.load('500 86px "Noto Serif TC"','嶼光映像'),document.fonts.load('400 25px "Noto Serif TC"','以光為筆')]);
      const got=[...document.fonts].filter(f=>/Noto Serif TC/.test(f.family)&&f.status==='loaded').map(f=>f.weight);
      if(want.every(w=>got.includes(w)))return !!document.querySelector('.card h1');
      await new Promise(r=>setTimeout(r,250));}
    return false})()`);
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
