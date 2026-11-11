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

// Mixed scripts. A string with CJK in it is not drawn in the CJK font as a whole: Latin letters and figures keep the
// interface font, the CJK glyphs take theirs (tokens.js: font(.., cjk)), and both sit on the Latin baseline.
const BASELINE = new Map();     // font key -> the baseline's row inside the font's line box
const GLYPH_RUNS = new Map();      // tracked labels: key -> { items, w, h }
const RUNS = new Map();         // plain text: key -> { runs, total }
const scratch = () => SCRATCH || (SCRATCH = d2d.CreateImage(1, 1));
const hasCJK = s => isCJK(s) || isHangul(s);
const SOFT = /[“”‘’—…]/;                       // punctuation both scripts own: it follows its neighbour
const JOINT = /[\s·\/\-–—:：，。、；！？（）()\[\]「」『』《》“”‘’…,.;!?%]/;   // no extra space beside these

// the row under the feet of "H", found by drawing it once (Direct2D gives a font's height, not its ascent)
function baseOf(f) {
    const key = f.Name + "/" + f.Size + "/" + f.Weight;
    let b = BASELINE.get(key);
    if (b !== undefined) return b;
    b = Math.round(f.Height * .78);
    try {
        const w = Math.ceil(f.Size * 2) + 2, h = Math.ceil(f.Height) + 4, img = d2d.CreateImage(w, h), g = img.GetGraphics();
        g.FillSolidRect(0, 0, w, h, 0xff000000);
        g.DrawText("H", f, 0xffffffff, 0, 0, w, h, DT_GLYPH);
        img.ReleaseGraphics(g);
        const d = img.GetPixelData();
        scan: for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 1] > 128) { b = y + 1; break scan; }
    } catch (e) {}
    BASELINE.set(key, b);
    return b;
}

// true for each character of str that takes the CJK font
function cjkMap(str) {
    const chars = [...str], out = chars.map(ch => hasCJK(ch));
    for (let i = 0; i < chars.length; i++) {
        if (!SOFT.test(chars[i])) continue;
        let j = i - 1; while (j >= 0 && chars[j] === " ") j--;
        if (j >= 0) { out[i] = out[j]; continue; }
        j = i + 1; while (j < chars.length && (chars[j] === " " || SOFT.test(chars[j]))) j++;
        if (j < chars.length) out[i] = hasCJK(chars[j]);
    }
    return out;
}

// where each glyph of a tracked label goes: { items: [{ ch, f, x, dy, a }], w, h }
function glyphRun(str, st) {
    const size = stSize(st), weight = st.weight || 400, track = st.track || 0, key = `${str}|${size * TEXT_SCALE}|${weight}|${track}`;
    let L = GLYPH_RUNS.get(key);
    if (L) return L;
    const lf = font(size, weight), em = dp(size * TEXT_SCALE), gap = track * em, mixed = hasCJK(str);
    const cf = mixed ? font(size, weight, isHangul(str) ? "ko" : true) : lf, dy = mixed ? baseOf(lf) - baseOf(cf) : 0;
    const chars = [...str], map = mixed ? cjkMap(str) : null, sg = scratch().GetGraphics(), items = [];
    let cx = 0, end = 0, h = Math.ceil(lf.Height);
    for (let i = 0; i < chars.length; i++) {
        const ch = chars[i], c = mixed && map[i], f = c ? cf : lf, a = advances(sg, ch, f)[0];
        // a thin space where the scripts meet
        if (i && mixed && map[i - 1] !== c && !JOINT.test(ch) && !JOINT.test(chars[i - 1])) cx += em * .12;
        items.push({ ch, f, x: cx, dy: c ? dy : 0, a });
        end = cx + a;
        cx = end + (c ? gap * .5 : gap);
        if (c) h = Math.max(h, dy + Math.ceil(cf.Height));
    }
    SCRATCH.ReleaseGraphics(sg);
    L = { items, w: end, h };
    if (GLYPH_RUNS.size >= 800) GLYPH_RUNS.clear();
    GLYPH_RUNS.set(key, L);
    return L;
}

// label(gr, "SIGNAL SECTION", { size: 10, weight: 600, track: .16, colour: C.fg, bg: C.bg }, x, y, align)
// Draws a letter-spaced single line whose box top is y; align 0 left, 1 centre, 2 right (x is that edge).
// `track` is in em, as in the spec (.14em = 0.14 × font size). Returns the drawn width in px.
// LABEL_LIVE: over a picture (the wallpaper, lib/wallpaper.js), labels are drawn live instead (trackedText)
let LABEL_LIVE = false;
function label(gr, str, st, x, y, align = 0) {
    if (LABEL_LIVE) return Math.round(trackedText(gr, str, st, x, y, align));
    const L = labelBitmap(str, st);
    if (!L) return 0;
    const lx = Math.round(align === 1 ? x - L.w / 2 : align === 2 ? x - L.w : x);
    gr.DrawImage(L.img, lx, Math.round(y), L.w, L.h, 0, 0, L.w, L.h);
    return L.w;
}

function labelWidth(str, st) { const L = labelBitmap(str, st); return L ? L.w : 0; }
function labelHeight(st) { return Math.ceil(font(stSize(st), st.weight || 400).Height); }
// st.fixed: a label that keeps its designed size whatever the text size (the header's wordmark)
const stSize = st => st.fixed ? st.size / TEXT_SCALE : st.size;

