// 上傳圖片到 GitHub 的 yuguang-site/images/(需 ADMIN_PASSWORD 驗證)
// 需要環境變數:GITHUB_TOKEN、(可選)GITHUB_REPO、GITHUB_BRANCH、ADMIN_PASSWORD
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || 'qqqq8413-cyber/yuguang-site';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const PW = process.env.ADMIN_PASSWORD;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const key = event.headers['x-admin-key'] || '';
  if (!PW || key !== PW) return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) };
  if (!TOKEN) return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'github-not-configured' }) };

  let o;
  try { o = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'invalid-json' }) };
  }
  if (!o.filename || !o.contentBase64) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'missing-filename-or-content' }) };
  }

  // 清理檔名,加上時間戳避免衝突
  const safe = String(o.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const name = `${Date.now()}_${safe}`;
  const path = `yuguang-site/images/${name}`;
  const api = `https://api.github.com/repos/${REPO}/contents/${path}`;
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'yuguang-admin'
  };

  try {
    const put = await fetch(api, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `上傳圖片 ${name}`, content: o.contentBase64, branch: BRANCH })
    });
    const pd = await put.json();
    if (!put.ok) return { statusCode: 502, body: JSON.stringify({ ok: false, github: pd }) };
    return { statusCode: 200, body: JSON.stringify({ ok: true, path: `/images/${name}` }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
