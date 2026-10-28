/* ==========================================================================
   3D hero: a particle galaxy that re-forms into Youssef's work on every click.
   galaxy -> eye (dissertation) -> neural network -> road robot -> name -> portrait
   Each change "warps" the points outward like a jump through space, then they
   settle into the next shape. Points flee the cursor. Three.js via the import map.
   Reads window.STAGE / window.stageAt (main.js) to travel between sections.
   ========================================================================== */
(async function () {
  "use strict";

  const stageEl = document.querySelector(".stage");
  const canvas = document.getElementById("scene");
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fallback = () => stageEl.classList.add("is-fallback");

  try {
    const t = document.createElement("canvas");
    if (!(t.getContext("webgl2") || t.getContext("webgl"))) return fallback();
  } catch (e) { return fallback(); }

  let THREE;
  try { THREE = await import("three"); } catch (e) { console.warn("3D scene unavailable:", e); return fallback(); }

  /* ---------- Renderer ---------- */
  // no depth buffer: both materials skip depth writes and nothing opaque is drawn
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, depth: false, powerPreference: "default" });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const isSmall = innerWidth < 900;
  const N = isSmall ? 5200 : 9000;

  /* ---------- Helpers ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const R = rng(20260);
  const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const rotX = (a, x, y, z) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  const rotY = (a, x, y, z) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  /* A shape = { pts: Float32Array(N*3), lines: [[x,y,z, x,y,z], ...] } */

  function galaxy() {
    const pts = new Float32Array(N * 3), arms = 3;
    for (let i = 0; i < N; i++) {
      let x, y, z;
      const k = i / N;
      if (k < 0.16) {                                   // bright core
        const r = Math.abs(gauss()) * 0.16, th = R() * Math.PI * 2;
        x = r * Math.cos(th); z = r * Math.sin(th); y = gauss() * 0.05;
      } else if (k < 0.93) {                            // spiral arms
        const arm = i % arms, t = Math.pow(R(), 0.75), r = 0.14 + t * 1.3;
        const th = (arm / arms) * Math.PI * 2 + r * 2.7 + gauss() * 0.2 * (1 - t * 0.4);
        x = r * Math.cos(th) + gauss() * 0.045 * (1 + t); z = r * Math.sin(th) + gauss() * 0.045 * (1 + t); y = gauss() * 0.035 * (1 - t * 0.6);
      } else {                                          // halo stars
        const r = 0.6 + R() * 1.1, th = R() * Math.PI * 2, ph = Math.acos(2 * R() - 1);
        x = r * Math.sin(ph) * Math.cos(th); y = r * Math.cos(ph) * 0.55; z = r * Math.sin(ph) * Math.sin(th);
      }
      const p = rotX(-1.08, x, y, z);
      pts.set(rotY(0.25, p[0], p[1], p[2]), i * 3);
    }
    return { pts, lines: [] };
  }

  function eye() {
    const pts = new Float32Array(N * 3), lines = [];
    const W = 1.45, UP = 0.78, LO = 0.64;
    const lid = (u, top) => (top ? UP : -LO) * Math.pow(Math.max(0, 1 - u * u), 0.85);
    for (let i = 0; i < N; i++) {
      const k = i / N; let x, y, z = 0;
      if (k < 0.5) {                                    // iris fibres
        const fib = Math.floor(R() * 140), th = (fib / 140) * Math.PI * 2 + gauss() * 0.01, r = 0.31 + 0.55 * Math.sqrt(R());
        x = r * Math.cos(th); y = r * Math.sin(th); z = 0.12 * Math.cos(r * 1.6);
      } else if (k < 0.58) {                            // collarette
        const th = R() * Math.PI * 2, r = 0.5 + gauss() * 0.02;
        x = r * Math.cos(th); y = r * Math.sin(th); z = 0.1;
      } else if (k < 0.64) {                            // pupil rim
        const th = R() * Math.PI * 2, r = 0.3 + Math.abs(gauss()) * 0.012;
        x = r * Math.cos(th); y = r * Math.sin(th); z = 0.12;
      } else if (k < 0.7) {                             // limbus
        const th = R() * Math.PI * 2, r = 0.87 + gauss() * 0.012;
        x = r * Math.cos(th); y = r * Math.sin(th); z = 0.02;
      } else if (k < 0.92) {                            // eyelids
        const u = R() * 2 - 1, top = R() < 0.55;
        x = u * W; y = lid(u, top) + gauss() * 0.008; z = -0.05 * (1 - u * u);
      } else if (k < 0.975) {                           // faint sclera dust inside the almond
        let u, v;
        do { u = R() * 2 - 1; v = R() * 2 - 1; } while (!(v * UP < lid(u, true) && v * LO > -LO * Math.pow(1 - u * u, 0.85)) || Math.hypot(u * W, v) < 0.9);
        x = u * W; y = v * (v > 0 ? UP : LO) * 0.9; z = -0.05;
      } else {                                          // catch-light
        x = 0.24 + gauss() * 0.04; y = 0.26 + gauss() * 0.03; z = 0.16;
      }
      // keep the iris inside the lids
      if (k < 0.7) { const lim = y > 0 ? lid(x / W, true) : lid(x / W, false); if ((y > 0 && y > lim) || (y < 0 && y < lim)) y = lim * 0.98; }
      pts.set([x * 0.92, y * 0.92, z], i * 3);
    }
    for (const top of [true, false]) {
      let prev = null;
      for (let s = 0; s <= 40; s++) {
        const u = -1 + (2 * s) / 40, p = [u * W * 0.92, lid(u, top) * 0.92, -0.05 * (1 - u * u)];
        if (prev) lines.push([...prev, ...p]);
        prev = p;
      }
    }
    return { pts, lines };
  }

  function network() {
    const pts = new Float32Array(N * 3), lines = [];
    const layers = [4, 7, 7, 5, 2], nodes = [];
    layers.forEach((n, li) => {
      const x = -1.25 + (2.5 * li) / (layers.length - 1);
      for (let j = 0; j < n; j++) nodes.push({ li, p: [x, ((j - (n - 1) / 2) * 0.34), (li % 2 ? 0.18 : -0.18) * (j % 2 ? 1 : -1)] });
    });
    const edges = [];
    for (const a of nodes) for (const b of nodes) if (b.li === a.li + 1) edges.push([a.p, b.p]);
    edges.forEach(([a, b]) => lines.push([...a, ...b]));
    for (let i = 0; i < N; i++) {
      if (i / N < 0.34) {                               // node clusters (spheres of light)
        const n = nodes[i % nodes.length].p, r = 0.05 * Math.cbrt(R()), th = R() * Math.PI * 2, ph = Math.acos(2 * R() - 1);
        pts.set([n[0] + r * Math.sin(ph) * Math.cos(th), n[1] + r * Math.cos(ph), n[2] + r * Math.sin(ph) * Math.sin(th)], i * 3);
      } else {                                          // signals along the connections
        const e = edges[Math.floor(R() * edges.length)], t = R(), p = lerp3(e[0], e[1], t);
        pts.set([p[0] + gauss() * 0.005, p[1] + gauss() * 0.005, p[2] + gauss() * 0.005], i * 3);
      }
    }
    return { pts, lines };
  }

  function robot() {
    const pts = new Float32Array(N * 3), lines = [];
    const view = (p) => { const a = rotY(-0.62, p[0], p[1], p[2]); return rotX(0.28, a[0], a[1], a[2]); };
    const box = (cx, cy, cz, w, h, d) => {            // random point on a box surface
      const areas = [w * h, w * h, w * d, w * d, h * d, h * d], tot = areas.reduce((s, v) => s + v, 0);
      let r = R() * tot, f = 0; while (r > areas[f]) { r -= areas[f]; f++; }
      const u = R() - 0.5, v = R() - 0.5;
      const P = [[u * w, v * h, d / 2], [u * w, v * h, -d / 2], [u * w, h / 2, v * d], [u * w, -h / 2, v * d], [w / 2, u * h, v * d], [-w / 2, u * h, v * d]][f];
      return [cx + P[0], cy + P[1], cz + P[2]];
    };
    const boxEdges = (cx, cy, cz, w, h, d) => {
      const c = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) c.push([cx + (sx * w) / 2, cy + (sy * h) / 2, cz + (sz * d) / 2]);
      [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => lines.push([...view(c[a]), ...view(c[b])]));
    };
    const wheels = [[-0.58, -0.27, 0.5], [0.58, -0.27, 0.5], [-0.58, -0.27, -0.5], [0.58, -0.27, -0.5]];
    const WR = 0.25, WW = 0.13;
    for (let i = 0; i < N; i++) {
      const k = i / N; let p;
      if (k < 0.36) p = box(0, 0.06, 0, 1.55, 0.42, 0.86);
      else if (k < 0.62) {                              // wheels: tyre surface + rims
        const w = wheels[i % 4], th = R() * Math.PI * 2, rim = R() < 0.35, r = rim ? WR * (0.55 + 0.45 * R()) : WR;
        const zz = rim ? (R() < 0.5 ? -WW / 2 : WW / 2) : (R() - 0.5) * WW;
        p = [w[0] + r * Math.cos(th), w[1] + r * Math.sin(th), w[2] + zz];
      } else if (k < 0.7) {                             // LiDAR puck
        const th = R() * Math.PI * 2, top = R() < 0.4, r = top ? 0.13 * Math.sqrt(R()) : 0.13;
        p = [-0.3 + r * Math.cos(th), 0.33 + (top ? 0.05 : (R() - 0.5) * 0.1), r * Math.sin(th)];
      } else if (k < 0.75) p = box(0.48, 0.52, 0, 0.05, 0.5, 0.05);           // camera mast
      else if (k < 0.8) p = box(0.48, 0.8, 0, 0.16, 0.1, 0.2);                 // camera head
      else if (k < 0.93) {                              // LiDAR scan beams
        const th = (Math.floor(R() * 26) / 26) * Math.PI * 2, r = 0.18 + R() * 1.05;
        p = [-0.3 + r * Math.cos(th), 0.33 + gauss() * 0.004, r * Math.sin(th)];
      } else {                                          // road under the rover
        p = [(R() - 0.5) * 3.0, -0.53, (R() - 0.5) * 1.3];
      }
      pts.set(view(p), i * 3);
    }
    boxEdges(0, 0.06, 0, 1.55, 0.42, 0.86);
    boxEdges(0.48, 0.8, 0, 0.16, 0.1, 0.2);
    lines.push([...view([0.48, 0.27, 0]), ...view([0.48, 0.75, 0])]);
    wheels.forEach((w) => {
      for (const zz of [-WW / 2, WW / 2]) for (let s = 0; s < 24; s++) {
        const a0 = (s / 24) * Math.PI * 2, a1 = ((s + 1) / 24) * Math.PI * 2;
        lines.push([...view([w[0] + WR * Math.cos(a0), w[1] + WR * Math.sin(a0), w[2] + zz]), ...view([w[0] + WR * Math.cos(a1), w[1] + WR * Math.sin(a1), w[2] + zz])]);
      }
    });
    return { pts, lines };
  }

  async function nameShape(lang) {
    const word = lang === "ar" ? "يوسف" : "YOUSSEF";
    const font = lang === "ar" ? '800 300px "YT Lifta", "YT Palestine", sans-serif' : '900 200px "Archivo", sans-serif';
    try { await document.fonts.load(font, word); } catch (e) {}
    const cv = document.createElement("canvas"); cv.width = 1200; cv.height = 460;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = font;
    g.direction = lang === "ar" ? "rtl" : "ltr";
    g.fillText(word, 600, lang === "ar" ? 250 : 235);
    const data = g.getImageData(0, 0, cv.width, cv.height).data, cand = [];
    for (let y = 0; y < cv.height; y += 3) for (let x = 0; x < cv.width; x += 3) if (data[(y * cv.width + x) * 4 + 3] > 128) cand.push([x, y]);
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    cand.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
    const s = 2.7 / Math.max(1, maxX - minX), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const c = cand.length ? cand[Math.floor(R() * cand.length)] : [600, 230];
      pts.set([(c[0] - cx + (R() - 0.5) * 3) * s, -(c[1] - cy + (R() - 0.5) * 3) * s, (R() - 0.5) * 0.14], i * 3);
    }
    return { pts, lines: [] };
  }

  let portraitImg = null;
  /* Portrait drawn from the photo's features, not its brightness: edge strength (Sobel) inside a
     soft oval around the face, so hair line, brows, eyes, nose, beard and jaw become lines of light
     and the (bright) background drops away. Works the same in both themes. */
  function portrait() {
    if (!portraitImg) return null;
    const w = 180, h = 240, cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const g = cv.getContext("2d", { willReadFrequently: true });
    const ir = portraitImg.width / portraitImg.height, cr = w / h;
    let sw = portraitImg.width, sh = portraitImg.height, sx = 0, sy = 0;
    if (ir > cr) { sw = sh * cr; sx = (portraitImg.width - sw) / 2; } else { sh = sw / cr; sy = (portraitImg.height - sh) * 0.3; }
    g.drawImage(portraitImg, sx, sy, sw, sh, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const L = new Float32Array(w * h);
    for (let p = 0; p < w * h; p++) L[p] = (0.2126 * d[p * 4] + 0.7152 * d[p * 4 + 1] + 0.0722 * d[p * 4 + 2]) / 255;
    const E = new Float32Array(w * h); let maxE = 1e-6;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const a = (yy, xx) => L[(y + yy) * w + (x + xx)];
      const gx = -a(-1, -1) - 2 * a(0, -1) - a(1, -1) + a(-1, 1) + 2 * a(0, 1) + a(1, 1);
      const gy = -a(-1, -1) - 2 * a(-1, 0) - a(-1, 1) + a(1, -1) + 2 * a(1, 0) + a(1, 1);
      const e = Math.hypot(gx, gy); E[y * w + x] = e; if (e > maxE) maxE = e;
    }
    const mask = (x, y) => {                            // soft oval around the head, fading out over the shoulders
      const u = (x / w - 0.5) / 0.4, v = (y / h - 0.44) / 0.44;
      const oval = 1 - Math.min(1, Math.max(0, (Math.hypot(u, v) - 0.8) / 0.2));
      return oval * (1 - Math.min(1, Math.max(0, (y / h - 0.74) / 0.12)));
    };
    // contrast-stretch the darkness so hair, brows, eyes and beard read like ink
    let lo = 1, hi = 0;
    for (let p = 0; p < w * h; p++) { lo = Math.min(lo, L[p]); hi = Math.max(hi, L[p]); }
    const pts = new Float32Array(N * 3);
    let i = 0, guard = 0;
    while (i < N && guard < N * 200) {
      guard++;
      const x = 1 + Math.floor(R() * (w - 2)), y = 1 + Math.floor(R() * (h - 2));
      const m = mask(x, y); if (m <= 0) continue;
      const dark = Math.pow(1 - (L[y * w + x] - lo) / Math.max(1e-3, hi - lo), 2.7);
      const e = Math.pow(E[y * w + x] / maxE, 1.3);
      if (R() > (dark * 0.8 + e * 0.45 + 0.003) * m) continue;
      pts.set([((x / w) - 0.5) * 2.15, 0.22 - ((y / h) - 0.46) * 2.85, (0.5 - L[y * w + x]) * 0.25 + (R() - 0.5) * 0.03], i * 3);
      i++;
    }
    for (; i < N; i++) { const t = R() * Math.PI * 2; pts.set([Math.cos(t) * 0.8, Math.sin(t) * 1.05, 0], i * 3); }
    return { pts, lines: [] };
  }

  /* ---------- Particles ---------- */
  const geo = new THREE.BufferGeometry();
  const aFrom = new Float32Array(N * 3), aTo = new Float32Array(N * 3), aRand = new Float32Array(N), aSize = new Float32Array(N), aMix = new Float32Array(N);
  for (let i = 0; i < N; i++) { aRand[i] = R(); aSize[i] = 0.55 + Math.pow(R(), 3) * 1.6; aMix[i] = R() < 0.32 ? 1 : R() * 0.25; }
  geo.setAttribute("position", new THREE.BufferAttribute(aTo, 3));
  geo.setAttribute("aFrom", new THREE.BufferAttribute(aFrom, 3));
  geo.setAttribute("aTo", geo.getAttribute("position"));
  geo.setAttribute("aRand", new THREE.BufferAttribute(aRand, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute("aMix", new THREE.BufferAttribute(aMix, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);

  const U = {
    uTime: { value: 0 }, uMorph: { value: 1 }, uWarp: { value: 0 }, uPx: { value: 1 },
    uMouse: { value: new THREE.Vector2(9, 9) }, uMouseOn: { value: 0 }, uAspect: { value: 1 }, uPulse: { value: 0 }, uDetail: { value: 0 },
    uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uOpacity: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aFrom; attribute vec3 aTo; attribute float aRand; attribute float aSize; attribute float aMix;
      uniform float uTime, uMorph, uWarp, uPx, uMouseOn, uAspect, uPulse, uDetail;
      uniform vec2 uMouse; uniform vec3 uColA, uColB;
      varying vec3 vCol; varying float vAlpha;
      void main() {
        float e = smoothstep(0.0, 1.0, clamp((uMorph - aRand * 0.35) / 0.65, 0.0, 1.0));
        vec3 p = mix(aFrom, aTo, e);
        // warp: points spiral outward mid-transition, like a jump through space
        float w = sin(3.14159265 * e) * uWarp;
        float ang = w * (1.2 + aRand * 2.4);
        p.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p.xz;
        p += normalize(p + vec3(0.0001)) * w * (0.5 + aRand * 1.4);
        // living shimmer + click pulse
        p += 0.01 * vec3(sin(uTime * 1.3 + aRand * 40.0), cos(uTime * 1.1 + aRand * 31.0), sin(uTime * 0.9 + aRand * 17.0));
        p *= 1.0 + uPulse * 0.06 * sin(aRand * 6.2831 + uTime * 6.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec4 clip = projectionMatrix * mv;
        vec2 ndc = clip.xy / clip.w;
        vec2 d = (ndc - uMouse) * vec2(uAspect, 1.0);
        // small, local gravity well around the cursor (quadratic falloff)
        float f = uMouseOn * pow(smoothstep(0.12, 0.0, length(d)), 1.6);
        mv.xy += normalize(d + 1e-5) * f * 0.028 * -mv.z;
        gl_Position = projectionMatrix * mv;
        // detailed shapes (name, face) use finer, more even points
        float sz = mix(aSize, 0.75 + aSize * 0.25, uDetail);
        gl_PointSize = sz * uPx * (1.0 + f * 0.6 + w * 0.6) / -mv.z;
        float tw = 0.65 + 0.35 * sin(uTime * 2.2 + aRand * 60.0);
        vCol = mix(uColA, uColB, aMix);
        vAlpha = tw;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec3 vCol; varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5; float r = length(c);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.12, r);
        gl_FragColor = vec4(vCol, a * vAlpha * uOpacity);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  /* ---------- Constellation lines (per shape, cross-faded) ---------- */
  const lineMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  let lineObj = null;
  function setLines(list) {
    if (lineObj) { spin.remove(lineObj); lineObj.geometry.dispose(); lineObj = null; }
    if (!list || !list.length) return;
    const arr = new Float32Array(list.length * 6);
    list.forEach((l, i) => arr.set(l, i * 6));
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    lineObj = new THREE.LineSegments(g, lineMat);
    spin.add(lineObj);
  }

  const group = new THREE.Group(), spin = new THREE.Group();
  group.add(spin); spin.add(points); scene.add(group);

  /* ---------- Theme ---------- */
  const THEMES = {
    night: { a: new THREE.Color(0xfff1e6), b: new THREE.Color(0xff5a1f), line: new THREE.Color(0xff8a57), additive: true, px: 1 },
    day: { a: new THREE.Color(0x15161a), b: new THREE.Color(0xe2470d), line: new THREE.Color(0xd9480f), additive: false, px: 1.15 },
  };
  const themeKey = () => (root.dataset.theme === "day" ? "day" : "night");
  let curTheme = themeKey();
  function applyBlend() {
    const t = THEMES[curTheme];
    mat.blending = t.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.needsUpdate = true;
  }
  U.uColA.value.copy(THEMES[curTheme].a); U.uColB.value.copy(THEMES[curTheme].b); lineMat.color.copy(THEMES[curTheme].line);
  applyBlend();

  /* ---------- Shape sequence ---------- */
  const lang = () => (root.lang === "ar" ? "ar" : "en");
  // The particle portrait ("me") is kept in the code but switched off for now (Youssef's call):
  // set PORTRAIT_IN_CYCLE = true to add it back after the name.
  const PORTRAIT_IN_CYCLE = false;
  const ORDER = PORTRAIT_IN_CYCLE ? ["galaxy", "eye", "net", "robot", "name", "me"] : ["galaxy", "eye", "net", "robot", "name"];
  const cache = {};
  async function build(key) {
    if (key === "name") { const k = "name:" + lang(); return cache[k] || (cache[k] = await nameShape(lang())); }
    if (key === "me") return cache.me || (cache.me = portrait());
    if (cache[key]) return cache[key];
    return (cache[key] = { galaxy, eye, net: network, robot }[key]());
  }
  let idx = 0, morphT = 1, morphing = false, firstCaption = true;
  let current = await build("galaxy");
  aTo.set(current.pts); aFrom.set(current.pts);
  geo.getAttribute("aTo").needsUpdate = true; geo.getAttribute("aFrom").needsUpdate = true;

  // Optional portrait: only if enabled and assets/img/youssef.jpg exists
  if (PORTRAIT_IN_CYCLE) {
    const img = new Image();
    img.onload = () => { portraitImg = img; };
    img.src = "assets/img/youssef.jpg";
  }

  /* Hand-written caption next to the form */
  const note = document.querySelector(".poke-note span");
  function caption(key) {
    if (!note) return;
    const d = (window.I18N && window.I18N[lang()]) || {};
    const k = key === "galaxy" && firstCaption ? (note.dataset.i18n || "hero.note") : "shape." + key;
    note.textContent = d[k] || note.textContent;
    const box = note.parentElement;
    if (window.gsap && !reduce) {
      const from = root.dir === "rtl" ? "inset(0% 0% 0% 100%)" : "inset(0% 100% 0% 0%)";
      gsap.fromTo(box, { clipPath: from }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.1, ease: "power2.inOut", overwrite: true });
    }
  }

  function snapshotCurrent() {
    // freeze the visible positions (handles clicks in the middle of a morph)
    const m = U.uMorph.value;
    for (let i = 0; i < N; i++) {
      const e0 = Math.min(1, Math.max(0, (m - aRand[i] * 0.35) / 0.65)), e = e0 * e0 * (3 - 2 * e0), o = i * 3;
      aFrom[o] = aFrom[o] + (aTo[o] - aFrom[o]) * e;
      aFrom[o + 1] = aFrom[o + 1] + (aTo[o + 1] - aFrom[o + 1]) * e;
      aFrom[o + 2] = aFrom[o + 2] + (aTo[o + 2] - aFrom[o + 2]) * e;
    }
  }
  async function morphTo(key) {
    let shape = null;
    // a shape that cannot be built (e.g. a tainted image when opened from file://) is skipped, never fatal
    try { shape = await build(key); } catch (e) { console.warn("shape skipped:", key, e); return false; }
    if (!shape) return false;
    snapshotCurrent();
    aTo.set(shape.pts);
    geo.getAttribute("aFrom").needsUpdate = true; geo.getAttribute("aTo").needsUpdate = true;
    current = shape;
    U.uMorph.value = 0; morphT = 0; morphing = true;
    lineMat.opacity = 0; setLines(shape.lines);
    caption(key);
    return true;
  }
  async function next() {
    firstCaption = false;
    for (let tries = 0; tries < ORDER.length; tries++) {
      idx = (idx + 1) % ORDER.length;
      if (await morphTo(ORDER[idx])) { U.uPulse.value = 1; return; }
    }
  }
  window.SceneAPI = {
    next,
    state: () => ({ shape: ORDER[idx], morphT, morphing, opacity: cur.o }),
    // QA helper: advance the simulation by n frames even when the tab is not painting
    step(n = 60) { for (let i = 0; i < n; i++) { last -= 1000 / 60; frame(performance.now()); } },
    onLang() {
      if (ORDER[idx] === "name") morphTo("name");
      else caption(ORDER[idx]);
    },
  };
  window.addEventListener("themechange", () => {
    curTheme = themeKey(); applyBlend(); resize();
  });

  /* ---------- Sizing ---------- */
  let W = 0, H = 0, halfW = 1, halfH = 1, baseR = 1, resized = false;
  function resize() {
    resized = true;
    W = innerWidth; H = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, W < 900 ? 1.5 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    halfW = halfH * camera.aspect;
    baseR = W < 900 ? Math.min(halfW * 0.55, halfH * 0.36) : Math.min(halfH * 0.46, halfW * 0.27);
    U.uAspect.value = camera.aspect;
    U.uPx.value = H * dpr * 0.022 * THEMES[curTheme].px;
  }
  resize();
  addEventListener("resize", resize);

  /* ---------- Pointer: hover hint, repulsion, click to morph ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9), hit = new THREE.Sphere();
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let hover = 0, mouseIn = false;
  function overForm(nx, ny) {
    ndc.set(nx, ny); ray.setFromCamera(ndc, camera);
    // only the heart of the shape is clickable, not its outer halo
    hit.center.copy(group.position); hit.radius = group.scale.x * 0.7;
    return cur.o > 0.5 && ray.ray.intersectsSphere(hit);
  }
  addEventListener("pointermove", (e) => {
    pointer.tx = (e.clientX / W) * 2 - 1; pointer.ty = -(e.clientY / H) * 2 + 1;
    mouseIn = e.pointerType !== "touch";
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { mouseIn = false; });
  addEventListener("pointerdown", (e) => {
    const t = e.target;
    if (t instanceof Element && t.closest("a, button, input, textarea, dialog, .card, .mini, .nav, .menu")) return;
    const nx = (e.clientX / innerWidth) * 2 - 1, ny = -(e.clientY / innerHeight) * 2 + 1;
    if (overForm(nx, ny)) next();
  }, { passive: true });

  /* ---------- Loop ---------- */
  const S = window.STAGE || { x: 0.5, y: 0, s: 1, o: 1 };
  const cur = { x: S.x, y: S.y, s: S.s * 0.5, o: 0 };
  let visible = true, last = performance.now(), time = 0;
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; });

  function frame(now) {
    requestAnimationFrame(frame);
    // also idle while a project window is open (main.js sets the flag on the live STAGE object)
    if (!visible || (window.STAGE || S).paused) {
      last = now;
      // a real resize clears the WebGL buffer: redraw once so the shape stays behind the backdrop
      if (resized && visible && cur.o >= 0.01) {
        group.position.set(cur.x * halfW * (S.rtl ? -1 : 1), cur.y * halfH, 0);
        group.scale.setScalar(baseR * cur.s);
        renderer.render(scene, camera);
      }
      resized = false;
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += reduce ? 0 : dt;

    if (window.stageAt && window.getScrollY) window.stageAt(window.getScrollY());
    const k = 1 - Math.pow(0.0015, dt);
    cur.x += (S.x - cur.x) * k; cur.y += (S.y - cur.y) * k; cur.s += (S.s - cur.s) * k; cur.o += (S.o - cur.o) * k;
    canvas.style.opacity = cur.o.toFixed(3);
    if (cur.o < 0.01) {
      if (hover && window.Cursor) { hover = 0; window.Cursor.hint(false); }
      return;
    }

    const dir = S.rtl ? -1 : 1;
    group.position.set(cur.x * halfW * dir, cur.y * halfH, 0);
    group.scale.setScalar(baseR * cur.s);

    // morph progress (warp only when motion is allowed)
    if (morphing) {
      morphT = Math.min(1, morphT + dt / (reduce ? 0.001 : 1.7));
      U.uMorph.value = morphT;
      U.uWarp.value = reduce ? 0 : 0.55;
      if (morphT >= 1) { morphing = false; aFrom.set(aTo); geo.getAttribute("aFrom").needsUpdate = true; }
    }
    lineMat.opacity += (((current.lines.length && morphT > 0.7) ? (curTheme === "day" ? 0.32 : 0.22) : 0) - lineMat.opacity) * k * 0.6;
    U.uPulse.value *= Math.pow(0.05, dt);
    const wantDetail = ORDER[idx] === "me" || ORDER[idx] === "name" ? 1 : 0;
    U.uDetail.value += (wantDetail - U.uDetail.value) * k * 0.5;

    // pointer: eased parallax, repulsion and the cursor hint
    pointer.x += (pointer.tx - pointer.x) * k * 0.6; pointer.y += (pointer.ty - pointer.y) * k * 0.6;
    U.uMouse.value.set(pointer.tx, pointer.ty);
    const nowHover = mouseIn && overForm(pointer.tx, pointer.ty) ? 1 : 0;
    U.uMouseOn.value += ((mouseIn ? 1 : 0) - U.uMouseOn.value) * k;
    if (nowHover !== hover && window.Cursor) window.Cursor.hint(!!nowHover);
    hover = nowHover;

    // theme colours blend
    const P = THEMES[curTheme], kt = k * 0.6;
    U.uColA.value.lerp(P.a, kt); U.uColB.value.lerp(P.b, kt); lineMat.color.lerp(P.line, kt);

    // motion: the galaxy turns; readable shapes only sway towards the pointer
    const key = ORDER[idx];
    const flat = key === "name" || key === "me" || key === "eye";
    const targetY = (key === "galaxy" ? time * 0.08 : Math.sin(time * 0.4) * (flat ? 0.12 : 0.35)) + pointer.x * (flat ? 0.15 : 0.35);
    spin.rotation.y += (targetY - spin.rotation.y) * k * 0.8;
    spin.rotation.x += ((-pointer.y * (flat ? 0.1 : 0.25)) - spin.rotation.x) * k * 0.8;
    group.position.y += Math.sin(time * 0.8) * 0.03;

    U.uTime.value = time;
    renderer.render(scene, camera);
  }
  renderer.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); fallback(); });

  // Compile the point and line shaders before the first frame, so neither the first render nor the
  // first click blocks the main thread. A throwaway line object pulls in the line program.
  // The first frame still starts if compileAsync is missing, throws or never settles.
  const warmLines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)), lineMat);
  spin.add(warmLines);
  try { await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 3000))]); } catch (e) {}
  spin.remove(warmLines); warmLines.geometry.dispose();
  requestAnimationFrame((t) => { last = t; frame(t); stageEl.classList.add("is-live"); });

  // Prebuild the other shapes in idle time, in ORDER order so the seeded points match clicking through
  const idleCb = window.requestIdleCallback ? (f, o) => requestIdleCallback(f, o) : (f) => setTimeout(f, 50);
  let pre = 1;
  const warmNext = () => { if (pre < ORDER.length) build(ORDER[pre++]).catch(() => {}).finally(() => idleCb(warmNext, { timeout: 2000 })); };
  setTimeout(() => idleCb(warmNext, { timeout: 2000 }), 3200);
})();
