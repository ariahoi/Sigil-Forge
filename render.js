/* Sigil Forge — materials and drawing: canvas paint and SVG export. */
(function (root) {
"use strict";

/* ---------- materials ---------- */
const STYLES = {
  chrome: { name: "Хром",    bg: "#050608", chrome: true, glow: "rgba(190,215,255,.22)", glowR: .006, sw: ["#050608", "#cfd6df"] },
  ink:    { name: "Чернила", bg: "#e7e3db", fill: "#0c0c0f", sw: ["#e7e3db", "#0c0c0f"] },
  blood:  { name: "Кровь",   bg: "#0a0405", fill: "#c4132b", glow: "rgba(255,25,55,.55)", glowR: .010, sw: ["#0a0405", "#c4132b"] },
  neon:   { name: "Неон",    bg: "#03060b", fill: "#eafdff", glow: "rgba(0,215,255,.95)", glowR: .013, sw: ["#03060b", "#41e3ff"] },
  bone:   { name: "Кость",   bg: "#050505", fill: "#eee8dc", sw: ["#050505", "#eee8dc"] },
  skin:   { name: "Тату",    bg: "#d9b49c", fill: "#16100e", sw: ["#d9b49c", "#16100e"] },
};
// Chrome bands, kept about 15% darker than polished white so the highlight pass reads on top.
const CHROME_STOPS = [[0,"#d9d9d9"],[.16,"#757c85"],[.3,"#d0d3d5"],[.43,"#2e333b"],[.56,"#b9bfc6"],[.7,"#5a6069"],[.84,"#d6d7d9"],[1,"#474d56"]];
const HIGHLIGHT = "rgba(255,255,255,.85)";
const HIGHLIGHT_MIN_W = .012;

/* ---------- rendering ---------- */
// Traces a tapered stroke as a closed outline into anything with moveTo/lineTo/closePath.
// While growing, the head narrows to a point. widthMul and shift (in half-widths, toward the
// upper-left light) turn the same stroke into its specular highlight.
function tracePath(target, st, prog, c, k, widthMul = 1, shift = 0) {
  const last = st.n - 1;
  const m = prog >= 1 ? last : Math.floor(prog * last);
  if (m < 1) return;
  const { p, nx, ny, w } = st;
  const head = i => prog >= 1 ? 1 : Math.min(1, (m - i) / 6);
  // light comes from (−1, −1); projecting it on the normal keeps the shift continuous along the stroke
  const lean = i => shift * (-nx[i] - ny[i]) * Math.SQRT1_2;
  const at = (i, side) => {
    const half = w[i] * .5 * head(i), h = side * half * widthMul + lean(i) * half;
    return [c + (p[2 * i] + nx[i] * h) * k, c + (p[2 * i + 1] + ny[i] * h) * k];
  };
  for (let i = 0; i <= m; i++) { const [x, y] = at(i, 1); i ? target.lineTo(x, y) : target.moveTo(x, y); }
  for (let i = m; i >= 0; i--) { const [x, y] = at(i, -1); target.lineTo(x, y); }
  target.closePath();
}
const maxWidth = st => { let mw = 0; for (let i = 0; i < st.n; i++) mw = Math.max(mw, st.w[i]); return mw; };

function chromeFill(ctx, size) {
  const g = ctx.createLinearGradient(0, 0, size * .35, size);
  for (const [o, col] of CHROME_STOPS) g.addColorStop(o, col);
  return g;
}

function paint(ctx, size, model, P, time, transparent) {
  const S = STYLES[P.style], c = size / 2, k = size / 2 * .94;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  if (!transparent) { ctx.fillStyle = S.bg; ctx.fillRect(0, 0, size, size); }
  const path = new Path2D(), shine = S.chrome ? new Path2D() : null;
  for (const st of model.strokes) {
    const prog = time === Infinity ? 1 : (time - st.t0) / st.dur;
    if (prog <= 0) continue;
    tracePath(path, st, Math.min(1, prog), c, k);
    if (shine && maxWidth(st) >= HIGHLIGHT_MIN_W) tracePath(shine, st, Math.min(1, prog), c, k, .3, .2);
  }
  if (S.glow) {
    ctx.save();
    ctx.filter = `blur(${Math.max(1.5, size * S.glowR)}px)`;
    ctx.fillStyle = S.glow;
    ctx.fill(path); ctx.fill(path);
    ctx.restore();
  }
  ctx.fillStyle = S.chrome ? chromeFill(ctx, size) : S.fill;
  ctx.fill(path);
  if (shine) { ctx.fillStyle = HIGHLIGHT; ctx.fill(shine); }
}

// Collects path commands as SVG path data, so toSVG shares tracePath with the canvas.
function svgPath() {
  let d = "";
  const f = v => v.toFixed(1);
  return {
    moveTo: (x, y) => { d += "M" + f(x) + " " + f(y); },
    lineTo: (x, y) => { d += "L" + f(x) + " " + f(y); },
    closePath: () => { d += "Z"; },
    get d() { return d; },
  };
}

function toSVG(model, P) {
  const S = STYLES[P.style], Z = 1000, c = Z / 2, k = Z / 2 * .94;
  const body = svgPath(), shine = svgPath();
  for (const st of model.strokes) {
    tracePath(body, st, 1, c, k);
    if (S.chrome && maxWidth(st) >= HIGHLIGHT_MIN_W) tracePath(shine, st, 1, c, k, .3, .2);
  }
  let defs = "", out = "";
  if (S.chrome) defs += `<linearGradient id="chrome" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${Z * .35}" y2="${Z}">` +
    CHROME_STOPS.map(([o, col]) => `<stop offset="${o}" stop-color="${col}"/>`).join("") + `</linearGradient>`;
  if (S.glow) {
    defs += `<filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${(Z * S.glowR * .5).toFixed(2)}"/></filter>`;
    out += `<path d="${body.d}" fill="${S.glow}" filter="url(#glow)"/>`;
  }
  out += `<path d="${body.d}" fill="${S.chrome ? "url(#chrome)" : S.fill}"/>`;
  if (shine.d) out += `<path d="${shine.d}" fill="${HIGHLIGHT}"/>`;
  const bg = P.transparent ? "" : `<rect width="${Z}" height="${Z}" fill="${S.bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Z} ${Z}" width="${Z}" height="${Z}">` +
    (defs ? `<defs>${defs}</defs>` : "") + bg + out + `</svg>`;
}


const SigilRender = { STYLES, paint, toSVG };
root.SigilRender = SigilRender;
if (typeof module !== "undefined") module.exports = SigilRender;
})(typeof window !== "undefined" ? window : globalThis);
