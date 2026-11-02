"use strict";
// The title tag (05 STYLE › TITLE TAG): the song's title printed on a rendered tag instead of plain text, on the signal
// profile card and the album file. A tag has three bands (a pale top band, the body, an accent band along the bottom)
// whose colours come from the colour scheme (paper, ink, accent), from the case skin, or the user's three own.
//
// assets/tags/<shape>/ (shapes TAB, NOTCHED, ROUNDED, TICKET; made with the private studio's title tag generator and
// art/build_tag.py) holds, per finish, the plate rendered in white: <finish>-shade.png (multiplied by each band's
// colour) and <finish>-gloss.png (its reflections, white with alpha, drawn over); the TIDE and AURORA glass keep their
// own colours. The see-through finishes show the panel through them (a dot grid on it, so there is something to see):
// TRANSPARENT (clear acrylic: clear-shade.png is its edges and glare, clear-mask.png its outline) with the band colours
// as a tint, TRANSLUCENT (the grid blurred) and the TIDE and AURORA glass (their colours over the grid); how much the
// colours cover is 05 STYLE › TAG OPACITY. The solid finishes can have a see-through middle band (TAG BODY). Then the
// print, white per band (print-top/-body/-bottom.png, inked dark or light to read on its band), the colour bars
// (print-static.png) and the eyelet (eyelet.png). tags.json says where the bands end and where the title and the small
// print go. The plate is put together once per shape, finish, colours, width and page; the title is set live, so it can
// scramble in.
//
// FACTORY: tags rendered whole in real materials and their own colours (kraft card, enamelled steel, anodised
// aluminium, leather …; made with the private .dev/tags3 tools from scanned materials). tags/factory.json lists them, with
// the colour schemes and case skins each is suggested for; per shape, factory/<id>.jpg is the plate without the title,
// <id>-a.png its outline and shadow (alpha) and <id>-ink.jpg the same tag marked all over the way its print is (etched,
// stamped, printed): the title and the small print are drawn with that as their brush, so the letters are cut from it.

const TAG_DIR = THEME_ROOT + "assets\\tags\\";
const TAG = { specs: {}, src: new Map(), plates: new Map() };
const TAG_SHAPES = [["tab", "TAB"], ["notch", "NOTCHED"], ["round", "ROUNDED"], ["ticket", "TICKET"]];
const TAG_COLOUR_SOURCES = [["scheme", "SCHEME"], ["case", "CASE"], ["custom", "CUSTOM"]];
// the case skins' colours as [top, body, bottom]: their light parts, their body, their tab or trim
const TAG_CASE = {
    white: ["#f7f7f5", "#d9d9d5", "#8f908b"], blackout: ["#2c2d30", "#121314", "#ff7a01"], blue: ["#eef3fb", "#0e2a6c", "#4f8ff0"],
    coral: ["#f7f3ef", "#ff6f55", "#f7f3ef"], frost: ["#f4f6f8", "#c3ced8", "#a596c8"], glass: ["#f2f6f4", "#2e3b36", "#38d07f"],
    hazard: ["#efeee8", "#18181a", "#ffb300"], marble: ["#f2f0ea", "#2b2a28", "#ff7a01"], red: ["#f2f0ea", "#b81d18", "#f2f0ea"],
    tide: ["#eef3fb", "#2a5fe6", "#8fd8f2"], aurora: ["#f4f0e4", "#a9a6ea", "#e8e2fb"],
};
const TAG_CUSTOM_START = ["#f1efe8", "#2b3240", "#e2722b"];
// how much of the page the colours of the see-through parts cover (05 STYLE › TAG OPACITY), in per cent
const TAG_OPACITIES = [[25, "25%"], [50, "50%"], [75, "75%"]];
// how a finish shows the page: "clear" (sharp, a little bent), "frosted" (blurred), "glass" (Tide and Aurora: their
// colours over it, sharp); the others are solid
const TAG_SEE_KIND = { clear: "clear", frosted: "frosted", tide: "glass", aurora: "glass" };
// the middle band of a solid finish (05 STYLE › TAG BODY): solid, or see-through like the translucent or clear plate
const TAG_BODIES = [["solid", "SOLID"], ["frosted", "TRANSLUCENT"], ["clear", "TRANSPARENT"]];
const tagBodyKind = fin => !TAG_SEE_KIND[fin] && !tagFactoryFin(fin) && ["frosted", "clear"].includes(STATE.tagBody) ? STATE.tagBody : null;
// whether a finish shows the page anywhere (the TAG OPACITY row is offered then)
const tagSeesThrough = (fin = STATE.tag) => fin !== "off" && !!(TAG_SEE_KIND[fin] || tagBodyKind(fin));
const TAG_WHITE = .8;   // the plate's white in its renders (each finish records its own, F.white): a colour c is c / white
const isHex = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const tagCustom = () => { const c = STATE.tagCustom; return Array.isArray(c) && c.length === 3 && c.every(isHex) ? c : TAG_CUSTOM_START; };

