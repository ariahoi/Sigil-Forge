/* Sigil Forge — geometry: seeded randomness, strokes, symmetry. No DOM. */
(function (root) {
"use strict";

/* ---------- parameters ---------- */
const DEFAULTS = { mode: "blades", density: 8, spikes: 55, curl: 60, chaos: 45, weight: 100, sym: "mirror", style: "chrome",
                   spine: true, orbits: true, sparks: true, transparent: false };
const RANGES = { density: [3, 16], spikes: [0, 100], curl: [0, 100], chaos: [0, 100], weight: [40, 220] };
const SYM_KEYS = ["mirror", "r3", "r4", "r5", "r6", "r8", "none"];
const MODES = ["blades", "filigree"];
const MAX_STROKES = 1800;
const FIT_R = .96;

// Repairs params from storage or an older version: unknown keys fall back to defaults, numbers are clamped.
function sanitizeParams(raw, styleKeys) {
  const src = raw && typeof raw === "object" ? raw : {};
  const P = { ...DEFAULTS };
  for (const [key, [lo, hi]] of Object.entries(RANGES)) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) P[key] = Math.min(hi, Math.max(lo, v));
  }
  if (MODES.includes(src.mode)) P.mode = src.mode;
  if (SYM_KEYS.includes(src.sym)) P.sym = src.sym;
  if (styleKeys.includes(src.style)) P.style = src.style;
  for (const key of ["spine", "orbits", "sparks", "transparent"]) if (key in src) P[key] = !!src[key];
  return P;
}

const heroCount = density => 2 + Math.round((density - 3) / 13 * 3);

/* ---------- seeded randomness ---------- */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function rngFrom(str) {
  const r = mulberry32(xmur3(str)());
  const f = () => r();
  f.range = (a, b) => a + (b - a) * r();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  f.sign = () => r() < .5 ? -1 : 1;
  f.chance = p => r() < p;
  f.gauss = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * r()); };
  return f;
}
const SEED_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newSeed() {
  let s = "";
  for (let i = 0; i < 8; i++) { s += SEED_ABC[Math.floor(Math.random() * SEED_ABC.length)]; if (i === 3) s += "-"; }
  return s;
}

/* ---------- geometry ---------- */
const PROF = {
  swoosh:  t => Math.pow(Math.sin(Math.PI * Math.pow(t, .55)), 1.1),
  thorn:   t => Math.pow(1 - t, 1.15),
  diamond: t => 1 - Math.abs(2 * t - 1),
  hair:    t => Math.pow(Math.sin(Math.PI * t), .5),
  blade:   t => t < .3 ? Math.pow(t / .3, .7) : Math.pow((1 - t) / .7, 1.4),
};
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const SPEED = .55;

// A guide is a cubic Bézier the composers align strokes to, so lines share one flow.
function makeGuide(p0, p1, p2, p3) {
  const at = t => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  };
  const dir = t => {
    const u = 1 - t, a = 3 * u * u, b = 6 * u * t, c = 3 * t * t;
    const dx = a * (p1[0] - p0[0]) + b * (p2[0] - p1[0]) + c * (p3[0] - p2[0]);
    const dy = a * (p1[1] - p0[1]) + b * (p2[1] - p1[1]) + c * (p3[1] - p2[1]);
    return Math.atan2(dy, dx);
  };
  const samples = [];
  for (let i = 0; i <= 64; i++) samples.push(at(i / 64));
  const nearest = (x, y) => {
    let best = 0, bd = Infinity;
    samples.forEach(([sx, sy], i) => { const d = (sx - x) ** 2 + (sy - y) ** 2; if (d < bd) { bd = d; best = i; } });
    return best / 64;
  };
  return { at, dir, nearest, cps: [p0, p1, p2, p3] };
}

// A sibling of a guide: same shape family, scaled about its start, shifted and sometimes flipped vertically.
function guideVariant(R, g) {
  const [o] = g.cps, s = R.range(.7, 1.25), dy = R.sign() * R.range(.2, .45), flip = R.chance(.4) ? -1 : 1;
  return makeGuide(...g.cps.map(([x, y]) => [o[0] + (x - o[0]) * s, o[1] + dy + flip * (y - o[1]) * s]));
}

