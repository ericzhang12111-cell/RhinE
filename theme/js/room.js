"use strict";
// 01 · ARCHIVE, ROOM layout (stage.js includes this after grid.js): the artist file's room as the archive. A rendered
// field of the theme's cases in cream polymer, lit from below (assets/render/room/<mode>/plate.jpg), with ROOM.meta.slots
// cases along one row that hold the shelf's albums a page at a time. The selected album's case rises out of the field
// with its cover in the window: per slot, pre-rendered patches of the rise (slotNN-F.png, the whole scene around the
// case, its window a hole) go over the cover, which is drawn into the window's quad (room.json) under them, so the rows
// in front hide the cover as they hide the case. The shelves, the selection and the album file are the array's.
//   ← → (or the wheel): the album before / after (the next page past the last case) · ↑ ↓: the shelf behind / in front
//   click a case: select it · double-click or Space: play the album · Enter: open it in the Archive playlist

const ROOM_ROOT = THEME_ROOT + "assets\\render\\room\\";
const ROOM = { mode: "", forMode: "", dir: "", meta: null, plate: null, frames: new Map(), rise: new Map(), album: new Map(), hover: -1, geo: null };
const ROOM_FRAMES_KEPT = 30;   // the patches of a few slots (6 frames each) stay decoded

// the room's assets for the mode in use (the dark ones when the mode has none)
function roomAssets() {
    if (ROOM.forMode === MODE) return ROOM.meta;   // (looked for once per mode, not on every paint)
    ROOM.forMode = MODE;
    const k = utils.IsFile(`${ROOM_ROOT}${MODE}\\room.json`) ? MODE : "dark";
    if (ROOM.mode === k) return ROOM.meta;
    ROOM.mode = k; ROOM.dir = `${ROOM_ROOT}${k}\\`; ROOM.frames.clear(); ROOM.geo = null;
    try {
        ROOM.meta = JSON.parse(utils.ReadTextFile(ROOM.dir + "room.json", 65001));
        ROOM.plate = d2d.Image(ROOM.dir + "plate.jpg");
    } catch (e) { ROOM.meta = ROOM.plate = null; console.log("audio-archive room: " + e); }
    return ROOM.meta;
}
const roomOn = () => AR.layout === "room" && !!roomAssets();
// a patch of slot s, frame f (decoded on first use; the least recently drawn go first)
function roomFrame(s, f) {
    const key = s * 100 + f;
    let img = ROOM.frames.get(key);
    if (img === undefined) {
        try { img = d2d.Image(`${ROOM.dir}slot${pad(s, 2)}-${f}.png`); } catch (e) { img = null; }
    } else ROOM.frames.delete(key);
    ROOM.frames.set(key, img);
    for (const k of ROOM.frames.keys()) { if (ROOM.frames.size <= ROOM_FRAMES_KEPT) break; ROOM.frames.delete(k); }
    return img;
}

// the plate fills the array area (cover-fit); k: screen px per plate px
function roomGeom() {
    const aw = arrayW(), [pw, ph] = ROOM.meta.size;
    if (ROOM.geo && ROOM.geo.aw === aw && ROOM.geo.h === H) return ROOM.geo;
    const k = Math.max(aw / pw, H / ph);
    return (ROOM.geo = { aw, h: H, k, ox: (aw - pw * k) / 2, oy: (H - ph * k) / 2 });
}
// the shelf's albums fill the slots from the left (the far end of the row, the last slot in room.json) to the right
const roomSlots = () => ROOM.meta.slots.length;
const roomSlotOf = i => roomSlots() - 1 - i % roomSlots();
const roomPage = i => Math.floor(i / roomSlots());

