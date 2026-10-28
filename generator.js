/* Sigil Forge — geometry: seeded randomness, strokes, symmetry. No DOM. */
(function (root) {
"use strict";

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
};
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const SPEED = .55;

// Builds one symmetry cell ("motif"). Main structure draws from R, branches and thorns from D,
// so a mutation (new variant → new D) keeps the skeleton and regrows the barbs.
function buildMotif(seed, variant, P) {
  const R = rngFrom(seed), D = rngFrom(seed + "/" + variant);
  const chaos = P.chaos / 100, curl = P.curl / 100, spikes = P.spikes / 100, wk = P.weight / 100;
  const radial = P.sym[0] === "r", folds = radial ? +P.sym.slice(1) : 1, free = P.sym === "none";
  const out = [];

  function bent(r, x0, y0, x1, y1, w, prof, t0, dur, n, bend) {
    const mx = (x0 + x1) / 2 - (y1 - y0) * bend, my = (y0 + y1) / 2 + (x1 - x0) * bend;
    const pts = [], ws = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * y0 + 2 * u * t * my + t * t * y1]);
      ws.push(w * prof(t));
    }
    out.push({ pts, ws, t0, dur });
  }

  function tendril(r, x, y, ang, len, w, depth, t0, opt = {}) {
    const prof = opt.prof || PROF.swoosh, ch = opt.chaos ?? chaos, cu = opt.curl ?? curl;
    const step = .009, n = Math.max(6, Math.round(len / step));
    const pts = [], ws = [], angs = [];
    let curv = r.range(-1, 1) * .03 * ch;
    const dir = r.sign(), zone = r.range(.22, .45), amt = cu * r.range(.5, 1.5);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([x, y]); ws.push(w * prof(t)); angs.push(ang);
      curv += r.gauss() * .005 * ch; curv *= .955;
      let c = curv;
      if (t > 1 - zone) { const k = (t - (1 - zone)) / zone; c += dir * amt * .11 * k * k; }
      const rad = Math.hypot(x, y);
      if (rad > .8) c += wrapA(Math.atan2(-y, -x) - ang) * .1 * (rad - .8) / .2;
      ang += c; x += Math.cos(ang) * step; y += Math.sin(ang) * step;
    }
    const dur = (.35 + len * .7) * SPEED;
    out.push({ pts, ws, t0, dur });
    if (opt.bare) return;

    if (depth < 2) {
      const nb = Math.round(spikes * len * (depth ? 2.2 : 4) * D.range(.4, 1.2));
      for (let b = 0; b < nb; b++) {
        const ti = D.range(.12, .7), i = Math.round(ti * n);
        tendril(D, pts[i][0], pts[i][1], angs[i] + D.sign() * D.range(.35, 1.15),
                len * D.range(.22, .5), ws[i] * D.range(.5, .85), depth + 1, t0 + dur * ti);
      }
    }
    const nt = Math.round(spikes * len * (depth ? 6 : 11) * D.range(.5, 1.3));
    for (let k = 0; k < nt; k++) {
      const ti = D.range(.08, .85), i = Math.round(ti * n);
      if (ws[i] < .002) continue;
      const side = D.sign(), back = D.chance(.18);
      const a = angs[i] + (back ? Math.PI : 0) + side * (back ? -1 : 1) * D.range(.45, 1.0);
      const L = ws[i] * D.range(1.6, 4.2) + .012;
      bent(D, pts[i][0], pts[i][1], pts[i][0] + Math.cos(a) * L, pts[i][1] + Math.sin(a) * L,
           ws[i] * D.range(.75, 1.1), PROF.thorn, t0 + dur * ti, .12, 6, side * D.range(0, .22));
    }
  }

  // spine: the axis everything hangs from
  if (P.spine && !free) {
    const W = .026 * wk * R.range(.8, 1.3), bul = R.int(2, 5), n = 140, pts = [], ws = [];
    const y0 = radial ? -.05 : -R.range(.8, .94), y1 = radial ? -R.range(.82, .94) : R.range(.8, .94);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([0, y0 + (y1 - y0) * t]);
      ws.push(W * Math.pow(Math.sin(Math.PI * t), .6) * (.3 + .7 * Math.pow(Math.abs(Math.cos(Math.PI * t * bul)), 4)));
    }
    out.push({ pts, ws, t0: 0, dur: .9 * SPEED });
    const nd = R.int(1, 3);
    for (let k = 0; k < nd; k++) {
      const cy = radial ? -R.range(.2, .75) : R.range(-.6, .6), h = R.range(.05, .16);
      bent(R, 0, cy - h, 0, cy + h, R.range(.03, .07) * wk, PROF.diamond, .15 + k * .08, .3 * SPEED, 16, 0);
      if (R.chance(.6)) bent(R, 0, cy, R.range(.08, .26), cy + R.range(-.03, .03), R.range(.008, .016) * wk, PROF.thorn, .3, .25 * SPEED, 14, R.range(-.15, .15));
    }
  }

  // main tendrils
  const N = radial ? Math.max(2, Math.round(P.density * .55)) : P.density;
  for (let i = 0; i < N; i++) {
    let x, y, a, len = R.range(.35, 1.0);
    const w = R.range(.016, .04) * wk, t0 = i * .06;
    if (free) {
      x = R.range(-.45, .45); y = R.range(-.6, .6); a = R.range(-Math.PI, Math.PI);
    } else if (radial) {
      x = R.range(0, .03); y = -R.range(.06, .6); a = -Math.PI / 2 + R.range(.15, Math.min(1.4, Math.PI / folds * 1.7)); len *= .65;
    } else if (R.chance(.32)) {
      x = R.range(.06, .38); y = R.range(-.5, .5); a = R.sign() * Math.PI / 2 + R.range(-.45, .45); len *= 1.15;
    } else {
      x = R.range(0, .05); y = R.range(-.78, .78); a = R.range(-1.25, 1.25);
    }
    tendril(R, x, y, a, len, w, 0, t0);
  }

  // hairlines: long thin strands that cut across the mass
  const nh = R.int(1, 3);
  for (let i = 0; i < nh; i++) {
    const x = free ? R.range(-.3, .3) : R.range(0, .2), y = radial ? -R.range(.1, .5) : R.range(-.4, .4);
    const a = radial ? -Math.PI / 2 + R.range(.1, Math.PI / folds) : (free ? R.range(-Math.PI, Math.PI) : R.range(-1.4, 1.4));
    tendril(R, x, y, a, R.range(.5, 1.1) * (radial ? .7 : 1), .0045 * wk * R.range(.7, 1.4), 2, .2 + i * .1,
            { prof: PROF.hair, chaos: chaos * .4, curl: curl * .5, bare: true });
  }

  // orbits: broken halo arcs with outward ticks
  if (P.orbits) {
    const no = R.int(1, 2);
    for (let o = 0; o < no; o++) {
      const rr = R.range(.3, .85);
      let a0, a1;
      if (radial) { a0 = -Math.PI / 2 + R.range(0, .15); a1 = -Math.PI / 2 + Math.PI / folds * R.range(.6, 1); }
      else if (free) { a0 = R.range(-Math.PI, Math.PI); a1 = a0 + R.range(1, 3); }
      else { a0 = -Math.PI / 2 + R.range(-.05, .5); a1 = Math.min(Math.PI / 2 + .05, a0 + R.range(.6, 2.2)); }
      const n = 90, pts = [], ws = [], wo = .006 * wk * R.range(.6, 1.6);
      for (let i = 0; i <= n; i++) { const t = i / n, aa = a0 + (a1 - a0) * t; pts.push([Math.cos(aa) * rr, Math.sin(aa) * rr]); ws.push(wo * PROF.hair(t)); }
      out.push({ pts, ws, t0: .25 + o * .15, dur: .8 * SPEED });
      const nt = R.int(1, 4);
      for (let k = 0; k < nt; k++) {
        const aa = a0 + (a1 - a0) * R.range(.15, .85), L = R.range(.03, .09);
        bent(R, Math.cos(aa) * rr, Math.sin(aa) * rr, Math.cos(aa) * (rr + L), Math.sin(aa) * (rr + L),
             wo * 2.4, PROF.thorn, .5, .15, 6, R.range(-.1, .1));
      }
    }
  }

  // sparks: four-point glints
  if (P.sparks) {
    const ns = R.int(2, 6);
    for (let s = 0; s < ns; s++) {
      let x, y;
      if (radial) { const rr = R.range(.25, .88), aa = -Math.PI / 2 + R.range(.05, Math.PI / folds); x = Math.cos(aa) * rr; y = Math.sin(aa) * rr; }
      else if (free) { x = R.range(-.85, .85); y = R.range(-.85, .85); }
      else { x = R.range(.12, .85); y = R.range(-.85, .85); }
      if (Math.hypot(x, y) > .92) continue;
      const sz = R.range(.025, .085), w = sz * .24, t0 = .4 + s * .07;
      bent(R, x, y - sz, x, y + sz, w, PROF.diamond, t0, .2, 12, 0);
      bent(R, x - sz * .6, y, x + sz * .6, y, w * .9, PROF.diamond, t0, .2, 12, 0);
    }
  }
  return out;
}

function applySymmetry(motif, sym) {
  if (sym === "none") return motif;
  let all = motif.concat(motif.map(s => ({ ...s, flip: true, pts: s.pts.map(([x, y]) => [-x, y]) })));
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
  return { n, p, nx, ny, w: Float32Array.from(st.ws), t0: st.t0, dur: Math.max(.05, st.dur), flip: !!st.flip };
}

function build(seed, variant, P) {
  const strokes = applySymmetry(buildMotif(seed, variant, P), P.sym).map(prepare);
  let end = 0;
  for (const s of strokes) end = Math.max(end, s.t0 + s.dur);
  return { strokes, end };
}


const SigilGen = { build, newSeed, prepare };
root.SigilGen = SigilGen;
if (typeof module !== "undefined") module.exports = SigilGen;
})(typeof window !== "undefined" ? window : globalThis);
