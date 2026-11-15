"use strict";
// Wallpaper (05 STYLE › DISPLAY › WALLPAPER): a picture behind the views the user picks: ARCHIVE, PLAYLISTS (its side
// columns: the native playlist cannot show one), LYRICS and SIGNAL; one that comes with the theme or one of the user's
// own. It covers the whole window (cropped to fill it) and each panel draws its own part, so the parts line up across
// the panels (frame.js sends where each panel sits: "geom"); a veil of the page colour keeps the text readable. Looks:
//   CLEAR     the picture as it is
//   FROST     blurred
//   HALFTONE  a dot screen in the picture's own colours, each dot as large as its tone stands out from the page
// A panel's part is rendered once into a bitmap and drawn from it; while the window is being resized the old one is
// stretched until the size has settled. Labels over it are drawn live (LABEL_LIVE, lib/text.js), as a cached label
// carries its opaque background.

const WP_LOOKS = [["clear", "CLEAR"], ["frost", "FROST"], ["halftone", "HALFTONE"]];
const WP_VEILS = [["low", "LOW"], ["mid", "MID"], ["high", "HIGH"]], WP_VEIL = { low: .42, mid: .6, high: .76 };
const WP_VIEWS = [["archive", "ARCHIVE"], ["playlists", "PLAYLISTS"], ["lyrics", "LYRICS"], ["signal", "SIGNAL"]];
const WP_START = { path: "", views: ["playlists", "lyrics", "signal"], look: "clear", veil: "mid" };
// The pictures that come with the theme (assets/wallpapers), each in a dark and a light version that follow the mode.
// The setting keeps "theme:NAME" rather than a file path, so they still open after a portable foobar2000 moves.
const WP_BUILTIN = [["topography", "TOPOGRAPHY"], ["streams", "STREAMS"], ["print", "PRINT"], ["survey", "SURVEY"]];
const WP_DIR = THEME_ROOT + "assets\\wallpapers\\";
// (a picture made for one mode only, as the special presets' are: NAME.jpg, the same in both)
const wpFile = path => !path.startsWith("theme:") ? path : utils.IsFile(WP_DIR + `${path.slice(6)}-${MODE}.jpg`) ? WP_DIR + `${path.slice(6)}-${MODE}.jpg` : WP_DIR + `${path.slice(6)}.jpg`;
// the special presets' pictures (style.js PRESETS_SPECIAL): named, not in the picker
const WP_SPECIAL = [["champions-bronze", "CHAMPIONS · BRONZE"], ["champions-stone", "CHAMPIONS · STONE"], ["champions-noir", "CHAMPIONS · NOIR"], ["champions-light", "CHAMPIONS · LIGHT"]];
// the name to show: a built-in picture's own, else the file's
const wpName = path => { const b = WP_BUILTIN.concat(WP_SPECIAL).find(k => "theme:" + k[0] === path); return b ? tr(b[1]) : path.slice(path.lastIndexOf("\\") + 1).toUpperCase(); };
function pickWallpaper(w) {
    w = w && typeof w === "object" ? w : {};
    return { path: typeof w.path === "string" ? w.path : "",
             views: Array.isArray(w.views) ? WP_VIEWS.map(v => v[0]).filter(v => w.views.includes(v)) : WP_START.views.slice(),
             look: WP_LOOKS.some(l => l[0] === w.look) ? w.look : WP_START.look,
             veil: WP_VEILS.some(l => l[0] === w.veil) ? w.veil : WP_START.veil,
             card: w.card !== false };   // false: the track card's column keeps its plain colour (a picture with its own type behind)
}
// the track card's column over the picture, or plain (wallpaper "card")
const wallpaperCard = () => !STATE.wallpaper || STATE.wallpaper.card !== false;

let GEOM = { w: 0, h: 0, r: {} };   // the window's size and each panel's rect in it, in px (frame.js)
onMessage("geom", g => { GEOM = g; window.Repaint(); });

// on for this view (one of WP_VIEWS), with a picture that has not failed to load
const wallpaperOn = where => { const b = STATE.wallpaper; return !!(b && b.path && b.views.includes(where) && !WP.failed[b.path]); };

const WP = { src: null, srcPath: "", loading: "", failed: {}, comp: null, key: "", want: "", timer: 0 };
function wpSource(path) {
    const file = wpFile(path);
    if (WP.srcPath === file && WP.src) return WP.src;
    if (WP.loading === file) return null;
    WP.loading = file;
    d2d.LoadImageAsyncV2(0, file).then(img => {
        if (WP.loading !== file) return;
        WP.loading = "";
        if (!img) { WP.failed[path] = true; window.Repaint(); return; }
        WP.src = img; WP.srcPath = file; WP.key = "";
        window.Repaint();
    }, () => { if (WP.loading === file) { WP.loading = ""; WP.failed[path] = true; window.Repaint(); } });
    return null;
}

// the picture's place in the window: scaled to cover it, centred
function wpCover(img) {
    const s = Math.max(GEOM.w / img.Width, GEOM.h / img.Height);
    return { s, x: (GEOM.w - img.Width * s) / 2, y: (GEOM.h - img.Height * s) / 2 };
}

function wpBuild(panel) {
    const b = STATE.wallpaper, r = GEOM.r[panel], src = WP.src;
    if (!r || !src || r[2] < 1 || r[3] < 1) return null;
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

// the bitmap of `panel`'s part (null while the picture loads)
function wpComp(panel) {
    const b = STATE.wallpaper, r = GEOM.r[panel];
    if (!b || !b.path || !r) return null;
    if (!wpSource(b.path)) return null;
    const key = [b.path, b.look, b.veil, C.bg, GEOM.w, GEOM.h, r.join(",")].join("|");
    if (key !== WP.key) {
        // the first time at once; a new size or look a moment later (a resize sends many sizes in a row)
        WP.key = key;
        window.ClearTimeout(WP.timer);
        const build = () => { if (WP.key === key) { WP.comp = wpBuild(panel); window.Repaint(); } };
        if (!WP.comp) build(); else WP.timer = window.SetTimeout(build, 150);
    }
    return WP.comp;
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
// the stage panel's part (the Style view is drawn there) fitted into a box, for 05 STYLE's preview
function wallpaperPreview(gr, x, y, w, h) {
    const c = wpComp("stage");
    if (!c) return false;
    const k = Math.max(w / c.w, h / c.h), sw = w / k, sh = h / k;
    gr.DrawImage(c.img, x, y, w, h, (c.w - sw) / 2, (c.h - sh) / 2, sw, sh);
    return true;
}
// a new picture or a picture turned off: let the old one go
let WP_WAS = "";
onMessage("state", () => {
    const b = STATE.wallpaper, now = JSON.stringify(b);
    if (now !== WP_WAS) { WP_WAS = now; window.Repaint(); }
    if (!b || !b.path || wpFile(b.path) !== WP.srcPath) { WP.src = null; WP.srcPath = ""; WP.comp = null; WP.key = ""; }
});
