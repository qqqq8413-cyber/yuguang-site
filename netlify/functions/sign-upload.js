// 為後台的 Cloudinary 上傳產生簽名(需 ADMIN_PASSWORD 驗證)
// 需要環境變數:CLOUDINARY_API_KEY、CLOUDINARY_API_SECRET(在 Cloudinary 後台 Settings → API Keys 取得)
// 後台上傳照片一律用這裡產生的簽名(只有登入後台的人拿得到);拿不到簽名時後台會停止上傳,
// 不會退回未簽名的方式。Cloudinary 上已不保留任何未簽名的上傳設定(原本的 yuguang preset 已刪除)。
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