const TAG_FACTORY = (() => { try { return JSON.parse(utils.ReadTextFile(TAG_DIR + "factory.json", 65001)).tags || []; } catch (e) { return []; } })();
const pickTagFactory = v => TAG_FACTORY.some(t => t.id === v) ? v : null;
// suggested for the colour scheme or the case skin in use
const tagFactorySuggested = t => (t.schemes || []).includes(SCHEME) || (t.skins || []).includes(stageSkin());
// the factory tag in use: the one picked, else the first suggested for the scheme, else for the skin, else the first
function tagFactoryId() {
    if (pickTagFactory(STATE.tagFactory)) return STATE.tagFactory;
    const t = TAG_FACTORY.find(f => (f.schemes || []).includes(SCHEME)) || TAG_FACTORY.find(f => (f.skins || []).includes(stageSkin())) || TAG_FACTORY[0];
    return t ? t.id : null;
}
const tagFactoryOf = id => TAG_FACTORY.find(t => t.id === id) || null;
// a finish id as drawTag takes it: "factory" is the one in use, "factory:<id>" a given one (the Style view's picker)
const tagFactoryFin = fin => fin === "factory" ? tagFactoryId() : String(fin).startsWith("factory:") ? fin.slice(8) : null;

function tagSpec(shape = STATE.tagShape) {
    if (!(shape in TAG.specs)) {
        try { TAG.specs[shape] = JSON.parse(utils.ReadTextFile(TAG_DIR + shape + "\\tags.json", 65001)); } catch (e) { TAG.specs[shape] = null; }
    }
    return TAG.specs[shape];
}
// a finish (the one in use by default) with its shape's layout, or null (off, or not rendered)
function tagFinish(fin = STATE.tag) {
    const fid = tagFactoryFin(fin), S = tagSpec();
    if (fid) {
        const t = tagFactoryOf(fid), base = TAG_DIR + STATE.tagShape + "\\factory\\" + fid;
        return t && S && utils.IsFile(base + ".jpg") ? { S, F: { factory: t, base }, fin } : null;
    }
    const F = fin !== "off" && S && S.finishes && S.finishes[fin];
    return F && F.shade && utils.IsFile(TAG_DIR + STATE.tagShape + "\\" + F.shade) ? { S, F, fin } : null;
}
// the tag's height at width w px (0 when no tag is shown)
function tagHeight(w, fin) { const t = tagFinish(fin); return t ? Math.round(w * t.S.canvas.tag[3] / t.S.canvas.tag[2]) : 0; }

