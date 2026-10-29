const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../generator.js"), R = require("../render.js");
const line = w => G.prepare({ pts: [[0,-.5],[0,0],[0,.5]], ws: [0, w, 0], t0: 0, dur: 1, role: "hero", motif: 0 });
const paths = svg => (svg.match(/<path /g) || []).length;

test("chrome SVG adds a highlight path over thick strokes", () => {
  assert.equal(paths(R.toSVG({ strokes: [line(.05)], end: 1, scale: 1 }, { style: "chrome", transparent: false })), 3); // свечение + тело + блик
});
test("no highlight when every stroke is thinner than 0.012", () => {
  assert.equal(paths(R.toSVG({ strokes: [line(.008)], end: 1, scale: 1 }, { style: "chrome", transparent: false })), 2);
});
test("ink SVG has a single path", () => {
  assert.equal(paths(R.toSVG({ strokes: [line(.05)], end: 1, scale: 1 }, { style: "ink", transparent: false })), 1);
});
