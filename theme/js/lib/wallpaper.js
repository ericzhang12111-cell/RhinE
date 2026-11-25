"use strict";
// Wallpaper (06 STYLE › DISPLAY › WALLPAPER): a picture behind the views the user picks: ARCHIVE, PLAYLISTS (its side
// columns: the native playlist cannot show one), LYRICS and SIGNAL; one that comes with the theme or one of the user's
// own. It covers the whole window (cropped to fill it) and each panel draws its own part, so the parts line up across
// the panels (frame.js sends where each panel sits: "geom"); a veil of the page colour keeps the text readable. Looks:
//   CLEAR     the picture as it is
//   FROST     blurred
//   HALFTONE  a dot screen in the picture's own colours, each dot as large as its tone stands out from the page
// A panel's part is rendered once into a bitmap and drawn from it; while the window is being resized the old one is
// stretched until the size has settled. Labels over it are drawn live (LABEL_LIVE, lib/text.js), as a cached label
// carries its opaque background.
// A wallpaper can also carry a picture per view (byView: { archive, playlists, lyrics, signal }, each falling back to
// the main one): a character pack's look (lib/pack.js) has a picture made for what each view keeps clear. A pack's
// pictures are kept as "pack:ID/wallpapers/NAME.jpg" and found through the pack's folder, wherever that is.

const WP_LOOKS = [["clear", "CLEAR"], ["frost", "FROST"], ["halftone", "HALFTONE"]];
const WP_VEILS = [["low", "LOW"], ["mid", "MID"], ["high", "HIGH"]], WP_VEIL = { low: .42, mid: .6, high: .76 };
const WP_VIEWS = [["archive", "ARCHIVE"], ["playlists", "PLAYLISTS"], ["lyrics", "LYRICS"], ["signal", "SIGNAL"]];
const WP_START = { path: "", views: ["playlists", "lyrics", "signal"], look: "clear", veil: "mid" };
// The pictures that come with the theme (assets/wallpapers), each in a dark and a light version that follow the mode.
// The setting keeps "theme:NAME" rather than a file path, so they still open after a portable foobar2000 moves.
const WP_BUILTIN = [["topography", "TOPOGRAPHY"], ["streams", "STREAMS"], ["print", "PRINT"], ["survey", "SURVEY"]];
const WP_DIR = THEME_ROOT + "assets\\wallpapers\\";
// A pack's picture, "pack:ID/REL": REL in the pack's folder, its NAME-MODE version first when there is one (a pack's
// pictures are made for one mode; one for the other may come beside). "" when the pack or the file is not there: the
// wallpaper then stays off, nothing breaks. Looked up once per mode (a pack not found reads the pack folders again).
const WP_PACK_FILES = new Map();
function wpPackFile(path) {
    const k = path + "|" + MODE;
    if (WP_PACK_FILES.has(k)) return WP_PACK_FILES.get(k);
    const rest = path.slice(5), cut = rest.indexOf("/"), id = cut > 0 ? rest.slice(0, cut) : "", rel = cut > 0 ? rest.slice(cut + 1) : "";
    let f = "";
    if (id && rel && !rel.includes("..")) {
        let p = null;
        try { p = typeof findPack === "function" ? findPack(id) : null; } catch (e) { p = null; }
        if (p) {
            const dot = rel.lastIndexOf("."), byMode = dot > 0 ? `${rel.slice(0, dot)}-${MODE}${rel.slice(dot)}` : "";
            f = (byMode && packFile(byMode, p)) || packFile(rel, p);
            if (f && utils.IsDirectory(f)) f = "";
        }
    }
    if (WP_PACK_FILES.size > 32) WP_PACK_FILES.clear();
    WP_PACK_FILES.set(k, f);
    return f;
}
// (a picture made for one mode only, as the special presets' are: NAME.jpg, the same in both)
const wpFile = path => path.startsWith("pack:") ? wpPackFile(path) : !path.startsWith("theme:") ? path : utils.IsFile(WP_DIR + `${path.slice(6)}-${MODE}.jpg`) ? WP_DIR + `${path.slice(6)}-${MODE}.jpg` : WP_DIR + `${path.slice(6)}.jpg`;
// the special presets' pictures (style.js PRESETS_SPECIAL): named, not in the picker
const WP_SPECIAL = [["champions-bronze", "CHAMPIONS · BRONZE"], ["champions-stone", "CHAMPIONS · STONE"], ["champions-noir", "CHAMPIONS · NOIR"], ["champions-light", "CHAMPIONS · LIGHT"]];
// the name to show: a built-in picture's own, a pack's name (its pictures go together), else the file's
function wpName(path) {
    const b = WP_BUILTIN.concat(WP_SPECIAL).find(k => "theme:" + k[0] === path);
    if (b) return tr(b[1]);
    if (path.startsWith("pack:")) {
        const rest = path.slice(5), cut = rest.indexOf("/"), id = cut > 0 ? rest.slice(0, cut) : rest;
        let p = null;
        try { p = typeof findPack === "function" ? findPack(id) : null; } catch (e) { p = null; }
        return p ? String(p.name).toUpperCase() : id.toUpperCase();
    }
    return path.slice(path.lastIndexOf("\\") + 1).toUpperCase();
}
function pickWallpaper(w) {
    w = w && typeof w === "object" ? w : {};
    const out = { path: typeof w.path === "string" ? w.path : "",
                  views: Array.isArray(w.views) ? WP_VIEWS.map(v => v[0]).filter(v => w.views.includes(v)) : WP_START.views.slice(),
                  look: WP_LOOKS.some(l => l[0] === w.look) ? w.look : WP_START.look,
                  veil: WP_VEILS.some(l => l[0] === w.veil) ? w.veil : WP_START.veil,
                  card: w.card !== false };   // false: the track card's column keeps its plain colour (a picture with its own type behind)
    // The pictures per view go with a pack's picture only: choosing any other picture (06 STYLE sends just its path,
    // merged over the wallpaper in use) or none lets them go. Kept in the views' order, so that a preset that has them
    // compares equal to the state (style.js presetMatches compares them as JSON).
    if (out.path.startsWith("pack:") && w.byView && typeof w.byView === "object") {
        const bv = {};
        for (const [v] of WP_VIEWS) if (typeof w.byView[v] === "string" && w.byView[v]) bv[v] = w.byView[v];
        if (Object.keys(bv).length) out.byView = bv;
    }
    return out;
}
// the track card's column over the picture, or plain (wallpaper "card")
const wallpaperCard = () => !STATE.wallpaper || STATE.wallpaper.card !== false;

