/* Shared "报名免费 Demo 课" call to action for every guide page.
   Usage: <script src="/assets/demo-cta.js" data-campaign="wa-flow" defer></script>
   Adds (1) a button in the page header, (2) a closing CTA block if the page has none,
   (3) a bottom bar that stays on screen after the visitor starts scrolling.
   data-mode="pill" (full-screen pages): only a small floating button, top right. */
(function () {
  "use strict";
  var me = document.currentScript || document.querySelector('script[src*="demo-cta.js"]');
  var campaign = (me && me.dataset.campaign) || location.pathname.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home";
  var mode = (me && me.dataset.mode) || "full";
  var URL_REG = "/register?utm_source=guide&utm_medium=web&utm_campaign=" + encodeURIComponent(campaign);
  var LABEL = "报名免费 Demo 课 →";

  var css = [
    ".dcta-h{display:inline-flex!important;align-items:center;gap:6px;padding:9px 16px!important;border-radius:999px!important;background:#FFC93C!important;color:#14110F!important;font:700 14px/1.2 system-ui,'Noto Sans SC',sans-serif!important;text-decoration:none!important;white-space:nowrap;border:2px solid #14110F!important;box-shadow:3px 3px 0 #14110F;flex:none;margin-left:10px;transition:transform .15s}",
    ".dcta-h:hover{transform:translate(-1px,-1px);box-shadow:4px 4px 0 #14110F}",
    ".dcta-h.dcta-float{position:fixed;top:14px;right:14px;z-index:9998;margin:0}",
    ".dcta-end{margin:48px auto;max-width:920px;padding:0 20px;box-sizing:border-box}",
    ".dcta-box{background:#14110F;color:#fff;border-radius:22px;padding:34px 30px;display:flex;gap:24px;align-items:center;justify-content:space-between;flex-wrap:wrap;font-family:system-ui,'Noto Sans SC',sans-serif}",
    ".dcta-box b{display:block;font-size:24px;line-height:1.35;margin-bottom:8px;color:#FFC93C}",
    ".dcta-box p{margin:0;font-size:15.5px;line-height:1.7;color:#E8E2D6;max-width:560px}",
    ".dcta-box a{display:inline-block;background:#FFC93C;color:#14110F;font-weight:800;font-size:17px;padding:15px 26px;border-radius:999px;text-decoration:none;white-space:nowrap}",
    ".dcta-bar{position:fixed;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;gap:14px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));background:rgba(20,17,15,.96);color:#fff;font:600 15px/1.3 system-ui,'Noto Sans SC',sans-serif;transform:translateY(110%);transition:transform .3s;box-shadow:0 -6px 24px rgba(0,0,0,.18)}",
    ".dcta-bar.on{transform:none}",
    ".dcta-bar a{background:#FFC93C;color:#14110F;font-weight:800;padding:10px 18px;border-radius:999px;text-decoration:none;white-space:nowrap}",
    "body.dcta-pad{padding-bottom:72px}",
    // phones: the header's own WhatsApp button and tagline make way for the Demo button
    "@media(max-width:760px){.topbar-inner>.top-meta,.topbar-inner>.top-cta{display:none!important}.dcta-h{padding:8px 12px!important;font-size:13px!important;margin-left:6px}.dcta-bar span{font-size:13.5px}.dcta-box{padding:26px 22px}.dcta-box b{font-size:21px}}",
    "@media print{.dcta-h,.dcta-bar,.dcta-end{display:none!important}}"
  ].join("");

  function track(what) {
    try {
      var body = JSON.stringify({ path: "/click/" + campaign + "/demo-" + what, ref: document.referrer || "" });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    } catch (e) {}
  }
  function link(cls, text, what) {
    var a = document.createElement("a");
    a.className = cls; a.href = URL_REG; a.textContent = text;
    a.addEventListener("click", function () { track(what); });
    return a;
  }

  function init() {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

    if (mode === "pill") { document.body.appendChild(link("dcta-h dcta-float", LABEL, "pill")); return; }

    // 1. header button: the page's own top bar, else a floating button
    var top = document.querySelector("header.topbar, header.top, body > nav, body > header nav");
    var slot = top && (top.querySelector(".nav-actions, .topbar-inner, .nav-in, .nav") || top);
    if (slot) slot.appendChild(link("dcta-h", LABEL, "header"));
    else document.body.appendChild(link("dcta-h dcta-float", LABEL, "header"));

    // 2. closing block, only where the page has no registration button of its own
    if (!document.querySelector('a[href^="/register"]:not(.dcta-h)')) {
      var end = document.createElement("section");
      end.className = "dcta-end";
      end.innerHTML = '<div class="dcta-box"><div><b>想跟我一起，把它真的做出来？</b><p>报名免费 Demo 课，我现场示范 AI Agent 怎样帮你回复顾客、整理资料、做报告、做网页。不用会写代码，跟着做就可以。</p></div></div>';
      end.firstChild.appendChild(link("", LABEL, "end"));
      var foot = document.querySelector("body > footer, footer");
      if (foot && foot.parentNode) foot.parentNode.insertBefore(end, foot); else document.body.appendChild(end);
    }

    // 3. bottom bar after the first screen
    var bar = document.createElement("div");
    bar.className = "dcta-bar";
    bar.innerHTML = "<span>跟阿理哥上一堂免费 Demo 课</span>";
    bar.appendChild(link("", "立即报名 →", "bar"));
    document.body.appendChild(bar);
    document.body.classList.add("dcta-pad");
    var onScroll = function () { bar.classList.toggle("on", window.scrollY > window.innerHeight * 0.6); };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
