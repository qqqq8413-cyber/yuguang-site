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

  function init(){buildNav();revealNet();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
