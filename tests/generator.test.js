const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../generator.js");
const P0 = { density: 8, spikes: 55, curl: 60, chaos: 45, weight: 100, sym: "mirror", style: "chrome",
             spine: true, orbits: true, sparks: true, transparent: false };

const flat = m => m.strokes.map(s => [...s.p, ...s.w]).flat();

test("build is deterministic", () => {
  assert.deepEqual(flat(G.build("HC8Q-5UEN", 0, P0)), flat(G.build("HC8Q-5UEN", 0, P0)));
});
test("unusual seeds build without throwing and without NaN", () => {
  for (const seed of ["", "ЖЁЛТЫЙ ЗМЕЙ", "a b c", "🐍🐍", "X".repeat(24)]) {
    const m = G.build(seed, 0, P0);
    assert.ok(m.strokes.length > 0);
    assert.ok(flat(m).every(Number.isFinite), seed);
  }
});

const SYMS = ["mirror", "r3", "r6", "r8", "none"], MODES = ["blades", "filigree"];
const SEEDS = ["HC8Q-5UEN", "K2MX-R7QA", "ЖЁЛТЫЙ ЗМЕЙ"];
const each = fn => { for (const mode of MODES) for (const sym of SYMS) for (const seed of SEEDS) fn({ ...P0, mode, sym }, seed); };
const copies = sym => sym === "none" ? 1 : sym === "mirror" ? 2 : 2 * +sym.slice(1);

test("every point with half-width lies within r ≤ 0.961", () => each((P, seed) => {
  for (const s of G.build(seed, 0, P).strokes)
    for (let i = 0; i < s.n; i++)
      assert.ok(Math.hypot(s.p[2 * i], s.p[2 * i + 1]) + s.w[i] / 2 <= 0.961, `${seed} ${P.mode} ${P.sym}`);
}));
test("stroke limit holds at extremes and keeps symmetry", () => {
  for (const mode of MODES) for (const sym of ["r8", "mirror"]) {
    const P = { ...P0, mode, sym, density: 16, spikes: 100, weight: 220, curl: 100, chaos: 100 };
    const m = G.build("HC8Q-5UEN", 0, P);
    assert.ok(m.strokes.length <= G.MAX_STROKES);
    assert.equal(m.strokes.length % copies(sym), 0);
  }
});
test("sanitizeParams repairs old and broken saved params", () => {
  const p = G.sanitizeParams({ density: "x", weight: 999, style: "gold", sym: "r7", spine: 0 }, ["chrome", "ink"]);
  assert.equal(p.mode, "blades"); assert.equal(p.density, 8); assert.equal(p.weight, 220);
  assert.equal(p.style, "chrome"); assert.equal(p.sym, "mirror"); assert.equal(p.spine, false);
});

const BL = { ...P0, mode: "blades" };
const heroes = m => m.strokes.filter(s => s.role === "hero");

test("blades: 2–5 heroes per half, matching heroCount, with echoes", () => {
  for (const density of [3, 8, 16]) for (const seed of SEEDS) {
    const m = G.build(seed, 0, { ...BL, density });
    assert.equal(heroes(m).length / 2, G.heroCount(density));
    assert.ok(m.strokes.some(s => s.role === "echo"));
  }
});
test("blades: mutation keeps heroes (up to fit scale)", () => {
  for (const seed of SEEDS) {
    const a = G.build(seed, 0, BL), b = G.build(seed, 1, BL);
    const norm = m => heroes(m).map(s => [s.motif, [...s.p].map(v => v / m.scale), [...s.w].map(v => v / m.scale)]);
    const A = norm(a), B = norm(b);
    assert.equal(A.length, B.length);
    A.forEach((h, i) => { assert.equal(h[0], B[i][0]); h[1].forEach((v, j) => assert.ok(Math.abs(v - B[i][1][j]) < 1e-5)); });
  }
});
test("blades: extremes of curl and weight stay finite", () => {
  for (const curl of [0, 100]) for (const weight of [40, 220]) {
    const m = G.build("HC8Q-5UEN", 0, { ...BL, curl, weight });
    assert.ok(m.strokes.every(s => [...s.p, ...s.w].every(Number.isFinite)));
  }
});

