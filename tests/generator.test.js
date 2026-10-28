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
