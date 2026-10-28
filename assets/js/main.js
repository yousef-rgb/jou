/* ==========================================================================
   Youssef Eltayel · interactions, i18n, themes, Lenis + GSAP choreography
   ========================================================================== */
(function () {
  "use strict";

  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  if (reduce) {
    root.classList.add("rm");
    // SMIL animations ignore CSS; pause them (route plane) and show the end state
    document.querySelectorAll("svg").forEach((s) => { if (s.pauseAnimations) { s.pauseAnimations(); if (s.setCurrentTime) s.setCurrentTime(4); } });
  }
  // main.js owns this flag (the head script may have set it early on a slow CDN)
  root.classList.toggle("no-anim", !hasGSAP);

  /* Shared state read by scene.js every frame */
  window.STAGE = { x: 0.55, y: 0, s: 1, o: 1, rtl: root.dir === "rtl", mobile: false, paused: false };

  const I18N = window.I18N || { en: {}, ar: {} };
  let lang = root.lang === "ar" ? "ar" : "en";
  let statementST = null;
  const T = (k) => (I18N[lang] && I18N[lang][k]) || (I18N.en[k] || "");

  /* ================================================================ i18n */
  function applyLang(l) {
    lang = l;
    root.lang = l;
    root.dir = l === "ar" ? "rtl" : "ltr";
    window.STAGE.rtl = l === "ar";
    const d = I18N[l];
    $$("[data-i18n]").forEach((el) => { const v = d[el.dataset.i18n]; if (v != null) el.textContent = v; });
    $$("[data-i18n-html]").forEach((el) => { const v = d[el.dataset.i18nHtml]; if (v != null) el.innerHTML = v; });
    $$("[data-i18n-alt]").forEach((el) => { const v = d[el.dataset.i18nAlt]; if (v != null) el.alt = v; });
    $$("[data-i18n-aria]").forEach((el) => { const v = d[el.dataset.i18nAria]; if (v != null) el.setAttribute("aria-label", v); });
    document.title = d["meta.title"];
    const md = $('meta[name="description"]'); if (md) md.content = d["meta.desc"];
    $("#langBtn").setAttribute("aria-label", d["a11y.lang"]);
    $("#pdlgClose").setAttribute("aria-label", d["a11y.close"]);
    updateThemeLabel();
    try { localStorage.setItem("lang", l); } catch (e) {}
    buildRotator();
    splitStatement();
    tickClock();
    if (window.Visuals) window.Visuals.onLang(l);
    if (window.SceneAPI) window.SceneAPI.onLang(l);
    if (window.Cursor) window.Cursor.refresh();
  }

  /* Statement: wrap every word in a span, keeping <em>/<span class="hl"> wrappers
     (word-level only, so Arabic letters stay joined) */
  function splitStatement() {
    const el = $("#statementText");
    const tmp = document.createElement("div");
    tmp.innerHTML = T("about.statement");
    // Screen readers get the plain sentence; the animated word spans are hidden from them
    const plain = tmp.textContent;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
            else { const s = document.createElement("span"); s.className = "w"; s.textContent = part; frag.appendChild(s); }
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(tmp);
    el.innerHTML = "";
    el.removeAttribute("aria-label");
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = plain;
    const wrap = document.createElement("span");
    wrap.setAttribute("aria-hidden", "true");
    while (tmp.firstChild) wrap.appendChild(tmp.firstChild);
    el.appendChild(sr);
    el.appendChild(wrap);
    buildStatementTrigger();
  }

  /* Hero rotating role words */
  let rotTimer = null;
  function buildRotator() {
    const el = $("#rotator");
    const words = T("hero.roles").split("|");
    el.innerHTML = words.map((w) => `<span>${w}</span>`).join("");
    clearInterval(rotTimer);
    const spans = $$("span", el);
    if (!hasGSAP || reduce || spans.length < 2) return;
    gsap.set(spans, { yPercent: 140, opacity: 0 });
    gsap.set(spans[0], { yPercent: 0, opacity: 1 });
    let i = 0;
    rotTimer = setInterval(() => {
      if (document.hidden) return;
      const cur = spans[i], next = spans[(i + 1) % spans.length];
      gsap.to(cur, { yPercent: -140, opacity: 0, duration: 0.8, ease: "expo.inOut" });
      gsap.fromTo(next, { yPercent: 140, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: "expo.inOut" });
      i = (i + 1) % spans.length;
    }, 2600);
  }

  /* Riyadh local time */
  let clockTimer;
  function tickClock() {
    const el = $("#clock");
    if (!el) return;
    const fmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });
    el.textContent = fmt.format(new Date()) + " GMT+3";
    clearTimeout(clockTimer);
    clockTimer = setTimeout(tickClock, 30000);
  }

  /* ================================================================ Theme */
  const themeBtn = $("#themeBtn");
  function updateThemeLabel() {
    const night = root.dataset.theme !== "day";
    themeBtn.setAttribute("aria-label", T(night ? "a11y.toDay" : "a11y.toNight"));
    const mc = $('meta[name="theme-color"]'); if (mc) mc.content = night ? "#0d0d0e" : "#f4f2ee";
  }
  function setTheme(t) {
    root.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch (e) {}
    updateThemeLabel();
    window.dispatchEvent(new CustomEvent("themechange", { detail: t }));
  }
  themeBtn.addEventListener("click", (e) => {
    const next = root.dataset.theme === "day" ? "night" : "day";
    if (!document.startViewTransition || reduce) { setTheme(next); return; }
    const r = themeBtn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(() => setTheme(next));
    vt.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 750, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(() => {});
  });

  // Touch screens: the hint under the hero shape says "tap", not "click"
  if (matchMedia("(hover: none)").matches) { const pn = $(".poke-note span"); if (pn) pn.dataset.i18n = "hero.noteTouch"; }
  applyLang(lang);

  /* ================================================================ Smooth scroll */
  let lenis = null;
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);
  if (window.Lenis && !reduce) {
    lenis = new Lenis({ lerp: 0.095, wheelMultiplier: 0.95, autoRaf: false, syncTouch: false });
    if (hasGSAP) {
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  window.LENIS = lenis;

  function scrollToTarget(sel) {
    const el = typeof sel === "string" ? $(sel) : sel;
    if (!el) return;
    // Ease in and out (no sudden start), with a duration that grows gently with the distance,
    // so a jump from the footer to the top glides instead of snapping
    const dist = Math.abs(el.getBoundingClientRect().top);
    const duration = Math.min(1.8, Math.max(0.9, 0.8 + dist / 6000));
    if (lenis) lenis.scrollTo(el, { offset: el.id === "home" ? 0 : -10, duration, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) });
    else el.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      e.preventDefault();
      closeMenu();
      scrollToTarget(id);
      // Move keyboard focus with the scroll (skip link, nav, footer links)
      const t = $(id);
      if (t) {
        if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "-1");
        t.focus({ preventScroll: true });
      }
    });
  });

  /* ================================================================ Nav / menu */
  const nav = $("#nav"), menuBtn = $("#menuBtn"), menu = $("#menu");
  function closeMenu() { menu.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    if (open) nav.classList.remove("is-hidden");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  let lastY = 0;
  const progress = $(".progress span");
  function onScroll(y, p) {
    if (progress) progress.style.transform = `scaleX(${Math.min(1, p)})`;
    nav.classList.toggle("is-scrolled", y > 30);
    if (menu.hidden) {
      if (y > lastY + 4 && y > 200) nav.classList.add("is-hidden");
      else if (y < lastY - 4 || y < 200) nav.classList.remove("is-hidden");
    }
    lastY = y;
  }
  // Lenis already holds the progress, so the scroll path never reads scrollHeight (a forced layout)
  const nativeP = () => { const max = root.scrollHeight - innerHeight; return max > 0 ? scrollY / max : 0; };
  if (lenis) lenis.on("scroll", (l) => onScroll(l.scroll, l.progress));
  else addEventListener("scroll", () => onScroll(scrollY, nativeP()), { passive: true });
  onScroll(scrollY, lenis ? lenis.progress : nativeP());

  /* ================================================================ Language switch */
  const curtain = $(".curtain"), curtainWord = $(".curtain-word");
  let switching = false;
  $("#langBtn").addEventListener("click", () => {
    if (switching) return;
    const next = lang === "en" ? "ar" : "en";
    if (!hasGSAP || reduce) { applyLang(next); refreshAll(); return; }
    switching = true;
    curtainWord.textContent = I18N[next]["curtain"];
    const y = window.scrollY;
    // Start fetching the other script's webfonts while the curtain covers the page
    let fontsReady = Promise.resolve();
    if (document.fonts && document.fonts.load) {
      const faces = next === "ar"
        ? ['700 1em "YT Palestine"', '800 1em "YT Lifta"', '700 1em "YT Kaf"', '700 1em "YT Aref"']
        : ['800 1em "Archivo"', '400 1em "Manrope"'];
      const sample = next === "ar" ? "يوسف" : "Youssef";
      fontsReady = Promise.all(faces.map((f) => document.fonts.load(f, sample).catch(() => {})));
    }
    gsap.timeline({ onComplete: () => (switching = false) })
      .set(curtain, { transformOrigin: "50% 100%" })
      .to(curtain, { scaleY: 1, duration: 0.6, ease: "expo.inOut" })
      .fromTo(curtainWord, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "expo.out" }, "-=0.2")
      .add(() => {
        applyLang(next); refreshAll();
        if (lenis) lenis.scrollTo(y, { immediate: true });
        // re-measure once the new fonts have swapped in (their metrics change section heights)
        fontsReady.then(() => (document.fonts ? document.fonts.ready : null)).then(() => refreshAll());
      })
      .to(curtainWord, { opacity: 0, y: -24, duration: 0.35, ease: "power2.in" }, "+=0.15")
      .set(curtain, { transformOrigin: "50% 0%" })
      .to(curtain, { scaleY: 0, duration: 0.7, ease: "expo.inOut" }, "-=0.05");
  });

  /* ================================================================ Copy e-mail */
  const toast = $("#toast");
  let toastT;
  $("#copyBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText("youssef.eltayel@gmail.com"); } catch (e) {}
    toast.textContent = T("contact.copied");
    toast.classList.add("is-on");
    clearTimeout(toastT);
    toastT = setTimeout(() => toast.classList.remove("is-on"), 2200);
  });

  /* ================================================================ Project dialog */
  const dlg = $("#pdlg");
  const LINKS = window.PROJECT_LINKS || {};
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ICONS = {
    github: '<svg viewBox="0 0 24 24" aria-hidden="true" class="fill"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.58 9.58 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>',
    demo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
    paper: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };
  const isMini = (id) => /^m\d+$/.test(id);

  const isPdf = (u) => /\.pdf(\?|#|$)/i.test(u || "");
  // Phones (and browsers without a built-in PDF viewer) can't show a PDF inside the page
  const canEmbedPdf = () => navigator.pdfViewerEnabled !== false && matchMedia("(min-width: 700px)").matches;
  function renderLinks(id) {
    const L = LINKS[id] || {};
    const btns = ["github", "demo", "paper"].filter((k) => L[k]).map((k, i) =>
      `<a class="btn ${i === 0 ? "btn-accent" : "btn-outline"} btn-sm" href="${esc(L[k])}" target="_blank" rel="noopener">${ICONS[k]}<span>${esc(T("link." + k))}</span></a>`);
    if (LINKS.profile) btns.push(`<a class="pdlg-profile" href="${esc(LINKS.profile)}" target="_blank" rel="noopener">${ICONS.github}<span>${esc(T("link.profile"))}</span></a>`);
    const box = $("#pdlgLinks");
    box.innerHTML = btns.join("");
    box.hidden = !btns.length;
    // A PDF paper gets a "click to read" block right under the summary: it opens the
    // paper inside the window (or in a new tab where that isn't possible)
    const paper = $("#pdlgPaper");
    paper.innerHTML = "";
    paper.hidden = !isPdf(L.paper);
    const showCta = () => {
      paper.innerHTML = `<a class="pdlg-paper-cta" href="${esc(L.paper)}" target="_blank" rel="noopener">${ICONS.paper}<span>${esc(T("link.read"))}</span></a>`;
      paper.querySelector(".pdlg-paper-cta").addEventListener("click", (e) => {
        if (!canEmbedPdf()) return;
        e.preventDefault();
        showViewer();
      });
    };
    // Open paper: a bar on top with "open in a new tab" and a clear "close" that folds it back
    const showViewer = () => {
      paper.innerHTML = `<div class="pdlg-paper-bar">
          <span class="pdlg-paper-name">${ICONS.paper}<span>${esc(T("paper.name"))}</span></span>
          <a class="pdlg-paper-btn" href="${esc(L.paper)}" target="_blank" rel="noopener">${ICONS.demo}<span>${esc(T("paper.newtab"))}</span></a>
          <button class="pdlg-paper-btn pdlg-paper-close" type="button">${ICONS.close}<span>${esc(T("paper.close"))}</span></button>
        </div>
        <iframe src="${esc(L.paper)}#view=FitH&navpanes=0" title="${esc(T("link.paper"))}"></iframe>`;
      const close = paper.querySelector(".pdlg-paper-close");
      close.addEventListener("click", () => {
        showCta();
        paper.querySelector(".pdlg-paper-cta").focus({ preventScroll: true });
        paper.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
      });
      close.focus({ preventScroll: true });
    };
    if (isPdf(L.paper)) showCta();
  }

  /* Gallery of real project images (scroll-snap strip + full-screen viewer) */
  let gallery = [], galleryAt = 0;
  const capOf = (im) => (im.caption && (im.caption[lang] || im.caption.en)) || "";
  function renderGallery(id) {
    gallery = ((LINKS[id] || {}).images || []).filter((im) => im && im.src);
    const box = $("#pdlgGallery"), track = $("#pgTrack");
    box.hidden = !gallery.length;
    box.classList.toggle("single", gallery.length < 2);
    track.innerHTML = gallery.map((im, i) =>
      `<figure class="pg-item"><button type="button" class="pg-open" data-i="${i}" aria-label="${esc(capOf(im) || T("link.view"))}"><img src="${esc(im.src)}" alt="${esc(capOf(im))}" loading="lazy" /></button>${capOf(im) ? `<figcaption>${esc(capOf(im))}</figcaption>` : ""}</figure>`).join("");
    track.scrollLeft = 0;
    updateCount();
  }
  function updateCount() {
    const track = $("#pgTrack"), items = track.children;
    if (!items.length) return;
    const w = items[0].getBoundingClientRect().width || 1;
    const i = Math.min(items.length - 1, Math.round(Math.abs(track.scrollLeft) / w));
    $("#pgCount").textContent = `${i + 1} / ${items.length}`;
  }
  $("#pgTrack").addEventListener("scroll", () => requestAnimationFrame(updateCount), { passive: true });
  const stepGallery = (dir) => {
    const track = $("#pgTrack"), first = track.children[0];
    if (!first) return;
    const rtl = root.dir === "rtl";
    track.scrollBy({ left: dir * (rtl ? -1 : 1) * (first.getBoundingClientRect().width + 12), behavior: reduce ? "auto" : "smooth" });
  };
  $("#pgPrev").addEventListener("click", () => stepGallery(-1));
  $("#pgNext").addEventListener("click", () => stepGallery(1));

  const lb = $("#lightbox");
  function showLb(i) {
    if (!gallery.length) return;
    galleryAt = (i + gallery.length) % gallery.length;
    const im = gallery[galleryAt];
    $("#lbImg").src = im.src; $("#lbImg").alt = capOf(im);
    $("#lbCap").textContent = capOf(im);
    lb.classList.toggle("single", gallery.length < 2);
    if (!lb.open) lb.showModal();
  }
  $("#pgTrack").addEventListener("click", (e) => {
    const b = e.target instanceof Element && e.target.closest(".pg-open");
    if (b) showLb(+b.dataset.i);
  });
  $("#lbClose").addEventListener("click", () => lb.close());
  $("#lbPrev").addEventListener("click", () => showLb(galleryAt + (root.dir === "rtl" ? 1 : -1)));
  $("#lbNext").addEventListener("click", () => showLb(galleryAt + (root.dir === "rtl" ? -1 : 1)));
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") showLb(galleryAt + (root.dir === "rtl" ? -1 : 1));
    if (e.key === "ArrowLeft") showLb(galleryAt + (root.dir === "rtl" ? 1 : -1));
  });

  function openProject(id, origin) {
    const mini = isMini(id);
    $("#pdlgKicker").textContent = mini ? T("dlg.more.kicker") : T(`dlg.${id}.kicker`);
    $("#pdlgTitle").textContent = mini ? T(`${id}.t`) : T(`dlg.${id}.title`);
    $("#pdlgSum").textContent = mini ? T(`${id}.d`) : T(`dlg.${id}.sum`);
    const facts = mini ? "" : T(`dlg.${id}.facts`), points = mini ? "" : T(`dlg.${id}.points`);
    $("#pdlgFacts").innerHTML = facts ? facts.split("|").map((f) => `<span>${esc(f)}</span>`).join("") : "";
    $("#pdlgFacts").hidden = !facts;
    $("#pdlgPoints").innerHTML = points ? points.split("||").map((p) => `<li>${esc(p)}</li>`).join("") : "";
    $("#pdlgPoints").hidden = !points;
    $("#pdlgTools").textContent = T(`dlg.${id}.tools`);
    renderGallery(id);
    renderLinks(id);
    dlg.dataset.origin = origin ? "1" : "";
    dlg.showModal();
    // Nothing behind the blurred backdrop needs to animate while the window is open
    if (window.STAGE) window.STAGE.paused = true;
    if (window.Visuals && window.Visuals.pause) window.Visuals.pause(true);
    if (lenis) {
      // Stopping Lenis clips the page and hides a classic scrollbar; pad its width back so nothing shifts sideways
      const sbw = innerWidth - root.clientWidth; // 0 with overlay scrollbars
      // Chromium keeps the page scrollbar on the right even in RTL; Firefox puts it on the left
      const side = root.dir === "rtl" && !window.chrome ? "paddingLeft" : "paddingRight";
      if (sbw > 0) root.style[side] = nav.style[side] = sbw + "px";
      lenis.stop();
    }
    if (hasGSAP && !reduce) {
      gsap.fromTo(dlg, { opacity: 0, y: 40, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "expo.out" });
      gsap.fromTo(".pdlg-inner > *", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.05, delay: 0.1, ease: "expo.out" });
    }
  }
  let lastCard = null, closing = false;
  function closeProject() {
    if (closing || !dlg.open) return;
    closing = true;
    const done = () => {
      if (!closing) return;
      closing = false;
      dlg.close();
      if (hasGSAP) gsap.set(dlg, { clearProps: "opacity,transform" });
      if (lenis) lenis.start();
      root.style.paddingRight = nav.style.paddingRight = root.style.paddingLeft = nav.style.paddingLeft = "";
      if (window.STAGE) window.STAGE.paused = false;
      if (window.Visuals && window.Visuals.pause) window.Visuals.pause(false);
      if (lastCard) lastCard.focus({ preventScroll: true });
    };
    if (hasGSAP && !reduce) {
      gsap.to(dlg, { opacity: 0, y: 24, scale: 0.97, duration: 0.3, ease: "power2.in", onComplete: done });
      setTimeout(done, 450); // never leave the dialog open if the ticker is throttled (background tab)
    } else done();
  }
  $$(".card[data-project], .mini[data-project]").forEach((card) => {
    const id = card.dataset.project;
    const open = (e) => {
      if (e && e.target instanceof Element && e.target.closest(".card-gh")) return; // direct GitHub link
      lastCard = card; openProject(id, card);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === card) { e.preventDefault(); open(); } });
    // Quick GitHub shortcut on the card itself, only when a repository link exists
    const gh = (LINKS[id] || {}).github;
    if (gh) {
      const a = document.createElement("a");
      a.className = "card-gh"; a.href = gh; a.target = "_blank"; a.rel = "noopener";
      a.setAttribute("aria-label", "GitHub"); a.innerHTML = ICONS.github;
      (card.querySelector(".card-media") || card.querySelector(".mini-vis") || card).appendChild(a);
    }
  });
  $("#pdlgClose").addEventListener("click", closeProject);
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeProject(); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeProject(); });

  /* ================================================================ 3D keyframes
     The scene object travels with the scroll; keyframes are measured from layout. */
  let frames = [];
  function measureStage() {
    const vh = innerHeight;
    const top = (sel) => { const el = $(sel); return el ? el.getBoundingClientRect().top + scrollY : 0; };
    const mobile = innerWidth < 900;
    window.STAGE.mobile = mobile;
    const about = top("#about"), work = top("#work");
    frames = mobile
      ? [
          { at: 0, x: 0.1, y: 0.5, s: 0.74, o: 1 },
          { at: about - vh * 0.2, x: 0.3, y: 1.05, s: 0.5, o: 0 },
        ]
      : [
          { at: 0, x: 0.52, y: 0.06, s: 1, o: 1 },
          { at: about - vh * 0.3, x: 0.7, y: 0.02, s: 0.62, o: 1 },
          { at: work - vh * 0.75, x: 0.72, y: 0.05, s: 0.56, o: 1 },
          { at: work - vh * 0.1, x: 0.9, y: 0.75, s: 0.36, o: 0 },
        ];
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  window.stageAt = function (y) {
    const S = window.STAGE;
    if (!frames.length) return S;
    let a = frames[0], b = frames[frames.length - 1];
    if (y <= a.at) b = a;
    else if (y >= b.at) a = b;
    else for (let i = 0; i < frames.length - 1; i++) if (y >= frames[i].at && y < frames[i + 1].at) { a = frames[i]; b = frames[i + 1]; break; }
    const t = a === b ? 0 : smooth((y - a.at) / (b.at - a.at));
    S.x = a.x + (b.x - a.x) * t; S.y = a.y + (b.y - a.y) * t; S.s = a.s + (b.s - a.s) * t; S.o = a.o + (b.o - a.o) * t;
    return S;
  };
  // Read every frame by scene.js; Lenis's value avoids the layout flush that window.scrollY can force
  window.getScrollY = () => (lenis ? lenis.scroll : window.scrollY);
  measureStage();

  /* ================================================================ GSAP choreography */
  function buildStatementTrigger() {
    if (statementST) { statementST.kill(); statementST = null; }
    const words = $$("#statementText .w");
    if (!hasGSAP || reduce || !words.length) return;
    statementST = gsap.to(words, {
      opacity: 1, ease: "none", stagger: 0.08,
      scrollTrigger: { trigger: "#statementText", start: "top 80%", end: "bottom 45%", scrub: 0.6 },
    }).scrollTrigger;
  }
  function refreshAll() {
    if (!hasGSAP) return;
    ScrollTrigger.refresh();
    measureStage();
  }

  if (hasGSAP && !reduce) {
    gsap.defaults({ ease: "expo.out", duration: 1 });

    /* Arrival */
    gsap.timeline({ delay: 0.1 })
      .fromTo(".nav-row", { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 1 }, 0)
      .fromTo(".hero [data-intro]", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.08 }, 0.15)
      .fromTo("#rotator", { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.3 }, 0.3)
      .to(".poke-note", { clipPath: "inset(0% 0% 0% 0%)", duration: 1.3, ease: "power2.inOut" }, 1.6);

    /* Hero content drifts up as you leave */
    gsap.to(".hero-inner", { yPercent: -10, opacity: 0.2, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 15%", scrub: true } });

    /* One reveal system: masked headlines + fade-up blocks */
    $$("[data-mask]").forEach((h) => {
      gsap.to(h.querySelectorAll(".line-in"), { y: 0, duration: 1.3, stagger: 0.1, ease: "expo.out", scrollTrigger: { trigger: h, start: "top 88%", once: true } });
    });
    ScrollTrigger.batch("[data-reveal]", {
      start: "top 90%", once: true,
      onEnter: (els) => {
        // CSS transform transitions would fight the tween; clear inline transforms after so :hover lifts still work
        gsap.set(els, { transition: "none" });
        gsap.fromTo(els, { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.08, clearProps: "transform,transition" });
      },
    });

    /* Skills: each giant word fills orange quickly as it comes into view */
    $$(".srow").forEach((row) => {
      gsap.fromTo(row, { "--p": 0 }, { "--p": 1, ease: "none", scrollTrigger: { trigger: row, start: "top 88%", end: "top 58%", scrub: 0.3 } });
    });

    /* More projects: stacked cards fan out (desktop) */
    ScrollTrigger.matchMedia({
      "(min-width: 1201px)": function () {
        const minis = $$(".mini");
        const mid = (minis.length - 1) / 2;
        gsap.fromTo(minis,
          { x: (i) => (mid - i) * 150 * (root.dir === "rtl" ? -1 : 1), rotate: (i) => (i - mid) * 7, y: (i) => Math.abs(i - mid) * 10 },
          { x: 0, rotate: (i) => (i - mid) * 3.5, y: (i) => Math.abs(i - mid) * 18, ease: "none",
            scrollTrigger: { trigger: ".fan-wrap", start: "top 90%", end: "top 30%", scrub: 0.8, invalidateOnRefresh: true } });
      },
    });

    /* Journey art tiles: numbers rise as cards enter */
    $$(".jcard .big-num").forEach((n) => {
      gsap.fromTo(n, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.4, scrollTrigger: { trigger: n, start: "top 92%", once: true } });
    });

    /* Contact card floats in with a tilt */
    ScrollTrigger.matchMedia({
      "(min-width: 861px)": function () {
        gsap.fromTo(".contact-card",
          { y: 80, opacity: 0, rotate: () => (root.dir === "rtl" ? 9 : -9) },
          { y: 0, opacity: 1, rotate: () => (root.dir === "rtl" ? 3 : -3), ease: "none",
            scrollTrigger: { trigger: ".contact", start: "top bottom", end: "center center", scrub: 0.8, invalidateOnRefresh: true } });
      },
      "(max-width: 860px)": function () {
        gsap.fromTo(".contact-card", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, scrollTrigger: { trigger: ".contact-card", start: "top 90%", once: true } });
      },
    });

    /* Tilted marquee drifts with scroll on top of its loop */
    gsap.fromTo(".tilt-row.r1", { xPercent: -4 }, { xPercent: 4, ease: "none", scrollTrigger: { trigger: ".tilt", start: "top bottom", end: "bottom top", scrub: true } });
    gsap.fromTo(".tilt-row.r2", { xPercent: 4 }, { xPercent: -4, ease: "none", scrollTrigger: { trigger: ".tilt", start: "top bottom", end: "bottom top", scrub: true } });

    buildStatementTrigger();
  }

  /* Counters */
  $$(".count").forEach((el) => {
    const to = +el.dataset.to;
    if (!hasGSAP || reduce) { el.textContent = to.toLocaleString("en-US"); return; }
    const o = { v: 0 };
    el.textContent = "0";
    ScrollTrigger.create({
      trigger: el, start: "top 90%", once: true,
      onEnter: () => gsap.to(o, { v: to, duration: to > 1000 ? 2.2 : 1.4, ease: "expo.out", onUpdate: () => (el.textContent = Math.round(o.v).toLocaleString("en-US")) }),
    });
  });

  /* Active nav link */
  if (hasGSAP) {
    $$(".nav-links a").forEach((a) => {
      const sec = $("#" + a.dataset.section);
      if (!sec) return;
      ScrollTrigger.create({ trigger: sec, start: "top 50%", end: "bottom 50%", onToggle: (self) => a.classList.toggle("is-active", self.isActive) });
    });
    ScrollTrigger.addEventListener("refresh", measureStage);
  }

  /* Project visuals */
  if (window.Visuals) window.Visuals.init({ reduce, lang });

  /* ================================================================ Resize */
  let rT;
  addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(measureStage, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (hasGSAP) ScrollTrigger.refresh(); measureStage(); });
  addEventListener("load", measureStage);
})();
