// 部署環境判斷:正式站 / 部署預覽(deploy-preview-N--…netlify.app) / 分支部署
// Netlify 會在函式環境提供 CONTEXT:'production'、'deploy-preview'、'branch-deploy'
//
// 為什麼要擋:後台的存檔、訂單修改、照片上傳都是直接寫到「正式的」資料
// (GitHub 主線、Airtable、Cloudinary)。預覽版後台是用來測試新程式的,如果從那裡存檔,
// 寫進去的資料可能用了正式站還不認得的欄位,正式站的建置就會失敗、整個網站停在舊版
// (2026-09-23 實際發生過一次:在預覽版後台勾了首頁精選,正式站部署連續失敗)。
// 因此:預覽與分支部署一律只能看、不能改;要修改內容請到正式網址的後台。
const CONTEXT = process.env.CONTEXT || '';
const isPreview = () => CONTEXT !== '' && CONTEXT !== 'production';

// 需要寫入正式資料的函式在驗證通過後呼叫;要擋就回傳現成的回應,否則回傳 null
function blockIfPreview(what) {
  if (!isPreview()) return null;
  return {
    statusCode: 403,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      ok: false,
      error: 'preview-readonly',
      context: CONTEXT,
      message: `這是預覽版網址，${what}已停用，以免改到正式資料。請到 https://phosofisle.com/後台 操作。`,
    }),
  };
}

module.exports = { blockIfPreview, isPreview, CONTEXT };
