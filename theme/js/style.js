"use strict";
// 05 · STYLE (stage.js includes this file): the case skins and colour schemes as cards, with a large preview of the
// card under the mouse (else of what is in use) and one click to apply. Applying is live: a skin changes the cases
// everywhere at once, a scheme runs under the light / dark sweep. PLAY INTRO (the boot film of the skin in use, in the
// scheme's colours) and LIGHT / DARK sit at the top right.
//   left   CASE SKIN: every skin (built-in and hand-installed) as its archive sprite on the page;
//          COLOUR SCHEME: every scheme as a miniature of the interface in its light and dark sets
//   right  the preview: a skin's front view and archive sprite, or a scheme's miniature large with its swatches

const STY_ST = {
    head: { size: 9, weight: 600, track: .16 },
    sec: { size: 9, weight: 600, track: .16 },
    tiny: { size: 8, weight: 500, track: .14 },
    name: { size: 10, weight: 600, track: .12 },
    nameS: { size: 8.5, weight: 600, track: .06 },   // on narrow cards
    big: { size: 22, weight: 700, track: .04 },
    tog: { size: 9, weight: 500, track: .14 },
};
// one line about each built-in skin (a hand-installed skin shows its folder name only)
const SKIN_ABOUT = {
    marble: "White marble specimen case, frosted polymer edges, orange index tab",
    hazard: "Carbon body, black rubber edges, yellow-and-black stripe band, signal yellow tab",
    white: "Soft matte white plastics and white metal, frosted silver tab",
    glass: "Clear glass frame with frosted edges, caustic glass behind the cover, green glass tab",
    frost: "Frosted glass all round with frosted silver, purple glass tab",
    red: "Glossy signal red with steel edges and white details",
    blue: "Pale blue body, dark blue metal edges, glowing blue tab",
    coral: "Warm coral translucent body, white spine and metal",
    tide: "Blue-to-cyan gradient body, white blue spine, glowing blue tab",
    aurora: "Iridescent pastel, cream to lavender, rainbow glass tab",
};
const SCHEME_ABOUT = {
    archive: "Paper and void with the theme orange",
    hazard: "Black and yellow industrial",
    flare: "Vibrant orange: the light page itself is orange",
    field: "Fresh green on green-tinted paper",
    front: "Cold front blue",
};
const STY = { img: new Map(), hover: null, gen: 0, shown: false };   // img: skin id -> { array, hero }

function styleShown(on) {
    if (on === STY.shown) return;
    STY.shown = on;
    if (on) { listSkins(true); return; }
    STY.img.clear(); STY.gen++; STY.hover = null;
}
function skinImages(s) {
    let e = STY.img.get(s.id);
    if (e) return e;
    e = { array: null, hero: null };
    STY.img.set(s.id, e);
    const g = STY.gen;
    for (const k of ["array", "hero"]) {
        d2d.LoadImageAsyncV2(0, s.dir + `${k}-clear.png`).then(img => { if (g === STY.gen) { e[k] = img; window.Repaint(); } }, () => {});
    }
    return e;
}