function makeGuides(k) {
  const { R } = k, n = R.int(1, 2), out = [];
  for (let g = 0; g < n; g++) {
    const type = ["rise", "fall", "loop"][R.int(0, 2)];
    let p0, p1, p2, p3;
    if (k.radial) {
      const span = Math.PI / k.folds, a3 = -Math.PI / 2 + R.range(.3, .9) * span, r3 = R.range(.6, .88);
      p0 = [R.range(0, .03), -R.range(.08, .3)];
      p3 = [Math.cos(a3) * r3, Math.sin(a3) * r3];
      p1 = [p0[0] + R.range(0, .08), p0[1] - R.range(.15, .35)];
      p2 = type === "loop" ? [p3[0] * .2, p3[1] * R.range(.6, .9)] : [p3[0] * R.range(.5, .9), p3[1] * R.range(.5, .8)];
    } else if (k.free) {
      p0 = [R.range(-.4, .4), R.range(-.4, .4)];
      p1 = [R.range(-.7, .7), R.range(-.7, .7)];
      p2 = [R.range(-.7, .7), R.range(-.7, .7)];
      p3 = [R.range(-.8, .8), R.range(-.8, .8)];
    } else {
      const up = type === "rise" ? -1 : type === "fall" ? 1 : R.sign();
      p0 = [R.range(0, .06), R.range(-.7, .7)];
      p3 = [R.range(.5, .88), type === "loop" ? R.range(-.4, .4) : up * R.range(.4, .9)];
      p1 = [p0[0] + R.range(.1, .35), p0[1] - up * R.range(.1, .35)];
      p2 = type === "loop" ? [R.range(0, .15), p3[1] + R.range(-.3, .3)] : [p3[0] - R.range(0, .25), p3[1] - up * R.range(.15, .4)];
    }
    out.push(makeGuide(p0, p1, p2, p3));
  }
  return out;
}

