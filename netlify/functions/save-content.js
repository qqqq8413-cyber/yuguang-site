// 儲存內容 JSON 到 GitHub(需後台密碼,驗證見 lib/auth.js)
// 需要環境變數:GITHUB_TOKEN、(可選)GITHUB_REPO、GITHUB_BRANCH、ADMIN_PASSWORD
const { requireAdmin } = require('./lib/auth');
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || 'qqqq8413-cyber/yuguang-site';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
// 只允許寫入網站內容 JSON;原本可寫入 repo 任何檔案(包含這些函式本身)
const ALLOWED = /^yuguang-site\/content\/[a-z0-9_-]+\.json$/;
const { validateContent } = require('./lib/content-schema');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const denied = await requireAdmin(event); // 共用驗證:比對密碼、錯誤次數限制(lib/auth.js)
  if (denied) return denied;
  if (!TOKEN) return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'github-not-configured' }) };

  let o;
  try { o = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'invalid-json' }) };
  }
  if (!o.path || o.data === undefined) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'missing-path-or-data' }) };
  }
  if (!ALLOWED.test(o.path)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'path-not-allowed' }) };
  }

  // 寫入前檢查格式:欄位打錯、型別不對(例如價格填成文字)就拒絕,不會把壞資料送上網站
  let parsed = o.data;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (e) {
      return { statusCode: 422, body: JSON.stringify({ ok: false, error: 'invalid-content', details: ['內容不是有效的 JSON'] }) };
    }
  }
  const problems = validateContent(o.path.split('/').pop(), parsed);
  if (problems.length) {
    return { statusCode: 422, body: JSON.stringify({ ok: false, error: 'invalid-content', details: problems.slice(0, 20) }) };
  }

  const api = `https://api.github.com/repos/${REPO}/contents/${o.path}`;
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'yuguang-admin'
  };

  try {
    // 後台帶來載入時的 sha:若 GitHub 上已是更新的版本,GitHub 會回 409,避免蓋掉別處的修改。
    // 沒帶 sha(舊版後台)時沿用原本行為:取最新 sha 直接覆蓋。
    let sha = o.sha;
    if (!sha) {
      const g = await fetch(`${api}?ref=${BRANCH}`, { headers });
      if (g.ok) { const gd = await g.json(); sha = gd.sha; }
    }

    const str = typeof o.data === 'string' ? o.data : JSON.stringify(o.data, null, 2);
    const b64 = Buffer.from(str, 'utf8').toString('base64');

    const put = await fetch(api, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: o.message || `更新 ${o.path}`, content: b64, sha, branch: BRANCH })
    });
    const pd = await put.json();
    if (put.status === 409) return { statusCode: 409, body: JSON.stringify({ ok: false, error: 'conflict' }) };
    if (!put.ok) return { statusCode: 502, body: JSON.stringify({ ok: false, github: pd }) };
    return { statusCode: 200, body: JSON.stringify({ ok: true, sha: pd.content && pd.content.sha }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