// a miniature of the interface in one colour set: header with tabs, rail, playlist rows (one selected, one playing),
// profile card, transport
function drawMock(gr, x, y, w, h, t) {
    const c = k => argb(t[k]), u = Math.max(1, Math.round(w / 120));
    gr.FillSolidRect(x, y, w, h, c("bg"));
    const hh = Math.round(h * .13);
    gr.FillSolidRect(x + u * 3, y + Math.round(hh * .3), u * 9, Math.round(hh * .4), c("fg"));
    for (let i = 0; i < 4; i++) {
        const tx = x + u * (18 + i * 11);
        if (i === 1) gr.FillSolidRect(tx - u, y + Math.round(hh * .25), u * 10, Math.round(hh * .5), c("fg"));
        gr.FillSolidRect(tx, y + Math.round(hh * .45), u * 8, Math.max(1, u), i === 1 ? c("bg") : c("text-muted"));
    }
    gr.FillSolidRect(x + u * 27, y + Math.round(hh * .2), u, u, c("accent"));
    gr.FillSolidRect(x, y + hh, w, 1, c("hair"));
    const by = y + h - Math.round(h * .12);
    // rail and rows
    const rx = x + u * 3, rw = Math.round(w * .62), rowH = Math.max(2, Math.round(h * .07));
    gr.FillSolidRect(rx, y + hh + u * 4, rw, Math.max(1, u), c("fg"));
    for (let i = 0; i < 7; i++) {
        const ry = y + hh + u * 7 + i * rowH;
        if (ry + rowH > by - u * 2) break;
        const sel = i === 2, play = i === 4;
        if (sel) gr.FillSolidRect(rx, ry, rw, rowH - 1, c("fg"));
        if (play) gr.FillSolidRect(rx, ry, u * 2, rowH - 1, c("accent"));
        gr.FillSolidRect(rx + u * 4, ry + Math.round(rowH * .4), Math.round(rw * (.35 + (i % 3) * .1)), Math.max(1, Math.round(rowH * .22)),
                         sel ? c("bg") : play ? c("accent") : i % 2 ? c("text-muted") : c("fg-soft"));
    }
    // profile card
    const cx = x + Math.round(w * .7), cw = w - Math.round(w * .7) - u * 3, cy = y + hh + u * 4;
    gr.FillSolidRect(cx, cy, cw, by - cy - u * 3, c("panel"));
    gr.FillSolidRect(cx + u * 2, cy + u * 2, cw - u * 4, cw - u * 4, c("well"));
    gr.FillSolidRect(cx + u * 2, cy + cw, u * 6, u * 2, c("accent"));
    gr.FillSolidRect(cx + u * 2, cy + cw + u * 4, cw - u * 6, Math.max(1, u), c("fg"));
    // transport
    gr.FillSolidRect(x, by, w, 1, c("hair"));
    gr.FillSolidRect(x + u * 3, by + u * 2, u * 4, u * 4, c("fg"));
    gr.FillSolidRect(x + u * 10, by + u * 4, w - u * 14, 1, c("line-dim"));
    gr.FillSolidRect(x + u * 10, by + u * 4 - 1, Math.round((w - u * 14) * .4), 2, c("fg"));
    gr.FillSolidRect(x + u * 10 + Math.round((w - u * 14) * .4), by + u * 2, Math.max(1, u), u * 4, c("accent"));
}

// card size: as large as the width allows and the height still fits every skin row plus the scheme row
function styleGeom(nSkins = 10, nSchemes = 5) {
    const m = dp(48), top = dp(62), gap = dp(16), lx1 = Math.round(W * .62), lw = lx1 - m;
    const cols = Math.max(5, Math.min(7, Math.ceil(Math.max(nSkins, nSchemes) / 2)));
    const rows = Math.ceil(nSkins / cols), srows = Math.ceil(nSchemes / cols);
    const byW = (lw - (cols - 1) * gap) / cols;
    const avail = H - top - dp(24) - dp(30) * 3 - dp(10) * 2 - dp(30) - dp(30);   // three section heads, the DISPLAY row
    const byH = (avail - (rows + srows) * gap) / (rows * 1.02 + srows * .86);
    const cw = Math.floor(Math.max(dp(70), Math.min(byW, byH)));
    return { m, top, gap, lx1, cols, cw, skinH: Math.round(cw * 1.02), schemeH: Math.round(cw * .86) };
}