// The kit holds the primitives both composers draw with. R shapes the skeleton, D the details,
// so a mutation (new variant → new D) keeps the skeleton and regrows the barbs.
function makeKit(R, D, P) {
  const radial = P.sym[0] === "r";
  const k = {
    R, D, P,
    chaos: P.chaos / 100, curl: P.curl / 100, spikes: P.spikes / 100, wk: P.weight / 100,
    radial, folds: radial ? +P.sym.slice(1) : 1, free: P.sym === "none",
    out: [], counter: {},
  };

  k.add = (raw, role) => {
    raw.role = role;
    raw.motif = k.counter[role] = (k.counter[role] ?? -1) + 1;
    k.out.push(raw);
    return raw;
  };
  k.main = N => k.radial ? Math.max(1, Math.round(N * 2 / k.folds)) : N;

  k.bent = (x0, y0, x1, y1, w, prof, t0, dur, n, bend, role = "detail") => {
    const mx = (x0 + x1) / 2 - (y1 - y0) * bend, my = (y0 + y1) / 2 + (x1 - x0) * bend;
    const pts = [], ws = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * y0 + 2 * u * t * my + t * t * y1]);
      ws.push(w * prof(t));
    }
    return k.add({ pts, ws, t0, dur }, role);
  };

  // Radial motifs live in the half-sector [0, π/folds] from the up axis; stray steps steer back to its bisector.
  const sectorPull = (x, y, ang) => {
    if (!k.radial) return 0;
    const phi = Math.atan2(x, -y);
    if (phi >= 0 && phi <= Math.PI / k.folds) return 0;
    return wrapA(-Math.PI / 2 + Math.PI / (2 * k.folds) - ang) * .12;
  };

  k.tendril = (r, x, y, ang, len, w, depth, t0, opt = {}) => {
    const prof = opt.prof || PROF.swoosh, ch = opt.chaos ?? k.chaos, cu = opt.curl ?? k.curl;
    const step = .009, n = Math.max(6, Math.round(len / step));
    const pts = [], ws = [], angs = [];
    let curv = r.range(-1, 1) * .03 * ch;
    const dir = r.sign(), zone = r.range(.22, .45), amt = cu * r.range(.5, 1.5);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([x, y]); ws.push(w * prof(t)); angs.push(ang);
      curv += r.gauss() * .005 * ch; curv *= .955;
      let c = curv;
      if (t > 1 - zone) { const q = (t - (1 - zone)) / zone; c += dir * amt * .11 * q * q; }
      const rad = Math.hypot(x, y);
      if (rad > .8) c += wrapA(Math.atan2(-y, -x) - ang) * .1 * (rad - .8) / .2;
      c += sectorPull(x, y, ang);
      ang += c; x += Math.cos(ang) * step; y += Math.sin(ang) * step;
    }
    const dur = (.35 + len * .7) * SPEED;
    k.add({ pts, ws, t0, dur }, opt.role || "detail");
    if (opt.bare) return;

    const D = k.D;
    if (depth < 2) {
      const nb = Math.round(k.spikes * len * (depth ? 2.2 : 4) * D.range(.4, 1.2));
      for (let b = 0; b < nb; b++) {
        const ti = D.range(.12, .7), i = Math.round(ti * n);
        k.tendril(D, pts[i][0], pts[i][1], angs[i] + D.sign() * D.range(.35, 1.15),
                  len * D.range(.22, .5), ws[i] * .6, depth + 1, t0 + dur * ti);
      }
    }
    // barbs lean back 25–60° against the growth; short ones outnumber long ones
    const nt = Math.min(12, Math.round(k.spikes * len * (depth ? 6 : 11) * D.range(.5, 1.3)));
    for (let q = 0; q < nt; q++) {
      const ti = D.range(.08, .85), i = Math.round(ti * n);
      if (ws[i] < .002) continue;
      const side = D.sign(), a = angs[i] + Math.PI - side * D.range(25, 60) * Math.PI / 180;
      const L = .02 + .1 * D() ** 2;
      k.bent(pts[i][0], pts[i][1], pts[i][0] + Math.cos(a) * L, pts[i][1] + Math.sin(a) * L,
             ws[i] * D.range(.75, 1.1), PROF.thorn, t0 + dur * ti, .12, 6, -side * D.range(0, .22), "barb");
    }
  };

  // spine: the axis everything hangs from; between bulges it never thins below minW
  k.spine = (W = .026 * k.wk * R.range(.8, 1.3), ornaments) => {
    const minW = .02 * k.wk, bul = R.int(2, 5), n = 140, pts = [], ws = [];
    const y0 = k.radial ? -.05 : -R.range(.8, .94), y1 = k.radial ? -R.range(.82, .94) : R.range(.8, .94);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([0, y0 + (y1 - y0) * t]);
      ws.push(Math.pow(Math.sin(Math.PI * t), .6) * Math.max(minW, W * (.3 + .7 * Math.pow(Math.abs(Math.cos(Math.PI * t * bul)), 4))));
    }
    k.add({ pts, ws, t0: 0, dur: .9 * SPEED }, "spine");
    const nd = ornaments ?? R.int(1, 3);
    for (let q = 0; q < nd; q++) {
      const cy = k.radial ? -R.range(.2, .75) : R.range(-.6, .6), h = R.range(.05, .16);
      k.bent(0, cy - h, 0, cy + h, R.range(.03, .07) * k.wk, PROF.diamond, .15 + q * .08, .3 * SPEED, 16, 0, "spine");
      if (R.chance(.6)) k.bent(0, cy, R.range(.08, .26), cy + R.range(-.03, .03), R.range(.008, .016) * k.wk, PROF.thorn, .3, .25 * SPEED, 14, R.range(-.15, .15), "spine");
    }
  };

  // orbits: halo arcs with outward ticks; with `gap` each arc is split once
  k.orbits = (count, gap = false) => {
    for (let o = 0; o < count; o++) {
      const rr = R.range(.3, .85);
      let a0, a1;
      if (k.radial) { a0 = -Math.PI / 2 + R.range(0, .15); a1 = -Math.PI / 2 + Math.PI / k.folds * R.range(.6, 1); }
      else if (k.free) { a0 = R.range(-Math.PI, Math.PI); a1 = a0 + R.range(1, 3); }
      else { a0 = -Math.PI / 2 + R.range(-.05, .5); a1 = Math.min(Math.PI / 2 + .05, a0 + R.range(.6, 2.2)); }
      const wo = .006 * k.wk * R.range(.6, 1.6), cut = gap ? R.range(.35, .65) : null;
      const spans = cut === null ? [[0, 1]] : [[0, cut - .04], [cut + .04, 1]];
      for (const [s0, s1] of spans) {
        const n = Math.max(8, Math.round(90 * (s1 - s0))), pts = [], ws = [];
        for (let i = 0; i <= n; i++) { const t = i / n, aa = a0 + (a1 - a0) * (s0 + (s1 - s0) * t); pts.push([Math.cos(aa) * rr, Math.sin(aa) * rr]); ws.push(wo * PROF.hair(t)); }
        k.add({ pts, ws, t0: .25 + o * .15, dur: .8 * SPEED * (s1 - s0) }, "detail");
      }
      const nt = R.int(1, 4);
      for (let q = 0; q < nt; q++) {
        const aa = a0 + (a1 - a0) * R.range(.15, .85), L = R.range(.03, .09);
        k.bent(Math.cos(aa) * rr, Math.sin(aa) * rr, Math.cos(aa) * (rr + L), Math.sin(aa) * (rr + L),
               wo * 2.4, PROF.thorn, .5, .15, 6, R.range(-.1, .1), "detail");
      }
    }
  };

  // spark: a four-point glint
  k.spark = (x, y, sz, t0) => {
    const w = sz * .24;
    k.bent(x, y - sz, x, y + sz, w, PROF.diamond, t0, .2, 12, 0, "detail");
    k.bent(x - sz * .6, y, x + sz * .6, y, w * .9, PROF.diamond, t0, .2, 12, 0, "detail");
  };
  // a random spot inside this motif's region
  k.spot = (rMin, rMax) => {
    if (k.radial) { const rr = R.range(rMin, rMax), aa = -Math.PI / 2 + R.range(.05, Math.PI / k.folds); return [Math.cos(aa) * rr, Math.sin(aa) * rr]; }
    if (k.free) return [R.range(-.85, .85), R.range(-.85, .85)];
    return [R.range(.12, .85), R.range(-.85, .85)];
  };

  k.guides = makeGuides(k);
  return k;
}

