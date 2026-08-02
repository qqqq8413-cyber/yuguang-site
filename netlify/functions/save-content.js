// 儲存內容 JSON 到 GitHub(需 ADMIN_PASSWORD 驗證)
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
  if (!o.path || o.data === undefined) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'missing-path-or-data' }) };
  }

  const api = `https://api.github.com/repos/${REPO}/contents/${o.path}`;
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'yuguang-admin'
  };

  try {
    let sha;
    const g = await fetch(`${api}?ref=${BRANCH}`, { headers });
    if (g.ok) { const gd = await g.json(); sha = gd.sha; }

    const str = typeof o.data === 'string' ? o.data : JSON.stringify(o.data, null, 2);
    const b64 = Buffer.from(str, 'utf8').toString('base64');

    const put = await fetch(api, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: o.message || `更新 ${o.path}`, content: b64, sha, branch: BRANCH })
    });
    const pd = await put.json();
    if (!put.ok) return { statusCode: 502, body: JSON.stringify({ ok: false, github: pd }) };
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
