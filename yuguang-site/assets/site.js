/* 全站共用:把各頁頂欄的「← 返回首頁」換成完整導覽,並補一層淡入保險。 */
(function(){
  var LINKS=[
    ['pingmian.html','平面作品'],['dongtai.html','動態作品'],['qicai.html','器材租賃'],
    ['liucheng.html','製作流程'],['guanyu.html','關於嶼光'],['lianluo.html','聯絡我們',true]
  ];
  var here=(location.pathname.split('/').pop()||'index.html').replace(/\.html?$/,'')+'.html';
  var root=document.documentElement;

  function buildNav(){
    var bar=document.querySelector('.topbar');
    if(!bar||bar.querySelector('.sitenav'))return;
    var nav=document.createElement('nav');
    nav.className='sitenav';nav.id='sitenav';nav.setAttribute('aria-label','主選單');
    LINKS.forEach(function(l){
      var a=document.createElement('a');a.href=l[0];a.textContent=l[1];
      if(l[2])a.className='cta';
      if(l[0]===here)a.setAttribute('aria-current','page');
      nav.appendChild(a);
    });
    var btn=document.createElement('button');
    btn.className='navtoggle';btn.type='button';
    btn.setAttribute('aria-controls','sitenav');btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-label','開啟選單');
    btn.innerHTML='<span></span>';
    function setOpen(open){
      root.classList.toggle('nav-open',open);
      btn.setAttribute('aria-expanded',String(open));btn.setAttribute('aria-label',open?'關閉選單':'開啟選單');
    }
    btn.addEventListener('click',function(){setOpen(!root.classList.contains('nav-open'))});
    nav.addEventListener('click',function(e){if(e.target.tagName==='A')setOpen(false)});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')setOpen(false)});

    var back=bar.querySelector('.back');
    var right=bar.querySelector('.right');
    if(back)back.remove();
    if(right){right.appendChild(nav);right.appendChild(btn);}
    else{bar.appendChild(nav);bar.appendChild(btn);}
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
    document.body.appendChild(sec);
  }

  /* 全站頁尾:聯絡資訊由 content/site.json 帶入 */
  function buildFooter(){
    var old=document.querySelector('body > footer');
    var f=document.createElement('footer');f.className='sitefoot';
    if(old)old.replaceWith(f);else document.body.appendChild(f);
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

  function init(){buildNav();buildCta();buildFooter();revealNet();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