/* ---------- composers ---------- */
// The flow direction at (x, y): heading of the nearest guide at its nearest point.
function flowAt(k, x, y) {
  let best = null, bd = Infinity;
  for (const g of k.guides) {
    const t = g.nearest(x, y), [gx, gy] = g.at(t), d = (gx - x) ** 2 + (gy - y) ** 2;
    if (d < bd) { bd = d; best = g.dir(t); }
  }
  return best;
}

function composeFiligree(k) {
  const { R, P } = k;
  if (P.spine && !k.free) k.spine();
  heroBlade(k, k.guides[0], 0, [.03, .045]);   // the trunk the lace hangs from

  // main tendrils start along the flow, so neighbours run nearly parallel
  const N = k.main(P.density);
  for (let i = 0; i < N; i++) {
    let x, y, len = R.range(.35, 1.0);
    const w = R.range(.016, .04) * k.wk, t0 = i * .06;
    if (k.free) { x = R.range(-.45, .45); y = R.range(-.6, .6); }
    else if (k.radial) { x = R.range(0, .03); y = -R.range(.06, .6); len *= .65; }
    else if (R.chance(.32)) { x = R.range(.06, .38); y = R.range(-.5, .5); len *= 1.15; }
    else { x = R.range(0, .05); y = R.range(-.78, .78); }
    k.tendril(R, x, y, flowAt(k, x, y) + R.gauss() * k.chaos * .5, len, w, 0, t0);
  }

  // hairlines: long thin strands laid along the guides
  const nh = R.int(3, 6);
  for (let i = 0; i < nh; i++) {
    const g = k.guides[i % k.guides.length], t = R.range(0, .6), [x, y] = g.at(t);
    k.tendril(R, x, y, g.dir(t) + R.range(-.2, .2), R.range(.5, 1.1) * (k.radial ? .7 : 1), .0045 * k.wk * R.range(.7, 1.4), 2, .2 + i * .1,
              { prof: PROF.hair, chaos: k.chaos * .4, curl: k.curl * .5, bare: true });
  }

  if (P.orbits) k.orbits(R.int(1, 2));
  if (P.sparks) {
    const ns = R.int(2, 6);
    for (let s = 0; s < ns; s++) {
      const [x, y] = k.spot(.25, .88);
      if (Math.hypot(x, y) > .92) continue;
      k.spark(x, y, R.range(.025, .085), .4 + s * .07);
    }
  }
}

// Direction of the polyline at i and the side (+1 / −1 along the left normal) facing away from its bend.
const headingAt = (pts, i) => {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
};
const outerSide = (pts, i, span = 5) => {
  const a = pts[Math.max(0, i - span)], b = pts[i], c = pts[Math.min(pts.length - 1, i + span)];
  const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  return turn > 0 ? -1 : 1;
};