// Signed area of the outline exactly as render.js traces it; mixed signs cancel under one nonzero fill.
const outlineArea = s => {
  const ring = [];
  for (let i = 0; i < s.n; i++) ring.push([s.p[2 * i] + s.nx[i] * s.w[i] / 2, s.p[2 * i + 1] + s.ny[i] * s.w[i] / 2]);
  for (let i = s.n - 1; i >= 0; i--) ring.push([s.p[2 * i] - s.nx[i] * s.w[i] / 2, s.p[2 * i + 1] - s.ny[i] * s.w[i] / 2]);
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length]; a += x0 * y1 - x1 * y0; }
  return a / 2;
};
test("spine strokes on the axis keep one winding with their mirror copies", () => {
  for (const mode of MODES) for (const seed of SEEDS) {
    const signs = G.build(seed, 0, { ...P0, mode }).strokes.filter(s => s.role === "spine").map(outlineArea).filter(a => Math.abs(a) > 1e-6).map(Math.sign);
    assert.ok(signs.length > 0);
    assert.ok(signs.every(v => v === signs[0]), `${mode} ${seed}`);
  }
});

test("filigree: one trunk hero per half in mirror", () => {
  for (const seed of SEEDS) {
    const m = G.build(seed, 0, { ...P0, mode: "filigree" });
    assert.equal(m.strokes.filter(s => s.role === "hero").length, 2);
  }
});

// Heroes of the original motif (before mirroring and rotation), in unscaled motif coordinates.
const heroPts = m => {
  const firstIdx = new Set(), out = [];
  for (const s of m.strokes) {
    if (s.role !== "hero" || firstIdx.has(s.motif)) continue;
    firstIdx.add(s.motif);
    for (let i = 0; i < s.n; i++) out.push([s.p[2 * i] / m.scale, s.p[2 * i + 1] / m.scale]);
  }
  return out;
};
const SEEDS60 = Array.from({ length: 60 }, (_, i) => "FIT-" + i);

test("blades fill the frame: median fit scale at default params is at least 0.9", () => {
  for (const sym of ["mirror", "r6"]) {
    const sc = SEEDS60.map(s => G.build(s, 0, { ...P0, mode: "blades", sym }).scale).sort((a, b) => a - b);
    assert.ok(sc[30] >= .9, `${sym}: median scale ${sc[30].toFixed(2)}`);
  }
});
test("radial heroes stay inside their half-sector", () => {
  for (const sym of ["r3", "r6", "r8"]) {
    const span = Math.PI / +sym.slice(1);
    let far = 0, total = 0;
    for (const seed of SEEDS60) for (const [x, y] of heroPts(G.build(seed, 0, { ...P0, mode: "blades", sym, density: 16 }))) {
      if (Math.hypot(x, y) < .25) continue;   // near the centre a small offset is a large angle
      const phi = Math.atan2(x, -y);
      total++;
      if (phi < -.2 || phi > span + .2) far++;
    }
    assert.ok(far / total < .03, `${sym}: ${(100 * far / total).toFixed(1)}% of hero points outside the half-sector`);
  }
});
test("layer toggles do not reshape the heroes", () => {
  for (const seed of SEEDS60.slice(0, 20)) for (const key of ["spine", "orbits"]) {
    const on = heroPts(G.build(seed, 0, { ...P0, mode: "blades" })), off = heroPts(G.build(seed, 0, { ...P0, mode: "blades", [key]: false }));
    assert.equal(on.length, off.length, `${seed} ${key}`);
    on.forEach(([x, y], i) => assert.ok(Math.abs(x - off[i][0]) < 1e-4 && Math.abs(y - off[i][1]) < 1e-4, `${seed} ${key}`));
  }
});
