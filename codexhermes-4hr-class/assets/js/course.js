(() => {
  const MAP = JSON.parse(document.querySelector("#course-map")?.textContent || "{}");
  const TOTAL = MAP.total || 108, HIDDEN = new Set(MAP.hidden || []);
  const course = document.querySelector("#course");
  let slides = [...document.querySelectorAll(".slide")].filter(slide => !slide.hidden);
  const pageInput = document.querySelector("#page-input");
  const fullscreenButton = document.querySelector("#fullscreen-button");
  let active = 0;
  let initialised = false;

  const hashPage = () => Number(location.hash.match(/(?:slide-)?(\d+)/)?.[1] || 0);
  const hasPage = page => slides.some(slide => Number(slide.dataset.page) === page);
  const indexForPage = page => {
    const found = slides.findIndex(slide => Number(slide.dataset.page) === page);
    return found < 0 ? 0 : found;
  };
  // ── 逐步出现：有 data-step-mode 的页面，每按一次 Enter／空格／→ 先出一步，出完才翻页 ──
  const step = { shown: 0, total: 0, items: [], notice: null, mode: "", slide: null };
  // 视频页：按 Enter 才开始播放（带 autoplay，键盘仍留在课件上）；离开页面就停止
  function ytStart(box) { const v = box.querySelector("video"); box.classList.add("is-playing"); v.currentTime = 0; v.play().catch(() => {}); }
  function ytStop(box) { const v = box.querySelector("video"); v.pause(); v.currentTime = 0; box.classList.remove("is-playing"); }
  document.addEventListener("click", e => { const box = e.target.closest?.(".yt-box"); if (box && !box.classList.contains("is-playing")) { ytStart(box); if (step.mode === "video" && step.slide.contains(box)) step.shown = step.total; } });
  function setupSteps(slide, revealAll) {
    step.slide = slide; step.mode = slide.dataset.stepMode || ""; step.shown = 0; step.total = 0; step.items = []; step.notice = null;
    if (!step.mode) return;
    if (step.mode === "cards") {
      step.items = [...slide.querySelectorAll(".cards > .card")]; step.notice = slide.querySelector(".slide-body > .notice");
      step.total = step.items.length;
      step.items.forEach(el => { el.classList.remove("step-shown"); el.classList.toggle("step-pending", !revealAll); });
      step.notice?.classList.toggle("step-pending", !revealAll);
    } else if (step.mode === "focus") {
      step.total = 1; slide.querySelector("[data-course-agents]")?.classList.toggle("is-focus", revealAll);
    } else if (step.mode === "video") {
      step.total = 1; const box = slide.querySelector(".yt-box"); if (box) ytStop(box);
      if (revealAll && box) ytStart(box);
    } else if (step.mode === "body") {
      step.items = [slide.querySelector(".slide-body")].filter(Boolean); step.total = step.items.length;
      step.items.forEach(el => { el.classList.remove("step-shown"); el.classList.toggle("step-pending", !revealAll); });
    }
    step.shown = revealAll ? step.total : 0;
  }
  function nextStep() {
    if (!step.mode || step.shown >= step.total) return false;
    if (step.mode === "cards") {
      const el = step.items[step.shown]; el.classList.remove("step-pending"); void el.offsetWidth; el.classList.add("step-shown");
      if (step.shown === step.total - 1 && step.notice) { step.notice.classList.remove("step-pending"); step.notice.classList.add("step-shown"); }
    } else if (step.mode === "focus") { step.slide.querySelector("[data-course-agents]")?.classList.add("is-focus"); }
    else if (step.mode === "video") { const box = step.slide.querySelector(".yt-box"); if (box) ytStart(box); }
    else if (step.mode === "body") { const el = step.items[0]; el.classList.remove("step-pending"); void el.offsetWidth; el.classList.add("step-shown"); }
    step.shown++; return true;
  }
  // 训练动画页：每次切到这页都从头播放；「减少动态效果」时停在完成画面
  function playTrain(slide) {
    const svg = slide.querySelector("svg.train-svg"); if (!svg || !svg.setCurrentTime) return;
    try { svg.setCurrentTime(0); svg.unpauseAnimations(); if (matchMedia("(prefers-reduced-motion: reduce)").matches) { svg.setCurrentTime(9.5); svg.pauseAnimations(); } } catch {}
  }
  // 第 1 页背景音乐（婚礼轻音乐，Pixabay Content License）：浏览器不准自动播放，按按钮或 M 键开始；离开第 1 页自动淡出
  const MUSIC_DIR = "assets/audio/wedding/";
  const MUSIC = ["01-paulyudin-574002","02-andriig-604061","03-atlasaudio-625735","04-leberch-594956","05-atlasaudio-621618","06-atlasaudio-606284","07-andriih-601619","08-andriig-568195","09-alexmorgan-578500","10-alexmorgan-578502"].map(n => `${MUSIC_DIR}${n}.mp3`);
  const music = { audio: null, order: [], pos: -1, on: false, vol: 0.6, fade: 1, timer: 0, btn: null };
  function musicApply() { if (music.audio) music.audio.volume = music.on ? Math.min(1, music.vol * music.vol * music.fade) : 0; }
  function musicLoad(k) { music.pos = (k + music.order.length) % music.order.length; music.audio.src = MUSIC[music.order[music.pos]]; }
  function musicInit() {
    if (music.audio) return;
    music.audio = new Audio(); music.audio.preload = "auto";
    music.order = MUSIC.map((_, i) => i).sort(() => Math.random() - 0.5);
    music.audio.addEventListener("ended", () => { musicLoad(music.pos + 1); if (music.on) music.audio.play().catch(() => {}); });
    music.audio.addEventListener("error", () => { musicLoad(music.pos + 1); if (music.on) music.audio.play().catch(() => {}); });
    musicLoad(0);
  }
  function musicFade(to, done) {
    clearInterval(music.timer);
    music.timer = setInterval(() => {
      music.fade += (to > music.fade ? 0.05 : -0.05);
      if ((to > 0 && music.fade >= to) || (to === 0 && music.fade <= 0)) { music.fade = to; clearInterval(music.timer); done && done(); }
      musicApply();
    }, 60);
  }
  function musicUi() { if (!music.btn) return; music.btn.classList.toggle("is-on", music.on); music.btn.querySelector("span").textContent = music.on ? "音乐播放中 · 点击暂停" : "播放轻音乐"; music.btn.setAttribute("aria-pressed", String(music.on)); }
  function musicToggle() {
    musicInit();
    if (!music.on) { music.on = true; music.fade = 0; musicApply(); music.audio.play().catch(() => { music.on = false; musicUi(); }); musicFade(1); }
    else { music.on = false; musicFade(0, () => { music.audio.pause(); musicApply(); }); }
    musicUi();
  }
  function musicSync(page) {
    if (!music.btn) {
      const b = document.createElement("div"); b.className = "music-ctl"; b.hidden = true;
      b.innerHTML = '<button type="button" class="music-btn" aria-pressed="false"><i aria-hidden="true">♪</i><span>播放轻音乐</span></button><input type="range" min="0" max="100" value="60" aria-label="音量">';
      document.body.appendChild(b); music.btn = b.querySelector("button");
      music.btn.addEventListener("click", e => { musicToggle(); e.currentTarget.blur(); });
      b.querySelector("input").addEventListener("input", e => { music.vol = e.target.value / 100; musicApply(); e.target.blur(); });
    }
    const want = Number(page) === 1 || slides[active]?.dataset.music === "1";
    const ctl = music.btn.parentElement; ctl.hidden = !want;
    if (!want && music.on) { music.on = false; musicFade(0, () => { music.audio.pause(); musicApply(); }); musicUi(); }
    // 休息页：从键盘翻页进来已有用户操作，浏览器通常允许直接播放；不允许时按按钮即可
    if (want && Number(page) !== 1 && !music.on) musicToggle();
  }
  addEventListener("keydown", e => { if ((e.key === "m" || e.key === "M") && !e.metaKey && !e.ctrlKey && !e.altKey && e.target.tagName !== "INPUT" && slides[active] && (Number(slides[active].dataset.page) === 1 || slides[active].dataset.music === "1")) { e.preventDefault(); musicToggle(); } });
  // 休息页大时钟 + 倒数到开始时间
  const pad2 = n => String(n).padStart(2, "0");
  setInterval(() => {
    const clk = document.querySelector("[data-bc-clock]"); if (!clk) return;
    const now = new Date(); clk.textContent = `${now.getHours() % 12 || 12}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
    const [h, m] = (clk.dataset.target || "14:30").split(":").map(Number), end = new Date(now); end.setHours(h, m, 0, 0);
    const cnt = document.querySelector("[data-bc-count]"); if (!cnt) return;
    const left = Math.round((end - now) / 1000);
    if (left > 0 && left < 12 * 3600) cnt.innerHTML = `距离开始 <b>${pad2(Math.floor(left / 3600))}:${pad2(Math.floor(left % 3600 / 60))}:${pad2(left % 60)}</b>`;
    else cnt.innerHTML = left <= 0 && left > -3600 ? "<b>时间到，继续上课！</b>" : "";
  }, 1000);
  function activate(index, { updateHash = true, revealAll = false } = {}) {
    active = Math.max(0, Math.min(slides.length - 1, index));
    slides.forEach((slide, i) => {
      const on = i === active;
      slide.classList.toggle("is-active", on);
      slide.setAttribute("aria-hidden", on ? "false" : "true");
    });
    const page = slides[active].dataset.page;
    if (pageInput) pageInput.value = page;
    if (updateHash) history.replaceState(null, "", `#${page}`);
    document.title = `${slides[active].querySelector("h1,h2")?.textContent?.trim() || "课程"}｜Codex + Hermes 4 小时实作课`;
    document.querySelectorAll(".yt-box.is-playing").forEach(bx => { if (!slides[active].contains(bx)) ytStop(bx); });
    setupSteps(slides[active], revealAll);
    playTrain(slides[active]);
    musicSync(page);
    if (initialised) preloadNeighbours();
  }
  const forward = () => { if (nextStep()) return; let page=Number(slides[active].dataset.page)+1; while(HIDDEN.has(page)) page++; if(page<=TOTAL) navigateGlobal(page); };
  const backward = () => { let page=Number(slides[active].dataset.page)-1; while(HIDDEN.has(page)) page--; if(page>=1) navigateGlobal(page, true); };
  const preloadNeighbours = () => { const cur = Number(slides[active]?.dataset.page); [cur + 1, cur - 1].forEach(p => { if (p >= 1 && p <= TOTAL && !HIDDEN.has(p) && !hasPage(p)) { const c = chapterForPage(p); if (c && !chapterCache.has(c)) fetch(c, { credentials: "same-origin" }).then(r => r.ok ? r.text() : null).then(t => t && chapterCache.set(c, t)).catch(() => {}); } }); };

  addEventListener("keydown", event => {
    if (event.metaKey || event.ctrlKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    // 点过按钮（全屏、复制）后，按钮会保留焦点；这时按 Enter／空格会再次「点按钮」，导致退出全屏。翻页键一律优先翻页。
    if (event.target.tagName === "BUTTON" && ["Enter", " ", "ArrowRight", "ArrowLeft", "PageDown", "PageUp", "Backspace"].includes(event.key)) event.target.blur();
    if (["Enter", "ArrowRight", "PageDown", " "].includes(event.key)) { event.preventDefault(); forward(); }
    if (["ArrowLeft", "PageUp", "Backspace"].includes(event.key)) { event.preventDefault(); backward(); }
    if (event.key === "Home") activate(0);
    if (event.key === "End") activate(slides.length - 1);
  });
  addEventListener("hashchange", () => { const page = hashPage(); if (hasPage(page)) activate(indexForPage(page), { updateHash: false }); else if (page) navigateGlobal(page); });

  const PAGE_CHAPTERS = (MAP.chapters || []).map(c => [c.first, c.last, c.file]);
  const chapterForPage = page => PAGE_CHAPTERS.find(([first,last]) => page>=first && page<=last)?.[2] || null;
  // 跨章节时不重新载入网页：只把新章节的页面换进来，这样全屏不会被中断。
  const chapterCache = new Map();
  let loading = false;
  async function loadChapter(chapter, page, revealAll = false) {
    if (loading) return;
    loading = true;
    try {
      let html = chapterCache.get(chapter);
      if (!html) { const res = await fetch(chapter, { credentials: "same-origin" }); if (!res.ok) throw new Error(res.status); html = await res.text(); chapterCache.set(chapter, html); }
      const doc = new DOMParser().parseFromString(html, "text/html");
      const incoming = [...doc.querySelectorAll("#course > .slide")].map(node => document.importNode(node, true));
      if (!incoming.length) throw new Error("empty chapter");
      course.replaceChildren(...incoming);
      slides = incoming.filter(slide => !slide.hidden);
      activate(indexForPage(page), { updateHash: false, revealAll });
      history.replaceState(null, "", `${chapter}#${page}`);
      if (pageInput) pageInput.setCustomValidity("");
    } catch (error) {
      console.error("Chapter swap failed, falling back to a normal page load", error);
      location.href = `${chapter}#${page}`;
    } finally { loading = false; }
  }
  function navigateGlobal(page, revealAll = false) {
    const localIndex=slides.findIndex(slide=>Number(slide.dataset.page)===page);
    if(localIndex>=0){ activate(localIndex, { revealAll }); return; }
    const chapter=chapterForPage(page);
    if(chapter) loadChapter(chapter, page, revealAll);
  }
  function goToTypedPage() {
    const page = Number(pageInput?.value);
    if (HIDDEN.has(page)) { pageInput.setCustomValidity(`第 ${page} 页是隐藏的待补占位页`); pageInput.reportValidity(); return; }
    if (!Number.isInteger(page) || page < 1 || page > TOTAL) {
      pageInput?.setCustomValidity(`请输入 1–${TOTAL} 的页码`); pageInput?.reportValidity(); return;
    }
    const localIndex = slides.findIndex(slide => Number(slide.dataset.page) === page);
    if (localIndex >= 0) { pageInput.setCustomValidity(""); activate(localIndex); pageInput.blur(); return; }
    const chapter = chapterForPage(page);
    if (chapter) { loadChapter(chapter, page); pageInput.blur(); }
    else { pageInput.setCustomValidity("这一页尚未生成 HTML"); pageInput.reportValidity(); }
  }
  pageInput?.addEventListener("input", () => pageInput.setCustomValidity(""));
  pageInput?.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); goToTypedPage(); } });

  fullscreenButton?.addEventListener("click", async event => {
    event.currentTarget.blur();
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) { console.error("Fullscreen unavailable", error); }
  });
  document.addEventListener("fullscreenchange", () => {
    const on = Boolean(document.fullscreenElement);
    fullscreenButton?.classList.toggle("is-fullscreen", on);
    fullscreenButton?.setAttribute("aria-label", on ? "退出全屏" : "进入全屏");
    fullscreenButton?.setAttribute("title", on ? "Exit Full Screen" : "Full Screen");
  });

  const status = document.querySelector("#copy-status");
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-copy]");
    if (!button) return;
    const text = button.closest(".copy-box")?.querySelector("code")?.textContent || "";
    try { await navigator.clipboard.writeText(text); }
    catch {
      const area = Object.assign(document.createElement("textarea"), { value: text });
      area.style.cssText = "position:fixed;opacity:0";
      document.body.append(area); area.select(); document.execCommand("copy"); area.remove();
    }
    button.textContent = "已复制";
    if (status) { status.textContent = "Prompt 已复制"; status.classList.add("show"); }
    setTimeout(() => { button.textContent = "复制"; status?.classList.remove("show"); }, 1400);
  });
  initialised = true;
  activate(indexForPage(hashPage() || Number(slides[0]?.dataset.page)), { updateHash: Boolean(location.hash) });
})();
