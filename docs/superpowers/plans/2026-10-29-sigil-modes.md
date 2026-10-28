# Режимы «Лезвия» и «Филигрань» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разделить генератор на три скрипта и добавить два режима генерации, «Лезвия» и «Филигрань», с общими исправлениями хрома, радиального режима, хребта и вписывания в кадр.

**Architecture:** `generator.js` — чистая геометрия (глобал `SigilGen`, в Node — `module.exports`). `render.js` — canvas и SVG (`SigilRender`). `app.js` — интерфейс. Оба компоновщика пользуются общим набором примитивов, привязанным к генераторам случайности `R` (каркас) и `D` (детали).

**Tech Stack:** ванильный JS (обычные скрипты, не ES-модули), Canvas 2D, SVG, Node 24 и `node:test` для тестов. Зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-10-29-sigil-modes-design.md`

## Глобальные ограничения

- Никаких зависимостей и сборки. Скрипты подключаются в `index.html` через `<script defer src>` в порядке `generator.js` → `render.js` → `app.js`.
- Без `import`/`export`: `index.html` должен работать и с `file://`, и на GitHub Pages.
- `generator.js` и `render.js` не обращаются к DOM при загрузке. В конце каждого из них стоит `if (typeof module !== "undefined") module.exports = <Глобал>;`.
- `MAX_STROKES = 1800`, считается после симметрии.
- Вписывание в кадр: если `maxR > 0.96`, все координаты и толщины умножаются на `0.96 / maxR`. Этот коэффициент сохраняется в `model.scale`.
- Роли штрихов: `"hero" | "echo" | "barb" | "spine" | "detail"`.
- Мутация меняет только `D` (`rngFrom(seed + "/" + variant)`). Каркас строится из `R` (`rngFrom(seed)`).
- Весь текст интерфейса на русском.
- Тесты запускаются из корня репозитория: `node --test tests/`.

## На что смотреть при ревью

1. **Крайние значения ползунков** (weight 220, density 16, spikes 100, curl 0 и 100, ×8). Ожидание: лимит соблюдён, нет `NaN`, кадр не обрезан. Тесты в задачах 2 и 3.
2. **Необычный seed** (кириллица, пробелы, эмодзи, пустая строка, 24 символа). Ожидание: сборка детерминирована и не падает. Тест в задаче 1.
3. **Старые или испорченные параметры в localStorage** (нет `mode`, неизвестный `style`, строка вместо числа). Ожидание: подставляются значения по умолчанию, страница не падает. Тест `sanitizeParams` в задаче 2.
4. **Лимит штрихов не ломает симметрию.** Ожидание: если шип отброшен, вместе с ним исчезают все его симметричные копии. Тест в задаче 2: число штрихов делится на число копий.
5. **Смена режима во время анимации роста.** Ожидание: анимация перезапускается и не накладывается на предыдущую. Ручная проверка, шаг 4 задачи 6.

---

### Задача 1. Разделить `index.html` на три скрипта, не меняя поведения

**Файлы:**
- Создать `generator.js`. Сюда переезжает текущий `index.html:223-430`: случайность, `PROF`, `SPEED`, `buildMotif`, `applySymmetry`, `prepare`, `build`, `newSeed`.
- Создать `render.js`. Сюда переезжают текущие `index.html:202-211` (`STYLES`, `CHROME_STOPS`) и `432-497` (`trace`, `paint`, `toSVG`).
- Создать `app.js`. Сюда переезжает всё остальное: `SYMS`, `SLIDERS`, `DEFAULTS`, состояние, контролы, история, экспорт, загрузка.
- Изменить `index.html:198-708`: inline-скрипт заменяется тремя `<script defer src>`.
- Тест: `tests/generator.test.js`.

**Интерфейсы:**
- Отдаёт:
  - `SigilGen.build(seed: string, variant: number, params) → { strokes, end }`
  - `SigilGen.newSeed() → string`
  - `SigilGen.prepare(rawStroke) → PreparedStroke`
  - `SigilRender.STYLES`
  - `SigilRender.paint(ctx, size, model, params, time, transparent)`
  - `SigilRender.toSVG(model, params) → string`
  - `PreparedStroke`: `{ n, p: Float32Array, nx, ny, w: Float32Array, t0, dur, flip }`

- [ ] **Шаг 1. Написать падающий тест** `tests/generator.test.js`

```js
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
```

