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
    blackout: "Black anodised aluminium, black-on-black etching, topographic lines, one white light",
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
    hearth: "Walnut and candlelight, made for REAL STYLE",
    livewire: "Lime signal and steel cyan",
    matcha: "Creamy white and matcha green",
    custom: "Your own: pick the page, the text and the accent",
};
const STY = { img: new Map(), thumbs: new Map(), hover: null, gen: 0, shown: false };   // img: skin id -> { array, hero }; thumbs: wpThumb

function styleShown(on) {
    if (on === STY.shown) return;
    STY.shown = on;
    if (on) { listSkins(true); return; }
    STY.img.clear(); STY.thumbs.clear(); STY.gen++; STY.hover = null;
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

// card size: as large as the width allows and the height still fits every skin row, the scheme row and the tag row
function styleGeom(nSkins = 10, nSchemes = 5, nTags = 0) {
    const m = dp(48), top = dp(62), gap = dp(16), lx1 = Math.round(W * .62), lw = lx1 - m;
    const cols = Math.max(5, Math.min(9, Math.max(Math.ceil(nSkins / 2), nSchemes)));   // the schemes in one row
    const rows = Math.ceil(nSkins / cols), srows = Math.ceil(nSchemes / cols), trows = Math.ceil(nTags / cols), heads = nTags ? 4 : 3;
    const byW = (lw - (cols - 1) * gap) / cols;
    // the section heads, then the DISPLAY rows (as many as they wrap into)
    const avail = H - top - dp(24) - dp(30) * heads - dp(10) * (heads - 1) - drawDisplay(null, 0, 0, lw) - dp(24);
    const byH = (avail - (rows + srows + trows) * gap) / (rows * 1.02 + srows * .86 + trows * TAG_CARD_H);
    const cw = Math.floor(Math.max(dp(56), Math.min(byW, byH)));
    return { m, top, gap, lx1, cols, cw, skinH: Math.round(cw * 1.02), schemeH: Math.round(cw * .86), tagH: Math.round(cw * TAG_CARD_H) };
}

// the skin cards: every skin, and the custom case's card while it has not been made yet
const styleSkins = () => listSkins().some(s => s.id === "custom") ? listSkins() : listSkins().concat([{ id: "custom", dir: null, name: "CUSTOM" }]);
// the tag cards: OFF, then every finish; the cards are this much as tall as wide
const TAG_CARD_H = .62, styleTags = () => TAGS.filter(([id]) => id === "off" || tagFinish(id));
function drawStyle(gr) {
    const skins = styleSkins(), ids = Object.keys(TOKENS.schemes), tags = styleTags(), g = styleGeom(skins.length, ids.length, tags.length);
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
    // TITLE TAG: each finish in the chosen shape and colours
    if (tags.length) {
        label(gr, `${tr("TITLE TAG")}  ·  ${pad(tags.length - 1, 2)}`, st(STY_ST.sec, C.fg), g.m, y);
        y += dp(30);
        tags.forEach(([id, name], i) => drawTagCard(gr, id, name, g.m + (i % g.cols) * (g.cw + g.gap), y + Math.floor(i / g.cols) * (g.tagH + g.gap), g.cw, g.tagH));
        y += Math.ceil(tags.length / g.cols) * (g.tagH + g.gap) + dp(10);
    }
    // DISPLAY: the settings in groups (the count is of the rows)
    label(gr, `${tr("DISPLAY")}  ·  ${pad(displayCount(), 2)}`, st(STY_ST.sec, C.fg), g.m, y);
    drawDisplay(gr, g.m, y + dp(30), g.lx1);
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
    const e = s.dir ? skinImages(s) : { array: null, hero: null }, ih = h - dp(40), inUse = s.id === STATE.skin, hov = STY.hover && STY.hover.kind === "skin" && STY.hover.id === s.id;
    gr.FillSolidRect(x, y, w, h, C.panel);
    if (e.array) {
        const k = Math.min((w - dp(16)) / e.array.Width, (ih - dp(8)) / e.array.Height) * 1.35;   // the sprite has empty margins
        const dw = e.array.Width * k, dh = e.array.Height * k;
        gr.PushClip(x, y, w, ih);
        gr.DrawImage(e.array, x + (w - dw) / 2, y + (ih - dh) / 2 + dp(6), dw, dh, 0, 0, e.array.Width, e.array.Height);
        gr.PopClip();
    }
    if (!s.dir) {   // the custom case, not made yet: a plus to start one
        const c = Math.round(Math.min(w, ih) * .18), cx = x + w / 2, cy = y + ih / 2;
        gr.FillSolidRect(Math.round(cx - c), Math.round(cy - HAIR), 2 * c, 2 * HAIR, C["text-muted"]);
        gr.FillSolidRect(Math.round(cx - HAIR), Math.round(cy - c), 2 * HAIR, 2 * c, C["text-muted"]);
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

// a tag card: the finish as the card and the album file would show it, its name under it
function drawTagCard(gr, id, name, x, y, w, h) {
    const ih = h - dp(40), inUse = id === STATE.tag, hov = STY.hover && STY.hover.kind === "tag" && STY.hover.id === id;
    gr.FillSolidRect(x, y, w, h, C.panel);
    const tw = w - dp(18), th = tagHeight(tw, id === "off" ? "plastic" : id);
    if (id === "off") {
        // no tag: its outline, struck through
        const ty = y + Math.round((ih - th) / 2), c = C["text-muted"];
        box(gr, x + dp(9), ty, tw, th, c);
        gr.DrawLine(x + dp(9), ty + th, x + dp(9) + tw, ty, HAIR, c);
    } else {
        gr.PushClip(x, y, w, ih);
        drawTag(gr, x + dp(9), y + Math.round((ih - th) / 2), tw, tr("Over the Signal"), { track: "03", total: "12", arc: "0269" }, C.panel, id);
        gr.PopClip();
    }
    gr.FillSolidRect(x, y + ih, w, HAIR, C["line-faint"]);
    const t = tr(name), ns = labelWidth(t, st(STY_ST.name, 0)) <= w - dp(18) ? STY_ST.name : STY_ST.nameS;
    label(gr, fitLabel(t, st(ns, C.fg, C.panel), w - dp(18)), st(ns, C.fg, C.panel), x + dp(10), y + ih + Math.round((dp(40) - labelHeight(ns)) / 2));
    if (inUse) chip(gr, tr("IN USE"), x + w - dp(8) - labelWidth(tr("IN USE"), st(STY_ST.tiny, 0)) - dp(16), y + dp(8), dp(16), "inv", 8);
    cardFrame(gr, x, y, w, h, inUse, hov);
    hits.add("sty-tagcard", x, y, w, h, id);
}

// MODE [■ LIGHT | □ DARK | □ SYSTEM], right-aligned at x (SYSTEM: Windows' light / dark decides)
function drawModeToggle(gr, xr, y) {
    const items = [["light", tr("LIGHT")], ["dark", tr("DARK")], ["system", tr("SYSTEM")]], hh = dp(22), s = st(STY_ST.tog, 0);
    const widths = items.map(([, t]) => dp(9) + dp(5) + dp(6) + labelWidth(t, s) + dp(9)), total = widths.reduce((a, b) => a + b, 0);
    let x = xr - total;
    label(gr, tr("MODE"), st(STY_ST.tog, C["text-muted"]), x - dp(14), y + Math.round((hh - labelHeight(STY_ST.tog)) / 2), 2);
    items.forEach(([m, t], i) => {
        const on = STATE.modeSystem ? m === "system" : MODE === m, col = on ? C.bg : C["text-muted"];
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

// DISPLAY: the settings that are not cards, in four groups whose rows line up (a label column, then the control):
//   TEXT       SIZE [− 10.0 +] (typed, or stepped by 0.5; 10 is 100 %), FONT
//   ARCHIVE    ARRAY, INSPECT, FLOOR (with REAL STYLE, the offer of its colour scheme under it), GLASS (frosted or clear)
//   PAGE       WALLPAPER ›, HALFTONE, DOTS, EMBLEM, WINDOW (normal, or borderless full screen)
//   TITLE TAG  TAG SHAPE, TAG COLOURS (the custom ones under it), TAG BODY, TAG OPACITY (the finish: the cards above)
// The groups flow into as many columns as the width takes. A row that does not apply now (DOTS with the halftone off,
// the tag's rows with no tag) keeps its place, dimmed.
const pct = v => `${Math.round(v * 100)}%`;
const DISP = { row: 30, head: 28, seg: 22, colGap: 40, maxGap: 72 };   // dp
const hearthOffer = () => STATE.floor === "real" && SCHEME !== "hearth" && !!TOKENS.schemes.hearth;
function displayGroups() {
    const sc = list => list.map(v => [v, pct(v)]), tagOn = STATE.tag !== "off";
    const row = (title, items, cur, id, off = false) => ({ title, items, cur, id, off });
    return [
        { title: "TEXT", rows: [{ title: "SIZE", kind: "size" }, row("FONT", FONTS.filter(([id]) => FONT_FAMILIES[id].ok), STATE.font, "sty-font")] },
        { title: "ARCHIVE", rows: [row("ARRAY", sc(ARRAY_SCALES), STATE.arrayScale, "sty-array"), row("INSPECT", sc(INSPECT_SCALES), STATE.inspectScale, "sty-inspect"),
                                   row("FLOOR", FLOORS, STATE.floor, "sty-floor"), ...(hearthOffer() ? [{ title: "", kind: "hearth" }] : []),
                                   row("GLASS", [["frost", "FROST"], ["clear", "CLEAR"]], AR.frost ? "frost" : "clear", "sty-glass")] },
        { title: "PAGE", rows: [{ title: "WALLPAPER", kind: "wallpaper" }, row("HALFTONE", HALFTONES, STATE.halftone, "sty-ht"),
                                row("DOTS", HALFTONE_LEVELS, STATE.halftoneLevel, "sty-htl", STATE.halftone === "off"), row("EMBLEM", EMBLEMS, STATE.emblem, "sty-emblem"),
                                row("WINDOW", [["window", "NORMAL"], ["borderless", "BORDERLESS"]], STATE.borderless ? "borderless" : "window", "sty-window")] },
        { title: "TITLE TAG", rows: [row("TAG SHAPE", TAG_SHAPES, STATE.tagShape, "sty-tagshape", !tagOn), row("TAG COLOURS", TAG_COLOUR_SOURCES, STATE.tagColours, "sty-tagcol", !tagRecolours()),
                                     ...(tagRecolours() && STATE.tagColours === "custom" ? [{ title: "", kind: "swatches" }] : []),
                                     row("TAG BODY", TAG_BODIES, STATE.tagBody, "sty-tagbody", !tagOn || !!TAG_SEE_KIND[STATE.tag]),
                                     row("TAG OPACITY", TAG_OPACITIES, STATE.tagOpacity, "sty-tagop", !tagSeesThrough())] },
    ];
}
const displayCount = () => displayGroups().reduce((n, g) => n + g.rows.filter(r => r.title).length, 0);
const wpButtonText = () => { const b = STATE.wallpaper || WP_START; return `${b.path ? wpName(b.path) : tr("NONE")}  ›`; };
// a row's control width
function displayRowW(r) {
    const s = st(GRID_ST.count, 0);
    if (r.kind === "size") return sizeCtl(null, 0, 0);
    if (r.kind === "wallpaper") return Math.min(dp(240), labelWidth(wpButtonText(), s) + dp(24));
    if (r.kind === "hearth") return dp(32) + labelWidth(tr("USE HEARTH, MADE FOR REAL STYLE"), s);
    if (r.kind === "swatches") return drawTagSwatches(null, 0, 0);
    return r.items.reduce((n, [, l]) => n + dp(18) + labelWidth(tr(l), s), 0);
}
// where each group goes: the most columns that fit between x and x1, the groups split into them in order, as evenly
// as their heights allow; the columns spread over the width (up to DISP.maxGap apart)
function displayLayout(x, x1) {
    const G = displayGroups(), s = st(GRID_ST.count, 0), avail = x1 - x;
    const lw = Math.max(...G.flatMap(g => g.rows.map(r => r.title ? labelWidth(tr(r.title), s) : 0))) + dp(16);
    for (const g of G) { g.w = lw + Math.max(...g.rows.map(displayRowW)); g.h = dp(DISP.head) + g.rows.length * dp(DISP.row); }
    // every way to cut the groups into n runs, in order
    const cuts = (from, n) => n === 1 ? [[[from, G.length]]] : Array.from({ length: G.length - from - n + 1 }, (_, i) => from + i + 1)
        .flatMap(end => cuts(end, n - 1).map(rest => [[from, end], ...rest]));
    for (let n = Math.min(4, G.length); n >= 1; n--) {
        let best = null;
        for (const c of cuts(0, n)) {
            const cols = c.map(([a, b]) => G.slice(a, b)), ws = cols.map(col => Math.max(...col.map(g => g.w)));
            const sum = ws.reduce((a, b) => a + b, 0) + (n - 1) * dp(DISP.colGap);
            if (sum > avail && n > 1) continue;
            const h = Math.max(...cols.map(col => col.reduce((a, g) => a + g.h, 0) + (col.length - 1) * dp(12)));
            if (!best || h < best.h) best = { cols, ws, h, sum };
        }
        if (!best) continue;
        const gap = n > 1 ? Math.min(dp(DISP.maxGap), dp(DISP.colGap) + (avail - best.sum) / (n - 1)) : 0;
        let cx = x;
        best.cols.forEach((col, i) => {
            let cy = 0;
            for (const g of col) { g.x = Math.round(cx); g.y = cy; cy += g.h + dp(12); }
            cx += best.ws[i] + gap;
        });
        return { groups: G, lw, h: best.h };
    }
}
// gr null: only measures. Returns the height.
function drawDisplay(gr, x, y, x1) {
    const L = displayLayout(x, x1);
    if (!gr) return L.h;
    const s = st(GRID_ST.count, 0);
    for (const g of L.groups) {
        const gx = g.x, gy = y + g.y;
        label(gr, tr(g.title), st(STY_ST.tiny, C.fg), gx, gy);
        gr.FillSolidRect(gx, gy + dp(17), g.w, HAIR, C["line-faint"]);
        g.rows.forEach((r, i) => {
            const ry = gy + dp(DISP.head) + i * dp(DISP.row), cx = gx + L.lw, ty = ry + Math.round((dp(DISP.seg) - labelHeight(GRID_ST.count)) / 2);
            if (r.title) label(gr, tr(r.title), st(GRID_ST.count, r.off ? mix(C["text-muted"], C.bg, .45) : C["text-muted"]), gx, ty);
            if (r.kind === "size") sizeCtl(gr, cx, ry);
            else if (r.kind === "wallpaper") wallpaperButton(gr, cx, ry, displayRowW(r));
            else if (r.kind === "hearth") hearthButton(gr, cx, ry);
            else if (r.kind === "swatches") drawTagSwatches(gr, cx, ry);
            else segLeft(gr, cx, ry, r.items, r.cur, r.id, r.off);
        });
    }
    return L.h;
}
// a segmented toggle from x (as segToggle, grid.js, but left-aligned and without its title); off: dimmed, not clickable
function segLeft(gr, x, y, items, cur, id, off) {
    const hh = dp(DISP.seg), s = st(GRID_ST.count, 0), ty = y + Math.round((hh - labelHeight(GRID_ST.count)) / 2), x0 = x;
    const dim = mix(C["text-muted"], C.bg, .45);
    for (const [v, l] of items) {
        const t = tr(l), w = dp(18) + labelWidth(t, s), on = Array.isArray(cur) ? cur.includes(v) : cur === v;
        if (on && !off) gr.FillSolidRect(x, y, w, hh, C.fg);
        else if (on) box(gr, x, y, w, hh, dim);
        label(gr, t, st(GRID_ST.count, off ? dim : on ? C.bg : C["text-muted"], on && !off ? C.fg : C.bg), x + dp(9), ty);
        if (!off) hits.add(id, x, y, w, hh, v);
        x += w;
    }
    box(gr, x0, y, x - x0, hh, C["line-faint"]);
    return x - x0;
}
// WALLPAPER [NAME ›]: opens its editor on the right
function wallpaperButton(gr, x, y, w) {
    const on = STY.edit === "wallpaper", hov = STY.wpHover === "open", wh = dp(DISP.seg), t = wpButtonText();
    const ws = st(GRID_ST.count, on ? C.bg : C.fg, on ? C.fg : C.bg);
    if (on) gr.FillSolidRect(x, y, w, wh, C.fg);
    box(gr, x, y, w, wh, hov || on ? C.accent : C["line-dim"]);
    label(gr, fitLabel(t, ws, w - dp(24)), ws, x + dp(12), y + Math.round((wh - labelHeight(GRID_ST.count)) / 2));
    hits.add("sty-wp-open", x, y, w, wh);
}
// REAL STYLE has its own colour scheme: offered under the floor until it is in use
function hearthButton(gr, x, y) {
    const t = tr("USE HEARTH, MADE FOR REAL STYLE"), s = st(GRID_ST.count, C.fg, C.bg), h = dp(DISP.seg), w = dp(32) + labelWidth(t, s);
    box(gr, x, y, w, h, C.accent);
    gr.FillSolidRect(x + dp(9), y + Math.round((h - dp(6)) / 2), dp(6), dp(6), C.accent);
    label(gr, t, s, x + dp(22), y + Math.round((h - labelHeight(GRID_ST.count)) / 2));
    hits.add("sty-hearth", x, y, w, h);
}
// SIZE [−][ 10.0 ][+]  PX · 100%: the text size as a number (10 at 100 %), typed into the field (lib/field.js) or
// stepped by 0.5 with the buttons, the wheel or ↑ ↓. gr null: only measures (the width).
const TEXT_SIZE_BASE = 10, TEXT_SIZE_MIN = 8, TEXT_SIZE_MAX = 15;
const textSizeText = () => (Math.round(STATE.textScale * TEXT_SIZE_BASE * 10) / 10).toFixed(1);
function sizeCtl(gr, x, y) {
    const h = dp(DISP.seg), b = h, fw = dp(56), s = st(GRID_ST.count, 0), after = `PX  ·  ${pct(STATE.textScale)}`;
    const w = b * 2 + fw + dp(12) + labelWidth(after, s);
    if (!gr) return w;
    const E = STY.sizeEdit, f = fontFor("0", 11, 500);
    [[-1, x], [1, x + b + fw]].forEach(([d, bx]) => {
        const hov = STY.sizeHover === d, c = hov ? C.accent : C.fg;
        box(gr, bx, y, b, h, hov ? C.accent : C["line-dim"]);
        gr.FillSolidRect(Math.round(bx + b / 2 - dp(4)), Math.round(y + h / 2 - HAIR / 2), dp(8), HAIR, c);
        if (d > 0) gr.FillSolidRect(Math.round(bx + b / 2 - HAIR / 2), Math.round(y + h / 2 - dp(4)), HAIR, dp(8), c);
        hits.add("sty-size", bx, y, b, h, d);
    });
    const fx = x + b, edit = !!E;
    gr.FillSolidRect(fx, y, fw, h, edit ? C.panel : C.bg);
    box(gr, fx, y, fw, h, edit ? C.accent : STY.sizeHover === 0 ? C.fg : C["line-dim"]);
    if (edit) fieldDraw(gr, E, fx + dp(8), y, fw - dp(16), h, f, C.fg, true, STY.caret);
    else gr.DrawText(textSizeText(), f, C.fg, fx, y, fw, h, DT_SINGLE | 0x00000001);   // DT_CENTER
    hits.add("sty-size-field", fx, y, fw, h);
    label(gr, after, st(GRID_ST.count, C["text-muted"]), x + b * 2 + fw + dp(12), y + Math.round((h - labelHeight(GRID_ST.count)) / 2));
    return w;
}
// the text size from a number (a typed one: anything from 8 to 15, to a tenth)
function setTextSize(v) {
    if (!isFinite(v)) return;
    v = clamp(Math.round(v * 10) / 10, TEXT_SIZE_MIN, TEXT_SIZE_MAX);
    const sc = Math.round(v / TEXT_SIZE_BASE * 100) / 100;
    if (sc !== STATE.textScale) send("text-scale", sc);
}
const stepTextSize = d => setTextSize(Math.round(STATE.textScale * TEXT_SIZE_BASE * 2) / 2 + d * .5);
// the field: editing starts with a click on it (all selected), ends with Enter or a click elsewhere (applied) or Esc
let SIZE_CARET = 0;
function sizeEditStart() {
    if (STY.sizeEdit) return;
    STY.sizeEdit = makeField(textSizeText(), { accept: t => /^\d{0,2}([.,]\d?)?$/.test(t) });
    STY.sizeEdit.anchor = 0;
    STY.sizeDlg = window.DlgCode; window.DlgCode = STY.sizeDlg | 0x0080;   // DLGC_WANTCHARS
    fieldFocus(true);
    STY.caret = true;
    window.ClearInterval(SIZE_CARET);
    SIZE_CARET = window.SetInterval(() => { STY.caret = !STY.caret; const a = hits.get("sty-size-field"); if (a) window.RepaintRect(a.x, a.y, a.w, a.h); }, 530);
    window.Repaint();
}
function sizeEditEnd(apply) {
    const E = STY.sizeEdit;
    if (!E) return;
    STY.sizeEdit = null;
    window.ClearInterval(SIZE_CARET);
    window.DlgCode = STY.sizeDlg;
    fieldFocus(false);
    if (apply && E.text) setTextSize(parseFloat(E.text.replace(",", ".")));
    window.Repaint();
}
// keys and characters while the field is being edited: true when taken (stage.js asks first)
function styleKey(vk) {
    const E = STY.sizeEdit;
    if (!E) return false;
    if (vk === 0x0D) sizeEditEnd(true);
    else if (vk === 0x1B) sizeEditEnd(false);
    else if (vk === 0x26 || vk === 0x28) {   // ↑ ↓: a step, kept in the field
        const v = parseFloat(E.text.replace(",", "."));
        const n = clamp(Math.round((isFinite(v) ? v : STATE.textScale * TEXT_SIZE_BASE) * 2) / 2 + (vk === 0x26 ? .5 : -.5), TEXT_SIZE_MIN, TEXT_SIZE_MAX);
        fieldSetText(E, n.toFixed(1)); E.anchor = 0;
        setTextSize(n);
    }
    else fieldKey(E, vk);
    STY.caret = true;
    window.Repaint();
    return true;
}
function styleChar(code) {
    if (!STY.sizeEdit) return false;
    fieldChar(STY.sizeEdit, code);
    STY.caret = true;
    window.Repaint();
    return true;
}
// the mouse on the field: placing the caret, selecting by dragging or double-clicking
function styleDown(x, a, mask) {
    if (!a || a.id !== "sty-size-field") return;
    if (!STY.sizeEdit) { sizeEditStart(); return; }   // a first click selects it all
    fieldDown(STY.sizeEdit, x, !!(mask & 4));
    window.Repaint();
}
function styleDrag(x, mask) {
    const E = STY.sizeEdit;
    if (!E || !E.drag) return false;
    if (mask & 1) { fieldDrag(E, x); window.Repaint(); return true; }
    fieldUp(E);
    return false;
}
function styleDblClick(x, a) { if (a && a.id === "sty-size-field" && STY.sizeEdit) { fieldDblClick(STY.sizeEdit, x); window.Repaint(); } }
// the wheel over SIZE steps it
function styleWheel(step) {
    if (STY.sizeHover === undefined || STY.sizeHover === null) return false;
    stepTextSize(step > 0 ? 1 : -1);
    if (STY.sizeEdit) { fieldSetText(STY.sizeEdit, (clamp(Math.round(STATE.textScale * TEXT_SIZE_BASE * 2) / 2 + (step > 0 ? .5 : -.5), TEXT_SIZE_MIN, TEXT_SIZE_MAX)).toFixed(1)); STY.sizeEdit.anchor = 0; }
    return true;
}
// the tag's colours can be chosen (its finish is not one of the glass ones, which keep theirs)
const tagRecolours = () => STATE.tag !== "off" && !["tide", "aurora"].includes(STATE.tag);
// the custom tag colours: TOP ■ BODY ■ BOTTOM ■, each opens the colour picker. Returns the width.
const TAG_BANDS = ["TOP", "BODY", "BOTTOM"];
function drawTagSwatches(gr, x, y) {
    const s = st(GRID_ST.count, C.fg, C.bg), cols = tagCustom(), sw = dp(22);
    let cx = x;
    TAG_BANDS.forEach((t, i) => {
        if (gr) cx += label(gr, tr(t), s, cx, y + Math.round((sw - labelHeight(GRID_ST.count)) / 2)) + dp(6); else cx += labelWidth(tr(t), s) + dp(6);
        if (gr) { gr.FillSolidRect(cx, y, sw, sw, tagArgb(cols[i])); box(gr, cx, y, sw, sw, C["line-dim"]); hits.add("sty-tagc", cx, y, sw, sw, i); }
        cx += sw + dp(14);
    });
    return cx - x - dp(14);
};
// toggle groups [title, items, cur, hit id, marks] in a row from x, wrapping before x1: where each one's right edge
// goes ({ at: [[xr, y, group]], y: the last row's, xl: where that row ends })
function wrapGroups(groups, x, y, x1) {
    const s = st(GRID_ST.count, 0), at = [];
    let xl = x;
    for (const gp of groups) {
        const [title, items, , , marks] = gp, need = items.reduce((n, [, t]) => n + (marks ? dp(29) : dp(18)) + labelWidth(tr(t), s), 0) + dp(12) + labelWidth(tr(title), s);
        if (xl > x && xl + need > x1) { xl = x; y += dp(34); }
        at.push([xl + need, y, gp]);
        xl += need + dp(28);
    }
    return { at, y, xl };
}
// The wallpaper's editor (lib/wallpaper.js): the picture as the stage shows it (look and veil applied), CHOOSE / REMOVE,
// the pictures that come with the theme, then where it shows, its look and its veil.
function drawWallpaperEditor(gr, x0, y, w, y1) {
    const b = STATE.wallpaper || WP_START, s = st(GRID_ST.count, 0), hh = dp(22);
    const ty = yy => yy + Math.round((hh - labelHeight(GRID_ST.count)) / 2);
    label(gr, tr("WALLPAPER"), st(STY_ST.big, C.fg), x0, y);
    y += labelHeight(STY_ST.big) + dp(6);
    text(gr, tr("A picture behind the views below: one that comes with the theme, or one of your own."), 10, 500, C["fg-soft"], x0, y, w, dp(18));
    y += dp(30);
    const ph = Math.max(dp(80), Math.min(Math.round(w * 9 / 16), y1 - y - dp(200) - drawWallpaperBuiltIns(null, x0, 0, w)));
    if (!(b.path && wallpaperPreview(gr, x0, y, w, ph))) {
        const t = tr(b.path ? (WP.failed[b.path] ? "CANNOT OPEN THE PICTURE" : "LOADING …") : "NO PICTURE");
        label(gr, t, st(STY_ST.tiny, b.path && WP.failed[b.path] ? C.accent : C["text-muted"]), x0 + w / 2, y + ph / 2 - dp(6), 1);
    }
    box(gr, x0, y, w, ph, C["line-faint"]);
    y += ph + dp(16);
    // [CHOOSE PICTURE …]  NAME.JPG                                                           [REMOVE]
    const pick = tr(b.path ? "CHANGE PICTURE …" : "CHOOSE PICTURE …"), pw = labelWidth(pick, s) + dp(24), hov = STY.wpHover === "pick";
    gr.FillSolidRect(x0, y, pw, hh, hov ? C.accent : C.fg);
    label(gr, pick, st(GRID_ST.count, hov ? C["on-accent"] : C.bg, hov ? C.accent : C.fg), x0 + dp(12), ty(y));
    hits.add("sty-wp-pick", x0, y, pw, hh);
    if (b.path) {
        const rm = tr("REMOVE"), rw = labelWidth(rm, s) + dp(24), name = wpName(b.path), nst = st(GRID_ST.count, C["fg-soft"]);
        label(gr, fitLabel(name, nst, w - pw - rw - dp(28)), nst, x0 + pw + dp(14), ty(y));
        box(gr, x0 + w - rw, y, rw, hh, STY.wpHover === "off" ? C.accent : C["line-dim"]);
        label(gr, rm, st(GRID_ST.count, C.fg), x0 + w - rw + dp(12), ty(y));
        hits.add("sty-wp-off", x0 + w - rw, y, rw, hh);
    }
    y += dp(40);
    y = drawWallpaperBuiltIns(gr, x0, y, w);
    // VIEWS, LOOK, VEIL: one row each
    for (const gp of wallpaperGroups()) {
        const [title, items, cur, id, marks] = gp, [[xr]] = wrapGroups([gp], x0, y, x0 + w).at;
        segToggle(gr, xr, y, title, items, cur, id, !!marks);
        y += dp(34);
    }
}
const wallpaperGroups = () => {
    const b = STATE.wallpaper || WP_START;
    return [["VIEWS", WP_VIEWS, b.views, "sty-wp-view", true], ["LOOK", WP_LOOKS, b.look, "sty-wp-look"], ["VEIL", WP_VEILS, b.veil, "sty-wp-veil"]];
};
// COMES WITH THE THEME: the built-in pictures (WP_BUILTIN) as thumbnails in the mode's version, a click puts one up.
// Returns the y below the row (gr null: only measures, from y 0).
function drawWallpaperBuiltIns(gr, x0, y, w) {
    const b = STATE.wallpaper || WP_START, gap = Math.round(dp(10)), tw = Math.min(Math.round(dp(150)), Math.floor((w - gap * 3) / 4)), th = Math.round(tw * 9 / 16);
    const y1 = Math.round(y + labelHeight(GRID_ST.count) + dp(8)), ny = y1 + th + Math.round(dp(6)), end = ny + labelHeight(STY_ST.tiny) + dp(18);
    if (!gr) return end;
    label(gr, tr("COMES WITH THE THEME"), st(GRID_ST.count, C["text-muted"]), x0, y);
    WP_BUILTIN.forEach(([id, name], i) => {
        const x = Math.round(x0) + i * (tw + gap), on = b.path === "theme:" + id, img = wpThumb(id);
        if (img) gr.DrawImage(img, x, y1, tw, th, 0, 0, img.Width, img.Height);
        else gr.FillSolidRect(x, y1, tw, th, C["line-faint"]);
        box(gr, x, y1, tw, th, on || STY.wpHover === "bi:" + id ? C.accent : C["line-faint"], on ? HAIR * 2 : HAIR);
        const ns = st(STY_ST.tiny, on ? C.fg : C["text-muted"]);
        label(gr, fitLabel(tr(name), ns, tw), ns, x, ny);
        hits.add("sty-wp-builtin", x, y1, tw, ny - y1 + labelHeight(STY_ST.tiny), id);
    });
    return end;
}
// a built-in picture's thumbnail (assets/wallpapers/thumbs) in the mode's version: null while it loads
function wpThumb(id) {
    const k = `${id}-${MODE}`;
    if (STY.thumbs.has(k)) return STY.thumbs.get(k);
    STY.thumbs.set(k, null);
    const g = STY.gen;
    d2d.LoadImageAsyncV2(0, WP_DIR + `thumbs\\${k}.jpg`).then(img => { if (img && g === STY.gen) { STY.thumbs.set(k, img); window.Repaint(); } }, () => {});
    return null;
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
    if (hv && hv.kind === "tag") { drawTagPreview(gr, hv.id, x0, y0 + dp(30), w, y1); return; }
    if (!hv && STY.edit === "wallpaper") { drawWallpaperEditor(gr, x0, y0 + dp(30), w, y1); return; }
    if (!hv && (STY.making || (STATE.skin === "custom" && STY.edit !== "scheme"))) { drawCaseEditor(gr, x0, y0 + dp(30), w, y1); return; }
    if (!hv && SCHEME === "custom") { drawCustomEditor(gr, x0, y0 + dp(30), w, y1); return; }
    const s = hv ? skins.find(k => k.id === hv.id) : skins.find(k => k.id === STATE.skin);
    if (!s || !s.dir) return;
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

// The tag card under the mouse: the tag large, with the playing (else the focused) track's title, then as large as
// the signal profile card shows it, then its name, what it is and the shape, colours and opacity it is shown in.
const TAG_ABOUT = {
    "plastic": "Glossy plastic, coloured band by band.",
    "paper": "Matte card stock, its fibres showing.",
    "metal": "Brushed aluminium: its grain along the tag, the light a band across it.",
    "frosted": "A milky plate: the panel shows through it, blurred.",
    "clear": "Clear acrylic: the panel shows through, tinted by the band colours.",
    "tide": "The Tide case's blue gradient glass, see-through.",
    "aurora": "The Aurora case's pastel gradient glass, see-through.",
};
const TF_TAG_TITLE = fb.TitleFormat("%title%");
function drawTagPreview(gr, id, x0, y, w, y1) {
    const h0 = fb.GetNowPlaying() || fb.GetFocusItem(), title = h0 ? TF_TAG_TITLE.EvalWithMetadb(h0) : tr("Over the Signal");
    const vals = { track: "03", total: "12", arc: "0269" }, pad_ = dp(22);
    // large: as wide as the panel allows
    const bw = w - 2 * pad_, bh = tagHeight(bw, id);
    gr.FillSolidRect(x0, y, w, bh + 2 * pad_, C.panel);
    drawTag(gr, x0 + pad_, y + pad_, bw, title, vals, C.panel, id);
    y += bh + 2 * pad_ + dp(18);
    // as the signal profile card shows it (its 296 dp column)
    label(gr, tr("ON THE SIGNAL PROFILE CARD"), st(STY_ST.tiny, C["text-muted"]), x0, y);
    y += dp(20);
    const cw = Math.min(dp(296), w - 2 * pad_), ch = tagHeight(cw, id);
    gr.FillSolidRect(x0, y, cw + 2 * pad_, ch + 2 * pad_, C.panel);
    drawTag(gr, x0 + pad_, y + pad_, cw, title, vals, C.panel, id);
    // name, what it is, how it is shown
    const ty = Math.max(y + ch + 2 * pad_ + dp(24), y1 - dp(104));
    gr.FillSolidRect(x0, ty, w, dp(3), C.fg);
    const name = (TAGS.find(t => t[0] === id) || [id, id])[1];
    label(gr, tr(name), st(STY_ST.big, C.fg), x0, ty + dp(14));
    const ay = ty + dp(14) + labelHeight(STY_ST.big) + dp(6);
    text(gr, tr(TAG_ABOUT[id] || ""), 10, 500, C["fg-soft"], x0, ay, w, Math.round(dp(18) * TEXT_SCALE));
    const shape = tr((TAG_SHAPES.find(t => t[0] === STATE.tagShape) || ["", ""])[1]);
    const colours = TAG_SEE_KIND[id] === "glass" ? tr("ITS OWN COLOURS") : tr((TAG_COLOUR_SOURCES.find(t => t[0] === STATE.tagColours) || ["", ""])[1]);
    const how = [shape, colours, tagSeesThrough(id) ? `${STATE.tagOpacity}%` : ""].filter(Boolean).join("  ·  ");
    label(gr, how, st(STY_ST.tiny, C["text-muted"]), x0, ay + Math.round(dp(26) * TEXT_SCALE));
}

// The custom scheme's editor: for light and for dark, a preview and the three colours to pick (Windows' colour
// dialog); text and accent are measured against the page (WCAG contrast; text wants 7 : 1, 4.5 at the least).
function drawCustomEditor(gr, x0, y, w, y1) {
    const sc = TOKENS.schemes.custom, u = customChoice();
    label(gr, tr("CUSTOM SCHEME"), st(STY_ST.big, C.fg), x0, y);
    y += labelHeight(STY_ST.big) + dp(6);
    text(gr, tr("Pick the page, the text and the accent; the rest follows."), 10, 500, C["fg-soft"], x0, y, w, dp(18));
    y += dp(30);
    const names = [["bg", "PAGE"], ["fg", "TEXT"], ["accent", "ACCENT"]], mh = Math.max(dp(60), Math.min(Math.round(w * .3), Math.round((y1 - y - dp(260)) / 2)));
    for (const m of ["light", "dark"]) {
        label(gr, tr(m.toUpperCase()), st(STY_ST.sec, C.fg), x0, y);
        y += dp(24);
        gr.PushClip(x0, y, w, mh);   // the mock is drawn for a card's proportions: a wide one runs past its foot
        drawMock(gr, x0, y, w, mh, sc[m]);
        gr.PopClip();
        box(gr, x0, y, w, mh, C["line-faint"]);
        y += mh + dp(10);
        const cw = Math.floor((w - dp(16)) / 3);
        names.forEach(([k, t], i) => {
            const x = x0 + i * (cw + dp(8)), h = dp(30), hov = STY.cpick === m + "|" + k;
            gr.FillSolidRect(x, y, cw, h, C.panel);
            gr.FillSolidRect(x + dp(6), y + dp(6), h - dp(12), h - dp(12), argb(u[m][k]));
            box(gr, x + dp(6), y + dp(6), h - dp(12), h - dp(12), C["line-dim"]);
            label(gr, tr(t), st(STY_ST.tiny, C["text-muted"], C.panel), x + h, y + dp(4));
            label(gr, u[m][k].toUpperCase(), st(STY_ST.tiny, C.fg, C.panel), x + h, y + dp(16));
            box(gr, x, y, cw, h, hov ? C.accent : C["line-faint"]);
            hits.add("sty-cpick", x, y, cw, h, m + "|" + k);
        });
        y += dp(38);
        const tc = contrast(sc[m].fg, sc[m].bg), ac = contrast(sc[m].accent, sc[m].bg);
        const verdict = tc >= 7 ? tr("GOOD") : tc >= 4.5 ? tr("READABLE") : tr("HARD TO READ");
        label(gr, `${tr("TEXT ON PAGE")}  ${tc.toFixed(1)} : 1  ·  ${verdict}`, st(STY_ST.tiny, tc >= 4.5 ? C["fg-soft"] : C.accent), x0, y);
        label(gr, `${tr("ACCENT ON PAGE")}  ${ac.toFixed(1)} : 1`, st(STY_ST.tiny, C["text-muted"]), x0 + Math.round(w / 2), y);
        y += dp(30);
    }
    const t = tr("RESET TO ARCHIVE COLOURS"), s = st(STY_ST.tog, C.fg), bw = labelWidth(t, s) + dp(24), bh = dp(22);
    box(gr, x0, y, bw, bh, C["line-dim"]);
    label(gr, t, s, x0 + dp(12), y + Math.round((bh - labelHeight(STY_ST.tog)) / 2));
    hits.add("sty-creset", x0, y, bw, bh);
}
// The custom case's editor: base colour, accent and pattern from the curated plastics, then MAKE (the renders are made
// again: customcase.js). The choice waits in STY.cc until it is made.
function drawCaseEditor(gr, x0, y, w, y1) {
    const cc = STY.cc || (STY.cc = customCase()), made = customCaseMade() ? customCase() : null;
    label(gr, tr("CUSTOM CASE"), st(STY_ST.big, C.fg), x0, y);
    y += labelHeight(STY_ST.big) + dp(6);
    text(gr, tr("A base colour, an accent and a pattern, in matte plastics."), 10, 500, C["fg-soft"], x0, y, w, dp(18));
    y += dp(30);
    const e = made ? skinImages({ id: "custom", dir: CC_DIR }) : { hero: null }, ph = Math.max(dp(120), Math.min(Math.round(w * .55), y1 - y - dp(250)));
    if (e.hero) {
        const k = Math.min(w / e.hero.Width, ph / e.hero.Height), dw = e.hero.Width * k, dh = e.hero.Height * k;
        gr.DrawImage(e.hero, x0 + (w - dw) / 2, y + (ph - dh) / 2, dw, dh, 0, 0, e.hero.Width, e.hero.Height);
    } else box(gr, x0, y, w, ph, C["line-faint"]);
    y += ph + dp(16);
    for (const [key, t] of [["base", "BASE"], ["accent", "ACCENT"]]) {
        label(gr, tr(t), st(STY_ST.tiny, C["text-muted"]), x0, y + dp(5));
        const n = CC_PALETTE.length, sw = Math.min(dp(22), Math.floor((w - dp(70)) / n) - dp(4));
        CC_PALETTE.forEach((c, i) => {
            const sx = x0 + dp(70) + i * (sw + dp(4));
            gr.FillSolidRect(sx, y, sw, sw, argb(c));
            box(gr, sx, y, sw, sw, cc[key] === c ? C.fg : C["line-faint"], cc[key] === c ? Math.max(HAIR, dp(2)) : HAIR);
            hits.add("sty-cc", sx, y, sw, sw, key + "|" + c);
        });
        y += sw + dp(12);
    }
    const pat = CC_PATTERNS.map(([id, t]) => [id, t]);
    segToggle(gr, x0 + dp(70) + CC_PATTERNS.reduce((n, [, t]) => n + dp(18) + labelWidth(tr(t), st(GRID_ST.count, 0)), 0) + dp(12) + labelWidth(tr("PATTERN"), st(GRID_ST.count, 0)) - dp(70), y, "PATTERN", pat, cc.pattern, "sty-ccpat");
    y += dp(40);
    const same = made && made.base === cc.base && made.accent === cc.accent && made.pattern === cc.pattern;
    const t = STY.making ? tr("MAKING THE CASE …  {0} / {1}", STY.making[0], STY.making[1]) : tr(same ? "IN USE" : "MAKE THIS CASE");
    const s = st(STY_ST.tog, same || STY.making ? C["text-muted"] : C.bg, same || STY.making ? C.bg : C.fg), bw = labelWidth(t, s) + dp(24), bh = dp(24);
    if (!same && !STY.making) gr.FillSolidRect(x0, y, bw, bh, C.fg);
    box(gr, x0, y, bw, bh, C["line-dim"]);
    label(gr, t, s, x0 + dp(12), y + Math.round((bh - labelHeight(STY_ST.tog)) / 2));
    if (!same && !STY.making) hits.add("sty-ccmake", x0, y, bw, bh);
}
// makes the custom case from the editor's choice, then uses it (or loads it again where it is in use)
function makeCase() {
    const cc = Object.assign({}, STY.cc || customCase());
    const ok = makeCustomCase(cc, (i, n) => { STY.making = [i, n]; window.Repaint(); }, done => {
        STY.making = null;
        if (done) {
            setSetting("customCase", cc, true);
            listSkins(true);
            STY.img.delete("custom");
            if (STATE.skin === "custom") { reloadSkin("custom"); send("skin-reload", "custom"); }
            else send("skin", "custom");
        }
        window.Repaint();
    });
    if (ok) { STY.making = [0, 1]; STY.edit = "case"; window.Repaint(); }
}

// a new custom colour: saved, worked out here and in every other panel (lib/bus.js), imported by frame.js
function setCustom(u) {
    setSetting("customScheme", u, true);
    TOKENS.schemes.custom = customScheme(TOKENS);
    send("custom-scheme");
    window.Repaint();
}

// ------------------------------------------------------------------------------------------------------- input
function styleMouseMove(a) {
    const wh = !a ? null : a.id === "sty-wp-pick" || a.id === "sty-wp-off" || a.id === "sty-wp-open" ? a.id.slice(7) : a.id === "sty-wp-builtin" ? "bi:" + a.data : null;
    if (wh !== (STY.wpHover || null)) { STY.wpHover = wh; window.Repaint(); }
    const cp = a && a.id === "sty-cpick" ? a.data : null;
    if (cp !== (STY.cpick || null)) { STY.cpick = cp; window.Repaint(); }
    // SIZE: −1 / +1 its buttons, 0 its field (the wheel steps it while the mouse is over any of them)
    const sz = a && a.id === "sty-size" ? a.data : a && a.id === "sty-size-field" ? 0 : null;
    if (sz !== (STY.sizeHover === undefined ? null : STY.sizeHover)) { STY.sizeHover = sz; window.Repaint(); }
    const h = a && (a.id === "sty-skin" || a.id === "sty-scheme" || a.id === "sty-tagcard" && a.data !== "off") ? { kind: { "sty-skin": "skin", "sty-scheme": "scheme", "sty-tagcard": "tag" }[a.id], id: a.data }
        : a && a.id === "sty-intro" ? { kind: "intro", id: "" } : null;
    const o = STY.hover;
    if ((h && (!o || o.kind !== h.kind || o.id !== h.id)) || (!h && o)) { STY.hover = h; window.Repaint(); }
}
function styleClick(a) {
    // a click anywhere but in the size field ends its editing (the number is applied)
    if (STY.sizeEdit && !(a && a.id === "sty-size-field")) sizeEditEnd(true);
    if (!a) return;
    if (a.id === "sty-size") { stepTextSize(a.data); return; }
    if (a.id === "sty-glass") { setFrost(a.data === "frost"); return; }
    if (a.id === "sty-skin" && a.data === "custom") {
        STY.edit = "case";
        if (!customCaseMade()) makeCase();
        else if (STATE.skin !== "custom") send("skin", "custom");
        window.Repaint();
    }
    else if (a.id === "sty-wp-open") { STY.edit = STY.edit === "wallpaper" ? null : "wallpaper"; window.Repaint(); }
    else if (a.id === "sty-skin" && a.data !== STATE.skin) { if (STY.edit === "wallpaper") STY.edit = null; send("skin", a.data); }
    else if (a.id === "sty-scheme" && a.data === "custom") { STY.edit = "scheme"; if (SCHEME !== "custom") send("scheme", "custom"); window.Repaint(); }
    else if (a.id === "sty-scheme" && a.data !== SCHEME) { if (STY.edit === "wallpaper") STY.edit = null; send("scheme", a.data); }
    else if (a.id === "sty-cc") { const [k, c] = a.data.split("|"); STY.cc = Object.assign({}, STY.cc || customCase(), { [k]: c }); window.Repaint(); }
    else if (a.id === "sty-ccpat") { STY.cc = Object.assign({}, STY.cc || customCase(), { pattern: a.data }); window.Repaint(); }
    else if (a.id === "sty-ccmake") makeCase();
    else if (a.id === "sty-mode" && (a.data === "system" ? !STATE.modeSystem : STATE.modeSystem || a.data !== MODE)) send("mode-to", a.data);
    else if (a.id === "sty-window" && (a.data === "borderless") !== STATE.borderless) send("borderless", a.data === "borderless");
    else if (a.id === "sty-intro") send("boot-play");
    else if (a.id === "sty-text" && a.data !== STATE.textScale) send("text-scale", a.data);
    else if (a.id === "sty-array" && a.data !== STATE.arrayScale) send("array-scale", a.data);
    else if (a.id === "sty-inspect" && a.data !== STATE.inspectScale) send("inspect-scale", a.data);
    else if (a.id === "sty-floor" && a.data !== STATE.floor) send("floor", a.data);
    else if (a.id === "sty-ht" && a.data !== STATE.halftone) send("halftone", a.data);
    else if (a.id === "sty-htl" && a.data !== STATE.halftoneLevel) send("halftone-level", a.data);
    else if (a.id === "sty-emblem" && a.data !== STATE.emblem) send("emblem", a.data);
    else if (a.id === "sty-tag" && a.data !== STATE.tag) send("tag", a.data);
    else if (a.id === "sty-tagshape" && a.data !== STATE.tagShape) send("tag-shape", a.data);
    else if (a.id === "sty-tagcol" && a.data !== STATE.tagColours) send("tag-colours", a.data);
    else if (a.id === "sty-tagop" && a.data !== STATE.tagOpacity) send("tag-opacity", a.data);
    else if (a.id === "sty-tagbody" && a.data !== STATE.tagBody) send("tag-body", a.data);
    else if (a.id === "sty-tagcard" && a.data !== STATE.tag) send("tag", a.data);
    else if (a.id === "sty-font" && a.data !== STATE.font) send("font", a.data);
    else if (a.id === "sty-tagc") {
        const cols = tagCustom().slice(), c = utils.ColourPicker(window.ID, tagArgb(cols[a.data]));
        if (typeof c === "number" && c !== -1) { cols[a.data] = "#" + (c & 0xFFFFFF).toString(16).padStart(6, "0"); send("tag-custom", cols); }
    }
    else if (a.id === "sty-hearth") send("scheme", "hearth");
    else if (a.id === "sty-cpick") {
        const [m, k] = a.data.split("|"), u = customChoice(), c = utils.ColourPicker(window.ID, argb(u[m][k]));
        if (typeof c !== "number" || c === -1) return;
        const hex = "#" + (c & 0xFFFFFF).toString(16).padStart(6, "0");
        if (hex === u[m][k]) return;
        u[m][k] = hex;
        setCustom(u);
    }
    else if (a.id === "sty-creset") setCustom(JSON.parse(JSON.stringify(CUSTOM_START)));
    else if (a.id === "sty-wp-pick") {
        const b = STATE.wallpaper || WP_START, dir = b.path ? b.path.slice(0, b.path.lastIndexOf("\\") + 1) : "";
        let p = "";
        try { p = utils.FilePicker(tr("Choose a picture"), dir, "Pictures (*.jpg;*.jpeg;*.png;*.bmp;*.webp)|*.jpg;*.jpeg;*.png;*.bmp;*.webp|All files (*.*)|*.*", 0, window.ID); }
        catch (e) { return; }
        if (p) { delete WP.failed[p]; send("wallpaper", { path: p, views: b.views.length ? b.views : WP_START.views }); }
    }
    else if (a.id === "sty-wp-builtin") {
        const b = STATE.wallpaper || WP_START, p = "theme:" + a.data;
        if (p !== b.path) { delete WP.failed[p]; send("wallpaper", { path: p, views: b.views.length ? b.views : WP_START.views }); }
    }
    else if (a.id === "sty-wp-off") send("wallpaper", { path: "" });
    else if (a.id === "sty-wp-view") {
        const v = (STATE.wallpaper || WP_START).views;
        send("wallpaper", { views: v.includes(a.data) ? v.filter(k => k !== a.data) : v.concat([a.data]) });
    }
    else if (a.id === "sty-wp-look") send("wallpaper", { look: a.data });
    else if (a.id === "sty-wp-veil") send("wallpaper", { veil: a.data });
}
