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
const CHROME_STOPS = [[0,"#ffffff"],[.16,"#8a929d"],[.3,"#f5f8fb"],[.43,"#363c45"],[.56,"#dae1e9"],[.7,"#69717c"],[.84,"#fcfdff"],[1,"#545b65"]];
/* ---------- rendering ---------- */
// Traces a tapered stroke as a closed outline. While growing, the head narrows to a point.
function trace(path, st, prog, c, k) {
  const last = st.n - 1;
  const m = prog >= 1 ? last : Math.floor(prog * last);
  if (m < 1) return;
  const { p, nx, ny, w } = st, sg = st.flip ? -1 : 1;
  const head = i => prog >= 1 ? 1 : Math.min(1, (m - i) / 6);
  for (let i = 0; i <= m; i++) {
    const h = w[i] * .5 * sg * head(i), x = c + (p[2 * i] + nx[i] * h) * k, y = c + (p[2 * i + 1] + ny[i] * h) * k;
    i ? path.lineTo(x, y) : path.moveTo(x, y);
  }
  for (let i = m; i >= 0; i--) {
    const h = -w[i] * .5 * sg * head(i);
    path.lineTo(c + (p[2 * i] + nx[i] * h) * k, c + (p[2 * i + 1] + ny[i] * h) * k);
  }
  path.closePath();
}

function paint(ctx, size, model, P, time, transparent) {
  const S = STYLES[P.style], c = size / 2, k = size / 2 * .94;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  if (!transparent) { ctx.fillStyle = S.bg; ctx.fillRect(0, 0, size, size); }
  const path = new Path2D();
  for (const st of model.strokes) {
    const prog = time === Infinity ? 1 : (time - st.t0) / st.dur;
    if (prog > 0) trace(path, st, Math.min(1, prog), c, k);
  }
  if (S.glow) {
    ctx.save();
    ctx.filter = `blur(${Math.max(1.5, size * S.glowR)}px)`;
    ctx.fillStyle = S.glow;
    ctx.fill(path); ctx.fill(path);
    ctx.restore();
  }
  if (S.chrome) {
    const g = ctx.createLinearGradient(0, 0, size * .35, size);
    for (const [o, col] of CHROME_STOPS) g.addColorStop(o, col);
    ctx.fillStyle = g;
  } else ctx.fillStyle = S.fill;
  ctx.fill(path);
}

function toSVG(model, P) {
  const S = STYLES[P.style], Z = 1000, c = Z / 2, k = Z / 2 * .94;
  let d = "";
  const f = v => v.toFixed(1);
  for (const st of model.strokes) {
    const { p, nx, ny, w, n } = st, sg = st.flip ? -1 : 1;
    for (let i = 0; i < n; i++) { const h = w[i] * .5 * sg; d += (i ? "L" : "M") + f(c + (p[2 * i] + nx[i] * h) * k) + " " + f(c + (p[2 * i + 1] + ny[i] * h) * k); }
    for (let i = n - 1; i >= 0; i--) { const h = -w[i] * .5 * sg; d += "L" + f(c + (p[2 * i] + nx[i] * h) * k) + " " + f(c + (p[2 * i + 1] + ny[i] * h) * k); }
    d += "Z";
  }
  let defs = "", body = "";
  if (S.chrome) defs += `<linearGradient id="chrome" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${Z * .35}" y2="${Z}">` +
    CHROME_STOPS.map(([o, col]) => `<stop offset="${o}" stop-color="${col}"/>`).join("") + `</linearGradient>`;
  if (S.glow) {
    defs += `<filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${(Z * S.glowR * .5).toFixed(2)}"/></filter>`;
    body += `<path d="${d}" fill="${S.glow}" filter="url(#glow)"/>`;
  }
  body += `<path d="${d}" fill="${S.chrome ? "url(#chrome)" : S.fill}"/>`;
  const bg = P.transparent ? "" : `<rect width="${Z}" height="${Z}" fill="${S.bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Z} ${Z}" width="${Z}" height="${Z}">` +
    (defs ? `<defs>${defs}</defs>` : "") + bg + body + `</svg>`;
}


const SigilRender = { STYLES, paint, toSVG };
root.SigilRender = SigilRender;
if (typeof module !== "undefined") module.exports = SigilRender;
})(typeof window !== "undefined" ? window : globalThis);
