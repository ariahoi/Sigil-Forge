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