// The selected album's slot rises, any other falls back. The album a slot shows is kept while it rises or falls, so a
// case going down after a page turn still shows the album it held.
function roomUpdate(dt) {
    if (!roomOn()) return false;
    const g = curGroup(), r = AR.rows.get(AR.group), a = curAlbum(), sel = r && a ? roomSlotOf(r.sel) : -1;
    if (sel >= 0 && ROOM.album.get(sel) !== a && !(ROOM.rise.get(sel) || { x: 0 }).x) ROOM.album.set(sel, a);
    let more = false;
    for (let s = 0; s < roomSlots(); s++) {
        let sp = ROOM.rise.get(s);
        const to = s === sel && g ? 1 : 0;
        if (!sp) { if (!to) continue; sp = Spring(0, 9); ROOM.rise.set(s, sp); }
        // a page turn on the same slot: the case goes down first, then comes up with the new album
        if (to && ROOM.album.get(s) !== a) sp.to = 0;
        else sp.to = to;
        if (sp.x < .002 && sp.to === 0 && ROOM.album.get(s) !== a && s === sel) ROOM.album.set(s, a);
        more = stepSpring(sp, dt) || more;
        if (!sp.x && !sp.to) ROOM.rise.delete(s);
    }
    return more;
}

function drawRoom(gr) {
    THUMB_KEEP.clear();
    if (!arRows().length) { drawArchiveEmpty(gr); return; }
    if (AF.open) { AR.hits = []; drawArtistFile(gr); drawInfoLayer(gr); return; }   // artist.js
    const G = roomGeom(), M = ROOM.meta, nf = M.frames, aw = G.aw, r = AR.rows.get(AR.group);
    // the selected case rises without a key pressed (the layout just switched on, or the view shown)
    if (r && curAlbum() && !ROOM.rise.has(roomSlotOf(r.sel))) clock.wake();
    gr.PushClip(0, 0, aw, H);
    gr.DrawImage(ROOM.plate, G.ox, G.oy, ROOM.plate.Width * G.k, ROOM.plate.Height * G.k, 0, 0, ROOM.plate.Width, ROOM.plate.Height);
    // the risen cases, the far ones first (higher slot numbers stand further back)
    const up = [...ROOM.rise].filter(([, sp]) => sp.x > .002).sort((p, q) => q[0] - p[0]);
    for (const [s, sp] of up) {
        const S = M.slots[s], x = clamp(sp.x, 0, 1) * (nf - 1), f0 = Math.min(nf - 2, Math.floor(x)), f = x - f0;
        // the window's quad between the two frames, a little larger than the window: between frames the patches' holes
        // do not quite meet the interpolated quad, and what is too much lies under the case's frame
        const q0 = S.frames[f0].cover, q1 = S.frames[f0 + 1].cover, qm = q0.map((p, j) => [lerp(p[0], q1[j][0], f), lerp(p[1], q1[j][1], f)]);
        const cx = qm.reduce((v, p) => v + p[0], 0) / 4, cy = qm.reduce((v, p) => v + p[1], 0) / 4, q = qm.map(([x, y]) => [cx + (x - cx) * 1.06, cy + (y - cy) * 1.06]);
        const a = ROOM.album.get(s), big = a ? cover(albumFirst(a), () => window.Repaint()) : null, t = a ? thumbOf(a) : null;
        const img = big && big.img ? big.img : t ? t.img : null;
        const [rx, ry, rx1, ry1] = S.rect, p0 = roomFrame(s, f0), p1 = f > .01 ? roomFrame(s, f0 + 1) : null;
        const dx = G.ox + rx * G.k, dy = G.oy + ry * G.k, dw = (rx1 - rx) * G.k, dh = (ry1 - ry) * G.k;
        // the cover only within the patch, inside its feathered edge (where the patch fades into the plate it is not
        // opaque): below it the window is behind the rows in front, which the plate shows
        const fe = (M.feather || 0) * G.k, [pw, ph] = M.size;
        const cx0 = dx + (rx > 0 ? fe : 0), cy0 = dy + (ry > 0 ? fe : 0), cx1 = dx + dw - (rx1 < pw ? fe : 0), cy1 = dy + dh - (ry1 < ph ? fe : 0);
        gr.PushClip(Math.floor(cx0), Math.floor(cy0), Math.ceil(cx1 - cx0), Math.ceil(cy1 - cy0));
        if (img) quadImage(gr, img, q, G.ox, G.oy, G.k);
        else gr.FillPolygon(C.well, 0, quadPts(q, G.ox, G.oy, G.k));
        gr.PopClip();
        if (p0) gr.DrawImage(p0, dx, dy, dw, dh, 0, 0, p0.Width, p0.Height);
        if (p1) gr.DrawImage(p1, dx, dy, dw, dh, 0, 0, p1.Width, p1.Height, 0, Math.round(255 * f));
    }
    // the room dissolves into the page towards the album file and the controls, as the array does
    const edge = LABEL_LIVE ? withAlpha(C.bg, .8) : C.bg;
    gr.FillGradRect(aw - dp(100), 0, dp(100) + 1, H, 0, withAlpha(C.bg, 0), edge);
    gr.FillGradRect(0, H - dp(139), aw, dp(80) + 1, 90, withAlpha(C.bg, 0), edge);
    gr.FillSolidRect(0, H - dp(60), aw, dp(60), edge);
    drawRoomPage(gr);
    drawSelectNumeral(gr);
    drawGroupSwitch(gr);
    drawArchiveBar(gr);
    gr.PopClip();
    drawInfoLayer(gr);
}
// PAGE 2 / 5 under the selection numeral, when the shelf has more albums than the room has cases
function drawRoomPage(gr) {
    const g = curGroup(), r = AR.rows.get(AR.group);
    if (!g || !r || g.albums.length <= roomSlots()) return;
    const n = Math.ceil(g.albums.length / roomSlots());
    label(gr, tr("PAGE {0} / {1}", pad(roomPage(r.sel) + 1, 2), pad(n, 2)), st(AR_ST.sel, C["text-muted"]), dp(24), H - dp(176));
}

