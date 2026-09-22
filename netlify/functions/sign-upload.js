// 為後台的 Cloudinary 上傳產生簽名(需後台密碼,驗證見 lib/auth.js)
// 需要環境變數:CLOUDINARY_API_KEY、CLOUDINARY_API_SECRET(在 Cloudinary 後台 Settings → API Keys 取得)
// 後台上傳照片一律用這裡產生的簽名(只有登入後台的人拿得到);拿不到簽名時後台會停止上傳,
// 不會退回未簽名的方式。Cloudinary 上已不保留任何未簽名的上傳設定(原本的 yuguang preset 已刪除)。
const { requireAdmin } = require('./lib/auth');
const { blockIfPreview } = require('./lib/context');
const crypto = require('crypto');
const KEY = process.env.CLOUDINARY_API_KEY;
const SECRET = process.env.CLOUDINARY_API_SECRET;
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || 'wy6xqh42';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const denied = await requireAdmin(event); // 共用驗證:比對密碼、錯誤次數限制(lib/auth.js)
  if (denied) return denied;
  const preview = blockIfPreview('上傳照片'); // 預覽版只能看,不能改正式資料(lib/context.js)
  if (preview) return preview;
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
