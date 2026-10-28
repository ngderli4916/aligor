/* 一小时 Preview 网页版：左右键／点击翻页，F 全屏；手机或网址加 ?scroll 往下滚。 */
(function () {
  var deck = document.querySelector('.deck'), W = +deck.dataset.w, H = +deck.dataset.h;
  var slides = [].slice.call(document.querySelectorAll('.slide')), cur = 0;
  var scroll = location.search.indexOf('scroll') > -1 || (location.search.indexOf('present') === -1 && window.matchMedia('(max-width:640px)').matches);
  var bar = document.querySelector('.bar'), pn = document.querySelector('.pn'), tot = document.querySelector('.tot');
  if (tot) tot.textContent = '/ ' + slides.length;
  document.body.classList.toggle('scroll', scroll);
  deck.style.setProperty('--w', W); deck.style.setProperty('--h', H);
  slides.forEach(function (s) { s.style.setProperty('--w', W); s.style.setProperty('--h', H); });
  function fit() {
    var k = scroll ? window.innerWidth / W : Math.min(window.innerWidth / W, window.innerHeight / H);
    slides.forEach(function (s) { s.style.setProperty('--k', k); });
  }
  window.addEventListener('resize', fit); fit();
  var st = 0;
  function steps(s) { return +(s.dataset.steps || 0); }
  function reveal(s, k, instant) {
    s.classList.toggle('instant', !!instant);
    [].forEach.call(s.querySelectorAll('.pop[data-step]'), function (e) { var v = +e.dataset.step; if (v <= k) e.classList.add('r'); else e.classList.remove('r'); });
  }
  function show(i, toEnd) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function (s, k) { s.classList.toggle('active', k === cur); s.classList.remove('show', 'instant'); [].forEach.call(s.querySelectorAll('.r'), function (e) { e.classList.remove('r'); }); });
    var s = slides[cur]; void s.offsetWidth; s.classList.add('show');
    var n = s.querySelectorAll('.pop:not([data-step])').length; s.style.setProperty('--step', (n > 30 ? 1.2 / n : 0.06) + 's');
    st = toEnd ? steps(s) : 0; reveal(s, st, !!toEnd);
    var sn = s.querySelector('.sn'); if (sn) sn.textContent = cur + 1;
    if (pn && document.activeElement !== pn) pn.value = cur + 1;
    bar.style.width = ((cur + 1) / slides.length * 100) + '%';
    try { history.replaceState(null, '', '#' + (cur + 1)); } catch (e) {}
  }
  function next() { var s = slides[cur]; if (st < steps(s)) { st++; reveal(s, st, false); } else if (cur < slides.length - 1) show(cur + 1); }
  function prev() { var s = slides[cur]; if (st > 0) { st--; reveal(s, st, true); } else if (cur > 0) show(cur - 1, true); }
  if (scroll) {
    slides.forEach(function (s, k) { [].forEach.call(s.querySelectorAll('.pop[data-step]'), function (e) { e.classList.add('r'); }); s.classList.add('instant'); var sn = s.querySelector('.sn'); if (sn) sn.textContent = k + 1; });
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { var n = e.target.querySelectorAll('.pop:not([data-step])').length; e.target.style.setProperty('--step', (n > 30 ? 1.2 / n : 0.06) + 's'); e.target.classList.add('show'); } }); }, { threshold: 0.3 });
    slides.forEach(function (s) { io.observe(s); });
  } else {
    var start = parseInt((location.hash || '').slice(1), 10); show(isNaN(start) ? 0 : start - 1);
    window.addEventListener('hashchange', function () { var h = parseInt((location.hash || '').slice(1), 10); if (!isNaN(h) && h - 1 !== cur) show(h - 1); });
    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter', 'ArrowDown'].indexOf(e.key) > -1) { e.preventDefault(); next(); }
      else if (['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'].indexOf(e.key) > -1) { e.preventDefault(); prev(); }
      else if (e.key === 'Home') show(0); else if (e.key === 'End') show(slides.length - 1);
      else if (e.key === 'f' || e.key === 'F') fs();
    });
    if (pn) {
      pn.addEventListener('focus', function () { pn.select(); });
      pn.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { var n = parseInt(pn.value, 10); if (!isNaN(n)) show(n - 1); pn.blur(); } else if (e.key === 'Escape') { pn.value = cur + 1; pn.blur(); } });
      pn.addEventListener('blur', function () { pn.value = cur + 1; });
    }
    document.querySelector('[data-prev]').onclick = function (e) { e.stopPropagation(); prev(); };
    document.querySelector('[data-next]').onclick = function (e) { e.stopPropagation(); next(); };
    deck.addEventListener('click', function (e) { if (e.target.closest('a')) return; if (e.clientX < window.innerWidth * 0.2) prev(); else next(); });
    var sx = null; document.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', function (e) { if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 60) { if (dx < 0) next(); else prev(); } sx = null; });
  }
  function fs() { var d = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (d.requestFullscreen) d.requestFullscreen(); }
  var fb = document.querySelector('[data-full]'); if (fb) fb.onclick = fs;
})();