function drawStyle(gr) {
    const skins = listSkins(), ids = Object.keys(TOKENS.schemes), g = styleGeom(skins.length, ids.length);
    for (const [x, y] of [[dp(16), dp(16)], [W - dp(27), dp(16)], [dp(16), H - dp(27)], [W - dp(27), H - dp(27)]]) regCross(gr, x, y);
    // ■ STYLE · 05   [MARBLE · ARCHIVE]          TEXT [90% … 120%]   ARRAY [80% … 130%]   ▶ PLAY INTRO   MODE [LIGHT | DARK]
    gr.FillSolidRect(g.m, dp(32), dp(5), dp(5), C.fg);
    const hw = label(gr, tr("STYLE  ·  05"), st(STY_ST.head, C.fg), g.m + dp(15), dp(28));
    const cur = skins.find(s => s.id === STATE.skin), now = `${cur ? cur.name : "—"}  ·  ${TOKENS.schemes[SCHEME].name}  ·  ${tr(MODE.toUpperCase())}`;
    chip(gr, now, g.m + dp(15) + hw + dp(14), dp(24), dp(18), "acc", 8.5, C.bg);
    const mx = drawModeToggle(gr, W - g.m, dp(22));
    drawIntroButton(gr, mx - dp(28), dp(22));
    gr.FillSolidRect(g.m, g.top, W - 2 * g.m, HAIR, withAlpha(C.fg, .55));
    // CASE SKIN
    let y = g.top + dp(24);
    label(gr, `${tr("CASE SKIN")}  ·  ${pad(skins.length, 2)}`, st(STY_ST.sec, C.fg), g.m, y);
    y += dp(30);
    skins.forEach((s, i) => {
        const x = g.m + (i % g.cols) * (g.cw + g.gap), cy = y + Math.floor(i / g.cols) * (g.skinH + g.gap);
        drawSkinCard(gr, s, i, x, cy, g.cw, g.skinH);
    });
    y += Math.ceil(skins.length / g.cols) * (g.skinH + g.gap) + dp(10);
    // COLOUR SCHEME
    label(gr, `${tr("COLOUR SCHEME")}  ·  ${pad(ids.length, 2)}`, st(STY_ST.sec, C.fg), g.m, y);
    y += dp(30);
    ids.forEach((id, i) => drawSchemeCard(gr, id, i, g.m + (i % g.cols) * (g.cw + g.gap), y + Math.floor(i / g.cols) * (g.schemeH + g.gap), g.cw, g.schemeH));
    y += Math.ceil(ids.length / g.cols) * (g.schemeH + g.gap) + dp(10);
    // DISPLAY: text size, Archive array scale, inspection size
    label(gr, tr("DISPLAY  ·  03"), st(STY_ST.sec, C.fg), g.m, y);
    drawScaleRow(gr, g.m, y + dp(30), g.lx1);
    drawStylePreview(gr, g, skins);
}

function cardFrame(gr, x, y, w, h, inUse, hov) {
    if (inUse) {
        box(gr, x - dp(4), y - dp(4), w + dp(8), h + dp(8), C.fg, Math.max(HAIR, dp(1.5)));
        for (const [px, py] of [[x - dp(4), y - dp(4)], [x + w + dp(4), y - dp(4)], [x - dp(4), y + h + dp(4)], [x + w + dp(4), y + h + dp(4)]])
            gr.FillSolidRect(Math.round(px - dp(3)), Math.round(py - dp(3)), dp(6), dp(6), C.accent);
    } else box(gr, x, y, w, h, hov ? C.accent : C["line-faint"]);
}

