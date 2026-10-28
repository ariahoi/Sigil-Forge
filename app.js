/* Sigil Forge — interface: state, controls, history, export. */
(() => {
"use strict";

const { build, newSeed } = SigilGen;
const { STYLES, paint, toSVG } = SigilRender;

const SYMS = [["mirror","Зеркало"],["r3","×3"],["r4","×4"],["r5","×5"],["r6","×6"],["r8","×8"],["none","Нет"]];
const SLIDERS = [
  ["density", "Плотность", 3, 16, 1, v => v],
  ["spikes",  "Шипы",      0, 100, 1, v => v + "%"],
  ["curl",    "Завитки",   0, 100, 1, v => v + "%"],
  ["chaos",   "Хаос",      0, 100, 1, v => v + "%"],
  ["weight",  "Толщина",   40, 220, 5, v => v + "%"],
];
const DEFAULTS = { density: 8, spikes: 55, curl: 60, chaos: 45, weight: 100, sym: "mirror", style: "chrome",
                   spine: true, orbits: true, sparks: true, transparent: false };

/* ---------- state ---------- */
const $ = s => document.querySelector(s);
const cv = $("#cv"), ctx = cv.getContext("2d"), frame = $("#frame");
let P = { ...DEFAULTS };
try { const saved = JSON.parse(localStorage.getItem("sigil-forge-params") || "null"); if (saved) P = { ...DEFAULTS, ...saved }; } catch (e) {}
let seed = newSeed(), variant = 0, model = null, history = [], anim = 0, animStart = 0;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function persist() { try { localStorage.setItem("sigil-forge-params", JSON.stringify(P)); } catch (e) {} }

function canvasSize() {
  const css = cv.clientWidth || 600, dpr = Math.min(2, window.devicePixelRatio || 1);
  return Math.round(css * dpr);
}
function draw(time) {
  const size = canvasSize();
  if (cv.width !== size) { cv.width = size; cv.height = size; }
  paint(ctx, size, model, P, time, P.transparent);
}
function play(animate) {
  cancelAnimationFrame(anim);
  if (!animate || reduceMotion) { anim = 0; draw(Infinity); return; }
  animStart = performance.now();
  const tick = now => {
    const t = (now - animStart) / 1000;
    if (t >= model.end) { anim = 0; draw(Infinity); return; }
    draw(t); anim = requestAnimationFrame(tick);
  };
  anim = requestAnimationFrame(tick);
}

const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; };
function updateReadout() {
  $("#readout").innerHTML = `seed <b>${seed}</b> · вариант <b>${variant}</b>`;
  $("#seedIn").value = seed;
  const n = model.strokes.length, sym = SYMS.find(s => s[0] === P.sym)[1];
  $("#stats").textContent = `${n} ${plural(n, "штрих", "штриха", "штрихов")} · симметрия ${sym.toLowerCase()} · ${STYLES[P.style].name.toLowerCase()}`;
  frame.classList.toggle("transparent", P.transparent);
}

function regenerate(animate) {
  model = build(seed, variant, P);
  updateReadout();
  play(animate);
}

/* ---------- history ---------- */
function thumb(entry) {
  const c = document.createElement("canvas"), s = 128;
  c.width = c.height = s;
  paint(c.getContext("2d"), s, entry.model, entry.P, Infinity, false);
  return c;
}
function pushHistory() {
  history.unshift({ seed, variant, P: { ...P }, model });
  history = history.slice(0, 14);
  renderHistory();
}
function refreshHead() {
  if (!history.length) return;
  Object.assign(history[0], { seed, variant, P: { ...P }, model });
  renderHistory();
}
function renderHistory() {
  const box = $("#hist");
  box.textContent = "";
  history.forEach((h, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.title = `${h.seed} · вариант ${h.variant}`;
    b.setAttribute("aria-label", `Вернуть сигил ${h.seed}, вариант ${h.variant}`);
    b.setAttribute("aria-current", i === 0 ? "true" : "false");
    b.appendChild(thumb(h));
    b.addEventListener("click", () => {
      const [e] = history.splice(i, 1);
      history.unshift(e);
      seed = e.seed; variant = e.variant; P = { ...e.P }; model = e.model;
      syncControls(); updateReadout(); renderHistory(); persist(); play(false);
    });
    box.appendChild(b);
  });
}

/* ---------- controls ---------- */
function chipGroup(box, items, key, swatch) {
  box.textContent = "";
  for (const [val, label] of items) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.dataset.val = val;
    if (swatch) {
      const sw = document.createElement("span"); sw.className = "sw";
      sw.style.background = `linear-gradient(135deg, ${swatch(val)[0]} 50%, ${swatch(val)[1]} 50%)`;
      b.appendChild(sw);
    }
    b.appendChild(document.createTextNode(label));
    b.addEventListener("click", () => { P[key] = val; persist(); syncControls(); onParam(key === "sym"); });
    box.appendChild(b);
  }
}
chipGroup($("#symChips"), SYMS, "sym");
chipGroup($("#styleChips"), Object.entries(STYLES).map(([k, s]) => [k, s.name]), "style", v => STYLES[v].sw);