// the bands' colours [top, body, bottom] as #rrggbb
function tagColours(F) {
    if (F.fixed && F.bands) return F.bands;
    if (STATE.tagColours === "custom") return tagCustom();
    if (STATE.tagColours === "case") {
        const skin = stageSkin();
        if (skin === "custom") { const c = getSetting("customCase", null) || {}; return [TAG_CUSTOM_START[0], isHex(c.base) ? c.base : TAG_CUSTOM_START[1], isHex(c.accent) ? c.accent : TAG_CUSTOM_START[2]]; }
        if (TAG_CASE[skin]) return TAG_CASE[skin];
    }
    // the scheme: its light page as paper, its dark page as ink, its accent
    const sc = TOKENS.schemes[SCHEME] || TOKENS.schemes.archive;
    return [sc.light.bg, sc.dark.bg, sc.dark.accent];
}
const tagLum = h => { const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
const tagInk = h => tagLum(h) > .5 ? "#1b1c18" : "#f2f1ec";
const tagArgb = h => (0xFF000000 | parseInt(h.slice(1, 7), 16)) >>> 0;

function tagImage(file) {
    if (!file) return null;
    if (!TAG.src.has(file)) { let img = null; try { if (utils.IsFile(TAG_DIR + file)) img = d2d.Image(TAG_DIR + file); } catch (e) { img = null; } TAG.src.set(file, img); }
    return TAG.src.get(file);
}
// an image multiplied by a colour (#rrggbb, times k) and its alpha by a, as an effect to draw
function tagTint(img, hex, k = 1, a = 1) {
    const fx = d2d.Effect("{921F03D6-641C-47DF-852D-B4BB6153AE11}"), c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255 * k);
    fx.SetValue(0, new Float32Array([c[0], 0, 0, 0, 0, c[1], 0, 0, 0, 0, c[2], 0, 0, 0, 0, a, 0, 0, 0, 0]));
    fx.SetInput(0, img);
    return fx;
}

// #rrggbb of a mixed with b by t
const tagMix = (a, b, t) => "#" + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");
const tagHex = c => "#" + (c & 0xFFFFFF).toString(16).padStart(6, "0");
// The see-through finishes need something behind them to look see-through: a fine dot grid on the panel round and
// under the tag, fading out towards the edges of the plate's margin (fade false: everywhere at full strength). Under
// the clear acrylic it shows nudged down a little (the sheet's thickness bends it), under the translucent plate blurred.
function tagDots(g, iw, ih, ox, oy, tw, th, colour, dy = 0, fade = true) {
    const p = dp(7), r = Math.max(.6, dp(.85)), a0 = (colour >>> 24) / 255;
    for (let y = p / 2; y < ih; y += p) for (let x = p / 2; x < iw; x += p) {
        const fx = fade ? Math.max(0, Math.max(ox - x, x - (ox + tw)) / ox) : 0, fy = fade ? Math.max(0, Math.max(oy - y, y - (oy + th)) / oy) : 0;
        const a = 1 - Math.min(1, Math.hypot(fx, fy));
        if (a > .02) g.FillEllipse(x - r, y + dy - r, 2 * r, 2 * r, withAlpha(colour, a0 * a));
    }
}
// the blank tag for a tag w px wide, with the margin round it (the shadow), on a panel of colour bg: each band in its
// colour (or, where it is see-through, the panel and its dot grid seen through it), the reflections, the print inked
// for its band, the colour bars and the eyelet. Kept per shape, finish, colours, width, page, opacity and body.
// A factory tag's plate: its render with its alpha laid on, and the inked render at the same size as a bitmap brush
// for the title and the small print. Each image is read for the plate and let go (only the plates are kept).
function tagFactoryPlate(S, F, w) {
    const t = F.factory, key = `${STATE.tagShape}|factory:${t.id}|${w}`;
    let P = TAG.plates.get(key);
    if (P) return P;
    const k = w / S.canvas.tag[2], iw = Math.max(1, Math.round(S.canvas.w * k)), ih = Math.max(1, Math.round(S.canvas.h * k));
    const load = f => { try { return utils.IsFile(f) ? d2d.Image(f).Resize(iw, ih, 7) : null; } catch (e) { return null; } };   // HighQualityBicubic
    const plate = load(F.base + ".jpg"), alpha = load(F.base + "-a.png"), ink = load(F.base + "-ink.jpg");
    const img = d2d.CreateImage(iw, ih), g = img.GetGraphics();
    try {
        if (plate && alpha) {
            const am = d2d.Effect("{C80ECFF0-3FD5-4F05-8328-C5D1724B4F0A}");   // AlphaMask
            am.SetInput(0, plate);
            am.SetInput(1, alpha);
            g.DrawEffect(am, 0, 0, 0, 0, iw, ih);
        }
    } finally { img.ReleaseGraphics(g); }
    const inks = [t.ink, t.ink, t.ink];
    P = { img, ox: S.canvas.tag[0] * k, oy: S.canvas.tag[1] * k, k, cols: inks, inks, see: false, factory: t,
          brush: ink ? d2d.Brush(3, ink, 4) : null };   // BrushType.Bitmap, BrushWrapMode.Clamp
    if (TAG.plates.size >= 40) TAG.plates.clear();
    TAG.plates.set(key, P);
    return P;
}

