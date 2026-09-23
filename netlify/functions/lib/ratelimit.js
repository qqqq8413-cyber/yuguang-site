// 公開端點的簡易節流:同一來源在時間窗內最多幾次。
// 用途是擋「洗版式」連續送單:Airtable 免費方案有筆數上限,Netlify 表單每月也有提交上限,
// 被灌垃圾單會在最需要的時候剛好用完。
// 限制:次數記在函式執行個體的記憶體裡(同 lib/auth.js)。Netlify 可能同時開好幾個執行個體,
// 閒置後也會重啟,所以這是「拖慢」而不是保證。
const cfg = { now: () => Date.now() }; // 測試時可替換
const hits = new Map(); // key -> 這個時間窗內的時間戳陣列

function clientIp(event) {
  const h = (event && event.headers) || {};
  return h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

// 還在額度內回傳 null;超過回傳要直接 return 的 429 回應
function tooMany(event, { max, windowMs, bucket = 'default' }) {
  const now = cfg.now();
  const key = `${bucket}|${clientIp(event)}`;
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    const wait = Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000));
    return {
      statusCode: 429,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': String(wait),
      },
      body: JSON.stringify({ ok: false, error: 'too-many-requests', retryAfter: wait }),
    };
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.delete(hits.keys().next().value); // 避免記憶體無限增加
  return null;
}

module.exports = { tooMany, clientIp, _cfg: cfg, _reset: () => hits.clear() };