const sliderBox = $("#sliders");
for (const [key, label, min, max, step, fmt] of SLIDERS) {
  const wrap = document.createElement("div"); wrap.className = "slider";
  wrap.innerHTML = `<label for="s-${key}">${label}</label><output id="o-${key}" for="s-${key}"></output>` +
    `<input type="range" id="s-${key}" min="${min}" max="${max}" step="${step}">`;
  sliderBox.appendChild(wrap);
  const inp = wrap.querySelector("input");
  inp.addEventListener("input", () => { P[key] = +inp.value; $("#o-" + key).textContent = fmt(P[key]); onParam(false); });
  inp.addEventListener("change", persist);
}
const TOGGLES = { tSpine: "spine", tOrbits: "orbits", tSparks: "sparks", tTransparent: "transparent" };
for (const [id, key] of Object.entries(TOGGLES)) {
  $("#" + id).addEventListener("change", e => { P[key] = e.target.checked; persist(); onParam(key !== "transparent"); });
}

function syncControls() {
  for (const [key, , , , , fmt] of SLIDERS) { $("#s-" + key).value = P[key]; $("#o-" + key).textContent = fmt(P[key]); }
  for (const [id, key] of Object.entries(TOGGLES)) $("#" + id).checked = !!P[key];
  document.querySelectorAll("#symChips .chip").forEach(b => b.setAttribute("aria-pressed", b.dataset.val === P.sym));
  document.querySelectorAll("#styleChips .chip").forEach(b => b.setAttribute("aria-pressed", b.dataset.val === P.style));
}

// Parameter edits rebuild the same seed; a rAF gate keeps slider drags smooth.
let pending = 0, pendingAnim = false;
function onParam(animate) {
  pendingAnim = pendingAnim || animate;
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    regenerate(pendingAnim); pendingAnim = false;
    clearTimeout(onParam.t); onParam.t = setTimeout(refreshHead, 250);
  });
}

function fresh() { seed = newSeed(); variant = 0; regenerate(true); pushHistory(); }
function mutate() { variant++; regenerate(true); pushHistory(); }

$("#btnNew").addEventListener("click", fresh);
$("#btnMut").addEventListener("click", mutate);
$("#btnReplay").addEventListener("click", () => play(true));
$("#seedForm").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("#seedIn").value.trim().toUpperCase();
  if (!v) { toast("Введите seed: любые буквы и цифры"); return; }
  seed = v; variant = 0; regenerate(true); pushHistory();
});
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "button" || tag === "select") return;
  if (e.code === "Space") { e.preventDefault(); fresh(); }
  else if (e.code === "KeyM") mutate();
});

/* ---------- export ---------- */
const toastEl = $("#toast");
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove("on"), 2600); }

const inViewer = !!(window.claude && window.claude.use);
let downloads = null;
if (inViewer) {
  (async () => {
    try { downloads = await window.claude.use("downloads"); } catch (e) { downloads = null; }
    if (!downloads) { $("#btnPng").hidden = true; $("#btnSvg").hidden = true; $(".row3").style.gridTemplateColumns = "1fr"; }
  })();
}
async function offerFile(filename, blob) {
  if (downloads) {
    try { await downloads.save({ filename, data: blob }); toast("Сохранено: " + filename); }
    catch (e) {
      if (e && e.code === "declined") toast("Сохранение отменено");
      else if (e && e.code === "rate_limited") toast("Окно сохранения уже открыто");
      else toast("Сохранить не получилось. Попробуйте «Копия SVG».");
    }
  } else if (!inViewer) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
}
const fileBase = () => `sigil-${seed}${variant ? "-v" + variant : ""}`;
$("#btnPng").addEventListener("click", () => {
  const c = document.createElement("canvas"); c.width = c.height = 2048;
  paint(c.getContext("2d"), 2048, model, P, Infinity, P.transparent);
  c.toBlob(b => b ? offerFile(fileBase() + ".png", b) : toast("Не удалось собрать PNG"), "image/png");
});
$("#btnSvg").addEventListener("click", () => offerFile(fileBase() + ".svg", new Blob([toSVG(model, P)], { type: "image/svg+xml" })));
$("#btnCopy").addEventListener("click", () => {
  const svg = toSVG(model, P);
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = svg; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    ta.remove();
    toast(ok ? "SVG скопирован" : "Буфер обмена недоступен в этом окне");
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(svg).then(() => toast("SVG скопирован"), fallback);
  else fallback();
});

/* ---------- boot ---------- */
new ResizeObserver(() => { if (model && !anim) draw(Infinity); }).observe(frame);
syncControls();
regenerate(true);
pushHistory();
})();
