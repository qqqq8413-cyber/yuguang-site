// 為後台的 Cloudinary 上傳產生簽名(需 ADMIN_PASSWORD 驗證)
// 需要環境變數:CLOUDINARY_API_KEY、CLOUDINARY_API_SECRET(在 Cloudinary 後台 Settings → API Keys 取得)
// 原本後台用「未簽名」的上傳設定,雲端名稱與設定名寫在公開的頁面原始碼裡,任何人都能上傳到這個帳號。
// 改成簽名上傳後,只有登入後台的人拿得到簽名;設定好金鑰並確認可上傳後,請到 Cloudinary 停用未簽名的上傳設定。
const crypto = require('crypto');
const PW = process.env.ADMIN_PASSWORD;
const KEY = process.env.CLOUDINARY_API_KEY;
const SECRET = process.env.CLOUDINARY_API_SECRET;
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || 'wy6xqh42';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const key = event.headers['x-admin-key'] || '';
  if (!PW || key !== PW) return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) };
  if (!KEY || !SECRET) return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'cloudinary-not-configured' }) };

  const timestamp = Math.floor(Date.now() / 1000);
  // 只簽 timestamp:簽名 1 小時內有效(Cloudinary 規則),檔案存放方式與原本相同
  const signature = crypto.createHash('sha1').update(`timestamp=${timestamp}${SECRET}`).digest('hex');
  return {
    statusCode: 200,
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify({ ok: true, cloud: CLOUD, api_key: KEY, timestamp, signature })
  };
};