let GEOM = { w: 0, h: 0, r: {} };   // the window's size and each panel's rect in it, in px (frame.js)
onMessage("geom", g => { GEOM = g; window.Repaint(); });

// the view a panel shows (the manager panel: the Playlists view's side column; the stage: the view in use), and the
// picture for a view: its own, else the main one
const wpView = panel => panel === "manager" ? "playlists" : STATE.view;
const wpPathFor = (b, view) => (b && b.byView && view && b.byView[view]) || (b ? b.path : "");

// on for this view (one of WP_VIEWS), with a picture that is there and has not failed to load
function wallpaperOn(where) {
    const b = STATE.wallpaper;
    if (!(b && b.path && b.views.includes(where))) return false;
    const p = wpPathFor(b, where);
    return !WP.failed[p] && !!wpFile(p);
}

// The pictures and the panel's parts, a few of each, by file: a panel that shows several views keeps each one's, so
// going back and forth does not load them again (the one used longest ago goes first).
//   srcs   file -> { img, loading }          comps  file -> { key, comp, timer }
//   comp   the part drawn last (the views' layers keep it, to know when the picture under them has changed)
const WP_KEEP = 4;
const WP = { srcs: new Map(), comps: new Map(), failed: {}, comp: null };
// (a Map as a short list: the entry used moves to the end, the first ones go past WP_KEEP)
function wpTouch(m, k, v) {
    m.delete(k);
    m.set(k, v);
    while (m.size > WP_KEEP) {
        const [old, e] = m.entries().next().value;
        if (e && e.timer) window.ClearTimeout(e.timer);
        m.delete(old);
    }
    return v;
}
function wpSource(path) {
    const file = wpFile(path);
    if (!file) return null;
    const have = WP.srcs.get(file);
    if (have) { if (have.img) wpTouch(WP.srcs, file, have); return have.img; }
    const e = wpTouch(WP.srcs, file, { img: null, loading: true });
    d2d.LoadImageAsyncV2(0, file).then(img => {
        if (WP.srcs.get(file) !== e) return;   // (let go meanwhile)
        e.loading = false;
        if (!img) { WP.srcs.delete(file); WP.failed[path] = true; window.Repaint(); return; }
        e.img = img;
        window.Repaint();
    }, () => { if (WP.srcs.get(file) === e) { WP.srcs.delete(file); WP.failed[path] = true; window.Repaint(); } });
    return null;
}