function labelBitmap(str, st) {
    str = String(str);
    if (!str) return null;
    const weight = st.weight || 400, track = st.track || 0, colour = st.colour, bg = st.bg;
    const size = stSize(st), key = `${str}|${size * TEXT_SCALE}|${weight}|${track}|${colour}|${bg}`;
    let L = TEXT_CACHE.get(key);
    if (L) return L;
    const Y = glyphRun(str, st), w = Math.max(1, Math.ceil(Y.w)), h = Y.h;
    const img = d2d.CreateImage(w, h), g = img.GetGraphics();
    g.FillSolidRect(0, 0, w, h, bg);
    for (const it of Y.items) if (it.ch !== " ") g.DrawText(it.ch, it.f, colour, it.x, it.dy, it.a + dp(4), Math.ceil(it.f.Height), DT_GLYPH);
    img.ReleaseGraphics(g);
    L = { img, w, h };
    if (TEXT_CACHE.size >= 600) { let n = 150; for (const k of TEXT_CACHE.keys()) { TEXT_CACHE.delete(k); if (--n === 0) break; } }
    TEXT_CACHE.set(key, L);
    return L;
}

// Plain text (no tracking): one line, vertically centred in [y, y + h], with an ellipsis when it does not fit.
function text(gr, str, sizeDp, weight, colour, x, y, w, h, align = 0) {
    str = String(str);
    const flags = (align === 1 ? DT_CENTER_SINGLE : align === 2 ? DT_RIGHT_SINGLE : DT_SINGLE) | DT_ELLIPSIS;
    if (!hasCJK(str)) { gr.DrawText(str, font(sizeDp, weight), colour, x, y, w, h, flags); return; }
    const R = runsOf(gr, str, sizeDp, weight, w);
    // one script only: one call, moved so its baseline is where the interface font's would be
    if (R.runs.length === 1 && !R.cut) { gr.DrawText(str, R.runs[0].f, colour, x, y + R.runs[0].dy, w, h, flags); return; }
    let rx = align === 1 ? x + (w - R.total) / 2 : align === 2 ? x + w - R.total : x;
    for (const r of R.runs) {
        gr.DrawText(r.s, r.f, colour, Math.round(rx + r.lead), y + r.dy, Math.ceil(r.w) + dp(4), h, DT_SINGLE);
        rx += r.lead + r.w;
    }
}

// str as runs of one font each, cut with an ellipsis to fit w: { runs: [{ s, f, w, dy, lead }], total, cut }
function runsOf(gr, str, sizeDp, weight, w) {
    const base = `${str}|${sizeDp * TEXT_SCALE}|${weight}`;
    let R = RUNS.get(base);
    if (!R) {
        const lf = font(sizeDp, weight), cf = font(sizeDp, weight, isHangul(str) ? "ko" : true), em = dp(sizeDp * TEXT_SCALE);
        // DT_VCENTER centres each font's own line box: this much brings the CJK baseline onto the Latin one
        const dy = Math.round((cf.Height - lf.Height) / 2 + baseOf(lf) - baseOf(cf));
        const chars = [...str], map = cjkMap(str), runs = [];
        for (let i = 0; i < chars.length; i++) {
            const last = runs[runs.length - 1];
            if (last && last.c === map[i]) { last.s += chars[i]; continue; }
            runs.push({ s: chars[i], c: map[i], f: map[i] ? cf : lf, dy: map[i] ? dy : 0, lead: i && !JOINT.test(chars[i]) && !JOINT.test(chars[i - 1]) ? em * .12 : 0 });
        }
        let total = 0;
        for (const r of runs) { r.w = gr.CalcTextWidth(r.s, r.f, true); total += r.lead + r.w; }
        R = { runs, total, cut: false };
        if (RUNS.size >= 1500) RUNS.clear();
        RUNS.set(base, R);
    }
    if (R.total <= w) return R;
    const key = base + "|" + Math.round(w);
    let T = RUNS.get(key);
    if (T) return T;
    const runs = [];
    let used = 0;
    for (const r of R.runs) {
        const ell = gr.CalcTextWidth("…", r.f, true);
        if (used + r.lead + r.w + ell <= w && r !== R.runs[R.runs.length - 1]) { runs.push(r); used += r.lead + r.w; continue; }
        // this run is the one that does not fit: keep what does, then the ellipsis
        const adv = advances(gr, r.s, r.f), chars = [...r.s];
        let n = 0, cw = 0;
        while (n < chars.length && used + r.lead + cw + adv[n] + ell <= w) cw += adv[n++];
        const s2 = chars.slice(0, n).join("").trimEnd() + "…";
        if (n || !runs.length) { const w2 = gr.CalcTextWidth(s2, r.f, true); runs.push({ s: s2, f: r.f, dy: r.dy, lead: r.lead, w: w2 }); used += r.lead + w2; }
        else { const p = runs[runs.length - 1], s3 = p.s.trimEnd() + "…", w3 = gr.CalcTextWidth(s3, p.f, true); used += w3 - p.w; runs[runs.length - 1] = { s: s3, f: p.f, dy: p.dy, lead: p.lead, w: w3 }; }
        break;
    }
    T = { runs, total: used, cut: true };
    RUNS.set(key, T);
    return T;
}

// Letter-spaced text drawn live, glyph by glyph, for text over pictures (a cached label carries its opaque background).
// st as for label() (bg unused); box top at y, align 0 left / 1 centre / 2 right. Returns the width in px.
function trackedText(gr, str, st, x, y, align = 0) {
    str = String(str);
    const Y = glyphRun(str, st), w = Y.w, x0 = align === 1 ? x - w / 2 : align === 2 ? x - w : x;
    for (const it of Y.items) if (it.ch !== " ") gr.DrawText(it.ch, it.f, st.colour, Math.round(x0 + it.x), Math.round(y) + it.dy, it.a + dp(4), Math.ceil(it.f.Height), DT_GLYPH);
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