- [ ] **Шаг 2. Запустить** `node --test tests/`. Ожидание: FAIL, `Cannot find module '../generator.js'`.
- [ ] **Шаг 3. Перенести код** по трём файлам, как описано в разделе «Файлы». `app.js` остаётся обёрнутым в IIFE и обращается к `SigilGen.*` и `SigilRender.*`. Тела функций не меняются.
- [ ] **Шаг 4. Запустить** `node --test tests/`. Ожидание: 2 теста проходят.
- [ ] **Шаг 5. Проверить вручную.** Открыть `index.html` с диска (`file://`). Seed `HC8Q-5UEN` в режиме «зеркало / хром» должен выглядеть так же, как на https://ariahoi.github.io/Sigil-Forge/ с тем же seed. В консоли нет ошибок. Экспорт PNG и SVG работает.
- [ ] **Шаг 6. Коммит:** `refactor: split page into generator, render and app scripts`

---

### Задача 2. Ядро генератора: роли, параметры, направляющие, лимит, вписывание в кадр

Нынешний `buildMotif` становится `composeFiligree(kit)`, форма сигилов пока не меняется. Задача добавляет только общую инфраструктуру.

**Файлы:**
- Изменить `generator.js`.
- Изменить `app.js`: использовать `SigilGen.DEFAULTS`, `SigilGen.RANGES` и `SigilGen.sanitizeParams`.
- Тест: `tests/generator.test.js`.

**Интерфейсы:**
- Использует: задачу 1.
- Отдаёт:
  - `SigilGen.DEFAULTS` — текущие значения плюс `mode: "blades"`.
  - `SigilGen.RANGES = { density:[3,16], spikes:[0,100], curl:[0,100], chaos:[0,100], weight:[40,220] }`
  - `SigilGen.SYM_KEYS = ["mirror","r3","r4","r5","r6","r8","none"]`
  - `SigilGen.MODES = ["blades","filigree"]`
  - `SigilGen.MAX_STROKES = 1800`
  - `SigilGen.sanitizeParams(raw: any, styleKeys: string[]) → params`. Сливает `raw` с `DEFAULTS`. Неверные `mode`, `sym` и `style` заменяет значениями по умолчанию. Числа ограничивает диапазонами `RANGES`, а не-числа заменяет значениями по умолчанию. Булевы поля приводит через `!!`.
  - `SigilGen.heroCount(density) → 2 + Math.round((density - 3) / 13 * 3)`
  - `SigilGen.build(...) → { strokes, end, scale }`
  - `PreparedStroke` получает поля `role` и `motif`. `prepare` копирует их из исходного штриха.
  - Внутренняя функция `makeKit(R, D, P)` отдаёт:
    - `add(raw, role) → raw`, которая присваивает `motif = counter[role]++`;
    - примитивы `tendril`, `bent`, `spine`, `orbit`, `spark`;
    - `guides: Guide[]`;
    - `main(N)`: при радиальной симметрии возвращает `max(1, round(N * 2 / folds))`, иначе `N`.
  - `Guide` — кубическая кривая Безье: `{ at(t) → [x, y], dir(t) → angle, nearest(x, y) → t }`.

- [ ] **Шаг 1. Написать падающие тесты**

```js
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
```

- [ ] **Шаг 2. Запустить** `node --test tests/`. Ожидание: FAIL. `sanitizeParams` не определена, а тест границ падает на точках дальше 0.96.
- [ ] **Шаг 3. Реализовать в `generator.js`.**
  - **`makeKit` и роли.** Плети из `R` получают роль `"detail"`, шипы — `"barb"`, ветки — `"detail"`.
  - **Выбор компоновщика.** `build` выбирает его по `P.mode`. Пока нет `composeBlades` (задача 3), `blades` тоже вызывает `composeFiligree`.
  - **Удержание в секторе.** В `tendril` при радиальной симметрии вычисляется `φ = atan2(x, -y)`. Если `φ ∉ [0, π/folds]`, к кривизне прибавляется `wrapA(bisector − ang) · 0.12`, где `bisector = −π/2 + π/(2·folds)`.
  - **Лимит.** Применяется к мотиву до симметрии, поэтому копии исчезают вместе. Мотиву разрешено `floor(MAX_STROKES / copies)` штрихов. Сначала отбрасываются `barb`, потом `detail`; внутри каждой роли — по возрастанию длины ломаной, стабильной сортировкой.
  - **Вписывание в кадр.** После симметрии и `prepare` вычисляется `maxR = max(hypot(p) + w/2)`. Если `maxR > 0.96`, `p` и `w` умножаются на `0.96 / maxR`, и это значение записывается в `scale`. Иначе `scale = 1`.
  - **Хребет.** Его минимальная толщина `0.02 × weight / 100`.
