// 從 GitHub 讀取最新的內容 JSON(需後台密碼,驗證見 lib/auth.js)
// 後台改由這裡載入,而不是讀網站上的 /content/*.json:
// 網站在每次儲存後約 1 分鐘才重新部署,期間讀到的是舊資料,再存檔就會蓋掉剛才的修改。
// 回傳 sha,儲存時帶回去,GitHub 會拒絕以過期版本覆蓋。
const { requireAdmin } = require('./lib/auth');
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || 'qqqq8413-cyber/yuguang-site';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const ALLOWED = /^yuguang-site\/content\/[a-z0-9_-]+\.json$/;

exports.handler = async (event) => {
  const denied = await requireAdmin(event); // 共用驗證:比對密碼、錯誤次數限制(lib/auth.js)
  if (denied) return denied;
  if (!TOKEN) return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'github-not-configured' }) };
  const path = (event.queryStringParameters || {}).path || '';
  if (!ALLOWED.test(path)) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'path-not-allowed' }) };

  const headers = { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'yuguang-admin' };
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`, { headers });
    if (r.status === 404) return { statusCode: 200, body: JSON.stringify({ ok: true, data: null, sha: null }) };
    const d = await r.json();
    if (!r.ok) return { statusCode: 502, body: JSON.stringify({ ok: false, github: d }) };
    let text;
    if (d.content) text = Buffer.from(d.content, 'base64').toString('utf8');
    else { // 超過 1MB 時 contents API 不附內容,改抓 blob
      const b = await fetch(`https://api.github.com/repos/${REPO}/git/blobs/${d.sha}`, { headers });
      const bd = await b.json();
      text = Buffer.from(bd.content || '', 'base64').toString('utf8');
    }
    return { statusCode: 200, headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ ok: true, data: JSON.parse(text), sha: d.sha }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