function tagPlate(S, fin, w, bg) {
    const F = S.finishes[fin], kind = TAG_SEE_KIND[fin] || null, body = tagBodyKind(fin), op = (STATE.tagOpacity || 50) / 100;
    const cols = tagColours(F), k = w / S.canvas.tag[2], page = tagHex(bg);
    // the bands that show the page, and what each band looks like there (the page with its colour by the opacity),
    // which its print and the title are inked for
    const seeRows = kind ? [0, 1, 2] : body ? [1] : [], seeKind = kind || body;
    const seen = cols.map((c, b) => seeRows.includes(b) ? tagMix(page, c, op) : c), inks = seen.map(tagInk);
    const key = `${STATE.tagShape}|${fin}|${cols.join()}|${w}|${page}|${seeKind ? op : ""}|${body || ""}|${C.fg}`;
    let P = TAG.plates.get(key);
    if (P) return P;
    const iw = Math.max(1, Math.round(S.canvas.w * k)), ih = Math.max(1, Math.round(S.canvas.h * k)), img = d2d.CreateImage(iw, ih), g = img.GetGraphics();
    const dir = STATE.tagShape + "\\", sized = f => { const s = tagImage(f && dir + f); return s && s.Resize(iw, ih, 7); };   // InterpolationMode.HighQualityBicubic
    const ox = S.canvas.tag[0] * k, oy = S.canvas.tag[1] * k, tw = S.canvas.tag[2] * k, th = S.canvas.tag[3] * k;
    const rows = [[0, oy + S.bands.top * th], [oy + S.bands.top * th, oy + S.bands.bottom * th], [oy + S.bands.bottom * th, ih]];
    const inRow = (b, fn) => { const [y0, y1] = rows[b]; g.PushClip(0, Math.floor(y0), iw, Math.ceil(y1) - Math.floor(y0)); fn(); g.PopClip(); };
    const draw = (im, b) => { if (im) inRow(b, () => g.DrawImage(im, 0, 0, iw, ih, 0, 0, iw, ih)); };
    const effect = (fx, b) => inRow(b, () => g.DrawEffect(fx, 0, 0, 0, 0, iw, ih));
    const solidRows = [0, 1, 2].filter(b => !seeRows.includes(b));
    try {
        const shade = sized(F.shade), CL = S.finishes.clear || {}, FR = S.finishes.frosted || {};
        if (seeKind) {
            // the dot grid round the tag, then the view through it: the panel and the grid, nudged (clear, glass) or
            // blurred (translucent), inside the outline
            const mask = sized(F.mask || CL.mask), dot = withAlpha(C.fg, MODE === "dark" ? .3 : .26);
            tagDots(g, iw, ih, ox, oy, tw, th, dot);
            const under = d2d.CreateImage(iw, ih), ug = under.GetGraphics();
            ug.FillSolidRect(0, 0, iw, ih, bg);
            tagDots(ug, iw, ih, ox, oy, tw, th, dot, seeKind === "frosted" ? 0 : Math.round(dp(1.5)), false);
            under.ReleaseGraphics(ug);
            let view = under;
            if (seeKind === "frosted") {
                const blur = d2d.Effect("{1feb6d69-2fe6-4ac9-8c58-1d7f93e7a6a5}");   // GaussianBlur
                blur.SetValue(0, dp(2.4));
                blur.SetInput(0, under);
                view = d2d.CreateImage(iw, ih);
                const vg = view.GetGraphics();
                vg.DrawEffect(blur, 0, 0, 0, 0, iw, ih);
                view.ReleaseGraphics(vg);
            }
            if (mask) {
                const am = d2d.Effect("{C80ECFF0-3FD5-4F05-8328-C5D1724B4F0A}");   // AlphaMask
                am.SetInput(0, view);
                am.SetInput(1, mask);
                seeRows.forEach(b => effect(am, b));
            }
            // the see-through material in those bands
            if (seeKind === "clear") {        // the band colours as a tint, then the sheet's edges and glare
                const edges = sized(CL.shade);
                if (mask) seeRows.forEach(b => effect(tagTint(mask, cols[b], 1, op), b));
                seeRows.forEach(b => draw(edges, b));
            } else if (seeKind === "frosted") {   // the translucent plate in the band colours (its render covers FR.cover of the page)
                const fs = fin === "frosted" ? shade : sized(FR.shade), fg_ = sized(FR.gloss);
                if (fs) seeRows.forEach(b => effect(tagTint(fs, cols[b], 1 / (FR.white || TAG_WHITE), Math.min(2, op / (FR.cover || .62))), b));
                seeRows.forEach(b => draw(fg_, b));
            } else {                          // the glass in its own colours, as opaque as asked, then the clear sheet's edges and glare
                const edges = sized(CL.shade);
                seeRows.forEach(b => effect(tagTint(shade, "#ffffff", 1, op), b));
                seeRows.forEach(b => draw(edges, b));
            }
        }
        // the solid bands
        if (F.fixed) solidRows.forEach(b => draw(shade, b));
        else solidRows.forEach(b => effect(tagTint(shade, cols[b], 1 / (F.white || TAG_WHITE)), b));
        if (!kind) { const gloss = sized(F.gloss); solidRows.forEach(b => draw(gloss, b)); }
        ["top", "body", "bottom"].forEach((band, b) => { const pr = sized(S.print && S.print[band]); if (pr) g.DrawEffect(tagTint(pr, inks[b]), 0, 0, 0, 0, iw, ih); });
        for (const f of [S.print && S.print.static, S.eyelet]) { const im = sized(f); if (im) g.DrawImage(im, 0, 0, iw, ih, 0, 0, iw, ih); }
    } finally { img.ReleaseGraphics(g); }
    P = { img, ox, oy, k, cols, inks, see: !!seeKind };
    if (TAG.plates.size >= 40) TAG.plates.clear();
    TAG.plates.set(key, P);
    return P;
}