// where a skin card's name starts and in which style: after the index when it fits there, else alone
function cardNameX(name, w) {
    if (labelWidth(name, st(STY_ST.name, 0)) <= w - dp(44)) return { x: dp(34), st: STY_ST.name, num: true };
    if (labelWidth(name, st(STY_ST.name, 0)) <= w - dp(18)) return { x: dp(10), st: STY_ST.name, num: false };
    return { x: dp(10), st: STY_ST.nameS, num: false };
}
function drawSkinCard(gr, s, i, x, y, w, h) {
    const e = skinImages(s), ih = h - dp(40), inUse = s.id === STATE.skin, hov = STY.hover && STY.hover.kind === "skin" && STY.hover.id === s.id;
    gr.FillSolidRect(x, y, w, h, C.panel);
    if (e.array) {
        const k = Math.min((w - dp(16)) / e.array.Width, (ih - dp(8)) / e.array.Height) * 1.35;   // the sprite has empty margins
        const dw = e.array.Width * k, dh = e.array.Height * k;
        gr.PushClip(x, y, w, ih);
        gr.DrawImage(e.array, x + (w - dw) / 2, y + (ih - dh) / 2 + dp(6), dw, dh, 0, 0, e.array.Width, e.array.Height);
        gr.PopClip();
    }
    gr.FillSolidRect(x, y + ih, w, HAIR, C["line-faint"]);
    // a narrow card (small window, large text) drops the index and sets the name smaller so it stays whole
    const nx = cardNameX(s.name, w), ns = nx.st;
    if (nx.num) label(gr, pad(i + 1, 2), st(STY_ST.tiny, C["text-muted"], C.panel), x + dp(10), y + ih + dp(14));
    label(gr, fitLabel(s.name, st(ns, C.fg, C.panel), w - nx.x - dp(8)), st(ns, C.fg, C.panel), x + nx.x, y + ih + Math.round((dp(40) - labelHeight(ns)) / 2));
    if (inUse) chip(gr, tr("IN USE"), x + w - dp(8) - labelWidth(tr("IN USE"), st(STY_ST.tiny, 0)) - dp(16), y + dp(8), dp(16), "inv", 8);
    cardFrame(gr, x, y, w, h, inUse, hov);
    hits.add("sty-skin", x, y, w, h, s.id);
}

function drawSchemeCard(gr, id, i, x, y, w, h) {
    const sc = TOKENS.schemes[id], mh = h - dp(40), inUse = id === SCHEME, hov = STY.hover && STY.hover.kind === "scheme" && STY.hover.id === id;
    const half = Math.floor((w - dp(1)) / 2);
    drawMock(gr, x, y, half, mh, sc.light);
    drawMock(gr, x + w - half, y, half, mh, sc.dark);
    gr.FillSolidRect(x, y + mh, w, h - mh, C.panel);
    gr.FillSolidRect(x, y + mh, w, HAIR, C["line-faint"]);
    gr.FillSolidRect(x + dp(10), y + mh + dp(15), dp(7), dp(7), argb(sc.light.accent === "#ffffff" ? sc.dark.accent : sc.light.accent));
    const ns = labelWidth(sc.name, st(STY_ST.name, 0)) <= w - dp(34) ? STY_ST.name : STY_ST.nameS;
    label(gr, fitLabel(sc.name, st(ns, C.fg, C.panel), w - dp(34)), st(ns, C.fg, C.panel), x + dp(24), y + mh + Math.round((dp(40) - labelHeight(ns)) / 2));
    if (inUse) chip(gr, tr("IN USE"), x + w - dp(8) - labelWidth(tr("IN USE"), st(STY_ST.tiny, 0)) - dp(16), y + dp(8), dp(16), "inv", 8);
    cardFrame(gr, x, y, w, h, inUse, hov);
    hits.add("sty-scheme", x, y, w, h, id);
}

// MODE [■ LIGHT | □ DARK], right-aligned at x
function drawModeToggle(gr, xr, y) {
    const items = [["light", tr("LIGHT")], ["dark", tr("DARK")]], hh = dp(22), s = st(STY_ST.tog, 0);
    const widths = items.map(([, t]) => dp(9) + dp(5) + dp(6) + labelWidth(t, s) + dp(9)), total = widths[0] + widths[1];
    let x = xr - total;
    label(gr, tr("MODE"), st(STY_ST.tog, C["text-muted"]), x - dp(14), y + Math.round((hh - labelHeight(STY_ST.tog)) / 2), 2);
    items.forEach(([m, t], i) => {
        const on = MODE === m, col = on ? C.bg : C["text-muted"];
        if (on) gr.FillSolidRect(x, y, widths[i], hh, C.fg);
        toggleMark(gr, x + dp(9), y + hh / 2, on, col);
        label(gr, t, st(STY_ST.tog, col, on ? C.fg : C.bg), x + dp(20), y + Math.round((hh - labelHeight(STY_ST.tog)) / 2));
        hits.add("sty-mode", x, y, widths[i], hh, m);
        x += widths[i];
    });
    box(gr, xr - total, y, total, hh, C["line-faint"]);
    return xr - total - labelWidth(tr("MODE"), st(STY_ST.tog, 0)) - dp(14);
}

