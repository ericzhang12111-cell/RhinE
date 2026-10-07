"use strict";
// Text: letter-spaced labels and plain single-line text.
//
// Direct2D's DrawText has no letter spacing, so tracked labels are drawn glyph by glyph into a bitmap once and then
// drawn as an image (Phase 0: ≈ 10 µs per glyph live vs a few µs per cached label). DrawText needs an opaque
// background for ClearType, so each cached label is rendered on the colour it will sit on (`bg`); the cache is keyed by
// text, font, tracking and both colours, and emptied when the colours change.

const TEXT_CACHE = new Map();   // key -> { img, w, h }
const ADVANCE = new Map();      // font key + glyph -> advance in px
// entries are keyed by colour, so both modes' labels can stay cached: switching back and forth renders nothing new

const DT_GLYPH = 0x00000800 | 0x00000020;   // DT_NOPREFIX | DT_SINGLELINE
let SCRATCH = null;                          // 1 × 1 bitmap whose graphics measure glyphs

// advance widths of each glyph of str, measured with any D2DGraphics (glyph widths are cached per font)
function advances(g, str, f) {
    const key = f.Name + "/" + f.Size + "/" + f.Weight + "/";
    return [...str].map(ch => {
        let w = ADVANCE.get(key + ch);
        if (w === undefined) { w = g.CalcTextWidth(ch, f, true); ADVANCE.set(key + ch, w); }
        return w;
    });
}

// label(gr, "SIGNAL SECTION", { size: 10, weight: 600, track: .16, colour: C.fg, bg: C.bg }, x, y, align)
// Draws a letter-spaced single line whose box top is y; align 0 left, 1 centre, 2 right (x is that edge).
// `track` is in em, as in the spec (.14em = 0.14 × font size). Returns the drawn width in px.
function label(gr, str, st, x, y, align = 0) {
    const L = labelBitmap(str, st);
    if (!L) return 0;
    const lx = Math.round(align === 1 ? x - L.w / 2 : align === 2 ? x - L.w : x);
    gr.DrawImage(L.img, lx, Math.round(y), L.w, L.h, 0, 0, L.w, L.h);
    return L.w;
}

function labelWidth(str, st) { const L = labelBitmap(str, st); return L ? L.w : 0; }
function labelHeight(st) { return Math.ceil(font(st.size, st.weight || 400).Height); }

function labelBitmap(str, st) {
    str = String(str);
    if (!str) return null;
    const weight = st.weight || 400, track = st.track || 0, colour = st.colour, bg = st.bg;
    const key = `${str}|${st.size}|${weight}|${track}|${colour}|${bg}`;
    let L = TEXT_CACHE.get(key);
    if (L) return L;
    const f = fontFor(str, st.size, weight), gap = track * dp(st.size);
    const h = Math.ceil(f.Height);
    // measure on the scratch bitmap, then render
    if (!SCRATCH) SCRATCH = d2d.CreateImage(1, 1);
    const sg = SCRATCH.GetGraphics(), adv = advances(sg, str, f);
    SCRATCH.ReleaseGraphics(sg);
    const w = Math.max(1, Math.ceil(adv.reduce((a, b) => a + b, 0) + gap * (adv.length - 1)));
    const img = d2d.CreateImage(w, h), g = img.GetGraphics();
    g.FillSolidRect(0, 0, w, h, bg);
    let cx = 0, i = 0;
    for (const ch of str) {
        if (ch !== " ") g.DrawText(ch, f, colour, cx, 0, adv[i] + dp(4), h, DT_GLYPH);
        cx += adv[i++] + gap;
    }
    img.ReleaseGraphics(g);
    L = { img, w, h };
    if (TEXT_CACHE.size >= 600) { let n = 150; for (const k of TEXT_CACHE.keys()) { TEXT_CACHE.delete(k); if (--n === 0) break; } }
    TEXT_CACHE.set(key, L);
    return L;
}

// Plain text (no tracking): one line, vertically centred in [y, y + h], with an ellipsis when it does not fit.
function text(gr, str, sizeDp, weight, colour, x, y, w, h, align = 0) {
    const flags = (align === 1 ? DT_CENTER_SINGLE : align === 2 ? DT_RIGHT_SINGLE : DT_SINGLE) | DT_ELLIPSIS;
    gr.DrawText(String(str), fontFor(String(str), sizeDp, weight), colour, x, y, w, h, flags);
}

// Letter-spaced text drawn live, glyph by glyph, for text over pictures (a cached label carries its opaque background).
// st as for label() (bg unused); box top at y, align 0 left / 1 centre / 2 right. Returns the width in px.
function trackedText(gr, str, st, x, y, align = 0) {
    str = String(str);
    const f = fontFor(str, st.size, st.weight || 400), gap = (st.track || 0) * dp(st.size), adv = advances(gr, str, f);
    const w = adv.reduce((a, b) => a + b, 0) + gap * Math.max(0, adv.length - 1), h = Math.ceil(f.Height);
    let cx = align === 1 ? x - w / 2 : align === 2 ? x - w : x, i = 0;
    for (const ch of str) {
        if (ch !== " ") gr.DrawText(ch, f, st.colour, Math.round(cx), Math.round(y), adv[i] + dp(4), h, DT_GLYPH);
        cx += adv[i++] + gap;
    }
    return w;
}

// the longest prefix of str (plus "…") whose tracked label fits in maxW px
function fitLabel(str, st, maxW) {
    str = String(str);
    if (labelWidth(str, st) <= maxW) return str;
    let lo = 0, hi = str.length;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (labelWidth(str.slice(0, m).trimEnd() + "…", st) <= maxW) lo = m; else hi = m - 1; }
    return str.slice(0, lo).trimEnd() + "…";
}
