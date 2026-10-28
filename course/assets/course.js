/* 一天课程网页版 · 共用小程序：左右键翻页（桌面），手机往下滚动；动画在页面出现时开始。 */
(function () {
  var slides = [].slice.call(document.querySelectorAll('.slide'));
  if (!slides.length) return;
  var bar = document.querySelector('.bar'), count = document.querySelector('.count'), pos = document.querySelector('.nav .pos');
  var wide = window.matchMedia('(min-width:900px)').matches && location.search.indexOf('scroll') === -1;
  var cur = 0;

  function mark(i) {
    slides.forEach(function (s, k) { s.classList.toggle('active', k === i); });
    var s = slides[i];
    s.classList.remove('show'); void s.offsetWidth; s.classList.add('show'); // 重新播放动画
    var label = (i + 1) + ' / ' + slides.length;
    if (count) count.textContent = label; if (pos) pos.textContent = label;
    if (bar) bar.style.width = ((i + 1) / slides.length * 100) + '%';
    try { history.replaceState(null, '', '#' + (i + 1)); } catch (e) {}
  }
  function go(i) { cur = Math.max(0, Math.min(slides.length - 1, i)); mark(cur); }

  if (wide) {
    document.body.classList.add('present');
    var start = parseInt((location.hash || '').slice(1), 10);
    go(isNaN(start) ? 0 : start - 1);
    document.addEventListener('keydown', function (e) {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].indexOf(e.key) > -1) { e.preventDefault(); go(cur + 1); }
      else if (['ArrowLeft', 'PageUp', 'Backspace'].indexOf(e.key) > -1) { e.preventDefault(); go(cur - 1); }
      else if (e.key === 'Home') go(0); else if (e.key === 'End') go(slides.length - 1);
    });
    var prev = document.querySelector('[data-prev]'), next = document.querySelector('[data-next]');
    if (prev) prev.onclick = function () { go(cur - 1); }; if (next) next.onclick = function () { go(cur + 1); };
    var sx = null;
    document.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', function (e) { if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 60) go(cur + (dx < 0 ? 1 : -1)); sx = null; });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('show'); var i = slides.indexOf(en.target); if (count) count.textContent = (i + 1) + ' / ' + slides.length; if (bar) bar.style.width = ((i + 1) / slides.length * 100) + '%'; } });
    }, { threshold: 0.25 });
    slides.forEach(function (s) { io.observe(s); });
  }

  // 复制 Prompt
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]'); if (!b) return;
    var pre = b.closest('.prompt').querySelector('pre'), text = pre.innerText;
    var done = function () { b.textContent = '已复制 ✓'; b.classList.add('done'); setTimeout(function () { b.textContent = '复制 Prompt'; b.classList.remove('done'); }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(text); done(); }); else { fallback(text); done(); }
  });
  function fallback(t) { var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); }
})();