// the slot under the mouse: its case at rest or risen (the cases overlap along the row, the nearest centre wins)
function roomSlotAt(x, y) {
    if (!roomOn() || x >= arrayW()) return -1;
    const G = roomGeom(), M = ROOM.meta, px = (x - G.ox) / G.k, py = (y - G.oy) / G.k;
    let best = -1, bd = 1e9;
    M.slots.forEach((S, s) => {
        const a = S.frames[0].cover, b = S.frames[S.frames.length - 1].cover;
        const x0 = Math.min(a[0][0], a[3][0]), x1 = Math.max(a[1][0], a[2][0]), y0 = Math.min(b[0][1], b[1][1]), y1 = Math.max(a[2][1], a[3][1]);
        if (px < x0 || px > x1 || py < y0 || py > y1) return;
        const d = Math.abs(px - (x0 + x1) / 2);
        if (d < bd) { bd = d; best = s; }
    });
    return best;
}
// the album a slot holds on the selected shelf's current page, or -1
function roomAlbumAt(s) {
    const g = curGroup(), r = AR.rows.get(AR.group);
    if (!g || !r || s < 0) return -1;
    const i = roomPage(r.sel) * roomSlots() + (roomSlots() - 1 - s);
    return i < g.albums.length ? i : -1;
}
function roomMouseMove(x, y) {
    const h = roomAlbumAt(roomSlotAt(x, y));
    if (h !== ROOM.hover) { ROOM.hover = h; window.SetCursor(h >= 0 ? 32649 : 32512); }   // IDC_HAND / IDC_ARROW
    return h >= 0;
}
function roomClick(x, y) {
    const i = roomAlbumAt(roomSlotAt(x, y)), r = AR.rows.get(AR.group);
    if (i >= 0 && r && i !== r.sel) moveAlbum(i - r.sel);
}
function roomDoubleClick(x, y) {
    const i = roomAlbumAt(roomSlotAt(x, y)), r = AR.rows.get(AR.group);
    if (i >= 0 && r && i === r.sel) { playAlbum(); return true; }
    return false;
}
function roomKey(vk) {
    switch (vk) {
        case 0x25: moveAlbum(-1); return true;   // ←: the album to the left
        case 0x27: moveAlbum(1); return true;    // →
        case 0x26: moveGroup(1); return true;    // ↑: the shelf behind
        case 0x28: moveGroup(-1); return true;   // ↓
        case 0x21: moveAlbum(-roomSlots()); return true;   // Page Up: a page back
        case 0x22: moveAlbum(roomSlots()); return true;    // Page Down
        case 0x0D: if (curAlbum()) openAlbum(); return true;   // Enter: no inspection in the room
    }
    return false;
}