- [ ] **Шаг 4. Реализовать в `app.js`.** Сохранённые параметры загружаются через `SigilGen.sanitizeParams(JSON.parse(...), Object.keys(SigilRender.STYLES))`. Ползунки строятся по `SigilGen.RANGES`.
- [ ] **Шаг 5. Запустить** `node --test tests/`. Ожидание: все тесты проходят.
- [ ] **Шаг 6. Коммит:** `feat: generator kit with roles, stroke limit, radial confinement and fit to frame`

---

### Задача 3. Компоновщик «Лезвия»

**Файлы:**
- Изменить `generator.js`: добавить `PROF.blade` и `composeBlades(kit)`.
- Тест: `tests/generator.test.js`.

**Интерфейсы:**
- Использует: `makeKit`, `Guide`, `heroCount` и `main` из задачи 2.
- Отдаёт: `composeBlades(kit)`. `build` вызывает его при `mode: "blades"`.

- [ ] **Шаг 1. Написать падающие тесты**

```js
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
```

- [ ] **Шаг 2. Запустить** `node --test tests/`. Ожидание: FAIL, штрихов с ролью `"hero"` нет.
- [ ] **Шаг 3. Реализовать `PROF.blade`:** `t < 0.3 ? (t / 0.3) ** 0.7 : ((1 − t) / 0.7) ** 1.4`
- [ ] **Шаг 4. Реализовать `composeBlades(kit)`** по значениям из §3 спецификации («Лезвия»).
  - **Направляющие.** 1–2 штуки из `R`. Тип каждой выбирается из `R` среди `rise`, `fall` и `loop`; у `loop` контрольная точка `p2` отведена назад к оси. Это защита от однообразия (§6 спецификации).
  - **Главные штрихи.** Их `main(heroCount(P.density))`, направляющие используются по кругу.
    - Точки берутся как `at(t)` со смещением по нормали `R.range(-.06, .06)`. К ним добавляется шум `chaos · 0.06 · (sin(a₁·t + φ₁) + 0.5·sin(a₂·t + φ₂))`; фазы и частоты берутся из `R`.
    - Толщина `R.range(.05, .09) · wk`, профиль `PROF.blade`.
    - С вероятностью `curl` (решает `R`) штрих продолжается ещё на 15–25% длины с кривизной `±curl · 0.15`, образуя крючок.
  - **Порядок случайности.** Каждый главный штрих целиком строится из `R`, и только после этого из `D` строятся его детали:
    - **эхо:** `D.int(1, 3)` штук. Смещения `0.025 / 0.045 / 0.07` по нормалям главного штриха с внешней стороны изгиба, толщина ×`D.range(.25, .4)`, концы укорочены на 10–25%;
    - **шипы:** `round(spikes · 4 · D())` штук. Длина `D.range(.08, .2)`, угол 20–40° назад, с внешней стороны изгиба; с вероятностью 0.3 — крючок;
    - **развилки:** `D.int(0, 2)` штук на последних 20% штриха, роль `"detail"`.
  - **Хребет.** Толщина `R.range(.035, .05) · wk`, плюс один ромб или крест.
  - **Искры.** `R.int(1, 3)` штук размером `.05–.11`. Для каждой берётся лучшая из 12 точек-кандидатов из `R`: самая далёкая от уже созданных точек.
  - **Орбита.** Одна дуга с одним разрывом.
- [ ] **Шаг 5. Запустить** `node --test tests/`. Ожидание: все тесты проходят.
- [ ] **Шаг 6. Коммит:** `feat: blades composer with heroes, echoes and swept-back barbs`

---

### Задача 4. Упорядочить режим «Филигрань»

**Файлы:**
- Изменить `generator.js`: `composeFiligree(kit)`.
- Тест: `tests/generator.test.js`.

**Интерфейсы:**
- Использует: `kit.guides`, `Guide.nearest` и `Guide.dir` из задачи 2.

- [ ] **Шаг 1. Написать падающий тест**

```js
test("filigree: one trunk hero per half in mirror", () => {
  for (const seed of SEEDS) {
    const m = G.build(seed, 0, { ...P0, mode: "filigree" });
    assert.equal(m.strokes.filter(s => s.role === "hero").length, 2);
  }
});
```

