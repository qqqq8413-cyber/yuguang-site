/* 全站共用:沒有導覽列的頁面補上導覽列與手機選單鈕,並補一層淡入保險。
   (主要頁面的導覽列已在部署時寫進 HTML,這裡只會補上選單鈕。) */
(function(){
  var LINKS=[
    ['pingmian.html','平面作品'],['dongtai.html','動態作品'],['qicai.html','器材租賃'],
    ['liucheng.html','製作流程'],['wenda.html','常見問題'],['guanyu.html','關於嶼光'],['lianluo.html','聯絡我們',true]
  ];
  var here=(location.pathname.split('/').pop()||'index.html').replace(/\.html?$/,'')+'.html';
  var root=document.documentElement;

  /* 手機的選單鈕:導覽列不論是部署時就寫進 HTML(主要頁面)還是這裡補的,都要有這顆鈕,
     否則手機版只看得到 logo,整個網站沒有選單可以點。 */
  function addToggle(bar,nav){
    if(bar.querySelector('.navtoggle'))return;
    var btn=document.createElement('button');
    btn.className='navtoggle';btn.type='button';
    btn.setAttribute('aria-controls',nav.id||'sitenav');
    btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-label','開啟選單');
    btn.innerHTML='<span></span>';
    function setOpen(open){
      root.classList.toggle('nav-open',open);
      btn.setAttribute('aria-expanded',String(open));btn.setAttribute('aria-label',open?'關閉選單':'開啟選單');
    }
    btn.addEventListener('click',function(){setOpen(!root.classList.contains('nav-open'))});
    nav.addEventListener('click',function(e){if(e.target.tagName==='A')setOpen(false)});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')setOpen(false)});
    bar.appendChild(btn);
  }

  function buildNav(){
    var bar=document.querySelector('.topbar');
    if(!bar)return;
    var nav=bar.querySelector('.sitenav');
    if(!nav){
      nav=document.createElement('nav');
      nav.className='sitenav';nav.id='sitenav';nav.setAttribute('aria-label','主選單');
      LINKS.forEach(function(l){
        var a=document.createElement('a');a.href=l[0];a.textContent=l[1];
        if(l[2])a.className='cta';
        if(l[0]===here)a.setAttribute('aria-current','page');
        nav.appendChild(a);
      });
      bar.appendChild(nav);
    }
    addToggle(bar,nav);
  }

  /* 淡入保險:各頁的 observer 門檻偏高且要等 JSON 載完才開始觀察;
     這裡對所有 .reveal(含之後動態插入的)只要露出一點就顯示。 */
  function revealNet(){
    if(!('IntersectionObserver' in window)){
      document.querySelectorAll('.reveal').forEach(function(el){el.classList.add('show')});return;
    }
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('show');io.unobserve(e.target)}});
    },{threshold:0});
    var seen=new WeakSet();
    function scan(){
      document.querySelectorAll('.reveal:not(.show)').forEach(function(el){if(!seen.has(el)){seen.add(el);io.observe(el)}});
    }
    scan();
    new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
  }

  /* 作品頁 / 器材頁底部的預約區塊:看完作品就有下一步 */
  var CTA={
    'pingmian.html':['喜歡這些畫面嗎？','人像、形象、活動紀錄，我們都能為你量身拍攝。','預約平面拍攝','平面攝影'],
    'dongtai.html':['有一個故事想被看見嗎？','從企劃、拍攝到後製，陪你完成一支完整的影片。','洽談影片製作','動態影片'],
    'qicai.html':['不確定該租哪些器材？','告訴我們拍攝內容，我們幫你搭配最適合的組合。','詢問器材搭配','器材租賃']
  };
  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
  function buildCta(){
    var c=CTA[here];if(!c)return;
    var sec=document.createElement('section');sec.className='sitecta';
    sec.innerHTML='<p class="k">Let’s Talk</p><h2>'+c[0]+'</h2><p class="s">'+c[1]+'</p>'+
      '<a class="btn" href="lianluo.html?type='+encodeURIComponent(c[3])+'">'+c[2]+'</a>';
    /* 一定要放在頁尾之前。頁尾自 #42 起是部署時就寫進 HTML 的,
       直接 appendChild 會排到頁尾後面,畫面上就變成「頁尾在預約區塊上面」。 */
    var foot=document.querySelector('footer.sitefoot')||document.querySelector('body > footer');
    if(foot&&foot.parentNode)foot.parentNode.insertBefore(sec,foot);
    else document.body.appendChild(sec);
  }

  /* 全站頁尾:聯絡資訊由 content/site.json 帶入 */
  function buildFooter(){
    /* 部署時已經寫好頁尾就沿用它,不要再生一個。
       (首頁曾同時留著舊的 <footer> 與新的 .sitefoot,結果畫面上出現兩個頁尾) */
    var f=document.querySelector('footer.sitefoot');
    if(!f){
      var old=document.querySelector('body > footer');
      f=document.createElement('footer');f.className='sitefoot';
      if(old)old.replaceWith(f);else document.body.appendChild(f);
    }
    var year=new Date().getFullYear();
    function render(d){
      d=d||{};var items=[];
      if(d.email)items.push('<a href="mailto:'+esc(d.email)+'">'+esc(d.email)+'</a>');
      /* 個人 LINE ID:連結格式為 ~ID,不帶 @ */
      var lid=d.line?String(d.line).trim().replace(/^[@＠]/,''):'';
      if(lid)items.push('<a href="https://line.me/R/ti/p/~'+encodeURIComponent(lid)+'" target="_blank" rel="noopener">LINE '+esc(lid)+'</a>');
      if(d.phone)items.push('<a href="tel:'+esc(String(d.phone).replace(/\s/g,''))+'">'+esc(String(d.phone).replace(/^(\d{4})(\d{3})(\d{3})$/,'$1 $2 $3'))+'</a>');
      f.innerHTML='<div class="brand"><span class="zh">'+esc(d.brandZh||'嶼光映像')+'</span><span class="en">'+esc(d.brandEn||'PHOS OF ISLE')+'</span></div>'+
        (items.length?'<div class="contact">'+items.join('')+'</div>':'')+
        (d.address?'<div class="addr">'+esc(d.address)+'</div>':'')+
        '<div class="copy">© '+year+' '+esc(d.brandZh||'嶼光映像')+'</div>';
    }
    render(null);
    fetch('content/site.json').then(function(r){return r.json()}).then(render).catch(function(){});
  }

  /* ---- 捲動浮現:作品卡片、照片、器材、問答一個一個依序出現 ----
     規則(全站同一套節奏):
     - 剛載入時第一屏看得到的:直接顯示(保護 LCP,見下方 calm);看不到的:先隱藏,捲到才浮現
     - 點進分類、切換篩選等頁面內重畫:新卡片依序浮現
     - 同一批進場的依畫面位置(上→下、左→右)排序,每張間隔 65ms,最多排 8 張,不會讓後面的等太久
     - 只動 transform 與 opacity(不影響版面、不造成跳動);圖片在外框裡從 1.1 倍縮回 1 倍,像鏡頭對焦
     - 用 Web Animations:不改元素的 CSS,hover 等原本的效果照常運作
     - 系統設定「減少動態」時整段不執行;沒有 JS 時內容本來就全部可見 */
  var REVEAL_SEL=['.track>.tile','.albums>.album','.grid>.vid','.grid>.prod','.masonry>*','.shots>*',
    '.grps>.grp','.faqsec>.qa','.wrap>.terms','.keypoints'].join(',');
  var EASE_OUT='cubic-bezier(.19,1,.22,1)';
  function motion(){
    var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(rm||!('IntersectionObserver' in window)||!Element.prototype.animate)return;
    /* 速度倍率:讀 site.css 的 --motion-scale(改那裡就好) */
    var S=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-scale'))||1;
    var queue=[],raf=0;
    function frameOf(el){
      var im=el.querySelector('.bg,img');if(!im||!im.parentElement)return null;
      var o=getComputedStyle(im.parentElement).overflow;
      return (o==='hidden'||o==='clip')?im:null;
    }
    function play(){
      raf=0;
      var batch=queue.splice(0).map(function(el){return {el:el,r:el.getBoundingClientRect()}});
      batch.sort(function(a,b){return Math.abs(a.r.top-b.r.top)>24?a.r.top-b.r.top:a.r.left-b.r.left});
      batch.forEach(function(b,i){
        var el=b.el,d=Math.min(i,8)*65*S,img=frameOf(el),text=el.tagName!=='IMG'&&!el.querySelector('img,.bg');
        el.classList.remove('rv-wait');
        /* 起點用 0.01 而不是 0:肉眼一樣看不見,但 Chrome 會把它算成「已經畫出來」。
           從 0 開始的話,Chrome 要等淡入播完才記錄最大內容繪製(LCP),清單頁會慢將近 1 秒。 */
        el.animate([{opacity:.01,transform:'translate3d(0,'+(text?18:34)+'px,0)',offset:0}],
          {duration:(text?800:1000)*S,delay:d,easing:EASE_OUT,fill:'backwards'});
        if(img)img.animate([{transform:'scale(1.1)',offset:0}],{duration:1500*S,delay:d,easing:EASE_OUT,fill:'backwards'});
      });
    }
    function enqueue(el){queue.push(el);if(!raf)raf=requestAnimationFrame(play);}
    /* 橫向可滑動的列(首頁每一列作品):右邊還沒滑進來的卡片,不能等你橫向滑到才出現——
       改成觀察整列,這一列捲進畫面時,整列由左到右依序浮現 */
    function scrollerOf(el){
      var p=el.parentElement;if(!p)return null;
      var o=getComputedStyle(p).overflowX;
      return (o==='auto'||o==='scroll')?p:null;
    }
    /* 使用者第一次操作(點、按鍵、滾輪、觸控)之前,第一屏的卡片直接顯示、不做動畫。
       Google 的「最大內容繪製」(LCP)只量這段時間;卡片若在這時淡入,Chrome 會等動畫播完才算畫出來,
       平面作品頁實測從 0.66 秒變成 1.55 秒。操作之後(捲動、點進分類、切換篩選)出現的卡片才依序浮現。 */
    var calm=true;
    ['pointerdown','keydown','wheel','touchstart'].forEach(function(t){
      addEventListener(t,function(){calm=false;},{capture:true,passive:true,once:true});
    });
    var waiting=new Map();   // 被觀察的元素 → 要一起浮現的卡片
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){
        if(!e.isIntersecting)return;
        io.unobserve(e.target);
        (waiting.get(e.target)||[]).forEach(enqueue);waiting.delete(e.target);
      });
    },{rootMargin:'0px 0px -6% 0px',threshold:0});
    function setup(el){
      if(el.__rv)return;el.__rv=1;
      var target=scrollerOf(el)||el;
      var r=target.getBoundingClientRect();
      var inView=r.width>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;
      if(inView){if(!calm)enqueue(el);return;}
      el.classList.add('rv-wait');
      if(!waiting.has(target)){waiting.set(target,[]);io.observe(target);}
      waiting.get(target).push(el);
    }
    function scan(){document.querySelectorAll(REVEAL_SEL).forEach(setup);}
    scan();
    new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
  }

  function init(){buildNav();buildCta();buildFooter();revealNet();motion();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

/* 流量統計:Cloudflare Web Analytics。不用 Cookie、不追蹤個人,所以不需要同意視窗。
   放在全站共用的 site.js,所有公開頁(含自動產生的作品/影片/器材頁)都會載入,只需維護這一處;
   後台不載入 site.js,自己的操作不會被算進去。
   只在正式網域啟用:本機與 Netlify 部署預覽不計入,數字才乾淨。
   token 本來就會出現在網頁原始碼裡,是公開的識別碼,不是密碼。 */
(function(){
  var h=location.hostname;
  if(h!=='phosofisle.com'&&h!=='www.phosofisle.com')return;
  var s=document.createElement('script');
  s.defer=true;
  s.src='https://static.cloudflareinsights.com/beacon.min.js';
  s.setAttribute('data-cf-beacon','{"token": "4d4784e5ba924aa382bd7c0c57751ae7"}');
  document.head.appendChild(s);
})();