// One hero: a thick blade laid along a guide, built from R only.
function heroBlade(k, guide, h, [wLo, wHi] = [.05, .09]) {
  const { R } = k;
  const off = R.range(-.06, .06);
  const tA = R.range(0, .15), tB = R.range(.8, 1);
  const a1 = R.range(4, 9), a2 = R.range(9, 17), f1 = R.range(0, 6.28), f2 = R.range(0, 6.28);
  const w = R.range(wLo, wHi) * k.wk;
  const pts = [], n = 70;
  for (let i = 0; i <= n; i++) {
    const t = tA + (tB - tA) * i / n, [x, y] = guide.at(t), nrm = guide.dir(t) + Math.PI / 2;
    const d = off + k.chaos * .06 * (Math.sin(a1 * t + f1) + .5 * Math.sin(a2 * t + f2));
    pts.push([x + Math.cos(nrm) * d, y + Math.sin(nrm) * d]);
  }
  if (R.chance(k.curl)) {
    const step = .009, steps = Math.round(polyLength(pts) * R.range(.15, .25) / step), turn = R.sign() * k.curl * .15;
    let [x, y] = pts[n], ang = headingAt(pts, n);
    for (let j = 0; j < steps; j++) { ang += turn; x += Math.cos(ang) * step; y += Math.sin(ang) * step; pts.push([x, y]); }
  }
  const ws = pts.map((_, i) => w * PROF.blade(i / (pts.length - 1)));
  return k.add({ pts, ws, t0: h * .12, dur: (.5 + polyLength(pts) * .6) * SPEED }, "hero");
}

// Echoes, swept-back barbs and forks for one hero, built from D only.
function bladeDetails(k, hero) {
  const { D } = k, { pts, ws, t0, dur } = hero, n = pts.length - 1;
  const side = outerSide(pts, Math.round(n / 2), Math.round(n / 4));
  const wMax = Math.max(...ws);

  const ne = D.int(1, 3);
  for (let e = 0; e < ne; e++) {
    const gapOut = [.025, .045, .07][e], wf = D.range(.25, .4);
    const i0 = Math.round(n * D.range(.1, .25)), i1 = n - Math.round(n * D.range(.1, .25));
    const ep = [], ew = [];
    for (let i = i0; i <= i1; i++) {
      const nrm = headingAt(pts, i) + Math.PI / 2, d = side * (ws[i] / 2 + gapOut);
      ep.push([pts[i][0] + Math.cos(nrm) * d, pts[i][1] + Math.sin(nrm) * d]);
      ew.push(wMax * wf * Math.pow(Math.max(0, Math.sin(Math.PI * (i - i0) / (i1 - i0))), .7));
    }
    k.add({ pts: ep, ws: ew, t0: t0 + .1 + e * .05, dur }, "echo");
  }

  const nb = Math.round(k.spikes * 4 * D());
  for (let b = 0; b < nb; b++) {
    const ti = D.range(.15, .75), i = Math.round(ti * n), ang = headingAt(pts, i), s = outerSide(pts, i);
    const nrm = ang + Math.PI / 2, base = s * ws[i] / 2 * .6;
    const x0 = pts[i][0] + Math.cos(nrm) * base, y0 = pts[i][1] + Math.sin(nrm) * base;
    const a = ang + Math.PI - s * D.range(20, 40) * Math.PI / 180, L = D.range(.08, .2);
    const hook = D.chance(.3);
    k.bent(x0, y0, x0 + Math.cos(a) * L, y0 + Math.sin(a) * L, Math.max(ws[i] * .5, .01 * k.wk), PROF.thorn,
           t0 + dur * ti, .18, 10, -s * (hook ? D.range(.25, .4) : D.range(0, .12)), "barb");
  }

  const nf = D.int(0, 2);
  for (let f = 0; f < nf; f++) {
    const i = Math.round(n * D.range(.8, .95)), a = headingAt(pts, i) + D.sign() * D.range(.15, .4), L = D.range(.08, .18);
    k.bent(pts[i][0], pts[i][1], pts[i][0] + Math.cos(a) * L, pts[i][1] + Math.sin(a) * L,
           ws[i] * .8 + .004 * k.wk, PROF.thorn, t0 + dur * .85, .15, 10, D.range(-.15, .15), "detail");
  }
}

// The emptiest of 12 candidate spots, measured against every point placed so far.
function freeSpot(k) {
  const probe = [];
  for (const s of k.out) for (let i = 0; i < s.pts.length; i += 4) probe.push(s.pts[i]);
  let best = null, bestD = -1;
  for (let c = 0; c < 12; c++) {
    const [x, y] = k.spot(.2, .88);
    let d = Infinity;
    for (const [px, py] of probe) d = Math.min(d, (px - x) ** 2 + (py - y) ** 2);
    if (d > bestD) { bestD = d; best = [x, y]; }
  }
  return best;
}

