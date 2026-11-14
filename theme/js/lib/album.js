"use strict";
// Albums: a stable 4-digit album number (ARC-0201), cover loading with a blurred copy, and the flat hero case
// (the specimen case seen straight on, cover composited inside, frost → clear decrypt with an orange
// scan line). Needs lib/waveform.js for fnv().

// the active case skin (lib/skins.js): its folder and case.json; CASE_LISTENERS run after a switch
let CASE_SKIN = "", CASE_DIR = "", CASE_META = null;
const CASE_LISTENERS = [];
function loadSkin(id) {
    const s = findSkin(id);
    if (!s || s.dir === CASE_DIR) return false;
    CASE_META = JSON.parse(utils.ReadTextFile(s.dir + "case.json", 65001));
    CASE_DIR = s.dir; CASE_SKIN = s.id;
    HERO.clear = HERO.frost = null;
    CASE_LISTENERS.forEach(f => f());
    return true;
}
// a skin whose renders were made again (the custom case, 05 STYLE): load them anew where it is in use
function reloadSkin(id) { if (CASE_SKIN === id) { CASE_DIR = ""; loadSkin(id); window.Repaint(); } }
onMessage("skin-reload", reloadSkin);
// An album is the tracks with the same album tag in the same folder, a disc folder ("CD2", "Disc 1") counting as its
// parent: tracks with a guest artist stay on their album (no album artist tag needed), and two albums with the same
// name do not merge. Tracks without an album tag form one album per folder. js/workers/library.js has the same rule.
const DISC_DIR = /^(cd|disc|disk)[\s._-]*\d+\b/i;
function albumKeyOf(album, path) {
    const parts = String(path).toLowerCase().split("\\");
    parts.pop();
    if (parts.length > 1 && DISC_DIR.test(parts[parts.length - 1])) parts.pop();
    return album.trim().toLowerCase() + "|" + parts.join("\\");
}
// A folder case (the Archive's SHOW FOLDERS) is the tracks right in one folder, a disc folder counting as its parent
// as above; its key cannot be an album's (js/workers/library.js has the same rule).
const FOLDER_KEY = "\u0001f|";
function folderKeyOf(path) {
    const parts = String(path).toLowerCase().split("\\");
    parts.pop();
    if (parts.length > 1 && DISC_DIR.test(parts[parts.length - 1])) parts.pop();
    return FOLDER_KEY + parts.join("\\");
}
const TF_ALBUM_KEY = fb.TitleFormat("[%album%]\u0001%path%");
function albumKey(handle) {
    if (!handle) return "";
    const v = TF_ALBUM_KEY.EvalWithMetadb(handle).split("\u0001");
    return albumKeyOf(v[0], v[1]);
}
// the same album always gets the same number, 0001–9999
const albumNo = handle => handle ? 1 + parseInt(fnv(albumKey(handle)), 16) % 9999 : 0;

// covers: { key -> { img, blur } }, a few kept; loading is asynchronous, onLoad() is called when one arrives
const COVERS = new Map();
function cover(handle, onLoad) {
    const key = albumKey(handle);
    if (!handle) return null;
    if (COVERS.has(key)) return COVERS.get(key);
    const entry = { img: null, blur: null, loading: true };
    COVERS.set(key, entry);
    if (COVERS.size > 8) COVERS.delete(COVERS.keys().next().value);
    albumArtAsync(handle).then(r => {
        entry.loading = false;
        if (r && r.image) {
            // cut square from the middle like the library thumbnails, so a cover that is not square is not
            // squeezed, and the inspected case does not change shape when the large cover replaces the thumbnail
            // 640 px, or 1280 px on a screen scaled above 125 % (the inspected case draws its cover over 1000 px wide there)
            const s = SCALE > 1.25 ? 1280 : 640, src = r.image, w = src.Width, h = src.Height, m = Math.min(w, h);
            const sq = w === h ? src : src.Clone(Math.floor((w - m) / 2), Math.floor((h - m) / 2), m, m);
            entry.img = m > s ? sq.Resize(s, s) : sq;
            const b = entry.img.Resize(128, 128);
            b.StackBlur(14);
            entry.blur = b;
        }
        onLoad();
    }).catch(() => { entry.loading = false; onLoad(); });
    return entry;
}

const HERO = { clear: null, frost: null };
loadSkin(STATE.skin);
function heroImages() {
    if (!HERO.clear) { HERO.clear = d2d.Image(CASE_DIR + "hero-clear.png"); HERO.frost = d2d.Image(CASE_DIR + "hero-frost.png"); }
    return HERO;
}

