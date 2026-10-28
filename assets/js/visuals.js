/* ==========================================================================
   Animated project visuals. One rAF loop; each visual only runs while it is
   on screen. Respects reduced motion (renders a single, finished frame).
   ========================================================================== */
(function () {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const T = (k) => {
    const d = window.I18N && window.I18N[document.documentElement.lang];
    return (d && d[k]) || (window.I18N && window.I18N.en[k]) || "";
  };

  const items = [];
  let reduce = false, running = false, started = false, paused = false;

  function register(el, v) {
    v.el = el; v.active = false;
    items.push(v);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((ents) => ents.forEach((e) => { v.active = e.isIntersecting; if (v.active) kick(); }), { rootMargin: "120px" }).observe(el);
    } else v.active = true;
  }

  let last = 0;
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    let any = false;
    for (const v of items) if (v.active && !paused && !document.hidden) { v.t = (v.t || 0) + dt; v.frame(v.t, dt); any = true; }
    running = any;
    if (any) requestAnimationFrame(loop);
  }
  function kick() {
    if (reduce) { items.forEach((v) => v.still && v.still()); return; }
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });

  function fitCanvas(cv) {
    const r = cv.getBoundingClientRect(), d = DPR();
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return { w, h, d };
  }

  /* ================================================================ DR (fundus) */
  function setupDR() {
    const media = $(".media-dr");
    if (!media) return;
    const cv = $("canvas.fundus", media);
    const blurChip = $(".dr-blur", media), gradeEl = $(".dr-grade", media), bar = $(".dr-bar i", media);
    // Illustrative only, following the dissertation: as blur rises the models over-grade
    // severity, and confidence can climb even while the grade goes wrong
    const conf = [0.6, 0.54, 0.63, 0.86, 0.95];
    const gradeIdx = [1, 1, 2, 4, 4];
    let fundus = null, level = -1;

    // The retina texture is built in small row slices (idle time after load, or 6 ms per frame)
    // so the first frame on screen never blocks scrolling. ensure() returns true once it exists.
    const OPTS = { seed: 7, eye: "right", lesions: true };
    let prep = null, failed = false;
    const budget = (ms) => { const end = performance.now() + ms; return () => performance.now() > end; };
    function ensure(stop) {
      if (fundus) return true;
      if (failed || !window.Fundus) return false;
      try {
        // an older cached fundus.js without prepare(): build in one go, as before
        if (!window.Fundus.prepare) { fundus = window.Fundus.create(cv, OPTS); return true; }
        if (!prep) prep = window.Fundus.prepare(OPTS);
        if (!prep.step(stop)) return false;
        fundus = window.Fundus.create(cv, Object.assign({ model: prep.model, texture: prep.texture }, OPTS));
        prep = null; return true;
      } catch (e) { failed = true; console.warn(e); return false; }
    }
    function setLevel(l) {
      if (l === level) return;
      level = l;
      const grades = T("dr.grades").split("|");
      blurChip.textContent = `${T("dr.blur")} ${l}/4`;
      gradeEl.textContent = grades[gradeIdx[l]] || "";
      bar.style.width = Math.round(conf[l] * 100) + "%";
    }
    const v = {
      frame(t) {
        if (!fundus) ensure(budget(6));
        const cycle = t % 12;                      // 12 s loop
        const blur = Math.min(cycle / 10, 1);      // ramps up over 10 s, then snaps back
        setLevel(Math.min(4, Math.floor(blur * 5)));
        if (!fundus) return;
        fundus.draw({ blur, gradcam: 0.42 + 0.18 * Math.sin(t * 1.6), scan: (t * 0.35) % 1, time: t });
      },
      still() { ensure(); setLevel(0); if (fundus) fundus.draw({ blur: 0, gradcam: 0.5, scan: -1, time: 0 }); },
      lang() { const l = level; level = -1; setLevel(Math.max(0, l)); },
      resize() { if (fundus && fundus.resize) fundus.resize(); },
    };
    register(media, v);
    if (!reduce) {
      // A timed-out idle callback reports 0 ms left, so each slice gets at least 4 ms to make progress
      const idle = window.requestIdleCallback
        ? (f) => requestIdleCallback((dl) => f(budget(Math.max(4, dl.timeRemaining() - 1))), { timeout: 500 })
        : (f) => setTimeout(() => f(budget(6)), 32);
      const warm = () => idle((stop) => { if (!ensure(stop) && !failed && window.Fundus) warm(); });
      document.readyState === "complete" ? warm() : addEventListener("load", warm, { once: true });
    }
  }

  /* ================================================================ Robot */
  function setupRobot() {
    const media = $(".media-robot");
    if (!media) return;
    const svg = $("svg", media), route = $(".route", media), bot = $(".bot-g", media), lidar = $(".lidar", media);
    const holesG = $(".potholes", media), countEl = $(".robot-count", media), xyEl = $(".robot-xy", media);
    // The route is a fixed polyline, so points are interpolated here instead of asking the SVG
    // (getPointAtLength forces style and layout every frame)
    const PTS = [[30, 220], [190, 220], [190, 125], [280, 125], [280, 25], [375, 25], [375, 225], [230, 225]]; // keep in sync with .route d
    const SEG = []; let len = 0;
    for (let i = 1; i < PTS.length; i++) { const a = PTS[i - 1], b = PTS[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); SEG.push([len, l, a, b]); len += l; }
    const at = (d) => {
      d = Math.max(0, Math.min(len, d));
      for (const [s, l, a, b] of SEG) if (d <= s + l) { const u = (d - s) / l; return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u }; }
      return { x: 230, y: 225 };
    };
    const NS = "http://www.w3.org/2000/svg";
    const MISSED = new Set([6, 13]);
    const holes = [];
    for (let i = 0; i < 18; i++) {
      const f = 0.04 + (i / 17) * 0.92;
      const p = at(f * len);
      const q = at(Math.min(len, f * len + 1));
      const nx = -(q.y - p.y), ny = q.x - p.x;               // normal to the road
      const n = Math.hypot(nx, ny) || 1;
      const off = ((i * 37) % 11 - 5) * 1.2;                  // deterministic jitter across the lane
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", (p.x + (nx / n) * off).toFixed(1));
      c.setAttribute("cy", (p.y + (ny / n) * off).toFixed(1));
      c.setAttribute("r", 4.5 + ((i * 13) % 4));
      holesG.appendChild(c);
      holes.push({ c, f, missed: MISSED.has(i) });
    }
    const LOOP = 15, HOLD = 2;
    let lastCount = -1, lastXY = "";
    function place(p) {
      const d = p * len;
      const a = at(d), b = at(Math.min(len, d + 2));
      const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      bot.setAttribute("transform", `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
      route.style.strokeDashoffset = String(1 - p);
      let n = 0;
      holes.forEach((h) => {
        const passed = p >= h.f;
        h.c.classList.toggle("found", passed && !h.missed);
        h.c.classList.toggle("missed", passed && h.missed);
        if (passed && !h.missed) n++;
      });
      if (n !== lastCount) { countEl.textContent = n; lastCount = n; }
      const s = `x ${(a.x / 40).toFixed(2)}  y ${((250 - a.y) / 40).toFixed(2)}`;
      if (s !== lastXY) { xyEl.textContent = s; lastXY = s; }
    }
    const v = {
      frame(t) {
        const c = t % (LOOP + HOLD);
        const p = Math.min(c / LOOP, 1);
        place(p);
        lidar.setAttribute("transform", `rotate(${Math.sin(t * 3) * 28})`);
      },
      still() { place(1); },
    };
    register(media, v);
  }

  /* ================================================================ LLM */
  function setupLLM() {
    const media = $(".media-llm");
    if (!media) return;
    const typeEl = $(".llm-type", media), dots = $(".llm-dots", media), json = $(".llm-json", media);
    const steps = Array.from(media.querySelectorAll(".llm-path li"));
    const JSON_LINES = [
      '{ <span class="k">"goal"</span>: "data analysis",',
      '  <span class="k">"months"</span>: 3,',
      '  <span class="k">"path"</span>: ["pkg-03", "pkg-01", "pkg-06"],',
      '  <span class="k">"status"</span>: "ok" }',
    ];
    let goal = T("llm.goal");
    let lastKey = "";
    function render(t) {
      // Timeline (seconds): type 0-2.6 · think 2.6-3.8 · json 3.8-6.2 · steps 6.2-8 · hold to 11
      const typeEnd = 2.6, thinkEnd = 3.8, jsonEnd = 6.2, stepsEnd = 8;
      const chars = Math.floor(Math.min(1, t / typeEnd) * goal.length);
      const lit = t >= jsonEnd ? Math.min(3, 1 + Math.floor((t - jsonEnd) / ((stepsEnd - jsonEnd) / 3))) : 0;
      const key = chars + "|" + (t < thinkEnd ? 0 : 1) + "|" + Math.ceil(Math.min(1, Math.max(0, (t - thinkEnd) / (jsonEnd - thinkEnd))) * JSON_LINES.length) + "|" + lit;
      if (key === lastKey) return;
      lastKey = key;
      typeEl.textContent = goal.slice(0, Math.max(1, chars));
      dots.style.display = t >= typeEnd && t < thinkEnd ? "inline-flex" : "none";
      if (t >= thinkEnd) {
        const k = Math.min(1, (t - thinkEnd) / (jsonEnd - thinkEnd));
        const n = Math.ceil(k * JSON_LINES.length);
        json.innerHTML = JSON_LINES.slice(0, n).join("\n");
      } else json.innerHTML = "";
      steps.forEach((s, i) => s.classList.toggle("on", i < lit));
    }
    // Where the card sizes to its content, reserve the height of the tallest state (full goal +
    // 4 JSON lines) so the page below does not jump as the text types in and clears
    const box = $(".llm", media);
    const mq = matchMedia("(max-width: 560px), (min-width: 861px) and (max-width: 1200px)");
    function reserve() {
      box.style.minHeight = "";
      if (!mq.matches) return;
      render(10);
      box.style.minHeight = box.getBoundingClientRect().height + "px";
      lastKey = "";                                // next frame redraws the real phase
    }
    reserve();
    if (window.gsap && window.ScrollTrigger) ScrollTrigger.addEventListener("refreshInit", reserve); // covers resize, fonts.ready, language
    else addEventListener("resize", () => { clearTimeout(reserve.t); reserve.t = setTimeout(reserve, 150); });
    const v = {
      frame(t) { render(t % 11); },
      still() { render(10); },
      lang() { goal = T("llm.goal"); lastKey = ""; reserve(); },
    };
    register(media, v);
  }

  /* ================================================================ Face landmarks */
  function setupFace() {
    const media = $(".media-face");
    if (!media) return;
    const cv = $("canvas.face-cv", media), ctx = cv.getContext("2d"), confEl = $(".face-conf", media);
    // A 68-point style landmark set in face space (-1..1)
    const groups = [];
    const jaw = []; for (let i = 0; i <= 16; i++) { const t = i / 16; jaw.push([-0.9 * Math.cos(Math.PI * t), -0.2 + 1.12 * Math.pow(Math.sin(Math.PI * t), 0.85)]); }
    groups.push({ pts: jaw, closed: false });
    const brow = (s) => { const a = []; for (let i = 0; i < 5; i++) { const u = i / 4; a.push([s * (0.15 + 0.55 * u), -0.46 - 0.09 * Math.sin(Math.PI * (s > 0 ? u : 1 - u) * 0.9)]); } return a; };
    groups.push({ pts: brow(-1), closed: false }, { pts: brow(1), closed: false });
    groups.push({ pts: [[0, -0.32], [0, -0.18], [0, -0.04], [0, 0.1]], closed: false });
    groups.push({ pts: [[-0.18, 0.2], [-0.09, 0.25], [0, 0.27], [0.09, 0.25], [0.18, 0.2]], closed: false });
    const eye = (cx) => { const a = []; for (let i = 0; i < 6; i++) { const t = (i / 6) * Math.PI * 2; a.push([cx + 0.17 * Math.cos(t), -0.22 + 0.07 * Math.sin(t)]); } return a; };
    groups.push({ pts: eye(-0.42), closed: true }, { pts: eye(0.42), closed: true });
    const mouth = (rx, ry, n) => { const a = []; for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; a.push([0.32 * rx * Math.cos(t), 0.58 + ry * Math.sin(t)]); } return a; };
    groups.push({ pts: mouth(1, 0.1, 12), closed: true }, { pts: mouth(0.62, 0.04, 8), closed: true });

    let accent = css("--accent") || "#ff5a1f";
    window.addEventListener("themechange", () => (accent = css("--accent") || accent));

    function draw(t) {
      const { w, h, d } = fitCanvas(cv);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h * 0.47, S = Math.min(w, h) * 0.3;
      const yaw = Math.sin(t * 0.6) * 0.35, pitch = Math.sin(t * 0.45) * 0.08;
      const proj = ([x, y]) => {
        const z = Math.sqrt(Math.max(0, 1 - Math.min(1, x * x * 0.7 + y * y * 0.25)));
        return [cx + (x * Math.cos(yaw) + z * Math.sin(yaw) * 0.55) * S, cy + (y + z * pitch) * S];
      };
      const scanY = cy - S * 1.1 + ((t * 0.5) % 1) * S * 2.6;

      // soft grid
      ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1 * d;
      for (let gx = (cx % (24 * d)); gx < w; gx += 24 * d) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      for (let gy = (cy % (24 * d)); gy < h; gy += 24 * d) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

      // mesh lines + points
      groups.forEach((g) => {
        const P = g.pts.map(proj);
        ctx.beginPath();
        P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        if (g.closed) ctx.closePath();
        ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1.2 * d; ctx.stroke();
        P.forEach((p) => {
          const lit = Math.max(0, 1 - Math.abs(p[1] - scanY) / (S * 0.35));
          ctx.beginPath(); ctx.arc(p[0], p[1], (2 + lit * 2.2) * d, 0, Math.PI * 2);
          ctx.fillStyle = lit > 0.05 ? accent : "rgba(255,255,255,0.85)";
          ctx.globalAlpha = 0.65 + lit * 0.35; ctx.fill(); ctx.globalAlpha = 1;
        });
      });

      // scan line
      const grd = ctx.createLinearGradient(0, scanY - 30 * d, 0, scanY + 2 * d);
      grd.addColorStop(0, "rgba(255,90,31,0)"); grd.addColorStop(1, "rgba(255,90,31,0.35)");
      ctx.fillStyle = grd; ctx.fillRect(cx - S * 1.25, scanY - 30 * d, S * 2.5, 32 * d);
      ctx.fillStyle = accent; ctx.fillRect(cx - S * 1.25, scanY, S * 2.5, 1.5 * d);

      // bounding box corners
      const bx = cx - S * 1.15, by = cy - S * 0.85, bw = S * 2.3, bh = S * 2.05, k = 18 * d;
      ctx.strokeStyle = accent; ctx.lineWidth = 2.5 * d;
      [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]].forEach(([x, y, sx, sy]) => {
        ctx.beginPath(); ctx.moveTo(x + sx * k, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * k); ctx.stroke();
      });

      // NOTE: unused (no .media-face on the page). 98% is not a figure from the project report; change before reusing.
      const c = Math.min(98, ((t % 8) / 3) * 98);
      confEl.textContent = `${T("face.acc")} ${c.toFixed(1)}%`;
    }
    const v = { frame(t) { draw(t); }, still() { draw(2.2); confEl.textContent = `${T("face.acc")} 98.0%`; } };
    register(media, v);
  }

  /* ================================================================ Public API */
  window.Visuals = {
    init(opts) {
      if (started) return;
      started = true;
      reduce = !!(opts && opts.reduce);
      setupDR(); setupRobot(); setupLLM(); setupFace();
      if (reduce) items.forEach((v) => v.still && v.still());
      let r;
      addEventListener("resize", () => { clearTimeout(r); r = setTimeout(() => items.forEach((v) => v.resize && v.resize()), 150); });
    },
    onLang() {
      items.forEach((v) => v.lang && v.lang());
      if (reduce) items.forEach((v) => v.still && v.still());
    },
    // Freezes the loop while the project window covers the page (its backdrop blur repaints every frame otherwise)
    pause(p) { paused = !!p; if (!paused && !reduce) kick(); },
  };
})();
