/*!
 * fundus.js - realistic procedural colour fundus photograph for <canvas>. No dependencies, no modules.
 *   var f = Fundus.create(canvas, { seed: 7, eye: 'right', lesions: true });
 *   f.draw({ blur: 0..1, gradcam: 0..1, scan: 0..1, time: seconds });  f.resize();  f.clusters();  f.destroy();
 * Options: seed (int, deterministic) | eye 'right'|'left' (disc on the right / left of the photo) | lesions
 * (moderate-severe NPDR, default true) | background (CSS colour outside the field of view; default transparent)
 * | blend (Grad-CAM composite op, default 'source-over'; 'screen' / 'overlay' work too) | fill (FOV diameter /
 * canvas size, 0.97) | maxDpr (2) | autoResize (true). Give the canvas a CSS size (width:100%; aspect-ratio:1).
 * Palette sampled from Wikimedia Commons: "Fundus photograph of normal left eye.jpg" (CC0) and "Fundus -
 * diabetic retinopathy.png" (CC BY 4.0). Geometry lives in unit space (FOV centre 0,0, radius 1, y down),
 * built for a canonical LEFT eye (disc left, temporal = +x) and mirrored for right eyes.
 */
(function (global) {
  'use strict';
  /* ---------------------------------------------------------------- helpers */
  function mulberry32(a) {                                                  // seeded PRNG, uniform [0,1)
    return function () {
      var t = a = (a + 0x6D2B79F5) | 0;
      t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, v) { v = clamp((v - a) / (b - a), 0, 1); return v * v * (3 - 2 * v); }
  function mix(p, q, t) { return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]; }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function makeNoise(seed) {                                                // seeded 2-D value noise + fbm
    var rnd = mulberry32(seed), perm = new Uint8Array(512), val = new Float32Array(256), i, j, t;
    for (i = 0; i < 256; i++) { perm[i] = i; val[i] = rnd(); }
    for (i = 255; i > 0; i--) { j = (rnd() * (i + 1)) | 0; t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (i = 0; i < 256; i++) perm[i + 256] = perm[i];
    function n2(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      xi &= 255; yi &= 255;
      var a = val[perm[xi + perm[yi]]], b = val[perm[xi + 1 + perm[yi]]], c = val[perm[xi + perm[yi + 1]]], d = val[perm[xi + 1 + perm[yi + 1]]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function fbm(x, y, oct) {
      for (var k = 0, s = 0, amp = 0.5, norm = 0; k < oct; k++) { s += amp * n2(x, y); norm += amp; amp *= 0.5; x *= 2.03; y *= 2.03; }
      return s / norm;
    }
    return { n2: n2, fbm: fbm };
  }

  /* ---------------------------------------------------------------- palette (RGB, sampled then tuned) */
  var C = {
    post: [226, 98, 62], periph: [188, 68, 46], peri: [246, 134, 86],       // posterior pole, periphery, peripapillary
    macula: [196, 70, 42], fovea: [168, 36, 20],
    cup: [255, 230, 166], rim: [252, 192, 128], edge: [242, 150, 104], nasal: [250, 170, 150],
    ma: [138, 14, 20], heme: [126, 18, 22], exCore: [250, 216, 124], exEdge: [232, 160, 74], cws: [250, 228, 200]
  };
  var VF = [176, 98, 136], AF = [232, 170, 178], WHITE = [255, 255, 255]; // vessel 'multiply' factors: vein / artery
  var LS = {                                                                // lesion radial-gradient stops
    ma: [0, rgba(C.ma, 0.95), 0.7, rgba(C.ma, 0.85), 1, rgba(C.ma, 0)],
    hem: [0, rgba(C.heme, 0.75), 0.5, rgba(C.heme, 0.6), 1, rgba(C.heme, 0)],
    flame: [0, rgba(C.heme, 0.7), 0.5, rgba(C.heme, 0.4), 1, rgba(C.heme, 0)],
    ex: [0, rgba(C.exCore, 1), 0.5, rgba(C.exEdge, 0.92), 1, rgba(C.exEdge, 0)],
    cws: [0, rgba(C.cws, 0.42), 0.55, rgba(C.cws, 0.22), 1, rgba(C.cws, 0)]
  };

  /* ---------------------------------------------------------------- model (unit space) */
  function buildModel(seed, eye, lesions) {
    var rnd = mulberry32(seed),
      M = { disc: { x: -0.62, y: -0.04, r: 0.085 }, fovea: { x: 0.03, y: 0.02 }, vessels: [], lesions: [], clusters: [] };
    buildVessels(M, rnd);
    if (lesions) buildLesions(M, rnd);
    if (eye !== 'left') {                                                   // right eye: mirror horizontally
      M.disc.x = -M.disc.x; M.fovea.x = -M.fovea.x;
      M.vessels.forEach(function (v) { for (var i = 0; i < v.p.length; i += 3) v.p[i] = -v.p[i]; });
      M.lesions.forEach(function (l) { l.x = -l.x; l.a = Math.PI - l.a; });
      M.clusters.forEach(function (c) { c.x = -c.x; });
    }
    return M;
  }
  /* Vessel trees: the 4 arcade trunks orbit the macula, nasal trunks run to the periphery; side branches
     taper and obey Murray's law (w^3 = w1^3 + w2^3). Nothing enters the fovea or crosses the temporal raphe. */
  function buildVessels(M, rnd) {
    var D = M.disc, F = M.fovea, deg = Math.PI / 180, total = 0, queue = [], qi = 0;
    // [type, angle (deg), width, macular orbit radius, hemisphere (+1 superior), venous beading]
    [['v', -82, 0.025, 0.47, 1, 1], ['a', -68, 0.017, 0.44, 1, 0], ['v', 84, 0.026, 0.48, -1, 1], ['a', 70, 0.017, 0.45, -1, 0],
      ['v', -128, 0.017, 0, 1, 0], ['a', -142, 0.012, 0, 1, 0], ['v', 130, 0.017, 0, -1, 0], ['a', 144, 0.012, 0, -1, 0],
      ['a', 176, 0.008, 0, 1, 0], ['v', 186, 0.009, 0, -1, 0], ['a', -12, 0.006, 0, 1, 0], ['v', 13, 0.0065, 0, -1, 0]
    ].forEach(function (t) {                                                // trunks emerge across the cup
      var a = (t[1] + (rnd() - 0.5) * 8) * deg, o = D.r * (0.12 + rnd() * 0.3), oa = a + (rnd() - 0.5) * 1.2;
      queue.push([t[0], D.x + Math.cos(oa) * o, D.y + Math.sin(oa) * o, a, t[2] * (0.92 + rnd() * 0.16),
        t[3] ? t[3] + (rnd() - 0.5) * 0.05 : 0, 0, t[4], !!t[5]]);
    });
    while (qi < queue.length) grow.apply(null, queue[qi++]);              // breadth-first: budget trims fine twigs only
    function grow(type, x, y, ang, w, arc, depth, hs, bead) {
      var p = [], len = 0, curv = 0, step = 0.009, side = rnd() < 0.5 ? 1 : -1, next = 0.05 + rnd() * 0.1, dir = 1, i, cw;
      if (arc) dir = (Math.cos(ang) * (F.y - y) + Math.sin(ang) * (x - F.x)) > 0 ? 1 : -1;
      for (i = 0; i < 360; i++) {
        var dx = x - F.x, dy = y - F.y, df = Math.sqrt(dx * dx + dy * dy) || 1e-6, ux = dx / df, uy = dy / df;
        if (df < 0.09 || x * x + y * y > 1.04 || w < 0.0018) break;
        if (x > F.x + 0.06 && hs * (y - F.y) > -0.012) break;              // horizontal raphe
        p.push(x, y, bead && len > 0.4 ? w * (1 + 0.3 * Math.max(0, Math.sin(len * 75))) : w);
        curv = curv * 0.86 + (rnd() - 0.5) * 0.03;                          // gentle tortuosity
        ang += curv;
        if (arc) {                                                           // steer onto an orbit around the macula
          var aw = smooth(0.03, 0.25, len) * (1 - smooth(1.1, 1.7, len)), k = clamp((df - arc) * 3, -0.8, 0.8);
          ang += angDiff(Math.atan2(dir * ux - k * uy, -dir * uy - k * ux), ang) * 0.16 * aw;
        }
        if (df < 0.3) {                                                      // swerve around the avascular fovea
          var s = (Math.cos(ang) * -uy + Math.sin(ang) * ux) > 0 ? 1 : -1;
          ang += angDiff(Math.atan2(s * ux + 0.6 * uy, -s * uy + 0.6 * ux), ang) * (0.3 - df) * 1.6;
        }
        x += Math.cos(ang) * step; y += Math.sin(ang) * step; len += step;
        w *= 1 - step * (0.45 + 0.0016 / w);                                 // taper; thin twigs die off sooner
        if (len > next && depth < 4 && w > 0.004 && total < 9000) {          // side branch: mostly small, some forks
          cw = w * (rnd() < 0.2 ? 0.7 + rnd() * 0.15 : 0.3 + rnd() * 0.3);
          w = Math.cbrt(Math.max(w * w * w - cw * cw * cw, Math.pow(w * 0.62, 3)));
          queue.push([type, x, y, ang + side * (0.5 + rnd() * 0.6), cw, 0, depth + 1, hs, false]);
          side = -side; next = len + (0.1 + rnd() * 0.14) * (1 + depth * 0.4);
        }
      }
      total += p.length / 3;
      if (p.length >= 9) M.vessels.push({ t: type, p: p });                  // p = [x, y, width, x, y, width, ...]
    }
  }
  /* Moderate-severe NPDR: microaneurysms, dot/blot + flame haemorrhages in all 4 quadrants (4-2-1 rule),
     a circinate ring of hard exudates and cotton-wool spots. The clusters double as Grad-CAM targets. */
  function buildLesions(M, rnd) {
    var D = M.disc, F = M.fovea, L = M.lesions, i, p;
    function add(t, x, y, r, a, e) {                                         // skip disc, fovea and FOV rim
      var dx = x - D.x, dy = y - D.y, fx = x - F.x, fy = y - F.y;
      if (x * x + y * y < 0.85 && dx * dx + dy * dy > 2.9 * D.r * D.r && fx * fx + fy * fy > 0.0025)
        L.push({ t: t, x: x, y: y, r: r, a: a || 0, e: e || 1 });
    }
    function near(c, s) { var a = rnd() * 6.2832, d = Math.sqrt(rnd()) * s; return [c.x + Math.cos(a) * d, c.y + Math.sin(a) * d]; }
    function blot(q) {                                                       // irregular blot = 2-4 soft lobes
      var r = 0.01 + rnd() * 0.017, n = 2 + ((rnd() * 3) | 0);
      for (var j = 0; j < n; j++) add('hem', q[0] + (rnd() - 0.5) * r, q[1] + (rnd() - 0.5) * r, r * (0.5 + rnd() * 0.5), rnd() * 3.14, 1 + rnd() * 0.6);
    }
    // [dx, dy from fovea, spread, Grad-CAM weight]: 0 exudate ring, 1 inferior bleeds, 2 cotton-wool, 3 temporal bleeds
    [[0.24, -0.15, 0.12, 1], [0.06, 0.34, 0.13, 0.85], [-0.26, -0.32, 0.11, 0.7], [0.4, 0.14, 0.1, 0.55]].forEach(function (k, n) {
      M.clusters.push({ x: F.x + k[0] + (rnd() - 0.5) * 0.06, y: F.y + k[1] + (rnd() - 0.5) * 0.06, s: k[2], w: k[3], kind: n });
    });
    M.clusters.forEach(function (c) {
      for (i = 0; i < 12; i++) { p = near(c, c.s); add('ma', p[0], p[1], 0.004 + rnd() * 0.0035); }
      if (c.kind === 0) for (i = 0; i < 26; i++) {                           // circinate ring of exudate clumps
        var a = rnd() * 6.2832, d = c.s * (i % 5 ? 0.6 + rnd() * 0.4 : rnd() * 0.6), ex = c.x + Math.cos(a) * d, ey = c.y + Math.sin(a) * d * 0.8;
        for (var m = 0, mn = 1 + ((rnd() * 3) | 0); m < mn; m++) add('ex', ex + (rnd() - 0.5) * 0.02, ey + (rnd() - 0.5) * 0.02, 0.003 + rnd() * rnd() * 0.01);
      }
      if (c.kind === 1) for (i = 0; i < 8; i++) { p = near(c, c.s * 1.2); add('ex', p[0], p[1], 0.003 + rnd() * 0.004); }
      if (c.kind !== 0) for (i = 0; i < 4 + c.kind; i++) blot(near(c, c.s));
      if (c.kind === 2) for (i = 0; i < 2; i++) {                            // fluffy cotton-wool spots
        p = near(c, c.s * 0.8);
        for (var q = 0; q < 5; q++) add('cws', p[0] + (rnd() - 0.5) * 0.04, p[1] + (rnd() - 0.5) * 0.03, 0.014 + rnd() * 0.012, rnd() * 3.14, 1.2 + rnd() * 0.6);
      }
    });
    for (var qd = 0; qd < 4; qd++) for (i = 0; i < 4; i++) {                 // scattered lesions in every quadrant
      var a2 = (qd + rnd()) * Math.PI / 2, d2 = 0.25 + rnd() * 0.6;
      p = [F.x + Math.cos(a2) * d2, F.y + Math.sin(a2) * d2];
      if (rnd() < 0.5) blot(p); else add('ma', p[0], p[1], 0.004 + rnd() * 0.003);
    }
    for (i = 0; i < 3; i++) {                                                // flame haemorrhages along nerve fibres
      var fa = (rnd() < 0.5 ? -1 : 1) * (0.9 + rnd() * 0.9), fd = D.r * (2 + rnd() * 1.6);
      add('flame', D.x + Math.cos(fa) * fd, D.y + Math.sin(fa) * fd, 0.008 + rnd() * 0.005, fa, 3);
    }
  }

  /* ---------------------------------------------------------------- static rendering */
  /* Retina background (512 px, built once): radial falloff, peripapillary glow, macular pigment, RPE mottling,
     choroidal ribbons (ridges of domain-warped noise), nerve-fibre striations, uneven flash illumination.
     Built in row slices so it can run in idle time; step(stop) returns true once the canvas is filled. */
  function textureBuilder(M, seed, T) {
    var N = makeNoise(seed * 7 + 3), c = makeCanvas(T, T), x = c.getContext('2d'), img = x.createImageData(T, T), d = img.data;
    var D = M.disc, F = M.fovea, j = 0, done = false;
    function step(stop) {                                                    // stop() ends a slice between rows
      for (; j < T; j++) {
        if (stop && stop()) return false;
        for (var i = 0; i < T; i++) {
          var u = (i + 0.5) / T * 2 - 1, v = (j + 0.5) / T * 2 - 1, r = Math.sqrt(u * u + v * v), o = (j * T + i) * 4;
          if (r > 1.02) continue;
          var ddx = u - D.x, ddy = v - D.y, dl = Math.sqrt(ddx * ddx + ddy * ddy) + 1e-6, dd = dl / D.r;
          var fx = u - F.x, fy = v - F.y, f2 = fx * fx + fy * fy;
          var col = mix(C.post, C.periph, smooth(0.3, 1, r));
          col = mix(col, C.peri, 0.5 * Math.exp(-Math.pow(Math.max(0, dd - 1) / 1.3, 2)));
          col = mix(col, C.macula, 0.6 * Math.exp(-f2 / 0.05));
          col = mix(col, C.fovea, 0.8 * Math.exp(-f2 / 0.0028));
          var n = N.fbm(u * 5 + 11, v * 5 + 3, 4) - 0.5;
          var s = N.fbm(u * 4.5 + n * 1.4 + 20, v * 4.5 - n * 1.4, 3);
          var rib = (smooth(0.8, 0.99, 1 - Math.abs(2 * s - 1)) - 0.4) * 0.05 * smooth(0.2, 0.95, r);
          var ca = ddx / dl, sa = ddy / dl;                                  // direction from disc: seam-free streaks
          var nf = (N.n2(ca * 9 + dd * 0.12 + 50, sa * 9 + 50) - 0.5) * Math.exp(-Math.pow((dd - 1.8) / 1.5, 2)) * (0.35 + 0.65 * Math.abs(sa));
          var k = 1 + n * 0.16 + (N.fbm(u * 1.3 + 40, v * 1.3 + 7, 2) - 0.5) * 0.2 + rib + nf * 0.18;
          d[o] = col[0] * k; d[o + 1] = col[1] * k * (1 + (N.n2(u * 9 + 5, v * 9) - 0.5) * 0.1); d[o + 2] = col[2] * k; d[o + 3] = 255;
        }
      }
      if (!done) { x.putImageData(img, 0, 0); done = true; }
      return true;
    }
    return { canvas: c, step: step };
  }
  function buildTexture(M, seed, T) { var b = textureBuilder(M, seed, T); b.step(); return b.canvas; }
  function makeGrain(seed) {
    var c = makeCanvas(128, 128), x = c.getContext('2d'), im = x.createImageData(128, 128), r = mulberry32(seed ^ 0x5bd1e995);
    for (var i = 0; i < im.data.length; i += 4) { im.data[i] = im.data[i + 1] = im.data[i + 2] = r() * 255; im.data[i + 3] = 255; }
    x.putImageData(im, 0, 0); return c;
  }
  function blob(x, cx, cy, r, a, e, stops) {                               // soft, rotated, elliptical spot
    x.save(); x.translate(cx, cy); x.rotate(a); x.scale(e, 1);
    var g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 2 * Math.PI); x.fill(); x.restore();
  }
  function drawDisc(x, M) {
    var D = M.disc, r = D.r, tx = M.fovea.x > D.x ? 1 : -1, g;           // tx: temporal direction
    blob(x, D.x, D.y, r * 2.6, 0, 1, [0.3, rgba(C.peri, 0.45), 1, rgba(C.peri, 0)]);
    x.save(); x.translate(D.x, D.y); x.scale(1, 1.08);                     // slightly vertical oval
    g = x.createRadialGradient(tx * r * 0.2, 0, 0, 0, 0, r * 1.06);        // pale cup sits temporally (C/D ~0.4)
    g.addColorStop(0, rgba(C.cup, 1)); g.addColorStop(0.32, rgba(C.cup, 0.97)); g.addColorStop(0.46, rgba(C.rim, 1));
    g.addColorStop(0.8, rgba(C.edge, 0.95)); g.addColorStop(0.93, rgba(C.edge, 0.5)); g.addColorStop(1, rgba(C.edge, 0));
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, r * 1.06, 0, 2 * Math.PI); x.fill();
    blob(x, -tx * r * 0.5, 0, r * 0.6, 0, 1, [0, rgba(C.nasal, 0.4), 1, rgba(C.nasal, 0)]);   // pinker nasal rim
    x.restore();
  }
  function drawLesions(x, M, types) {
    types.forEach(function (t) { M.lesions.forEach(function (l) { if (l.t === t) blob(x, l.x, l.y, l.r, l.a, l.e, LS[t]); }); });
  }
  /* One vessel in runs of near-constant width. pass 0 = soft wall, 1 = blood column, 2 = central light reflex. */
  function strokeVessel(l, v, pass, px) {
    var p = v.p, n = p.length / 3, art = v.t === 'a', F = art ? AF : VF, i = 0;
    while (i < n - 1) {
      var w = p[i * 3 + 2], j = i + 1;
      while (j < n - 1 && j - i < 10 && Math.abs(p[j * 3 + 2] - w) < w * 0.05) j++;
      var fade = 1 - clamp(w / 0.01, 0.1, 1);                              // thin vessels are fainter
      if (pass === 0) { l.lineWidth = w * 1.8 + px * 1.5; l.strokeStyle = rgba(mix(F, WHITE, 0.66 + fade * 0.34), 1); }
      else if (pass === 1) { l.lineWidth = Math.max(w, px * 0.9); l.strokeStyle = rgba(mix(F, WHITE, fade * 0.85), 1); }
      else if (w > px * 5) { l.lineWidth = w * (art ? 0.26 : 0.18); l.strokeStyle = art ? 'rgb(72,52,46)' : 'rgb(30,20,18)'; }
      else { i = j; continue; }
      l.beginPath(); l.moveTo(p[i * 3], p[i * 3 + 1]);
      for (var k = i + 1; k <= j; k++) l.lineTo(p[k * 3], p[k * 3 + 1]);
      l.stroke(); i = j;
    }
  }
  /* Vessels go to an opaque layer (overlapping caps never double-darken) that is 'multiply'-ed onto the
     retina; arteries are drawn after veins so they cross over them. The light reflex is added with 'screen'. */
  function drawVessels(x, S) {
    var R = S.R, px = 1 / R, L = makeCanvas(S.W, S.H), l = L.getContext('2d'), M = S.M;
    var vs = M.vessels.filter(function (v) { return v.t === 'v'; }).concat(M.vessels.filter(function (v) { return v.t === 'a'; }));
    l.setTransform(R, 0, 0, R, S.cx, S.cy); l.lineCap = 'round'; l.lineJoin = 'round';
    [0, 1].forEach(function (pass) { vs.forEach(function (v) { strokeVessel(l, v, pass, px); }); });
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'multiply'; x.drawImage(L, 0, 0);
    l.setTransform(1, 0, 0, 1, 0, 0); l.clearRect(0, 0, S.W, S.H); l.setTransform(R, 0, 0, R, S.cx, S.cy);
    vs.forEach(function (v) { strokeVessel(l, v, 2, px); });
    x.globalCompositeOperation = 'screen'; x.drawImage(L, 0, 0); x.restore();
  }
  function renderBase(S) {
    var M = S.M, R = S.R, W = S.W, H = S.H, base = makeCanvas(W, H), x = base.getContext('2d'), g;
    x.imageSmoothingQuality = 'high';
    x.drawImage(S.tex, S.cx - R, S.cy - R, 2 * R, 2 * R);                  // 1. retina + choroid texture
    x.setTransform(R, 0, 0, R, S.cx, S.cy);                                // unit space from here on
    drawDisc(x, M);                                                        // 2. optic nerve head
    drawLesions(x, M, ['hem', 'ma', 'ex']);                                // 3. intraretinal lesions (under vessels)
    drawVessels(x, S);                                                     // 4. vessel trees
    drawLesions(x, M, ['flame', 'cws']);                                   // 5. nerve-fibre-layer lesions (on top)
    blob(x, M.fovea.x, M.fovea.y, 0.011, 0, 1, [0, 'rgba(255,232,214,0.5)', 1, 'rgba(255,232,214,0)']);  // foveal reflex
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'overlay'; x.globalAlpha = 0.07;          // 6. sensor grain
    x.fillStyle = x.createPattern(S.grain, 'repeat'); x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;        // 7. vignette
    g = x.createRadialGradient(S.cx, S.cy, 0, S.cx, S.cy, R);
    g.addColorStop(0.62, 'rgba(40,8,4,0)'); g.addColorStop(0.9, 'rgba(40,8,4,0.12)'); g.addColorStop(1, 'rgba(18,3,2,0.5)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'destination-in';                         // 8. soft circular field stop
    g = x.createRadialGradient(S.cx, S.cy, 0, S.cx, S.cy, R); g.addColorStop(0.975, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (S.bg) { x.globalCompositeOperation = 'destination-over'; x.fillStyle = S.bg; x.fillRect(0, 0, W, H); }
    x.globalCompositeOperation = 'source-over'; return base;
  }
  var FILTER = null;                                                       // does ctx.filter really blur? (tested once)
  function canFilter() {                                                   // blur a 1-px dot, look 2 px away
    try {
      var x = makeCanvas(9, 9).getContext('2d'), s = makeCanvas(9, 9), sx = s.getContext('2d');
      if (!('filter' in x)) return false;
      sx.fillStyle = '#fff'; sx.fillRect(4, 4, 1, 1); x.filter = 'blur(2px)'; x.drawImage(s, 0, 0);
      return x.getImageData(2, 4, 1, 1).data[3] > 0;
    } catch (e) { return false; }
  }
  function blurred(src, px) {
    var W = src.width, H = src.height, c = makeCanvas(W, H), x = c.getContext('2d');
    if (FILTER) { x.filter = 'blur(' + px.toFixed(2) + 'px)'; x.drawImage(src, 0, 0); return c; }
    var s = 1 / (1 + px / 1.6), t = makeCanvas(W * s, H * s), tx = t.getContext('2d');   // fallback: down/up-sample
    tx.imageSmoothingQuality = x.imageSmoothingQuality = 'high';
    tx.drawImage(src, 0, 0, t.width, t.height); x.drawImage(t, 0, 0, W, H); return c;
  }
  /* Grad-CAM: gaussian blobs on the lesion clusters -> jet colormap, 128 px, upscaled smoothly.
     Each gaussian is separable, so it is the product of one row and one column table per blob. */
  function heatFrame(S, time) {
    var HS = 128, d = S.himg.data, B = S.blobs, K = B.length, i, j, k;
    var gx = S.gx || (S.gx = new Float64Array(K * HS)), gy = S.gy || (S.gy = new Float64Array(K * HS)), wk = S.wk || (S.wk = new Float64Array(K));
    for (k = 0; k < K; k++) {                                               // blobs drift and breathe slightly
      var b = B[k], bx = b.x + Math.sin(time * 0.7 + k * 1.7) * 0.02, by = b.y + Math.cos(time * 0.55 + k * 2.3) * 0.02, c = 1 / (2 * b.s * b.s);
      wk[k] = b.w * (1 + 0.08 * Math.sin(time * 1.3 + k));
      for (i = 0; i < HS; i++) { var u = (i + 0.5) / HS * 2 - 1, du = u - bx, dv = u - by; gx[k * HS + i] = Math.exp(-du * du * c); gy[k * HS + i] = Math.exp(-dv * dv * c); }
    }
    for (j = 0; j < HS; j++) for (i = 0; i < HS; i++) {
      var t = 0, o = (j * HS + i) * 4;
      for (k = 0; k < K; k++) t += wk[k] * gx[k * HS + i] * gy[k * HS + j];
      t = (t > 1 ? 1 : t) * 0.9;                                            // peak = pure red, not dark red
      d[o] = 255 * (1.5 - Math.abs(4 * t - 3)); d[o + 1] = 255 * (1.5 - Math.abs(4 * t - 2));   // jet: blue > cyan >
      d[o + 2] = 255 * (1.5 - Math.abs(4 * t - 1)); d[o + 3] = 255 * (0.35 + 0.75 * t);        // yellow > red (clamped)
    }
    S.hctx.putImageData(S.himg, 0, 0);
  }

  /* ---------------------------------------------------------------- public API */
  function create(canvas, opts) {
    opts = opts || {};
    if (FILTER === null) FILTER = canFilter();
    var seed = (opts.seed >>> 0) || 7, ctx = canvas.getContext('2d'), last = null, dead = false, ro = null, timer = 0;
    var M = opts.model || buildModel(seed, opts.eye || 'right', opts.lesions !== false);
    var S = { M: M, tex: opts.texture || buildTexture(M, seed, 512), grain: makeGrain(seed), bg: opts.background || null,
      blend: opts.blend || 'source-over', levels: [], heat: makeCanvas(128, 128) };
    S.hctx = S.heat.getContext('2d'); S.himg = S.hctx.createImageData(128, 128);
    S.blobs = M.clusters.length ? M.clusters.map(function (c) { return { x: c.x, y: c.y, s: c.s * 1.35, w: c.w }; })
      : [{ x: M.disc.x, y: M.disc.y, s: 0.14, w: 0.8 }, { x: M.fovea.x, y: M.fovea.y, s: 0.2, w: 0.7 }];
    S.blobs.push({ x: M.fovea.x, y: M.fovea.y, s: 0.55, w: 0.16 });       // faint global attention
    function measure() {
      var dpr = Math.min(global.devicePixelRatio || 1, opts.maxDpr || 2);
      var w = canvas.clientWidth || canvas.width / dpr, h = canvas.clientHeight || w;
      return [Math.max(2, Math.round(w * dpr)), Math.max(2, Math.round(h * dpr))];
    }
    function resize(force) {                                               // re-render base + 4 blurred copies
      if (dead) return;
      var m = measure();
      if (!force && S.levels.length && m[0] === S.W && m[1] === S.H) return;   // same size: keep the cached levels
      S.W = canvas.width = m[0]; S.H = canvas.height = m[1];
      S.R = Math.min(S.W, S.H) * 0.5 * (opts.fill || 0.97); S.cx = S.W / 2; S.cy = S.H / 2;
      var base = renderBase(S);
      S.levels = [base].concat([0.004, 0.009, 0.017, 0.03].map(function (k) { return blurred(base, k * S.R); }));
      draw(last || {});
    }
    function draw(st) {
      if (dead || !S.levels.length) return;
      st = st || {}; last = st;
      var blur = clamp(+st.blur || 0, 0, 1), cam = clamp(+st.gradcam || 0, 0, 1), time = +st.time || 0;
      var scan = st.scan == null ? -1 : +st.scan, W = S.W, H = S.H, R = S.R, cx = S.cx, cy = S.cy, n = S.levels.length - 1;
      var b = blur * n, i0 = Math.min(n - 1, Math.floor(b)), f = b - i0;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(S.levels[i0], 0, 0);                                   // 1. degradation: cross-fade blur levels
      if (f > 0.002) { ctx.globalAlpha = f; ctx.drawImage(S.levels[i0 + 1], 0, 0); ctx.globalAlpha = 1; }
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R * 0.985, 0, 2 * Math.PI); ctx.clip();   // overlays stay in the FOV
      if (blur > 0) {                                                      //    + veiling haze
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.16 * blur; ctx.fillStyle = 'rgb(255,214,190)'; ctx.fillRect(0, 0, W, H);
      }
      if (cam > 0) {                                                       // 2. Grad-CAM heat map
        heatFrame(S, time);
        ctx.globalCompositeOperation = S.blend; ctx.globalAlpha = 0.55 * cam; ctx.imageSmoothingEnabled = true;
        ctx.drawImage(S.heat, cx - R, cy - R, 2 * R, 2 * R);
      }
      if (scan > 0 && scan < 1) {                                          // 3. scanning line with a fading trail
        var y = cy - R + 2 * R * scan, h = R * 0.24, g = ctx.createLinearGradient(0, y - h, 0, y);
        g.addColorStop(0, 'rgba(120,220,255,0)'); g.addColorStop(1, 'rgba(150,230,255,0.3)');
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(cx - R, y - h, 2 * R, h);
        ctx.fillStyle = 'rgba(225,250,255,0.95)'; ctx.fillRect(cx - R, y - Math.max(0.75, R * 0.004), 2 * R, Math.max(1.5, R * 0.008));
      }
      ctx.restore();
    }
    if (opts.autoResize !== false && global.ResizeObserver) {              // debounced; skips no-op notifications
      ro = new global.ResizeObserver(function () {
        clearTimeout(timer); timer = setTimeout(function () { var m = measure(); if (m[0] !== S.W || m[1] !== S.H) resize(); }, 120);
      });
      ro.observe(canvas);
    }
    resize();
    return {
      canvas: canvas, draw: draw, resize: resize,
      clusters: function () {                                              // lesion clusters in CSS px (for labels)
        var k = (canvas.clientWidth || S.W) / S.W, names = ['exudates', 'haemorrhages', 'cotton-wool spots', 'microaneurysms'];
        return M.clusters.map(function (c) { return { x: (S.cx + c.x * S.R) * k, y: (S.cy + c.y * S.R) * k, r: c.s * S.R * k, kind: names[c.kind] }; });
      },
      destroy: function () { dead = true; clearTimeout(timer); if (ro) ro.disconnect(); S.levels = []; S.tex = S.heat = S.grain = null; }
    };
  }
  /* Model + a texture builder for create(): call step(stop) in idle slices until it returns true, then pass
     { model, texture } to create() so it skips both builds. */
  function prepare(opts) {
    opts = opts || {};
    var seed = (opts.seed >>> 0) || 7, M = buildModel(seed, opts.eye || 'right', opts.lesions !== false), b = textureBuilder(M, seed, 512);
    return { model: M, texture: b.canvas, step: b.step };
  }
  global.Fundus = { create: create, prepare: prepare, version: '1.0.0' };
})(typeof window !== 'undefined' ? window : this);