- [ ] **Шаг 2. Запустить** `node --test tests/`. Ожидание: FAIL, главных штрихов 0.
- [ ] **Шаг 3. Реализовать** изменения из §3 спецификации («Филигрань»).
  - **Ствол.** Один на половину, роль `"hero"`, толщина `.03–.045 × wk`, идёт по `guides[0]`.
  - **Начальный угол плети.** `guide.dir(guide.nearest(x, y))` ближайшей направляющей плюс `R.gauss() · chaos · 0.5`.
  - **Ветки.** Толщина ×0.6.
  - **Шипы.**
    - угол 25–60° назад;
    - длина `0.02 + 0.1 · D() ** 2`, поэтому коротких шипов больше, чем длинных;
    - на одну плеть не больше 12.
  - **Волосяные линии.** `R.int(3, 6)` штук, начинаются вдоль направляющих.
- [ ] **Шаг 4. Запустить** `node --test tests/`. Ожидание: все тесты проходят, включая тест лимита из задачи 2.
- [ ] **Шаг 5. Коммит:** `feat: filigree follows guides, trunk, swept-back barbs`

---

### Задача 5. Блик хрома

**Файлы:**
- Изменить `render.js`: `paint`, `toSVG` и вспомогательную `tracePath(target, st, prog, c, k, widthMul, shift)`.
- Тест: `tests/render.test.js`.

**Интерфейсы:**
- Использует: `SigilGen.prepare` и форму `PreparedStroke`.
- Отдаёт: прежние сигнатуры `paint` и `toSVG`.

- [ ] **Шаг 1. Написать падающий тест** `tests/render.test.js`

```js
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
```

- [ ] **Шаг 2. Запустить** `node --test tests/`. Ожидание: FAIL, 2 ≠ 3.
- [ ] **Шаг 3. Реализовать.**
  - Сдвинуть `CHROME_STOPS` примерно на 15% в тёмные тона.
  - Путь блика строится только из штрихов с максимальной толщиной `w` от `0.012`.
    - Толщина штриха умножается на `0.3`.
    - Центральная линия сдвигается по нормали на `0.2 ·` полутолщины в сторону света: свет слева сверху, вектор `(−1, −1)`, поэтому знак сдвига `sign(−nx − ny)`.
  - Заливка блика `rgba(255,255,255,.85)`.
  - В `paint` блик рисуется после основной заливки, в `toSVG` — отдельным `<path>` после основного.
- [ ] **Шаг 4. Запустить** `node --test tests/`. Ожидание: все тесты проходят.
- [ ] **Шаг 5. Коммит:** `feat: specular highlight for chrome material`

---

### Задача 6. Переключатель режима в интерфейсе и README

**Файлы:**
- Изменить `index.html`: группа «Режим» с `<div class="chips" id="modeChips">` сразу после группы с кнопкой «Новый сигил».
- Изменить `app.js`.
- Изменить `README.md`.

**Интерфейсы:**
- Использует: `SigilGen.MODES`, `SigilGen.heroCount`, `params.mode`.

- [ ] **Шаг 1. Реализовать в `app.js`.**
  - **Чипы режима.** `chipGroup($("#modeChips"), [["blades","Лезвия"],["filigree","Филигрань"]], "mode")`. Смена режима перестраивает сигил с анимацией (`onParam(true)`) и обновляет текущую запись истории (`refreshHead`), не добавляя новую.
  - **Ползунок плотности.** В `blades` подпись «Главные штрихи», показание `SigilGen.heroCount(v)`. В `filigree` подпись «Плотность», показание `v`. Обновлять в `syncControls` и при `input`.
  - **Строка статистики:** `${n} ${штрих/штриха/штрихов} · ${режим строчными} · ${симметрия} · ${материал}`.
- [ ] **Шаг 2. Обновить `README.md`.**
  - Добавить раздел «Режимы»: по два предложения о каждом режиме.
  - Добавить раздел «Тесты» с командой `node --test tests/`.
  - В разделе «Как это устроено» назвать три файла.
- [ ] **Шаг 3. Запустить** `node --test tests/`. Ожидание: все тесты проходят.
- [ ] **Шаг 4. Проверить в браузере**, открыв `index.html` с диска.
  - Оба режима × зеркало, ×6 и «нет» × хром, чернила и неон.
  - Смена режима во время анимации роста: рост перезапускается без наложения.
  - После очистки `sigil-forge-params` в localStorage и перезагрузки выбраны «Лезвия».
  - Экспорт PNG и SVG работает в обоих режимах.
  - В консоли нет ошибок.
- [ ] **Шаг 5. Коммит:** `feat: mode switch in UI, README sections for modes and tests`
