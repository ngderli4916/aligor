/* 一小时 Preview 网页版：左右键／点击翻页，F 全屏；手机或网址加 ?scroll 往下滚。 */
(function () {
  var deck = document.querySelector('.deck'), W = +deck.dataset.w, H = +deck.dataset.h;
  var slides = [].slice.call(document.querySelectorAll('.slide')), cur = 0;
  var scroll = location.search.indexOf('scroll') > -1 || window.matchMedia('(max-width:820px)').matches;
  var bar = document.querySelector('.bar'), pos = document.querySelector('.pos');
  document.body.classList.toggle('scroll', scroll);
  deck.style.setProperty('--w', W); deck.style.setProperty('--h', H);
  slides.forEach(function (s) { s.style.setProperty('--w', W); s.style.setProperty('--h', H); });
  function fit() {
    var k = scroll ? window.innerWidth / W : Math.min(window.innerWidth / W, window.innerHeight / H);
    slides.forEach(function (s) { s.style.setProperty('--k', k); });
  }
  window.addEventListener('resize', fit); fit();
  function show(i) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function (s, k) { s.classList.toggle('active', k === cur); s.classList.remove('show'); });
    var s = slides[cur]; void s.offsetWidth; s.classList.add('show');
    var n = s.querySelectorAll('.pop').length; s.style.setProperty('--step', (n > 30 ? 1.2 / n : 0.06) + 's');
    pos.textContent = (cur + 1) + ' / ' + slides.length; bar.style.width = ((cur + 1) / slides.length * 100) + '%';
    try { history.replaceState(null, '', '#' + (cur + 1)); } catch (e) {}
  }
  if (scroll) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { var n = e.target.querySelectorAll('.pop').length; e.target.style.setProperty('--step', (n > 30 ? 1.2 / n : 0.06) + 's'); e.target.classList.add('show'); } }); }, { threshold: 0.3 });
    slides.forEach(function (s) { io.observe(s); });
  } else {
    var start = parseInt((location.hash || '').slice(1), 10); show(isNaN(start) ? 0 : start - 1);
    document.addEventListener('keydown', function (e) {
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].indexOf(e.key) > -1) { e.preventDefault(); show(cur + 1); }
      else if (['ArrowLeft', 'PageUp', 'Backspace'].indexOf(e.key) > -1) { e.preventDefault(); show(cur - 1); }
      else if (e.key === 'Home') show(0); else if (e.key === 'End') show(slides.length - 1);
      else if (e.key === 'f' || e.key === 'F') fs();
    });
    document.querySelector('[data-prev]').onclick = function () { show(cur - 1); };
    document.querySelector('[data-next]').onclick = function () { show(cur + 1); };
    deck.addEventListener('click', function (e) { show(cur + (e.clientX < window.innerWidth * 0.25 ? -1 : 1)); });
    var sx = null; document.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', function (e) { if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 60) show(cur + (dx < 0 ? 1 : -1)); sx = null; });
  }
  function fs() { var d = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (d.requestFullscreen) d.requestFullscreen(); }
  var fb = document.querySelector('[data-full]'); if (fb) fb.onclick = fs;
})();
