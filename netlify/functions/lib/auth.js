// 後台函式共用的密碼驗證:6 支後台函式都呼叫這裡,不要各自實作
//   - 先雜湊再用 timingSafeEqual 比對:回應時間不會洩漏「猜對了幾個字」
//   - 同一來源(IP)連續輸錯 5 次就鎖 15 分鐘;鎖定期間連正確密碼也不接受,否則鎖定擋不住猜測
//   - 每次輸錯多等 0.8 秒,拖慢逐一嘗試
//   - 沒帶密碼的請求(例如有人直接打開函式網址)只回 401,不算一次嘗試
// 限制:錯誤次數記在函式執行個體的記憶體裡。Netlify 可能同時開好幾個執行個體,閒置後也會重啟,
// 所以這是「盡力而為」的減速,不是保證;真正的防線仍是夠長、猜不到的密碼。
const crypto = require('crypto');

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const cfg = { now: () => Date.now(), delayMs: 800 }; // 測試時可替換
const fails = new Map(); // ip -> { n: 連續錯誤次數, t: 最後一次錯誤時間 }

const reply = (statusCode, body, headers) => ({
  statusCode,
  headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers),
  body: JSON.stringify(body),
});

function clientIp(event) {
  const h = (event && event.headers) || {};
  return h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

function sameSecret(a, b) {
  const h = (x) => crypto.createHash('sha256').update(String(x)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

function locked(rec, now) {
  const wait = Math.ceil((LOCK_MS - (now - rec.t)) / 1000);
  return reply(429, { ok: false, error: 'too-many-attempts', retryAfter: wait }, { 'Retry-After': String(wait) });
}

// 通過回傳 null;不通過回傳要直接 return 的回應(401 或 429)
async function requireAdmin(event) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return reply(401, { ok: false, error: 'unauthorized' });
  const now = cfg.now();
  const ip = clientIp(event);

  const prev = fails.get(ip);
  if (prev && now - prev.t >= LOCK_MS) fails.delete(ip); // 超過 15 分鐘沒再錯,重新計算
  const cur = fails.get(ip);
  if (cur && cur.n >= MAX_FAILS) return locked(cur, now);

  const key = ((event && event.headers) || {})['x-admin-key'] || '';
  if (!key) return reply(401, { ok: false, error: 'unauthorized' });
  if (sameSecret(key, pw)) { fails.delete(ip); return null; }

  const rec = { n: (cur ? cur.n : 0) + 1, t: now };
  fails.set(ip, rec);
  if (fails.size > 5000) fails.delete(fails.keys().next().value); // 避免記憶體無限增加
  if (cfg.delayMs) await new Promise((r) => setTimeout(r, cfg.delayMs));
  if (rec.n >= MAX_FAILS) return locked(rec, now);
  return reply(401, { ok: false, error: 'unauthorized', remaining: MAX_FAILS - rec.n });
}

module.exports = { requireAdmin, MAX_FAILS, LOCK_MS, _cfg: cfg, _reset: () => fails.clear() };