// the picture's place in the window: scaled to cover it, centred
function wpCover(img) {
    const s = Math.max(GEOM.w / img.Width, GEOM.h / img.Height);
    return { s, x: (GEOM.w - img.Width * s) / 2, y: (GEOM.h - img.Height * s) / 2 };
}

function wpBuild(panel, src) {
    const b = STATE.wallpaper, r = GEOM.r[panel];
    if (!b || !r || !src || !(r[2] >= 1) || !(r[3] >= 1) || !(GEOM.w >= 1) || !(GEOM.h >= 1)) return null;
    const [px, py, pw, ph] = r, cv = wpCover(src), img = d2d.CreateImage(pw, ph), g = img.GetGraphics();
    try {
        g.FillSolidRect(0, 0, pw, ph, C.bg);
        if (b.look === "halftone") wpHalftone(g, src, cv, r);
        else {
            // the picture at the size it covers the window (or, frosted, a tenth of it, blurred, stretched back)
            const k = b.look === "frost" ? .1 : 1, w = Math.max(1, Math.round(src.Width * cv.s * k)), h = Math.max(1, Math.round(src.Height * cv.s * k));
            let pic;
            try { pic = src.Resize(w, h, 7); } catch (e) { pic = src.Resize(w, h); }
            if (b.look === "frost") pic.StackBlur(6);
            g.DrawImage(pic, 0, 0, pw, ph, (px - cv.x) * k, (py - cv.y) * k, pw * k, ph * k);
        }
        g.FillSolidRect(0, 0, pw, ph, withAlpha(C.bg, WP_VEIL[b.veil]));
    } finally { img.ReleaseGraphics(g); }
    return { img, w: pw, h: ph };
}

// the dot screen: the picture sampled once per cell of a window-wide grid, a dot per cell in that colour, its area
// following how far the cell's lightness is from the page's
function wpHalftone(g, src, cv, r) {
    const p = Math.max(5, dp(8)), cols = Math.ceil(GEOM.w / p), rows = Math.ceil(GEOM.h / p);
    const grid = d2d.CreateImage(cols, rows), gg = grid.GetGraphics();
    const w2 = Math.max(1, Math.round(src.Width * cv.s / p * 2)), h2 = Math.max(1, Math.round(src.Height * cv.s / p * 2));
    let half;
    try { half = src.Resize(w2, h2, 7); } catch (e) { half = src.Resize(w2, h2); }
    gg.DrawImage(half, cv.x / p, cv.y / p, src.Width * cv.s / p, src.Height * cv.s / p, 0, 0, w2, h2);
    grid.ReleaseGraphics(gg);
    const px = grid.GetPixelData("bgra32");
    if (!px) return;
    const L = (rr, gc, bb) => (.2126 * rr + .7152 * gc + .0722 * bb) / 255, page = L((C.bg >>> 16) & 255, (C.bg >>> 8) & 255, C.bg & 255);
    const x0 = Math.floor(r[0] / p), x1 = Math.ceil((r[0] + r[2]) / p), y0 = Math.floor(r[1] / p), y1 = Math.ceil((r[1] + r[3]) / p);
    for (let gy = Math.max(0, y0); gy < Math.min(rows, y1); gy++) {
        for (let gx = Math.max(0, x0); gx < Math.min(cols, x1); gx++) {
            const i = (gy * cols + gx) * 4, bb = px[i], gc = px[i + 1], rr = px[i + 2];
            const t = Math.abs(L(rr, gc, bb) - page), d = p * .92 * Math.sqrt(t);
            if (d < .8) continue;
            const cx = (gx + .5) * p - r[0], cy = (gy + .5) * p - r[1];
            g.FillEllipse(cx - d / 2, cy - d / 2, d, d, mix((0xFF000000 | (rr << 16) | (gc << 8) | bb) >>> 0, C.bg, .25));
        }
    }
}