// ▶ PLAY INTRO, right-aligned at xr
function drawIntroButton(gr, xr, y) {
    const hh = dp(22), t = tr("PLAY INTRO"), s = st(STY_ST.tog, 0), w = labelWidth(t, s) + dp(34), x = xr - w;
    const hov = STY.hover && STY.hover.kind === "intro";
    gr.FillSolidRect(x, y, w, hh, hov ? C.accent : C.fg);
    icon(gr, "play", x + dp(13), y + hh / 2, 8, hov ? C["on-accent"] : C.bg);
    label(gr, t, st(STY_ST.tog, hov ? C["on-accent"] : C.bg, hov ? C.accent : C.fg), x + dp(24), y + Math.round((hh - labelHeight(STY_ST.tog)) / 2));
    hits.add("sty-intro", x, y, w, hh);
    return x;
}

// TEXT [90% … 120%]   ARRAY [80% … 130%]   INSPECT [100% … 150%] from x, wrapping to a second row before x1
const pct = v => `${Math.round(v * 100)}%`;
function drawScaleRow(gr, x, y, x1) {
    const groups = [["TEXT", TEXT_SCALES, STATE.textScale, "sty-text"], ["ARRAY", ARRAY_SCALES, STATE.arrayScale, "sty-array"],
                    ["INSPECT", INSPECT_SCALES, STATE.inspectScale, "sty-inspect"]];
    let xl = x;
    for (const [title, list, cur, id] of groups) {
        const s = st(GRID_ST.count, 0), need = list.reduce((n, v) => n + dp(18) + labelWidth(pct(v), s), 0) + dp(12) + labelWidth(tr(title), s);
        if (xl > x && xl + need > x1) { xl = x; y += dp(34); }
        segToggle(gr, xl + need, y, title, list.map(v => [v, pct(v)]), cur, id);
        xl += need + dp(28);
    }
}

