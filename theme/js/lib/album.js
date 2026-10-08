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
    utils.GetAlbumArtAsyncV2(window.ID, handle, 0).then(r => {
        entry.loading = false;
        if (r && r.image) {
            // cut square from the middle like the library thumbnails, so a cover that is not square is not
            // squeezed, and the inspected case does not change shape when the large cover replaces the thumbnail
            const s = 640, src = r.image, w = src.Width, h = src.Height, m = Math.min(w, h);
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

// the hero case fitted into (x, y, w, h); clearK 0 = frosted, 1 = clear; no = album number printed on the label
function drawHeroCase(gr, x, y, w, h, cov, clearK, no) {
    const I = heroImages(), [iw, ih] = CASE_META.hero_res, m = CASE_META.hero;
    const s = Math.min(w / iw, h / ih) * 1.02, ox = x + (w - iw * s) / 2, oy = y + (h - ih * s) / 2;
    const [c0, , c2] = m.cover, cx = ox + c0[0] * s, cy = oy + c0[1] * s, cw = (c2[0] - c0[0]) * s, ch = (c2[1] - c0[1]) * s;
    if (cov && cov.img) {
        gr.DrawImage(cov.blur, cx, cy, cw, ch, 0, 0, cov.blur.Width, cov.blur.Height);
        if (clearK > 0) gr.DrawImage(cov.img, cx, cy, cw, ch, 0, 0, cov.img.Width, cov.img.Height, 0, Math.round(255 * clearK));
    } else gr.FillSolidRect(cx, cy, cw, ch, C.well);
    if (clearK < 1) gr.DrawImage(I.frost, ox, oy, iw * s, ih * s, 0, 0, iw, ih, 0, Math.round(255 * (1 - clearK)));
    if (clearK > 0) gr.DrawImage(I.clear, ox, oy, iw * s, ih * s, 0, 0, iw, ih, 0, Math.round(255 * clearK));
    // album number on the spine label
    const L = m.label, lx = ox + L[0][0] * s, ly = oy + L[0][1] * s, lw = (L[1][0] - L[0][0]) * s, lh = (L[2][1] - L[0][1]) * s;
    if (no) gr.DrawText(`ARC\n${pad(no, 4)}`, font(Math.max(5, lh / SCALE * .28), 600), 0xFF2B2B29, lx, ly, lw, lh, 0x00000800 | 0x00000001 | 0x00000004 | 0x00000010);
    // decrypt scan line across the cover while clearing
    if (clearK > .02 && clearK < .98) gr.FillSolidRect(cx, cy + ch * clearK - dp(.75), cw, Math.max(HAIR, dp(1.5)), C.accent);
}