// the bitmap of `panel`'s part, of the picture for the view it shows (null while the picture loads)
function wpComp(panel) {
    const b = STATE.wallpaper, r = GEOM.r[panel];
    if (!b || !b.path || !r) return (WP.comp = null);
    const path = wpPathFor(b, wpView(panel)), file = wpFile(path), src = file ? wpSource(path) : null;
    if (!src) return (WP.comp = null);
    const key = [file, b.look, b.veil, C.bg, GEOM.w, GEOM.h, r.join(",")].join("|");
    const e = wpTouch(WP.comps, file, WP.comps.get(file) || { key: "", comp: null, timer: 0 });
    if (key !== e.key) {
        // the first time at once; a new size or look a moment later (a resize sends many sizes in a row)
        e.key = key;
        window.ClearTimeout(e.timer);
        const build = () => {
            e.timer = 0;
            const s = WP.srcs.get(file);
            if (e.key === key && WP.comps.get(file) === e && s && s.img) { e.comp = wpBuild(panel, s.img); window.Repaint(); }
        };
        if (!e.comp) build(); else e.timer = window.SetTimeout(build, 150);
    }
    return (WP.comp = e.comp);
}
// Draws the wallpaper under (x, y, w, h) of `panel` (its own coordinates), at (dx, dy) (a layer drawn later at x, y
// gives 0, 0). False when there is nothing to draw yet (the picture is loading): the caller fills the page colour.
function drawWallpaper(gr, panel, x, y, w, h, dx = x, dy = y) {
    const c = wpComp(panel), r = GEOM.r[panel];
    if (!c) return false;
    if (c.w === r[2] && c.h === r[3]) gr.DrawImage(c.img, dx, dy, w, h, x, y, w, h);
    else {
        gr.PushClip(dx, dy, w, h);
        gr.DrawImage(c.img, dx - x, dy - y, r[2], r[3], 0, 0, c.w, c.h);
        gr.PopClip();
    }
    return true;
}
// the stage panel's part (the Style view is drawn there) fitted into a box, for 06 STYLE's preview
function wallpaperPreview(gr, x, y, w, h) {
    const c = wpComp("stage");
    if (!c) return false;
    const k = Math.max(w / c.w, h / c.h), sw = w / k, sh = h / k;
    gr.DrawImage(c.img, x, y, w, h, (c.w - sw) / 2, (c.h - sh) / 2, sw, sh);
    return true;
}
// a new picture or a picture turned off: let the old ones go (those the wallpaper in use no longer names, in the mode
// in use: a pack's picture for the other mode is another file)
let WP_WAS = "";
onMessage("state", () => {
    const b = STATE.wallpaper, now = JSON.stringify(b);
    if (now !== WP_WAS) { WP_WAS = now; WP_PACK_FILES.clear(); window.Repaint(); }
    const keep = new Set();
    if (b && b.path) for (const p of [b.path].concat(b.byView ? Object.values(b.byView) : [])) { const f = wpFile(p); if (f) keep.add(f); }
    for (const m of [WP.srcs, WP.comps]) {
        for (const [f, e] of Array.from(m)) if (!keep.has(f)) { if (e && e.timer) window.ClearTimeout(e.timer); m.delete(f); }
    }
    if (!keep.size) WP.comp = null;
});
// ------------------------------------------------------------------------------------------------ side columns
// A character pack's pictures under the views' right-hand columns (pack.json "panels": { archive, playlists, lyrics,
// online: "panels/NAME.jpg", veil, anchor }; NAME-light.jpg beside one is used in light mode): the Archive's album
// file (archive.js), the track card of Playlists and Lyrics (lib/nowplaying.js drawCard) and Online's NOW PLAYING
// (online.js). Each is cut to the column (scaled to cover it, from the top unless anchor says "center" or "bottom"),
// a veil of the column's colour over it, and kept as a bitmap per view: drawn from it, built again only for a new
// size, colour or picture (a size a moment later, as the wallpaper's). With no pack, no "panels", or a picture that
// is missing or fails to load, nothing is drawn and the caller fills its plain colour as before.
// PP.ver goes up when a picture or a part comes in later (loaded, rebuilt): a caller that keeps the column in a
// layer of its own draws it again when it changes (panelPicVer).
const PP_VIEWS = ["archive", "playlists", "lyrics", "online"];
const PP = { srcs: new Map(), comps: new Map(), failed: {}, ver: 0 };
const panelPicVer = () => PP.ver;
function ppPart() {
    if (!STATE.pack) return null;
    let p = null;
    try { p = typeof packPart === "function" ? packPart("panels") : null; } catch (e) { p = null; }
    return p && typeof p === "object" ? p : null;
}
// the picture's "pack:ID/REL" for a view ("" when there is none)
function ppPath(view) {
    const p = ppPart(), rel = p && PP_VIEWS.includes(view) && typeof p[view] === "string" ? p[view] : "";
    return rel ? `pack:${STATE.pack}/${rel}` : "";
}
// a view's column has a picture (it may still be loading: then drawPanelPic gives false and the plain colour shows)
function panelPicOn(view) {
    const p = ppPath(view);
    return !!p && !PP.failed[p] && !!wpFile(p);
}
function ppVeil() {
    const v = (ppPart() || {}).veil;
    return typeof v === "number" && v >= 0 && v <= 1 ? v : WP_VEIL[v] || WP_VEIL.low;
}
function ppSource(path, file) {
    const have = PP.srcs.get(file);
    if (have) return have.img;
    const e = { img: null };
    PP.srcs.set(file, e);
    if (PP.srcs.size > 2) for (const [f, s] of Array.from(PP.srcs)) { if (PP.srcs.size <= 2) break; if (s !== e && s.img) PP.srcs.delete(f); }
    d2d.LoadImageAsyncV2(0, file).then(img => {
        if (PP.srcs.get(file) !== e) return;
        if (!img) { PP.srcs.delete(file); PP.failed[path] = true; } else e.img = img;
        PP.ver++;
        window.Repaint();
    }, () => { if (PP.srcs.get(file) === e) { PP.srcs.delete(file); PP.failed[path] = true; PP.ver++; window.Repaint(); } });
    return null;
}
function ppBuild(src, w, h, base, veil, anchor) {
    const img = d2d.CreateImage(w, h), g = img.GetGraphics();
    try {
        g.FillSolidRect(0, 0, w, h, base);
        const s = Math.max(w / src.Width, h / src.Height), sw = Math.max(1, Math.round(src.Width * s)), sh = Math.max(1, Math.round(src.Height * s));
        let pic;
        try { pic = src.Resize(sw, sh, 7); } catch (e) { pic = src.Resize(sw, sh); }
        const ox = Math.round((sw - w) / 2), oy = anchor === "bottom" ? sh - h : anchor === "center" ? Math.round((sh - h) / 2) : 0;
        g.DrawImage(pic, 0, 0, w, h, ox, oy, w, h);
        g.FillSolidRect(0, 0, w, h, withAlpha(base, veil));
    } finally { img.ReleaseGraphics(g); }
    return { img, w, h };
}
// Draws `view`'s column picture into (x, y, w, h), its veil of `base` (the column's colour: C.panel for the track
// card). False when there is nothing to draw (no picture, or still loading): the caller fills `base` itself.
function drawPanelPic(gr, view, x, y, w, h, base = C.panel) {
    w = Math.round(w); h = Math.round(h);
    if (!(w >= 1 && h >= 1)) return false;
    const path = ppPath(view), file = path && !PP.failed[path] ? wpFile(path) : "";
    if (!file) return false;
    const src = ppSource(path, file);
    if (!src) return false;
    const veil = ppVeil(), anchor = (ppPart() || {}).anchor, key = [file, w, h, base, veil, anchor].join("|");
    let e = PP.comps.get(view);
    if (!e || e.file !== file) { if (e && e.timer) window.ClearTimeout(e.timer); e = { key: "", file, comp: null, timer: 0 }; PP.comps.set(view, e); }
    if (key !== e.key) {
        e.key = key;
        if (e.timer) window.ClearTimeout(e.timer);
        e.timer = 0;
        const build = () => { e.timer = 0; const s = PP.srcs.get(file); if (e.key === key && PP.comps.get(view) === e && s && s.img) { e.comp = ppBuild(s.img, w, h, base, veil, anchor); } };
        // the first time at once; a new size a moment later (a resize sends many in a row), the old one stretched meanwhile
        if (!e.comp) build();
        else e.timer = window.SetTimeout(() => { build(); PP.ver++; window.Repaint(); }, 150);
    }
    const c = e.comp;
    if (!c) return false;
    gr.DrawImage(c.img, x, y, w, h, 0, 0, c.w, c.h);
    return true;
}
// a pack changed, or the mode (a -light picture is another file): let the pictures no longer named go
onMessage("state", () => {
    const keep = new Set();
    for (const v of PP_VIEWS) { const p = ppPath(v), f = p ? wpFile(p) : ""; if (f) keep.add(f); }
    let gone = false;
    for (const [f] of Array.from(PP.srcs)) if (!keep.has(f)) { PP.srcs.delete(f); gone = true; }
    for (const [v, e] of Array.from(PP.comps)) if (!keep.has(e.file)) { if (e.timer) window.ClearTimeout(e.timer); PP.comps.delete(v); gone = true; }
    if (gone) PP.ver++;
});