// the preview of the card under the mouse, else of the skin and scheme in use
function drawStylePreview(gr, g, skins) {
    const x0 = g.lx1 + dp(40), x1 = W - g.m, y0 = g.top + dp(24), y1 = H - dp(40), w = x1 - x0;
    if (w < dp(200)) return;
    gr.FillSolidRect(x0 - dp(20), g.top + dp(12), HAIR, y1 - g.top - dp(12), C["line-faint"]);
    const hv = STY.hover && STY.hover.kind !== "intro" ? STY.hover : null;
    label(gr, tr(hv ? "PREVIEW" : "IN USE"), st(STY_ST.sec, hv ? C.accent : C["text-muted"]), x0, y0);
    if (hv && hv.kind === "scheme") {
        const sc = TOKENS.schemes[hv.id], mh = Math.min(Math.round(w * .56), Math.round((y1 - y0 - dp(170)) / 2));
        drawMock(gr, x0, y0 + dp(30), w, mh, sc.light);
        drawMock(gr, x0, y0 + dp(30) + mh + dp(10), w, mh, sc.dark);
        box(gr, x0, y0 + dp(30), w, mh * 2 + dp(10), C["line-faint"]);
        let y = y0 + dp(30) + mh * 2 + dp(26);
        label(gr, sc.name, st(STY_ST.big, C.fg), x0, y);
        text(gr, tr(SCHEME_ABOUT[hv.id] || ""), 10, 500, C["fg-soft"], x0, y + dp(34), w, dp(18));
        y += dp(64);
        for (const [mi, m] of [[0, "light"], [1, "dark"]]) {
            const t = sc[m], keys = ["bg", "fg", "fg-soft", "text-muted", "line-dim", "accent"], sw = Math.floor((w - dp(40)) / keys.length);
            label(gr, m.toUpperCase(), st(STY_ST.tiny, C["text-muted"]), x0, y + mi * dp(30) + dp(4));
            keys.forEach((k, i) => {
                const sx = x0 + dp(40) + i * sw;
                gr.FillSolidRect(sx, y + mi * dp(30), dp(14), dp(14), argb(t[k]));
                box(gr, sx, y + mi * dp(30), dp(14), dp(14), C["line-faint"]);
                text(gr, t[k].toUpperCase(), 8, 500, C["fg-soft"], sx + dp(18), y + mi * dp(30) - dp(1), sw - dp(20), dp(16));
            });
        }
        return;
    }
    const s = hv ? skins.find(k => k.id === hv.id) : skins.find(k => k.id === STATE.skin);
    if (!s) return;
    const e = skinImages(s), ph = y1 - y0 - dp(150);
    if (e.hero) {
        const k = Math.min(w / e.hero.Width, (ph * .62) / e.hero.Height), dw = e.hero.Width * k, dh = e.hero.Height * k;
        gr.DrawImage(e.hero, x0 + (w - dw) / 2, y0 + dp(30), dw, dh, 0, 0, e.hero.Width, e.hero.Height);
    }
    if (e.array) {
        const k = Math.min(w * .5 / e.array.Width, (ph * .4) / e.array.Height) * 1.3, dw = e.array.Width * k, dh = e.array.Height * k;
        gr.PushClip(x0, y0 + dp(30) + ph * .6, w, ph * .4);
        gr.DrawImage(e.array, x0 + (w - dw) / 2, y0 + dp(30) + ph * .6 + (ph * .4 - dh) / 2, dw, dh, 0, 0, e.array.Width, e.array.Height);
        gr.PopClip();
    }
    const ty = y1 - dp(104);
    gr.FillSolidRect(x0, ty, w, dp(3), C.fg);
    // name, line and index stacked by their heights, so a larger text size does not overlap them
    label(gr, s.name, st(STY_ST.big, C.fg), x0, ty + dp(14));
    const ay = ty + dp(14) + labelHeight(STY_ST.big) + dp(6);
    text(gr, tr(SKIN_ABOUT[s.id] || ""), 10, 500, C["fg-soft"], x0, ay, w, Math.round(dp(18) * TEXT_SCALE));
    label(gr, `${tr("CASE SKIN")}  ${pad(skins.indexOf(s) + 1, 2)} / ${pad(skins.length, 2)}`, st(STY_ST.tiny, C["text-muted"]), x0, ay + Math.round(dp(26) * TEXT_SCALE));
}

// ------------------------------------------------------------------------------------------------------- input
function styleMouseMove(a) {
    const h = a && (a.id === "sty-skin" || a.id === "sty-scheme") ? { kind: a.id === "sty-skin" ? "skin" : "scheme", id: a.data }
        : a && a.id === "sty-intro" ? { kind: "intro", id: "" } : null;
    const o = STY.hover;
    if ((h && (!o || o.kind !== h.kind || o.id !== h.id)) || (!h && o)) { STY.hover = h; window.Repaint(); }
}
function styleClick(a) {
    if (!a) return;
    if (a.id === "sty-skin" && a.data !== STATE.skin) send("skin", a.data);
    else if (a.id === "sty-scheme" && a.data !== SCHEME) send("scheme", a.data);
    else if (a.id === "sty-mode" && a.data !== MODE) send("mode");
    else if (a.id === "sty-intro") send("boot-play");
    else if (a.id === "sty-text" && a.data !== STATE.textScale) send("text-scale", a.data);
    else if (a.id === "sty-array" && a.data !== STATE.arrayScale) send("array-scale", a.data);
    else if (a.id === "sty-inspect" && a.data !== STATE.inspectScale) send("inspect-scale", a.data);
}