// While the Archive shows the ROOM layout the hero case is the room's: the case of the material, light and mode in use,
// square-on (the room inspection's frame: assets/render/room/<set>/<mode>/inspect-00.png + inspect.json), so the card
// shows the case the Archive does. The layout: the Archive's own (the stage's panel), told to the other panels
// ("ar-layout", js/grid.js setLayout) and read from the settings when they load.
const HERO_ROOM = { layout: typeof getSetting === "function" ? getSetting("archiveLayout", "array") : "array", key: "", img: null, meta: null };
onMessage("ar-layout", l => { HERO_ROOM.layout = l; window.Repaint(); });
function heroRoom() {
    if ((typeof AR !== "undefined" && AR.layout ? AR.layout : HERO_ROOM.layout) !== "room") return null;
    const root = THEME_ROOT + "assets\\render\\room\\", has = (m, md) => utils.IsFile(`${root}${m}\\${md}\\inspect.json`);
    const set = roomSet(), other = MODE === "dark" ? "light" : "dark", mat = has(set, MODE) || has(set, other) ? set : "cream";
    const dir = `${root}${mat}\\${has(mat, MODE) ? MODE : other}\\`;
    if (HERO_ROOM.key !== dir) {
        HERO_ROOM.key = dir; HERO_ROOM.img = HERO_ROOM.meta = null;
        try { HERO_ROOM.meta = JSON.parse(utils.ReadTextFile(dir + "inspect.json", 65001)).inspect[0]; HERO_ROOM.img = d2d.Image(dir + "inspect-00.png"); } catch (e) { HERO_ROOM.img = null; }
    }
    return HERO_ROOM.img && HERO_ROOM.meta && HERO_ROOM.meta.crop ? HERO_ROOM : null;
}
// What a room case's label says under its print (RHINE LAB's: the label's paper runs on down, blank, the frame's "info"
// its corners): the title on up to two lines, the artist, a rule, a few rows (key left, value right) and a last line,
// printed as the label is, in its mono face. q: the paper's corners on screen (top left, top right, bottom right,
// bottom left); L: { title, sub, rows: [[key, value]], foot }.
const INFO_FONTS = {}, INFO_M = new Float32Array(6);   // (its own matrix: this file is in panels without archive.js)
function drawInfoLabel(gr, q, L, alpha = 255) {
    const wpx = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), hpx = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]);
    if (wpx < 40) return;   // too small to read
    const BW = 200, BH = BW * hpx / wpx, m = 14, iw = BW - 2 * m;   // (its box: 200 across)
    const F = (name, size, bold) => INFO_FONTS[name] || (INFO_FONTS[name] = d2d.Font(bold ? "Geist Mono SemiBold" : "Geist Mono", size, 0));
    const ft = F("t", 17, true), fs = F("s", 12.5, false), fr = F("r", 11, false), fb = F("b", 11, true);
    const ink = withAlpha(0xFF2B2B29, alpha / 255), dim = withAlpha(0xFF8C8882, alpha / 255), hair = withAlpha(0xFFB9B5AE, alpha / 255);
    INFO_M[0] = (q[1][0] - q[0][0]) / BW; INFO_M[1] = (q[1][1] - q[0][1]) / BW; INFO_M[2] = (q[3][0] - q[0][0]) / BH; INFO_M[3] = (q[3][1] - q[0][1]) / BH; INFO_M[4] = q[0][0]; INFO_M[5] = q[0][1];
    gr.SetTransform(INFO_M);
    const cut = (s, f, n) => {   // s on up to n lines of the box's width, the last ending in … when it does not fit
        const out = []; let rest = [...String(s || "")];
        while (rest.length && out.length < n) {
            let k = rest.length;
            while (k > 1 && gr.CalcTextWidth(rest.slice(0, k).join(""), f, true) > iw) k--;
            // (broken at a space where one stands late enough in the line, not through a word)
            if (out.length < n - 1 && k < rest.length) { const sp = rest.lastIndexOf(" ", k); if (sp > k * .45) k = sp + 1; }
            if (out.length === n - 1 && k < rest.length) { while (k > 1 && gr.CalcTextWidth(rest.slice(0, k).join("") + "…", f, true) > iw) k--; out.push(rest.slice(0, k).join("").trimEnd() + "…"); break; }
            out.push(rest.slice(0, k).join("").trim()); rest = rest.slice(k);
        }
        return out;
    };
    gr.FillSolidRect(m, 0, iw, 1, hair);
    let y = 12;
    for (const l of cut(L.title, ft, 2)) { gr.DrawText(l, ft, ink, m, y, iw + 4, 22, DT_SINGLE); y += 21; }
    if (L.sub) { gr.DrawText(cut(L.sub, fs, 1)[0] || "", fs, dim, m, y + 2, iw + 4, 16, DT_SINGLE); y += 20; }
    y += 6; gr.FillSolidRect(m, y, iw, 1, hair); y += 7;
    for (const [key, v] of L.rows || []) {
        if (y + 15 > BH - 26) break;
        gr.DrawText(key, fr, dim, m, y, iw, 15, DT_SINGLE); gr.DrawText(String(v), fb, ink, m, y, iw, 15, DT_RIGHT_SINGLE); y += 16;
    }
    if (L.foot) { gr.FillSolidRect(m, BH - 25, iw, 1, hair); gr.DrawText(L.foot, fb, ink, m, BH - 21, iw, 15, DT_SINGLE); if (L.foot2) gr.DrawText(L.foot2, fr, dim, m, BH - 21, iw, 15, DT_RIGHT_SINGLE); }
    gr.ResetTransform();
}
function drawHeroRoom(gr, R, x, y, w, h, cov, clearK, no, info) {
    const M = R.meta, c = M.crop, s = Math.min(w / c[2], h / c[3]) * .9, ox = x + (w - c[2] * s) / 2 - c[0] * s, oy = y + (h - c[3] * s) / 2 - c[1] * s;
    const [c0, , c2] = M.cover, cx = ox + c0[0] * s, cy = oy + c0[1] * s, cw = (c2[0] - c0[0]) * s, ch = (c2[1] - c0[1]) * s;
    if (cov && cov.img) {
        gr.DrawImage(cov.blur, cx, cy, cw, ch, 0, 0, cov.blur.Width, cov.blur.Height);
        if (clearK > 0) gr.DrawImage(cov.img, cx, cy, cw, ch, 0, 0, cov.img.Width, cov.img.Height, 0, Math.round(255 * clearK));
    } else gr.FillSolidRect(cx, cy, cw, ch, C.well);
    gr.DrawImage(R.img, ox + c[0] * s, oy + c[1] * s, c[2] * s, c[3] * s, 0, 0, R.img.Width, R.img.Height);
    if (M.info && info) drawInfoLabel(gr, M.info.map(([px, py]) => [ox + px * s, oy + py * s]), info);
    const L = M.label;
    if (L && no) { const lx = ox + L[0][0] * s, ly = oy + L[0][1] * s, lw = (L[1][0] - L[0][0]) * s, lh = (L[2][1] - L[0][1]) * s; gr.DrawText(`ARC\n${pad(no, 4)}`, font(Math.max(5, lh / SCALE * .28), 600), 0xFF2B2B29, lx, ly, lw, lh, 0x00000800 | 0x00000001 | 0x00000004 | 0x00000010); }
    if (clearK > .02 && clearK < .98) gr.FillSolidRect(cx, cy + ch * clearK - dp(.75), cw, Math.max(HAIR, dp(1.5)), C.accent);
}
// the hero case fitted into (x, y, w, h); clearK 0 = frosted, 1 = clear; no = album number printed on the label
function drawHeroCase(gr, x, y, w, h, cov, clearK, no, info = null) {
    const R = heroRoom();
    if (R) { drawHeroRoom(gr, R, x, y, w, h, cov, clearK, no, info); return; }
    const I = heroImages(), [iw, ih] = CASE_META.hero_res, m = CASE_META.hero;
    const s = Math.min(w / iw, h / ih) * 1.02, ox = x + (w - iw * s) / 2, oy = y + (h - ih * s) / 2;
    const [c0, , c2] = m.cover, cx = ox + c0[0] * s, cy = oy + c0[1] * s, cw = (c2[0] - c0[0]) * s, ch = (c2[1] - c0[1]) * s;
    if (cov && cov.img) {
        gr.DrawImage(cov.blur, cx, cy, cw, ch, 0, 0, cov.blur.Width, cov.blur.Height);
        if (clearK > 0) gr.DrawImage(cov.img, cx, cy, cw, ch, 0, 0, cov.img.Width, cov.img.Height, 0, Math.round(255 * clearK));
    } else gr.FillSolidRect(cx, cy, cw, ch, C.well);
    if (clearK < 1) gr.DrawImage(I.frost, ox, oy, iw * s, ih * s, 0, 0, I.frost.Width, I.frost.Height, 0, Math.round(255 * (1 - clearK)));
    if (clearK > 0) gr.DrawImage(I.clear, ox, oy, iw * s, ih * s, 0, 0, I.clear.Width, I.clear.Height, 0, Math.round(255 * clearK));
    // album number on the spine label
    const L = m.label, lx = ox + L[0][0] * s, ly = oy + L[0][1] * s, lw = (L[1][0] - L[0][0]) * s, lh = (L[2][1] - L[0][1]) * s;
    if (no) gr.DrawText(`ARC\n${pad(no, 4)}`, font(Math.max(5, lh / SCALE * .28), 600), 0xFF2B2B29, lx, ly, lw, lh, 0x00000800 | 0x00000001 | 0x00000004 | 0x00000010);
    // decrypt scan line across the cover while clearing
    if (clearK > .02 && clearK < .98) gr.FillSolidRect(cx, cy + ch * clearK - dp(.75), cw, Math.max(HAIR, dp(1.5)), C.accent);
}