// a px size as the dp size font() takes (font() multiplies by the text size; the tag's type follows the tag instead)
const tagFont = (px, weight, str) => fontFor(str, Math.round(px / dp(1) / TEXT_SCALE * 2) / 2, weight);
// the title in at most T.lines lines in its box: the largest size from max to min (fractions of the tag's height) that
// fits; at the smallest, the last line ends in "…"
function tagFit(gr, title, bw, bh, T, h) {
    const wrap = f => { const est = gr.EstimateLineWrap(title, f, bw), out = []; for (let i = 0; i < est.length; i += 2) out.push(String(est[i]).trim()); return out; };
    for (let size = T.max * h; size >= T.min * h; size *= .94) {
        const f = tagFont(size, T.weight, title);
        if (gr.CalcTextWidth(title, f) <= bw) return { f, lines: [title] };
        if (T.lines < 2 || 2 * f.Height > bh) continue;
        const lines = wrap(f);
        if (lines.length <= T.lines) return { f, lines };
    }
    const f = tagFont(T.min * h, T.weight, title);
    let lines = wrap(f);
    if (lines.length > T.lines) { lines = lines.slice(0, T.lines); lines[T.lines - 1] = lines[T.lines - 1].replace(/.?$/, "…"); }
    return { f, lines };
}

