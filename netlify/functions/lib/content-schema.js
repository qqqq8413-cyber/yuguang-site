// 網站內容 JSON 的格式定義與檢查(不依賴任何套件)
// 同一份規則用在兩個地方:
//   1. 後台存檔(save-content 函式):格式不對就拒絕寫入,並回報哪一欄錯
//   2. GitHub PR 自動檢查(scripts/validate-content.js)
// 欄位名稱打錯(例如 prcie)也會被抓到:每種資料只允許列出來的欄位。

const T = {
  str: { type: 'string' },
  text: { type: 'string', max: 20000 },
  // Cloudinary 等完整網址,或網站內的 / 開頭路徑;允許空字串(代表沒有)
  url: { type: 'string', url: true },
  // 固定代稱:小寫英數與 -,例如 amaran-300c
  slug: { type: 'string', slug: true },
  posInt: { type: 'integer', min: 1 },
  nonNegInt: { type: 'integer', min: 0 },
  bool: { type: 'boolean' },
  // 日期:2026-03-05,或含時區的完整時間 2026-03-05T19:51:13-08:00(YouTube 的上傳時間就是這種格式)
  datetime: { type: 'string', datetime: true },
};
const arr = (items, extra) => Object.assign({ type: 'array', items }, extra);
const obj = (props, required, extra) => Object.assign({ type: 'object', props, required: required || [] }, extra);
const nonEmpty = (s) => Object.assign({}, s, { nonEmpty: true });

const photo = obj({ image: nonEmpty(T.url), caption: T.str, w: T.posInt, h: T.posInt }, ['image']);
// 相簿、專案、器材的代稱(slug)是網址的一部分(/work/<相簿>/<專案>/、/rental/<器材>/),必填:
// 少了它網址就只能用排列順序產生,拖曳排序或新增項目後,已分享出去的連結會指到別的作品。
// 後台存檔時會自動補上(ensureSlugs),只有手動改 JSON 才可能漏掉,這裡負責擋下。
const project = obj({ zh: nonEmpty(T.str), en: T.str, cover: T.url, slug: nonEmpty(T.slug), photos: arr(photo) }, ['zh', 'slug']);
const album = obj(
  { zh: nonEmpty(T.str), en: T.str, cover: T.url, slug: nonEmpty(T.slug), photos: arr(photo), projects: arr(project) },
  ['zh', 'slug']
);

const video = obj({
  title: T.str, cat: T.str,
  yt: { type: 'string', youtube: true },
  client: T.str,
  year: { type: ['string', 'integer'] },
  featured: T.bool, cover: T.url, sub: T.str, desc: T.text, credits: T.text, slug: T.slug,
  // YouTube 上傳日期:Google 要有這個才會把影片頁當成影片結果顯示(VideoObject.uploadDate);
  // 與畫面上顯示的「年份」不同,年份是作品年份
  publishedAt: T.datetime,
});

const gear = obj({
  name: nonEmpty(T.str), cat: T.str,
  price: { type: ['number', 'null'], min: 0 },
  qty: T.nonNegInt,
  image: T.url, spec: T.text, desc: T.text, uses: T.text, note: T.text, slug: nonEmpty(T.slug),
}, ['name', 'slug']);

const SCHEMAS = {
  'albums.json': obj({ albums: arr(album) }, ['albums'], { uniqueSlugs: true }),
  'videos.json': obj({ videos: arr(video) }, ['videos']),
  'gear.json': obj({ gear: arr(gear), cats: arr(T.str) }, ['gear'], { uniqueSlugs: true }),
  'site.json': obj({
    brandZh: T.str, brandEn: T.str, email: T.str, line: T.str, phone: T.str, address: T.str,
    instagram: T.url, facebook: T.url, youtube: T.url,
  }),
};
// about.json、process.json 不在後台編輯,只檢查是合法的 JSON 物件
const LOOSE = new Set(['about.json', 'process.json']);

const TYPE_ZH = { string: '文字', integer: '整數', number: '數字', boolean: '是／否', array: '清單', object: '物件', null: '空值' };

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}
function typeOk(v, want) {
  const t = typeOf(v);
  return [].concat(want).some((w) => w === t || (w === 'number' && t === 'integer'));
}

function check(v, s, path, errs) {
  if (errs.length >= 50) return;
  if (!typeOk(v, s.type)) {
    errs.push(`${path}：應為${[].concat(s.type).map((t) => TYPE_ZH[t] || t).join('或')}，目前是${TYPE_ZH[typeOf(v)] || typeOf(v)}`);
    return;
  }
  if (typeof v === 'string') {
    if (s.nonEmpty && !v.trim()) errs.push(`${path}：不能是空的`);
    if (s.max && v.length > s.max) errs.push(`${path}：太長（上限 ${s.max} 字）`);
    if (s.url && v && !/^(https?:\/\/[^\s]+|\/[^\s]*)$/.test(v)) errs.push(`${path}：不是有效的網址「${v.slice(0, 60)}」`);
    if (s.slug && v && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) errs.push(`${path}：代稱只能用小寫英文、數字和 -（例如 amaran-300c）`);
    if (s.datetime && v && !(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2}))?$/.test(v) && !isNaN(Date.parse(v))))
      errs.push(`${path}：日期格式不對「${v.slice(0, 40)}」，請填 2026-03-05 這種格式`);
    if (s.youtube && v && !/^([A-Za-z0-9_-]{11}|https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\/\S+)$/.test(v.trim()))
      errs.push(`${path}：不是 YouTube 影片網址或 ID「${v.slice(0, 60)}」`);
  }
  if (typeof v === 'number' && s.min !== undefined && v < s.min) errs.push(`${path}：不能小於 ${s.min}`);
  if (Array.isArray(v) && s.items) v.forEach((x, i) => check(x, s.items, `${path}[${i}]`, errs));
  if (typeOf(v) === 'object' && s.props) {
    for (const k of s.required) if (!(k in v)) errs.push(`${path ? path + '.' : ''}${k}：缺少這個欄位`);
    for (const k of Object.keys(v)) {
      const p = path ? `${path}.${k}` : k;
      if (!s.props[k]) { errs.push(`${p}：不認得的欄位（是不是打錯字？）`); continue; }
      check(v[k], s.props[k], p, errs);
    }
  }
}

// 同一份檔案內,代稱(slug)不可重複,否則網址會指到錯的項目
function checkSlugs(data, errs) {
  const seen = new Map();
  const walk = (v, path) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (typeOf(v) !== 'object') return;
    if (typeof v.slug === 'string' && v.slug) {
      if (seen.has(v.slug)) errs.push(`${path}.slug：代稱「${v.slug}」和 ${seen.get(v.slug)} 重複`);
      else seen.set(v.slug, path);
    }
    for (const k of Object.keys(v)) if (k !== 'photos') walk(v[k], path ? `${path}.${k}` : k);
  };
  walk(data, '');
}

// fileName:例如 'gear.json';回傳錯誤訊息陣列(空陣列代表通過)
function validateContent(fileName, data) {
  const errs = [];
  if (typeOf(data) !== 'object') return ['最外層應為物件 { … }'];
  if (LOOSE.has(fileName)) return errs;
  const s = SCHEMAS[fileName];
  if (!s) return [`沒有「${fileName}」的格式定義，請先在 content-schema.js 補上`];
  check(data, s, '', errs);
  if (s.uniqueSlugs) checkSlugs(data, errs);
  return errs;
}

module.exports = { validateContent, SCHEMAS };