function composeBlades(k) {
  const { R, P } = k;
  if (P.spine && !k.free) k.spine(R.range(.035, .05) * k.wk, 1);
  const H = k.main(heroCount(P.density)), G = k.guides.length;
  for (let h = 0; h < H; h++) {
    const g = h < G ? k.guides[h] : guideVariant(R, k.guides[h % G]);
    bladeDetails(k, heroBlade(k, g, h));
  }
  if (P.orbits) k.orbits(1, true);
  if (P.sparks) {
    const ns = R.int(1, 3);
    for (let s = 0; s < ns; s++) { const [x, y] = freeSpot(k); k.spark(x, y, R.range(.05, .11), .5 + s * .08); }
  }
}

const COMPOSERS = { filigree: composeFiligree, blades: composeBlades };

/* ---------- assembly ---------- */
const copiesOf = sym => sym === "none" ? 1 : sym === "mirror" ? 2 : 2 * +sym.slice(1);
const polyLength = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };

// Trims the motif before symmetry, so every dropped barb loses all of its copies at once.
function capMotif(motif, copies) {
  const allowed = Math.floor(MAX_STROKES / copies);
  if (motif.length <= allowed) return motif;
  let excess = motif.length - allowed;
  const drop = new Set();
  for (const role of ["barb", "detail"]) {
    const pool = motif.filter(s => s.role === role).map(s => [s, polyLength(s.pts)]).sort((a, b) => a[1] - b[1]);
    for (const [s] of pool) { if (!excess) break; drop.add(s); excess--; }
  }
  return motif.filter(s => !drop.has(s));
}

function applySymmetry(motif, sym) {
  if (sym === "none") return motif;
  // No winding fix-up is needed: prepare() recomputes normals from the mirrored points, which swaps the
  // outline's sides and so keeps the original winding. Reversing it would cancel overlapping copies.
  let all = motif.concat(motif.map(s => ({ ...s, pts: s.pts.map(([x, y]) => [-x, y]) })));
  if (sym[0] === "r") {
    const f = +sym.slice(1), res = [];
    for (let k = 0; k < f; k++) {
      const th = 2 * Math.PI * k / f, c = Math.cos(th), s = Math.sin(th);
      for (const st of all) res.push({ ...st, pts: st.pts.map(([x, y]) => [x * c - y * s, x * s + y * c]) });
    }
    all = res;
  }
  return all;
}

function prepare(st) {
  const n = st.pts.length, p = new Float32Array(n * 2), nx = new Float32Array(n), ny = new Float32Array(n);
  for (let i = 0; i < n; i++) { p[2 * i] = st.pts[i][0]; p[2 * i + 1] = st.pts[i][1]; }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dx = p[2 * b] - p[2 * a], dy = p[2 * b + 1] - p[2 * a + 1], l = Math.hypot(dx, dy) || 1;
    nx[i] = -dy / l; ny[i] = dx / l;
  }
  return { n, p, nx, ny, w: Float32Array.from(st.ws), t0: st.t0, dur: Math.max(.05, st.dur),
           role: st.role, motif: st.motif };
}

// Uniformly shrinks the model when any outline edge reaches past FIT_R; returns the factor.
function fitToFrame(strokes) {
  let maxR = 0;
  for (const s of strokes) for (let i = 0; i < s.n; i++) maxR = Math.max(maxR, Math.hypot(s.p[2 * i], s.p[2 * i + 1]) + s.w[i] / 2);
  if (maxR <= FIT_R) return 1;
  const scale = FIT_R / maxR;
  for (const s of strokes) { for (let i = 0; i < s.p.length; i++) s.p[i] *= scale; for (let i = 0; i < s.n; i++) s.w[i] *= scale; }
  return scale;
}

function build(seed, variant, P) {
  const k = makeKit(rngFrom(seed), rngFrom(seed + "/" + variant), P);
  (COMPOSERS[P.mode] || composeFiligree)(k);
  const strokes = applySymmetry(capMotif(k.out, copiesOf(P.sym)), P.sym).map(prepare);
  const scale = fitToFrame(strokes);
  let end = 0;
  for (const s of strokes) end = Math.max(end, s.t0 + s.dur);
  return { strokes, end, scale };
}

const SigilGen = { build, newSeed, prepare, sanitizeParams, heroCount, DEFAULTS, RANGES, SYM_KEYS, MODES, MAX_STROKES };
root.SigilGen = SigilGen;
if (typeof module !== "undefined") module.exports = SigilGen;
})(typeof window !== "undefined" ? window : globalThis);