// Draws the tag with its top left corner at (x, y), w px wide, on a panel of colour bg: the title, and the small print
// with `vals` filled in ({track}, {total}, {arc}, …); fin: a finish other than the one in use (the Style view's cards).
// Returns its height (0 when no tag is shown: the caller draws the plain title).
function drawTag(gr, x, y, w, title, vals = {}, bg = C.bg, fin = STATE.tag) {
    const t = tagFinish(fin);
    if (!t || !(w >= dp(40))) return 0;   // too narrow to read (or no width yet): the plain title
    const { S, F } = t, P = F.factory ? tagFactoryPlate(S, F, Math.round(w)) : tagPlate(S, fin, Math.round(w), bg), h = Math.round(w * S.canvas.tag[3] / S.canvas.tag[2]);
    const px = Math.round(x - P.ox), py = Math.round(y - P.oy);
    gr.DrawImage(P.img, px, py, P.img.Width, P.img.Height, 0, 0, P.img.Width, P.img.Height);
    // a factory tag's letters: its inked render, laid exactly over the plate
    const brush = P.brush;
    if (brush) { brush.ResetTransform(); brush.Translate(px, py); }
    const inkFor = band => brush || tagArgb(P.inks[{ top: 0, body: 1, bottom: 2 }[band] || 1]);
    // the small print
    for (const s of S.small || []) {
        const str = String(s.text).replace(/\{(\w+)\}/g, (m, k) => vals[k] !== undefined && vals[k] !== "" ? vals[k] : "—");
        trackedText(gr, str, { size: s.size * h / dp(1) / TEXT_SCALE, weight: s.weight, track: s.track, colour: brush || withAlpha(inkFor(s.band), s.alpha) }, x + s.x * w, y + s.y * h, s.align === "right" ? 2 : 0);
    }
    // the title, at the bottom (or the middle) of its box
    const T = S.title, bx = x + T.box[0] * w, by = y + T.box[1] * h, bw = T.box[2] * w, bh = T.box[3] * h;
    const fit = tagFit(gr, String(title), bw, bh, T, h), lh = fit.f.Height, n = fit.lines.length;
    const ty = T.valign === "bottom" ? by + bh - lh * n : by + (bh - lh * n) / 2;
    const flags = DT_GLYPH | DT_ELLIPSIS | (T.align === "right" ? 0x00000002 : T.align === "centre" ? 0x00000001 : 0);
    const ink = inkFor(T.band), u = Math.max(1, Math.round(h * .008));
    // a factory tag's print sits in the face (etched, stamped, pressed: a thin light under each stroke, where the cut
    // edge faces the light) or on it (printed: a faint shadow)
    const sink = brush && P.factory.relief === "sink", ru = Math.max(1, Math.round(h * .004));
    fit.lines.forEach((ln, i) => {
        if (brush) gr.DrawText(ln, fit.f, sink ? withAlpha(0xFFFFFFFF, .2) : withAlpha(0xFF000000, .22), bx + (sink ? 0 : ru), ty + i * lh + ru, bw, lh + dp(2), flags);
        else if (F.fixed || P.see) gr.DrawText(ln, fit.f, withAlpha(0xFF000000, P.inks[1] === "#1b1c18" ? .12 : .3), bx + u * .7, ty + i * lh + u, bw, lh + dp(2), flags);   // on glass: a soft drop
        gr.DrawText(ln, fit.f, ink, bx, ty + i * lh, bw, lh + dp(2), flags);
    });
    return h;
}
