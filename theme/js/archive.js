"use strict";
// 01 · ARCHIVE, drawn by the stage panel (stage.js includes this file).
//
//   left   the archive array: rendered specimen cases standing on shelves, shelves receding up-left. Every shelf has
//          the same number of slots: the groups (genre, decade, artist initial or none) follow one another along
//          the shelves, a small group sharing a shelf with the next, a large one continuing on
//          the next shelf. Each shelf keeps its own selection and lifts a
//          wave around it; the selected case decrypts frost → clear and gets corner marks and a leader to its ARC
//          number. Below: ALBUM / SELECT numeral, album index (navigation), shelf switcher. Click the selected case
//          (or Enter) to inspect it: the case is lifted straight up out of its row, then turns square-on in front
//          (and goes back the same way).
//   right  the album file: eyebrow, bracketed album number, format chip, title plate, artist, profile table, first
//          tracks, PLAY ALBUM / OPEN ALBUM, ghost row name.
// Each case is one pre-rendered sprite (frost and clear) with the cover mapped into its window underneath
// (case.json: quads and axes); inactive rows use tinted copies of the sprite made once per tint level and mode.

const AR_ST = {
    eyebrow: { size: 9, weight: 500, track: .14 },
    eyebrowB: { size: 9, weight: 700, track: .14 },
    head: { size: 13, weight: 600, track: .12 },
    artist: { size: 13, weight: 500, track: .06 },
    meta: { size: 10, weight: 500, track: .12 },
    key: { size: 8.5, weight: 500, track: .12 },
    btn: { size: 11, weight: 600, track: .1 },
    sel: { size: 9, weight: 500, track: .14 },
    group: { size: 13, weight: 700, track: .14 },
    plate: { size: 9, weight: 600, track: .06 },
    insp: { size: 10, weight: 600, track: .12 },
    inspM: { size: 9, weight: 500, track: .12 },
    more: { size: 10, weight: 500, track: .12 },
};
const AS = .54;                    // array sprite px → dp (the renders are 2× for sharpness)
const PITCH = 1.0, ROWP = 4.7;     // case spacing along a row and between rows, in case.json axis units
const CLOSE = [.45, -.62, .64];    // "towards the viewer", for back-to-front sorting
const INFO_W = 456, ARCHIVE_PLAYLIST = "Archive · Album";
const LIFT_OUT = 2.2;              // how far the inspected case rises out of its row, in case.json axis units
const INSP_LIFT = .32, INSP_TURN = .72, INSPECT_ZOOM = 2.05;   // stage durations (s); size at the end of the turn

const AR = {
    group: 0,
    rows: new Map(),               // row index -> { sel, scroll, pos, cases: Map(i -> { lift, clear, gap }) }
    selKey: new Map(),             // row name -> the album selected on it
    selAlbum: "",                  // key of the selected album (survives re-indexing, regrouping and the layout switch)
    wantKey: "",                   // a selection waiting for its item to be listed (see placeSelection)
    hover: -1, hoverTick: -1, hits: [], from: [0, 0], infoHover: -1,
    insp: 0, inspOn: false,        // inspection timeline: 0 in the row · 1 lifted out · 2 square-on in front
    selRoll: Roll("01"), groupRoll: Roll("01"), noRoll: Roll("0000"),
    title: null, tracks: { key: "", rows: [], total: 0 },
    rulerStart: Spring(0, 14), ticks: new Map(),
    dirtyInfo: true, info: null,
};
let ARCHIVE_ON = false;
try { AR.selAlbum = String(JSON.parse(window.GetProperty("archiveSel", "{}")).key || ""); } catch (e) { /* none */ }

// ------------------------------------------------------------------------------------------------------ shelves
// The array's rows are shelves of SHELF_SLOTS slots. The groups follow one another along them: a group that fits
// where the shelf has room goes there, right after the previous one (the shelf's name below the array and the file
// panel say which group a case belongs to), a larger one fills the shelf and
// continues on the next, so every shelf but the last is full.
// shelf: { name, albums, slot (each album's slot), slots, segs: [{ gi, name, from, n, slot, part, parts, total }] }
// The grid's sections are the plain groups; both layouts share the selected album.
const SHELF_SLOTS = 20;
let SHELVES = [];
function buildShelves() {
    const out = [], parts = new Map();
    let cur = null;
    const open = () => { cur = { albums: [], slot: [], slots: SHELF_SLOTS, segs: [], used: 0 }; out.push(cur); };
    LIB.groups.forEach((g, gi) => {
        for (let i = 0; i < g.albums.length;) {
            if (!cur || cur.used >= SHELF_SLOTS) open();
            const room = SHELF_SLOTS - cur.used, left = g.albums.length - i, n = Math.min(left, room);
            const seg = { gi, name: g.name, from: cur.albums.length, n, slot: cur.used, total: g.albums.length };
            for (let k = 0; k < n; k++) { cur.albums.push(g.albums[i + k]); cur.slot.push(seg.slot + k); }
            cur.used = seg.slot + n;
            cur.segs.push(seg);
            if (!parts.has(gi)) parts.set(gi, []);
            parts.get(gi).push(seg);
            i += n;
        }
    });
    for (const list of parts.values()) list.forEach((s, k) => { s.part = k + 1; s.parts = list.length; });
    out.forEach(s => {
        const one = s.segs[0];
        s.name = s.segs.length > 1 ? s.segs.map(g => g.name).join("  ·  ") : one ? one.name + (one.parts > 1 ? `  ${one.part} / ${one.parts}` : "") : "";
    });
    SHELVES = out;
}
// the rows of the layout in use: shelves (array) or groups (grid)
const arRows = () => AR.layout === "grid" ? LIB.groups : SHELVES;
const slotOf = (row, i) => row.slot ? row.slot[i] : i;
const slotCount = row => row.slots || row.albums.length;

const curGroup = () => arRows()[AR.group] || null;
const curAlbum = () => { const g = curGroup(), r = AR.rows.get(AR.group); return g && r ? g.albums[r.sel] || null : null; };

// ------------------------------------------------------------------------------------------------------- data
let coverPaint = 0;
LIB_LISTENERS.push(kind => {
    if (kind === "catalog") placeSelection(AR.selAlbum);
    if (!ARCHIVE_ON) return;
    if (kind === "catalog") { requestVisibleThumbs(); clock.wake(); window.Repaint(); return; }
    // covers arrive in bursts (a screen of the grid at once): one repaint of the array area for all of them
    if (!coverPaint) coverPaint = window.SetTimeout(() => { coverPaint = 0; window.RepaintRect(0, 0, arrayW(), H); }, 16);
});
// rows rebuilt (catalog, grouping, layout): select `key` again where it now is, else stay near the same row
function placeSelection(key) {
    if (AR.layout !== "grid") buildShelves();
    const R = arRows();
    // An album or track not listed yet (a track before the worker has listed them, an album still indexing) is kept as
    // wanted and looked for again with the next catalog, until something else is selected by hand.
    const want = AR.wantKey || key;
    // across ALBUMS / TRACKS the selection moves to the album's first track, or to the track's album
    const alt = !want ? "" : want.startsWith("t|") ? ((LIB.items.find(t => t.key === want) || {}).album || "") : ((LIB.items.find(t => t.album === want) || {}).key || "");
    let at = null;
    for (const k of [want, alt, key]) if (k) for (let gi = 0; gi < R.length && !at; gi++) { const i = R[gi].albums.findIndex(a => a.key === k); if (i >= 0) at = [gi, i]; }
    AR.wantKey = at || !LIB.live ? (at ? "" : want) : "";
    AR.group = at ? at[0] : clamp(AR.group, 0, Math.max(0, R.length - 1));
    AR.rows.clear(); AR.ticks.clear(); AR.selKey.clear();
    AR.tracks.key = "";
    if (R.length) {
        const r = rowState(AR.group);
        if (at) { r.sel = at[1]; r.scroll.x = r.scroll.to = scrollTarget(r.sel, R[AR.group]); }
    }
    selectionChanged(false);
}

function selIndexOf(gi) {
    const g = arRows()[gi], key = g && AR.selKey.get(g.name);
    const i = key ? g.albums.findIndex(a => a.key === key) : -1;
    return Math.max(0, i);
}
function rowState(gi) {
    let r = AR.rows.get(gi);
    if (!r) {
        const sel = selIndexOf(gi);
        r = { sel, scroll: Spring(scrollTarget(sel, arRows()[gi]), 9), pos: Spring(gi - AR.group, 9), cases: new Map() };
        AR.rows.set(gi, r);
    }
    return r;
}
// the row scrolls (in slots) only when it is longer than the array shows; the selected case then sits a few places
// from the front
const scrollTarget = (sel, row) => clamp(slotOf(row, sel) - 4, 0, Math.max(0, slotCount(row) - slotsInView()));
let SLOTS_IN_VIEW = { key: "", n: 0 };
function slotsInView() {
    const key = `${W}|${H}|${CASE_DIR}`;
    if (SLOTS_IN_VIEW.key === key) return SLOTS_IN_VIEW.n;
    const k = arK(), ax = CASE_META.axes, m = CASE_META.array, S = CASE_META.array_res[0] * k, [Ox, Oy] = origin(), aw = arrayW();
    let n = 0;
    while (n < 400) {
        const ox = Ox + n * ax.y[0] * k - m.origin[0] * k, oy = Oy + n * ax.y[1] * k - m.origin[1] * k;
        if (ox + S * .7 > aw || oy < -S * .3) break;
        n++;
    }
    SLOTS_IN_VIEW = { key, n: Math.max(6, n) };
    return SLOTS_IN_VIEW.n;
}

function selectionChanged(animate = true) {
    const g = curGroup(), a = curAlbum();
    if (animate) AR.wantKey = "";   // chosen by hand
    AR.groupName = g ? g.name : "";
    if (g && a) { AR.selKey.set(g.name, a.key); AR.selAlbum = a.key; }
    window.SetProperty("archiveSel", JSON.stringify({ key: AR.selAlbum }));
    const r = AR.rows.get(AR.group), n = g ? g.albums.length : 0, w = Math.max(2, String(n).length);
    const sel = pad(r ? r.sel + 1 : 0, w), gno = pad(AR.group + 1, 2), no = pad(a ? a.no : 0, 4);
    if (animate) { setRoll(AR.selRoll, sel); setRoll(AR.groupRoll, gno); setRoll(AR.noRoll, no); }
    else { AR.selRoll = Roll(sel); AR.groupRoll = Roll(gno); AR.noRoll = Roll(no); }
    AR.title = a && animate ? Scramble(a.title || "UNTITLED") : null;
    AR.dirtyInfo = true;
    if (AR.layout === "grid") GRID.reveal = true;   // the grid scrolls to a selection made elsewhere (keys, catalog)
    if (ARCHIVE_ON) { requestVisibleThumbs(); clock.wake(); }
}

function moveAlbum(d) {
    const g = curGroup();
    if (!g || AR.inspOn || AR.insp > 0) return;
    const r = rowState(AR.group), sel = clamp(r.sel + d, 0, g.albums.length - 1);
    if (sel === r.sel) return;
    r.sel = sel;
    r.scroll.to = scrollTarget(sel, g);
    selectionChanged();
}
function moveGroup(d) {
    const gi = clamp(AR.group + d, 0, arRows().length - 1);
    if (gi === AR.group || AR.inspOn || AR.insp > 0) return;
    AR.group = gi;
    AR.ticks.clear();
    rowState(gi);
    selectionChanged();
}

// the tracks of the selected item's album for the file panel, as many as fit (`max`), in disc / track order; each row
// knows its place in the album (a click plays the album from there) and whether it is the selected track item
const TF_AR_TRACK = fb.TitleFormat("[%tracknumber%]\u0001%title%\u0001[%length_seconds%]");
const sameTrack = (h, k) => !!(h && k && h.RawPath === k.RawPath && h.SubSong === k.SubSong);
function albumTracks(a, max) {
    const key = `${a.key}|${LIB.live}|${max}`;
    if (AR.tracks.key === key) return AR.tracks;
    const list = albumHandles(a), np = fb.GetNowPlaying(), own = itemTrack(a);
    let rows = [], first = 0;
    if (list) {
        // a track item further down its album: start the window so it is in view
        const at = own ? [...Array(list.Count).keys()].find(i => sameTrack(list[i], own)) : -1;
        first = at > max - 2 ? Math.min(at - 1, Math.max(0, list.Count - max)) : 0;
        const n = Math.min(max, list.Count - first), sub = fb.CreateHandleList();
        for (let i = 0; i < n; i++) sub.Add(list[first + i]);
        rows = TF_AR_TRACK.EvalWithMetadbs(sub).map((s, k) => {
            const [no, title, len] = s.split("\u0001"), i = first + k, h = list[i];
            return { i, no: no ? pad(parseInt(no) || 0, 2) : pad(i + 1, 2), title, len: +len || 0, playing: sameTrack(h, np), own: sameTrack(h, own) };
        });
    }
    AR.tracks = { key, rows, first, total: list ? list.Count : (albumOf(a) || a).tracks };
    return AR.tracks;
}

function fmtChip(a) {
    const codec = (a.codec || "—").toUpperCase();
    if (a.lossless && a.bits && a.rate) return `${codec} ${a.bits}/${+(a.rate / 1000).toFixed(1)}`;
    return a.kbps ? `${codec} ${a.kbps}` : codec;
}

// ------------------------------------------------------------------------------------------------------ motion
function archiveUpdate(dt) {
    const G = arRows();
    if (!G.length) return false;
    let more = stepInspection(dt);
    // rows: the current one, three behind it, one more fading in at the back and the one leaving towards the viewer
    for (let gi = AR.group - 1; gi <= AR.group + 4; gi++) if (gi >= 0 && gi < G.length) rowState(gi).pos.to = gi - AR.group;
    for (const gi of [...AR.rows.keys()]) if (gi < AR.group - 1 || gi > AR.group + 4) AR.rows.delete(gi);
    for (const [gi, r] of AR.rows) {
        more = stepSpring(r.pos, dt) || more;
        more = stepSpring(r.scroll, dt) || more;
        const active = gi === AR.group, [i0, i1] = caseWindow(r, G[gi]);
        for (const i of [...r.cases.keys()]) if (i < i0 || i > i1) r.cases.delete(i);
        for (let i = i0; i <= i1; i++) {
            const t = caseTargets(i, r, active, G[gi]);
            let c = r.cases.get(i);
            if (!c) { c = { lift: Spring(t.lift, 13), clear: Spring(t.clear, 8), gap: Spring(t.gap, 11) }; r.cases.set(i, c); }
            c.lift.to = t.lift; c.lift.w = active ? 13 : 7; c.clear.to = t.clear; c.gap.to = t.gap;
            const m1 = stepSpring(c.lift, dt), m2 = stepSpring(c.clear, dt), m3 = stepSpring(c.gap, dt);
            more = more || m1 || m2 || m3;
        }
    }
    // album index marks
    const r = AR.rows.get(AR.group);
    if (r) {
        const M = rulerCount(), n = G[AR.group].albums.length;
        AR.rulerStart.to = clamp(r.sel - Math.floor(M / 2), 0, Math.max(0, n - M));
        more = stepSpring(AR.rulerStart, dt) || more;
        const s0 = Math.floor(AR.rulerStart.x);
        for (const i of [...AR.ticks.keys()]) if (i < s0 - 1 || i > s0 + M + 1) AR.ticks.delete(i);
        for (let i = Math.max(0, s0 - 1); i <= Math.min(n - 1, s0 + M + 1); i++) {
            const hd = AR.hoverTick >= 0 ? i - AR.hoverTick : 99;
            const to = i === r.sel ? 30 : Math.max(10, 10 + 12 * Math.exp(-hd * hd / 1.5));
            let s = AR.ticks.get(i);
            if (!s) { s = Spring(to, 18); AR.ticks.set(i, s); }
            s.to = to;
            more = stepSpring(s, dt) || more;
        }
    }
    if (AR.title && !scrambleDone(AR.title)) { more = true; AR.dirtyInfo = true; }
    if (!rollDone(AR.noRoll)) { more = true; AR.dirtyInfo = true; }
    if (!rollDone(AR.selRoll) || !rollDone(AR.groupRoll)) more = true;
    return more;
}
// the cases of a row that can be on screen (with room for lift and gap): cases enter and leave out of sight, behind
// the edges and fades, instead of popping in or out where they stand when the row scrolls
function caseWindow(r, row, pos = r.pos.x, scroll = r.scroll.x) {
    const n = row ? row.albums.length : 0;
    if (!n || W <= 0) return [0, -1];
    const k = arK(), ax = CASE_META.axes, m = CASE_META.array, S = CASE_META.array_res[0] * k, [Ox, Oy] = origin();
    const aw = arrayW(), margin = dp(160), x = -pos * ROWP;
    let i0 = -1, i1 = -1;
    for (let i = 0; i < n; i++) {
        const y = slotOf(row, i) - scroll;
        if (y < -30 || y > 60) continue;
        const ox = Ox + (x * ax.x[0] + y * ax.y[0]) * k - m.origin[0] * k, oy = Oy + (x * ax.x[1] + y * ax.y[1]) * k - m.origin[1] * k;
        if (ox < aw + margin && ox + S > -margin && oy < H + margin && oy + S > -margin * 2) { if (i0 < 0) i0 = i; i1 = i; }
    }
    return i0 < 0 ? [0, -1] : [i0, i1];
}

// The inspection runs in two stages with an ease at both ends of each, so the case first rises out of its row, stops,
// then turns towards the viewer; going back it turns away above its place and then sinks into the row. The turn waits
// until the inspection frames have loaded.
const inspLift = () => easeInOut(clamp(AR.insp, 0, 1));
const inspTurn = () => easeInOut(clamp(AR.insp - 1, 0, 1));
function stepInspection(dt) {
    const target = AR.inspOn ? (ARIMG.inspect ? 2 : 1) : 0;
    if (AR.insp === target) return AR.inspOn && !ARIMG.inspect;
    if (REDUCE_MOTION) { AR.insp = target; return false; }
    const dir = Math.sign(target - AR.insp), lifting = dir > 0 ? AR.insp < 1 : AR.insp <= 1;
    const next = AR.insp + dir * dt / (lifting ? INSP_LIFT : INSP_TURN);
    AR.insp = dir > 0 ? Math.min(next, target) : Math.max(next, target);
    return true;
}
function caseTargets(i, r, active, row) {
    const d = slotOf(row, i) - slotOf(row, r.sel), bell = Math.exp(-d * d / 4.5) - .32 * Math.exp(-d * d / 18), hd = i - AR.hover;
    const hov = active && AR.hover >= 0 ? .5 * Math.exp(-hd * hd / 2.2) : 0, isSel = active && i === r.sel;
    return {
        lift: (active ? 1.1 : .65) * bell + hov + (isSel ? 1.35 : 0),
        clear: isSel ? 1 : 0,
        gap: active ? (i > r.sel ? .55 : i < r.sel ? -.25 : 0) : 0,
    };
}

// ------------------------------------------------------------------------------------------------------ layout
const infoX = () => W - dp(24 + INFO_W);
const arrayW = () => Math.max(dp(300), infoX() - dp(24));
const origin = () => [Math.round(arrayW() * .37), H - dp(87)];
// the array grows with the view: 1 at the design's 1440 × 900 window (array 936 × 731 dp), up to 1.6 on large screens,
// so a maximised window on a big display is filled instead of showing the same small cases in a sea of black
const AR_REF = [936, 731];
const arZoom = () => clamp(Math.min(arrayW() / dp(AR_REF[0]), H / dp(AR_REF[1])), 1, 1.6);
const arK = () => AS * SCALE * arZoom();   // array sprite px → screen px
// the album index fits between ALBUM / SELECT and the row switcher
const RULER_STEP = 7;
const rulerX0 = () => Math.round(arrayW() * .34);
const rulerCount = () => Math.max(8, Math.floor((Math.round(arrayW() * .774) - dp(150) - rulerX0() - dp(40)) / dp(RULER_STEP)));

// ------------------------------------------------------------------------------------------------------ images
const ARIMG = { clear: null, frost: null, faded: new Map(), inspect: null, inspectLoading: false, gen: 0, rail: null };
// the guide rail under each row: sprites made with the cases' camera, one per slot plus the row's
// front and back ends; they belong to the archive, not to a case skin
const RAIL_DIR = THEME_ROOT + "assets\\render\\rail\\";
const RAIL_META = utils.IsFile(RAIL_DIR + "rail.json") ? JSON.parse(utils.ReadTextFile(RAIL_DIR + "rail.json", 65001)) : null;
function railImages() {
    if (!ARIMG.rail && RAIL_META) {
        ARIMG.rail = {};
        for (const k of ["mid", "front", "back"]) {
            ARIMG.rail[k] = d2d.Image(RAIL_DIR + `rail-${k}.png`);
            if (RAIL_META.lip) ARIMG.rail["lip-" + k] = d2d.Image(RAIL_DIR + `lip-${k}.png`);
        }
    }
    return ARIMG.rail;
}
CASE_LISTENERS.push(() => {   // another case skin
    ARIMG.clear = ARIMG.frost = ARIMG.inspect = null; ARIMG.faded.clear(); ARIMG.inspectLoading = false; ARIMG.gen++;
    AR.inspOn = false; AR.insp = 0; AR.dirtyInfo = true;
    if (ARCHIVE_ON) { clock.wake(); window.Repaint(); }
});
function arrayImages() {
    if (!ARIMG.clear) { ARIMG.clear = d2d.Image(CASE_DIR + "array-clear.png"); ARIMG.frost = d2d.Image(CASE_DIR + "array-frost.png"); }
    return ARIMG;
}
// the frost sprite tinted towards the background by f (0.1 steps), alpha kept: Direct2D colour matrix, made once
const fadedSprite = f => tinted(arrayImages().frost, f, "case" + CASE_DIR);
function tinted(src, f, name) {
    const key = MODE + f + name;
    let img = ARIMG.faded.get(key);
    if (img) return img;
    const fx = d2d.Effect("{921F03D6-641C-47DF-852D-B4BB6153AE11}");
    const bg = C.bg, r = ((bg >>> 16) & 255) / 255, g = ((bg >>> 8) & 255) / 255, b = (bg & 255) / 255, k = 1 - f;
    fx.SetInput(0, src);
    fx.SetValue(0, new Float32Array([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1, r * f, g * f, b * f, 0]));
    img = d2d.CreateImage(src.Width, src.Height);
    const gr = img.GetGraphics();
    gr.DrawEffect(fx, 0, 0, 0, 0, src.Width, src.Height);
    img.ReleaseGraphics(gr);
    ARIMG.faded.set(key, img);
    return img;
}
TOKEN_LISTENERS.push(() => { ARIMG.faded.clear(); AR.dirtyInfo = true; });

function inspectImages() {
    if (ARIMG.inspect || ARIMG.inspectLoading) return ARIMG.inspect;
    ARIMG.inspectLoading = true;
    const n = CASE_META.inspect.length, imgs = new Array(n), gen = ARIMG.gen;
    let left = n;
    // a frame that cannot be read sends the case back into its row (rather than waiting, and ticking, forever)
    const fail = () => { if (gen !== ARIMG.gen) return; ARIMG.gen++; ARIMG.inspectLoading = false; AR.inspOn = false; clock.wake(); };
    for (let i = 0; i < n; i++) d2d.LoadImageAsyncV2(0, CASE_DIR + `inspect-${pad(i, 2)}.png`).then(img => {
        if (gen !== ARIMG.gen) return;
        if (!img) { fail(); return; }
        imgs[i] = img;
        if (--left === 0) { ARIMG.inspect = imgs; ARIMG.inspectLoading = false; clock.wake(); window.Repaint(); }
    }, fail);
    return null;
}
// the archive's big images are kept only while it is shown
function archiveHidden() { AR.inspOn = false; AR.insp = 0; ARIMG.inspect = null; ARIMG.gen++; ARIMG.inspectLoading = false; ARIMG.faded.clear(); ARIMG.clear = ARIMG.frost = ARIMG.rail = null; AR.info = null; }

// covers of what is on screen, nearest first: the current row around the selection, then the rows behind
function requestVisibleThumbs() {
    if (AR.layout === "grid") { gridThumbs(); return; }
    const G = arRows(), list = [];
    for (let gi = AR.group; gi <= Math.min(G.length - 1, AR.group + 3); gi++) {
        const r = rowState(gi), albums = G[gi].albums, [i0, i1] = caseWindow(r, G[gi], gi - AR.group, r.scroll.to);
        const idx = [];
        for (let i = i0; i <= i1; i++) idx.push(i);
        idx.sort((p, q) => Math.abs(p - r.sel) - Math.abs(q - r.sel));
        idx.forEach(i => list.push(albums[i]));
    }
    requestThumbs(list);
}

// ------------------------------------------------------------------------------------------------------ drawing
const QM = new Float32Array(6);
// image into the parallelogram q (sprite px; q[0] top-left, q[1] top-right, q[3] bottom-left) placed at (ox, oy) × k
function quadImage(gr, img, q, ox, oy, k, alpha = 255) {
    const w = img.Width, h = img.Height;
    QM[0] = (q[1][0] - q[0][0]) * k / w; QM[1] = (q[1][1] - q[0][1]) * k / w;
    QM[2] = (q[3][0] - q[0][0]) * k / h; QM[3] = (q[3][1] - q[0][1]) * k / h;
    QM[4] = ox + q[0][0] * k; QM[5] = oy + q[0][1] * k;
    gr.SetTransform(QM);
    gr.DrawImage(img, 0, 0, w, h, 0, 0, w, h, 0, alpha);
    gr.ResetTransform();
}
const quadPts = (q, ox, oy, k) => q.flatMap(([x, y]) => [ox + x * k, oy + y * k]);
// one rail sprite at screen point (sx, sy) of its slot; rows behind are tinted like their cases
function drawRailSlot(gr, it, sx, sy, k, aw) {
    const img = accentShift(ARIMG.rail[it.rail]), [rw, rh] = RAIL_META.res, ox = sx - RAIL_META.origin[0] * k, oy = sy - RAIL_META.origin[1] * k;
    if (ox > aw || ox + rw * k < 0 || oy > H || oy + rh * k < 0) return;
    const alpha = rowAlpha(it.pos), f = rowTint(it.pos);
    gr.DrawImage(f > 0 ? tinted(img, f, "rail-" + it.rail) : img, ox, oy, rw * k, rh * k, 0, 0, rw, rh, 0, alpha);
    // the row's number on the front end's label plate
    if (it.rail === "front" && f < .5) {
        const q = RAIL_META.label;
        QM[0] = (q[1][0] - q[0][0]) * k / 100; QM[1] = (q[1][1] - q[0][1]) * k / 100;
        QM[2] = (q[3][0] - q[0][0]) * k / 20; QM[3] = (q[3][1] - q[0][1]) * k / 20;
        QM[4] = ox + q[0][0] * k; QM[5] = oy + q[0][1] * k;
        if (!LABEL_FONTS.row) LABEL_FONTS.row = d2d.Font("Geist Mono SemiBold", 12, 0);
        gr.SetTransform(QM);
        gr.DrawText(`ROW ${pad(it.gi + 1, 2)}`, LABEL_FONTS.row, withAlpha(0xFF1B1C18, alpha / 255), 6, 1, 94, 18, DT_SINGLE);
        gr.ResetTransform();
    }
}

// "ARC / 0269" printed on the spine label (a 100 × 60 box mapped onto the label quad)
const LABEL_FONTS = { a: null, b: null };
function drawSpineLabel(gr, q, ox, oy, k, no, alpha = 255) {
    if (!LABEL_FONTS.a) { LABEL_FONTS.a = d2d.Font("Geist Mono SemiBold", 15, 0); LABEL_FONTS.b = d2d.Font("Geist Mono", 22, 1); }
    QM[0] = (q[1][0] - q[0][0]) * k / 100; QM[1] = (q[1][1] - q[0][1]) * k / 100;
    QM[2] = (q[3][0] - q[0][0]) * k / 60; QM[3] = (q[3][1] - q[0][1]) * k / 60;
    QM[4] = ox + q[0][0] * k; QM[5] = oy + q[0][1] * k;
    gr.SetTransform(QM);
    const ink = withAlpha(0xFF1B1C18, alpha / 255);
    gr.DrawText("ARC", LABEL_FONTS.a, ink, 8, 6, 90, 20, DT_SINGLE);
    gr.DrawText(pad(no, 4), LABEL_FONTS.b, ink, 8, 28, 92, 28, DT_SINGLE);
    gr.ResetTransform();
}

function drawArchive(gr) {
    THUMB_KEEP.clear();
    const G = arRows();
    if (!G.length) { drawArchiveEmpty(gr); return; }
    const aw = arrayW(), [Ox, Oy] = origin(), k = arK(), meta = CASE_META.array, sz = CASE_META.array_res[0];
    const ax = CASE_META.axes, I = arrayImages();
    const lift = inspLift(), turn = inspTurn();
    const toScreen = it => [Ox + (it.x * ax.x[0] + it.y * ax.y[0] + it.z * ax.z[0]) * k, Oy + (it.x * ax.x[1] + it.y * ax.y[1] + it.z * ax.z[1]) * k];
    gr.PushClip(0, 0, aw, H);
    // Shelf by shelf, back to front: a shelf stands wholly behind the shelves in front of it (the camera looks along
    // +x), so each is drawn as one layer: its rail slots and cases back to front, then its front lip if the rail has one.
    const R = railImages(), rows = [...AR.rows].filter(([, r]) => r.pos.x > -1 && r.pos.x < 4).sort((p, q) => q[1].pos.x - p[1].pos.x);
    AR.hits = [];
    let selItem = null;
    for (const [gi, r] of rows) {
        const row = G[gi], albums = row.albums, pos = r.pos.x, x = -pos * ROWP, active = gi === AR.group, [i0, i1] = caseWindow(r, row);
        const nSlots = slotCount(row), items = [];
        // a rail slot sorts just in front of the case behind it and behind the case standing in it
        if (R) for (let s = -1; s <= nSlots; s++) {
            const y = (s - r.scroll.x) * PITCH;
            if (y < -30 || y > 60) continue;
            items.push({ rail: s < 0 ? "front" : s >= nSlots ? "back" : "mid", gi, pos, x, y, z: 0, close: CLOSE[1] * (y + .4) });
        }
        for (let i = i0; i <= i1; i++) {
            const c = r.cases.get(i);
            if (!c) continue;
            const isSel = active && i === r.sel;
            const y = (slotOf(row, i) - r.scroll.x) * PITCH + c.gap.x, z = c.lift.x + (isSel ? LIFT_OUT * lift : 0);
            items.push({ gi, i, c, a: albums[i], active, isSel, pos, x, y, z, close: CLOSE[1] * y + CLOSE[2] * z * .2 });
        }
        items.sort((p, q) => p.close - q.close);
        for (const it of items) {
            const [sx, sy] = toScreen(it);
            if (it.rail) { drawRailSlot(gr, it, sx, sy, k, aw); continue; }
            selItem = drawArrayCase(gr, it, sx, sy, k, aw, I) || selItem;
        }
        drawLip(gr, row, gi, r, x, toScreen, k);
    }
    // the array dissolves into the background towards the file panel and the controls
    gr.FillGradRect(aw - dp(100), 0, dp(100) + 1, H, 0, withAlpha(C.bg, 0), C.bg);
    gr.FillGradRect(0, H - dp(139), aw, dp(80) + 1, 90, withAlpha(C.bg, 0), C.bg);
    gr.FillSolidRect(0, H - dp(60), aw, dp(60), C.bg);
    drawSelectNumeral(gr);
    drawRuler(gr);
    drawGroupSwitch(gr);
    if (turn === 0) drawArchiveBar(gr);
    if (turn > 0) drawInspection(gr, turn);
    gr.PopClip();
    // album file
    if (AR.dirtyInfo || !AR.info) { AR.info = renderLayer(W - infoX() + dp(20), H, drawInfo, AR.info); AR.dirtyInfo = false; }
    gr.DrawImage(AR.info.img, infoX() - dp(20), 0, AR.info.w, AR.info.h, 0, 0, AR.info.w, AR.info.h);
    infoHits(infoX() - dp(20));
}

// one case of the array at screen point (sx, sy); returns { ox, oy } for the selected one
function drawArrayCase(gr, it, sx, sy, k, aw, I) {
    const meta = CASE_META.array, sz = CASE_META.array_res[0];
    const ox = sx - meta.origin[0] * k, oy = sy - meta.origin[1] * k, S = sz * k;
    if (ox > aw || ox + S < 0 || oy > H || oy + S < 0) return null;
    let selItem = null;
    if (it.isSel) { AR.from = [ox + meta.center[0] * k, oy + meta.center[1] * k]; selItem = { ox, oy }; }
    if (it.isSel && inspTurn() > 0) return selItem;                   // drawn by the inspection
    const alpha = rowAlpha(it.pos), f = rowTint(it.pos), t = thumbOf(it.a);
    // cover, under the case
    if (t) quadImage(gr, t.blur, meta.cover, ox, oy, k, alpha);
    else gr.FillPolygon(withAlpha(C.well, alpha / 255), 0, quadPts(meta.cover, ox, oy, k));
    if (f > 0) {
        gr.FillPolygon(withAlpha(C.bg, f * alpha / 255), 0, quadPts(meta.cover, ox, oy, k));
        gr.DrawImage(fadedSprite(f), ox, oy, S, S, 0, 0, sz, sz, 0, alpha);
    } else {
        const cl = clamp(it.c.clear.x, 0, 1);
        if (t && cl > .01) quadImage(gr, t.img, meta.cover, ox, oy, k, Math.round(alpha * cl));
        if (cl < .99) gr.DrawImage(I.frost, ox, oy, S, S, 0, 0, sz, sz, 0, Math.round(alpha * (1 - cl)));
        if (cl > .01) gr.DrawImage(I.clear, ox, oy, S, S, 0, 0, sz, sz, 0, Math.round(alpha * cl));
        if (it.active) drawSpineLabel(gr, meta.label, ox, oy, k, it.a.no, alpha);
    }
    if (it.active && it.pos < .5) AR.hits.push({ i: it.i, quad: meta.cover.map(([px, py]) => [ox + px * k, oy + py * k]) });
    if (it.isSel && it.c.clear.x > .6 && AR.insp === 0) {
        const top = meta.cover[1], x1 = ox + top[0] * k + dp(4), y1 = oy + top[1] * k - dp(4), lx = x1 + dp(26), ly = y1 - dp(30);
        gr.DrawLine(x1, y1, lx, ly, HAIR, C.fg);
        gr.DrawLine(lx, ly, lx + dp(60), ly, HAIR, C.fg);
        const txt = `ARC-${pad(it.a.no, 4)}`, pw = labelWidth(txt, st(AR_ST.plate, C.bg, C.fg)) + dp(16);
        gr.FillSolidRect(lx + dp(60), ly - dp(9), pw, dp(18), C.fg);
        label(gr, txt, st(AR_ST.plate, C.bg, C.fg), lx + dp(68), ly - Math.round(labelHeight(AR_ST.plate) / 2));
        for (const [px, py] of meta.cover) gr.FillSolidRect(Math.round(ox + px * k - dp(3)), Math.round(oy + py * k - dp(3)), dp(6), dp(6), C.accent);
    }
    return selItem;
}

// rows fade out towards the viewer and in at the back; rows behind are tinted towards the page (0.1 steps)
const rowAlpha = pos => Math.round(255 * clamp(1 + pos, 0, 1) * clamp((4 - pos) / .8, 0, 1));
const rowTint = pos => Math.round(clamp(.38 * clamp(pos, 0, 1) + .14 * Math.max(0, pos), 0, .8) * 10) / 10;

// The shelf's front lip, an optional look (lip-*.png, described by rail.json → lip; the shipped rail has none, so this
// draws nothing), drawn after everything standing on the shelf, then its print on the pale face panel, mapped like the spine label (100 units per world unit along the row,
// down the panel): the ∞ emblem on the front end, each group's name where it starts on the shelf (with its size),
// slot numbers under the slots, hazard stripes on the back end.
const LIP_INK = 0xFF1B1C18, LIP_SOFT = 0xFF77766F;
function drawLip(gr, row, gi, r, x, toScreen, k) {
    const L = RAIL_META && RAIL_META.lip, R = ARIMG.rail;
    if (!L || !R || !R["lip-mid"]) return;
    const pos = r.pos.x, alpha = rowAlpha(pos), aw = arrayW(), n = slotCount(row);
    if (alpha <= 0) return;
    for (let sl = -1; sl <= n; sl++) {
        const y = (sl - r.scroll.x) * PITCH;
        if (y < -30 || y > 60) continue;
        const [sx, sy] = toScreen({ x, y, z: 0 });
        drawRailSlot(gr, { rail: sl < 0 ? "lip-front" : sl >= n ? "lip-back" : "lip-mid", gi, pos }, sx, sy, k, aw);
    }
    const f = rowTint(pos);
    if (f >= .5) return;   // too far back to read
    const tone = c => withAlpha(mix(c, C.bg, f), alpha / 255);
    const y0 = -.5 - r.scroll.x, lx = x + L.x, o = toScreen({ x: lx, y: y0, z: L.z1 }), u = toScreen({ x: lx, y: y0 + 1, z: L.z1 }), v = toScreen({ x: lx, y: y0, z: L.z1 - 1 });
    QM[0] = (u[0] - o[0]) / 100; QM[1] = (u[1] - o[1]) / 100; QM[2] = (v[0] - o[0]) / 100; QM[3] = (v[1] - o[1]) / 100; QM[4] = o[0]; QM[5] = o[1];
    const ph = (L.z1 - L.z0) * 100;   // panel height in units
    if (!LABEL_FONTS.lip) {
        LABEL_FONTS.lip = d2d.Font("Geist Mono SemiBold", 30, 0); LABEL_FONTS.lipC = d2d.Font("Microsoft YaHei UI", 28, 1);
        LABEL_FONTS.lipS = d2d.Font("Geist Mono Medium", 13, 0); LABEL_FONTS.lipN = d2d.Font("Geist Mono", 12, 0);
    }
    gr.SetTransform(QM);
    // front end: the emblem on an ink plate and the shelf number
    gr.FillSolidRect(-84, 10, 76, ph - 20, tone(LIP_INK));
    drawEmblem(gr, 0, -84, 10, 76, ph * .55, 11, tone(0xFFF2F1EC));
    gr.DrawText(`SHELF
${pad(gi + 1, 2)}`, LABEL_FONTS.lipS, tone(0xFFF2F1EC), -84, 10 + ph * .52, 76, ph * .45 - 20, 0x00000800 | 0x00000001);
    // the groups on this shelf
    row.segs.forEach((g, j) => {
        const ux = g.slot * 100 + 6, next = j + 1 < row.segs.length ? row.segs[j + 1].slot - 1 : n, w = (next - g.slot) * 100 - 16;
        gr.FillSolidRect(ux, 16, 8, 8, tone(C.accent));
        gr.DrawText(g.name, isCJK(g.name) ? LABEL_FONTS.lipC : LABEL_FONTS.lip, tone(LIP_INK), ux + 16, 4, Math.max(40, w - 16), 36, DT_SINGLE | DT_ELLIPSIS);
        const meta = `${LIB.groupBy === "none" ? "" : GROUP_LABEL[LIB.groupBy] + " " + pad(g.gi + 1, 2) + "  ·  "}${unitWord(g.total)}${g.parts > 1 ? `  ·  ${g.part} / ${g.parts}` : ""}`;
        gr.DrawText(meta, LABEL_FONTS.lipS, tone(LIP_SOFT), ux + 16, 42, Math.max(40, w - 16), 18, DT_SINGLE | DT_ELLIPSIS);
    });
    // slot numbers and ticks along the bottom of the panel
    gr.FillSolidRect(0, ph - 26, n * 100, 1.2, tone(LIP_SOFT));
    for (let sl = 0; sl < n; sl++) {
        gr.FillSolidRect(sl * 100, ph - 32, 1.2, 12, tone(LIP_SOFT));
        gr.DrawText(pad(sl + 1, 2), LABEL_FONTS.lipN, tone(LIP_SOFT), sl * 100, ph - 22, 100, 16, DT_CENTER_SINGLE);
    }
    // back end: hazard stripes
    gr.PushClip(n * 100 + 8, 10, 70, ph - 20);
    for (let hx = n * 100 + 8 - ph; hx < n * 100 + 78; hx += 24) gr.FillPolygon(tone(C.accent), 0, [hx, ph - 10, hx + ph - 20, 10, hx + ph - 8, 10, hx + 12, ph - 10]);
    gr.PopClip();
    gr.ResetTransform();
}

function drawArchiveEmpty(gr) {
    const t = LIB.filter ? `NOTHING MATCHES "${LIB.filter.toUpperCase()}"` : LIB.live ? "NO ALBUMS · THE MEDIA LIBRARY AND THE PLAYLISTS ARE EMPTY" : "INDEXING LIBRARY …";
    label(gr, t, st(AR_ST.meta, C["text-muted"]), arrayW() / 2, H / 2 - dp(6), 1);
    drawArchiveBar(gr);
}

// FILTER · "word" · 12 ALBUMS  ×   (top left, while the header's search filters the archive)
function drawFilterChip(gr, x = dp(32), y = dp(22)) {
    if (!LIB.filter) return 0;
    const h = dp(22);
    const s = st(AR_ST.key, C.bg, C.fg), t = `FILTER  ·  "${LIB.filter.toUpperCase()}"  ·  ${unitWord(filteredCount())}`;
    const w = labelWidth(t, s) + dp(20);
    gr.FillSolidRect(x, y, w, h, C.fg);
    gr.FillSolidRect(x, y, dp(4), h, C.accent);
    label(gr, t, s, x + dp(12), y + Math.round((h - labelHeight(AR_ST.key)) / 2));
    box(gr, x + w, y, h, h, C.fg);
    gr.DrawLine(x + w + dp(7), y + dp(7), x + w + h - dp(7), y + h - dp(7), HAIR, C.fg);
    gr.DrawLine(x + w + h - dp(7), y + dp(7), x + w + dp(7), y + h - dp(7), HAIR, C.fg);
    hits.add("ar-filter", x, y, w + h, h);
    return w + h;
}

// ALBUM / SELECT 05 / 12
function drawSelectNumeral(gr) {
    const g = curGroup(), x = dp(24), y = H - dp(150);
    label(gr, showTracks() ? "TRACK / SELECT" : "ALBUM / SELECT", st(AR_ST.sel, C["text-muted"]), x, y);
    const f = font(56, 300), cell = Math.round(gr.CalcTextWidth("0", f, true)), h = Math.ceil(f.Height);
    const w = drawRoll(gr, AR.selRoll, f, C.fg, x - dp(3), y + dp(14), cell, h);
    gr.DrawText(`/ ${pad(g.albums.length, AR.selRoll.to.length)}`, font(16, 400), C["text-muted"], x + w + dp(12), y + dp(14) + h - dp(34), dp(120), dp(24), DT_SINGLE);
}

// album index: one mark per album (a window of them in long rows), ↑ ↓ at the ends
function drawRuler(gr) {
    const r = AR.rows.get(AR.group);
    if (!r) return;
    const n = curGroup().albums.length, M = rulerCount(), step = dp(RULER_STEP), x0 = rulerX0(), y0 = H - dp(48);
    const s0 = AR.rulerStart.x;
    gr.DrawText("↑", font(16, 400), C.fg, x0 - dp(40), y0 - dp(16), dp(24), dp(24), DT_CENTER_SINGLE);
    gr.DrawText("↓", font(16, 400), C.fg, x0 + Math.min(n, M) * step + dp(14), y0 - dp(16), dp(24), dp(24), DT_CENTER_SINGLE);
    hits.add("ar-prev", x0 - dp(44), y0 - dp(20), dp(32), dp(32));
    hits.add("ar-next", x0 + Math.min(n, M) * step + dp(10), y0 - dp(20), dp(32), dp(32));
    gr.PushClip(x0 - dp(4), y0 - dp(30), Math.min(n, M) * step + dp(4), dp(60));
    for (const [i, s] of AR.ticks) {
        const x = Math.round(x0 + (i - s0) * step), h = dp(s.x), on = i === r.sel;
        gr.FillSolidRect(x, Math.round(y0 - h / 2 - dp(4)), on ? dp(3) : dp(2), h, on ? C.fg : C["line-dim"]);
    }
    gr.PopClip();
    AR.rulerGeom = { x0, y0, step, s0, n, M };
    hits.add("ar-ruler", x0 - dp(4), y0 - dp(24), Math.min(n, M) * step + dp(4), dp(40));
}

// ← SHELF 01 / 08  AMBIENT →
function drawGroupSwitch(gr) {
    const g = curGroup(), cx = Math.round(arrayW() * .774), y = H - dp(82);
    const lbl = "SHELF ", tail = ` / ${pad(arRows().length, 2)}`, s = st(AR_ST.sel, C["text-muted"]);
    const f = font(9, 500), cell = Math.round(gr.CalcTextWidth("0", f, true) + .14 * dp(9));
    const w = labelWidth(lbl, s) + cell * 2 + labelWidth(tail, s), x = cx - w / 2;
    label(gr, lbl, s, x, y);
    drawRoll(gr, AR.groupRoll, f, C["text-muted"], x + labelWidth(lbl, s), y, cell, labelHeight(AR_ST.sel));
    label(gr, tail, s, x + labelWidth(lbl, s) + cell * 2, y);
    label(gr, fitLabel(g.name, st(AR_ST.group, 0), dp(180)), st(AR_ST.group, C.fg), cx, y + dp(16), 1);
    const can = d => AR.group + d >= 0 && AR.group + d < arRows().length;
    gr.DrawText("←", font(16, 400), can(-1) ? C.fg : C["line-dim"], cx - dp(110), y + dp(2), dp(24), dp(24), DT_CENTER_SINGLE);
    gr.DrawText("→", font(16, 400), can(1) ? C.fg : C["line-dim"], cx + dp(86), y + dp(2), dp(24), dp(24), DT_CENTER_SINGLE);
    hits.add("ar-gprev", cx - dp(116), y - dp(4), dp(36), dp(36));
    hits.add("ar-gnext", cx + dp(80), y - dp(4), dp(36), dp(36));
}

// inspection, stage 2 (e: 0 lifted above its row … 1 in front): the case moves to the middle, grows ×2 and turns
// square-on through the evenly spaced pre-rendered frames; between two frames the next one fades in over the current
// one and the cover and label quads are interpolated, so the turn has no visible steps
function drawInspection(gr, e) {
    const frames = ARIMG.inspect, a = curAlbum(), aw = arrayW();
    gr.FillSolidRect(0, 0, aw, H, withAlpha(C.bg, .82 * e));
    if (!frames || !a) return;
    const n = frames.length, x = e * (n - 1), i0 = Math.min(n - 2, Math.floor(x)), f = clamp(x - i0, 0, 1);
    const M0 = CASE_META.inspect[i0], M1 = CASE_META.inspect[i0 + 1], full = CASE_META.inspect_res;
    const k0 = arK() * CASE_META.array_ppu / CASE_META.inspect_ppu, k = lerp(k0, k0 * INSPECT_ZOOM, e);
    const cx = lerp(AR.from[0], aw * .49, e), cy = lerp(AR.from[1], H * .5, e);
    const ox = cx - M0.center[0] * k, oy = cy - M0.center[1] * k;
    const mixQ = (A, B) => A.map((p, j) => [lerp(p[0], B[j][0], f), lerp(p[1], B[j][1], f)]);
    const coverQ = mixQ(M0.cover, M1.cover), labelQ = mixQ(M0.label, M1.label);
    const big = cover(albumFirst(a), () => window.Repaint()), t = thumbOf(a);
    const cov = big && big.img ? big.img : t ? t.img : null;
    if (cov) quadImage(gr, cov, coverQ, ox, oy, k);
    else gr.FillPolygon(C.well, 0, quadPts(coverQ, ox, oy, k));
    const frame = (img, M, alpha) => {
        const c = M.crop || [0, 0, full[0], full[1]];
        gr.DrawImage(img, ox + c[0] * k, oy + c[1] * k, c[2] * k, c[3] * k, 0, 0, img.Width, img.Height, 0, alpha);
    };
    frame(frames[i0], M0, 255);
    if (f > .01) frame(frames[i0 + 1], M1, Math.round(255 * f));
    drawSpineLabel(gr, labelQ, ox, oy, k, a.no);
    if (e > .85) {
        const q = coverQ.map(([px, py]) => [ox + px * k, oy + py * k]), al = (e - .85) / .15;
        for (const [px, py] of q) gr.FillSolidRect(Math.round(px - dp(3)), Math.round(py - dp(3)), dp(6), dp(6), withAlpha(C.accent, al));
        if (al > .5) {
            // the text above and the button below keep clear of the case's edges (the frame's crop is the case's box)
            const c = M1.crop, left = Math.round(c ? ox + c[0] * k : q[0][0]);
            const top = c ? oy + c[1] * k : q[0][1] - dp(40), bottom = c ? oy + (c[1] + c[3]) * k : q[3][1] + dp(20);
            const y2 = Math.round(top - dp(16) - labelHeight(AR_ST.inspM)), y1 = y2 - dp(6) - labelHeight(AR_ST.insp);
            label(gr, `INSPECTION  ·  ARC-${pad(a.no, 4)}`, st(AR_ST.insp, C.fg), left, y1);
            const sub = a.album ? (albumOf(a) || {}).title || "" : `${pad(a.tracks, 2)} TRACKS`;
            label(gr, `${fmtChip(a)}  ·  ${sub}  ·  ${a.grp || ""}`, st(AR_ST.inspM, C["text-muted"]), left, y2);
            // ← RETURN TO ARCHIVE
            const bx = left, by = Math.round(bottom + dp(16)), bs = st(AR_ST.btn, C.fg), bw = labelWidth("←  RETURN TO ARCHIVE", bs) + dp(22), bh = dp(26);
            gr.FillSolidRect(bx, by, bw, bh, C.bg);
            box(gr, bx, by, bw, bh, C.fg);
            label(gr, "←  RETURN TO ARCHIVE", bs, bx + dp(11), by + Math.round((bh - labelHeight(AR_ST.btn)) / 2));
            hits.add("ar-return", bx, by, bw, bh);
        }
    }
}

// ----------------------------------------------------------------------------------------------------- the file
const INFO_HITS = [];
function infoHits(ox) { for (const [id, x, y, w, h, data] of INFO_HITS) hits.add(id, ox + x, y, w, h, data); }

function drawInfo(gr, w, h) {
    gr.FillSolidRect(0, 0, w, h, C.bg);
    INFO_HITS.length = 0;
    const a = curAlbum();
    if (!a) return;
    const x = dp(20), iw = dp(INFO_W), gname = a.grp || "";
    // ghost group name, low behind the actions
    const gf = font(132, 700), gw = gr.CalcTextWidth(gname, gf);
    gr.DrawStrokedText(gname, gf, withAlpha(C["line-faint"], .45), HAIR, 0, 0, h - dp(150), gw + dp(20), dp(170));
    let y = dp(34);
    // AUDIO ARCHIVE / AMBIENT
    let ex = x + label(gr, "AUDIO ARCHIVE", st(AR_ST.eyebrow, C["text-muted"]), x, y);
    ex += label(gr, "  /  ", st(AR_ST.eyebrow, C["text-muted"]), ex, y);
    label(gr, fitLabel(gname, st(AR_ST.eyebrowB, 0), iw - (ex - x)), st(AR_ST.eyebrowB, C.fg), ex, y);
    y += dp(24);
    // bracketed ALBUM NO. 0269 + format chip
    const hh = dp(34), hs = st(AR_ST.head, C.fg), lw = labelWidth("ALBUM NO. ", hs);
    const f = font(13, 600), cell = Math.round(gr.CalcTextWidth("0", f, true) + .12 * dp(13)), bw = dp(20) + lw + cell * 4 + dp(16);
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) gr.FillSolidRect(x + cx * (bw - dp(5)), y + cy * (hh - dp(5)), dp(5), dp(5), C.fg);
    const ty = y + Math.round((hh - labelHeight(AR_ST.head)) / 2);
    label(gr, "ALBUM NO. ", hs, x + dp(20), ty);
    drawRoll(gr, AR.noRoll, f, C.fg, x + dp(20) + lw, ty, cell, labelHeight(AR_ST.head));
    const chipTxt = fmtChip(a), cw = labelWidth(chipTxt, { size: 9.5, weight: 600, track: .1, colour: 0, bg: 0 }) + dp(8) * 2 + dp(12);
    chip(gr, chipTxt, x + iw - cw, y + Math.round((hh - dp(22)) / 2), dp(22), "acc", 9.5, C.bg);
    y += hh + dp(14);
    gr.FillSolidRect(x, y, w - x, HEAVY, C.fg);
    y += HEAVY + dp(20);
    // title plate (wraps, two lines at most): the album's title, or the track's
    const al = albumOf(a) || a, isTrack = al !== a;
    const title = AR.title ? scrambleText(AR.title) : (a.title || "UNTITLED"), tf = fontFor(a.title || "U", 25, 600);
    const lines = gr.EstimateLineWrap(title, tf, iw - dp(24)), lh = dp(42);
    for (let i = 0, ly = y; i < Math.min(4, lines.length); i += 2, ly += lh + dp(2)) {
        let s = lines[i];
        if (i === 2 && lines.length > 4) s = s.replace(/.?$/, "…");
        const tw = Math.min(iw, Math.ceil(gr.CalcTextWidth(s, tf)) + dp(24));
        gr.FillSolidRect(x, ly, tw, lh, C.fg);
        gr.DrawText(s, tf, C.bg, x + dp(12), ly, tw - dp(12), lh, DT_SINGLE);
    }
    y += dp(104);
    // artist, year / tracks / length
    label(gr, fitLabel((a.artist || "UNKNOWN ARTIST").toUpperCase(), st(AR_ST.artist, 0), iw), st(AR_ST.artist, C.fg), x, y);
    y += dp(22);
    const meta = isTrack ? `${(al.title || "UNTITLED").toUpperCase()} / ${a.year || "—"} / ${fmtTime(a.length)}`
                         : `${a.year || "—"} / ${pad(a.tracks, 2)} TRACKS / ${fmtTime(a.length)}`;
    label(gr, fitLabel(meta, st(AR_ST.meta, 0), iw), st(AR_ST.meta, C["text-muted"]), x, y);
    y += dp(28);
    // profile table
    gr.FillSolidRect(x, y, iw, dp(18), C.fg);
    const phy = y + Math.round((dp(18) - labelHeight(ST.ph)) / 2);
    label(gr, "PROFILE", st(ST.ph, C.bg, C.fg), x + dp(8), phy);
    label(gr, `ARC-${pad(a.no, 4)}`, st(ST.ph, C.bg, C.fg), x + iw - dp(8), phy, 2);
    y += dp(18 + 10);
    const res = a.lossless && a.bits ? `${a.bits} / ${+(a.rate / 1000).toFixed(1)}` : a.kbps ? `${a.kbps} KBPS` : "—";
    const cells = [["FORMAT", (a.codec || "—").toUpperCase()], ["RES", res], ["GENRE", (a.genre || "—").toUpperCase()], ["DISCS", String(a.discs)],
                   ["ADDED", a.added ? a.added.slice(0, 10) : "—"], ["PLAYS", a.plays ? String(a.plays) : "—"]];
    const colW = iw / 2;
    cells.forEach(([kk, v], i) => {
        const cx = x + dp(8) + (i % 2) * colW, cy = y + Math.floor(i / 2) * dp(20);
        label(gr, kk, st(AR_ST.key, C["text-muted"]), cx, cy + dp(2));
        gr.DrawText(v, fontFor(v, 11, 400), C.fg, cx + dp(72), cy - dp(2), colW - dp(84), dp(18), DT_SINGLE | DT_ELLIPSIS);
    });
    y += dp(60) + dp(12);
    // the album's tracks, as many as fit above the buttons: click one to play the album from it (the selected track
    // item is marked, the playing track has ▶)
    const rowH = dp(24), fit = clamp(Math.floor((h - y - dp(24 + 18 + 40 + 90)) / rowH), 5, 40), TL = albumTracks(a, fit);
    if (!TL.rows.length) label(gr, LIB.live ? "NO TRACKS" : "INDEXING …", st(AR_ST.more, C["text-muted"]), x + dp(34), y + dp(6));
    TL.rows.forEach((t, k) => {
        const ry = y + k * rowH, hov = AR.infoHover === t.i;
        if (t.own || hov) gr.FillSolidRect(x - dp(8), ry, iw + dp(16), rowH, t.own ? C.panel : withAlpha(C.fg, .06));
        if (t.own) gr.FillSolidRect(x - dp(8), ry, dp(3), rowH, C.accent);
        gr.DrawText(t.playing ? "▶" : t.no, font(12, 400), t.playing ? C.accent : C["text-muted"], x, ry, dp(34), rowH, DT_SINGLE);
        gr.DrawText(t.title, fontFor(t.title, 12, t.own ? 600 : 400), C.fg, x + dp(34), ry, iw - dp(34) - dp(70), rowH, DT_SINGLE | DT_ELLIPSIS);
        gr.DrawText(fmtTime(t.len), font(12, 400), C["fg-soft"], x + iw - dp(70), ry, dp(70), rowH, DT_RIGHT_SINGLE);
        INFO_HITS.push(["ar-track", x - dp(8), ry, iw + dp(16), rowH, t.i]);
    });
    y += Math.max(1, TL.rows.length) * rowH;
    const more = TL.total - TL.first - TL.rows.length;
    if (more > 0 && TL.rows.length) {
        const mw = label(gr, `+ ${more} MORE  ·  OPEN ALBUM`, st(AR_ST.more, C["text-muted"]), x + dp(34), y + dp(6));
        INFO_HITS.push(["ar-open", x + dp(30), y, mw + dp(8), rowH]);
    }
    y += dp(24 + 18);
    // ▶ PLAY ALBUM / PLAY TRACK (inverse) · OPEN ALBUM ↗ (orange focus frame)
    const bh = dp(40), bs = st(AR_ST.btn, C.bg, C.fg), playTxt = isTrack ? "PLAY TRACK" : "PLAY ALBUM";
    const pw = dp(14) + dp(10) + dp(10) + labelWidth(playTxt, bs) + dp(16);
    gr.FillSolidRect(x, y, pw, bh, C.fg);
    icon(gr, "play", x + dp(19), y + bh / 2, 9, C.bg);
    label(gr, playTxt, bs, x + dp(34), y + Math.round((bh - labelHeight(AR_ST.btn)) / 2));
    INFO_HITS.push(["ar-play", x, y, pw, bh]);
    const ox2 = x + pw + dp(10), os = st(AR_ST.btn, C.fg), ow = dp(14) + labelWidth("OPEN ALBUM", os) + dp(40) + dp(26);
    box(gr, ox2, y, ow, bh, C.fg);
    box(gr, ox2 - dp(4), y - dp(4), ow + dp(8), bh + dp(8), C.accent);
    label(gr, "OPEN ALBUM", os, ox2 + dp(14), y + Math.round((bh - labelHeight(AR_ST.btn)) / 2));
    const ax0 = ox2 + ow - dp(24), ay0 = y + bh / 2 + dp(5), aL = dp(9), sw = Math.max(HAIR, dp(1.5));
    gr.DrawLine(ax0, ay0, ax0 + aL, ay0 - aL, sw, C.accent);
    gr.DrawLine(ax0 + dp(2.5), ay0 - aL, ax0 + aL, ay0 - aL, sw, C.accent);
    gr.DrawLine(ax0 + aL, ay0 - aL, ax0 + aL, ay0 - dp(2.5), sw, C.accent);
    INFO_HITS.push(["ar-open", ox2, y, ow, bh]);
    if (LIB.source === "playlists") label(gr, "SOURCE · ALL PLAYLISTS (NO MEDIA LIBRARY FOLDERS)", st(AR_ST.key, C["text-muted"]), x, y + bh + dp(16));
}

// ------------------------------------------------------------------------------------------------------ actions
function archivePlaylist() {
    let pl = plman.FindPlaylist(ARCHIVE_PLAYLIST);
    if (pl >= 0 && plman.IsAutoPlaylist(pl)) pl = -1;
    if (pl < 0) pl = plman.CreatePlaylist(plman.PlaylistCount, ARCHIVE_PLAYLIST);
    return pl;
}
function loadAlbum(a) {
    const list = albumHandles(a);
    if (!list || !list.Count) return -1;
    const pl = archivePlaylist();
    plman.ClearPlaylist(pl);
    plman.InsertPlaylistItems(pl, 0, list);
    return pl;
}
// plays the selected item's album from track `at` (default: the item's own track, else the first)
function playAlbum(at) {
    const a = curAlbum(), list = albumHandles(a);
    if (!list || !list.Count) return;
    if (at === undefined) { const own = itemTrack(a); at = 0; if (own) for (let i = 0; i < list.Count; i++) if (sameTrack(list[i], own)) { at = i; break; } }
    const pl = loadAlbum(a);
    if (pl < 0) return;
    plman.ActivePlaylist = pl;
    plman.ExecutePlaylistDefaultAction(pl, clamp(at, 0, list.Count - 1));
    AR.tracks.key = "";
}
// the playing track is this item (a track item) or on this album
function itemPlaying(a, np = fb.GetNowPlaying()) { return !!(a && np && (a.album ? sameTrack(itemTrack(a), np) : albumKey(np) === a.key)); }
function openAlbum() {
    const pl = loadAlbum(curAlbum());
    if (pl < 0) return;
    plman.ActivePlaylist = pl;
    send("view", "playlists");
}

// ------------------------------------------------------------------------------------------------------- input
function inQuad(x, y, q) {
    let inside = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
        const [xi, yi] = q[i], [xj, yj] = q[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
function archiveMouseMove(x, y, a) {
    const th = a && a.id === "ar-track" ? a.data : -1;   // the file panel's track rows highlight under the mouse
    if (th !== AR.infoHover) { AR.infoHover = th; AR.dirtyInfo = true; window.RepaintRect(infoX() - dp(20), 0, W - infoX() + dp(20), H); }
    if (AR.layout === "grid") return gridMouseMove(x, y, a);
    let h = -1;
    if (!AR.inspOn && x < arrayW() && !a) for (let j = AR.hits.length - 1; j >= 0; j--) if (inQuad(x, y, AR.hits[j].quad)) { h = AR.hits[j].i; break; }
    let ht = -1;
    if (a && a.id === "ar-ruler" && AR.rulerGeom) { const R = AR.rulerGeom; ht = clamp(Math.round((x - R.x0) / R.step + R.s0), 0, R.n - 1); }
    if (h !== AR.hover || ht !== AR.hoverTick) { AR.hover = h; AR.hoverTick = ht; clock.wake(); }
    return h >= 0;
}
function archiveMouseLeave() {
    if (AR.infoHover >= 0) { AR.infoHover = -1; AR.dirtyInfo = true; window.Repaint(); }
    if (GRID.hover) { GRID.hover = null; window.Repaint(); }
    if (AR.hover >= 0 || AR.hoverTick >= 0) { AR.hover = -1; AR.hoverTick = -1; clock.wake(); }
}
function archiveClick(x, y, a) {
    if (AR.inspOn) { AR.inspOn = false; clock.wake(); return; }
    if (a) {
        switch (a.id) {
            case "ar-play": playAlbum(); return;
            case "ar-track": playAlbum(a.data); return;
            case "ar-unit": setUnit(a.data); return;
            case "ar-open": openAlbum(); return;
            case "ar-prev": moveAlbum(-1); return;
            case "ar-next": moveAlbum(1); return;
            case "ar-gprev": moveGroup(-1); return;
            case "ar-gnext": moveGroup(1); return;
            case "ar-ruler": if (AR.hoverTick >= 0) moveAlbum(AR.hoverTick - AR.rows.get(AR.group).sel); return;
            case "ar-layout": setLayout(a.data); return;
            case "ar-filter": send("search-clear"); return;
            case "ar-per": setPerPage(a.data); return;
            case "ar-group": setGroupBy(a.data); return;
            case "ar-sort": setSortBy(a.data); return;
        }
    }
    if (AR.layout === "grid") { gridClick(x, y, a); return; }
    if (AR.hover >= 0) {
        const r = AR.rows.get(AR.group);
        if (AR.hover === r.sel) { AR.inspOn = true; inspectImages(); clock.wake(); }
        else moveAlbum(AR.hover - r.sel);
    }
}
function archiveWheel(step) { if (AR.layout === "grid") gridWheel(step); else moveAlbum(step > 0 ? -1 : 1); }
function archiveKey(vk) {
    if (AR.inspOn) {
        if (vk === 0x1B) { AR.inspOn = false; clock.wake(); return true; }
        if (vk === 0x0D) { openAlbum(); return true; }
        if (vk === 0x20) { playAlbum(); return true; }
        return vk >= 0x21 && vk <= 0x28;   // navigation keys do nothing while inspecting
    }
    if (vk === 0x47) { setLayout(AR.layout === "grid" ? "array" : "grid"); return true; }   // G
    if (AR.layout === "grid" && gridKey(vk)) return true;
    switch (vk) {
        case 0x26: moveAlbum(-1); return true;          // ↑
        case 0x28: moveAlbum(1); return true;           // ↓
        case 0x25: moveGroup(-1); return true;          // ←
        case 0x27: moveGroup(1); return true;           // →
        case 0x21: moveAlbum(-10); return true;         // Page Up
        case 0x22: moveAlbum(10); return true;          // Page Down
        case 0x24: moveAlbum(-1e6); return true;        // Home
        case 0x23: moveAlbum(1e6); return true;         // End
        case 0x0D: if (curAlbum()) { AR.inspOn = true; inspectImages(); clock.wake(); } return true;
        case 0x20: {                                    // Space: play the album (play / pause when it is the one playing)
            const a = curAlbum(), np = fb.GetNowPlaying();
            if (itemPlaying(a, np)) fb.PlayOrPause(); else playAlbum();
            return true;
        }
    }
    return false;
}
function archiveMenu(x, y) {
    const m = window.CreatePopupMenu(), by = ["genre", "decade", "artist", "none"], sorts = SORT_BY.map(([k]) => k);
    ["Group by genre", "Group by decade", "Group by artist initial", "No groups"].forEach((t, i) => m.AppendMenuItem(0, 1 + i, t));
    m.CheckMenuRadioItem(1, 4, 1 + Math.max(0, by.indexOf(LIB.groupBy)));
    const so = window.CreatePopupMenu();
    ["Artist", "Album title", "Year", "Date added (newest first)"].forEach((t, i) => so.AppendMenuItem(0, 400 + i, t));
    so.CheckMenuRadioItem(400, 403, 400 + Math.max(0, sorts.indexOf(LIB.sortBy)));
    so.AppendTo(m, 0, "Sort by");
    m.AppendMenuItem(showTracks() ? 0x8 : 0, 10, "Show every track as its own item");
    m.AppendMenuSeparator();
    m.AppendMenuItem(0, 7, "Case array\tG");
    m.AppendMenuItem(0, 8, "Cover grid\tG");
    m.CheckMenuRadioItem(7, 8, AR.layout === "grid" ? 8 : 7);
    const per = window.CreatePopupMenu();
    PER_PAGE.forEach((n, i) => per.AppendMenuItem(0, 300 + i, `${n} covers`));
    per.CheckMenuRadioItem(300, 300 + PER_PAGE.length - 1, 300 + Math.max(0, PER_PAGE.indexOf(GRID.per)));
    per.AppendTo(m, 0, "Grid: covers per page");
    m.AppendMenuSeparator();
    m.AppendMenuItem(curAlbum() ? 0 : 1, 9, "Play album");
    m.AppendMenuItem(curAlbum() ? 0 : 1, 5, "Open album in playlist");
    m.AppendMenuSeparator();
    const skins = appendSkinMenu(m, 100);
    m.AppendMenuItem(0, 6, "Re-index library");
    const id = m.TrackPopupMenu(x, y);
    if (id >= 1 && id <= 4) setGroupBy(by[id - 1]);
    else if (id >= 400 && sorts[id - 400]) setSortBy(sorts[id - 400]);
    else if (id === 9) playAlbum();
    else if (id === 10) setUnit(showTracks() ? "albums" : "tracks");
    else if (id === 5) openAlbum();
    else if (id === 6) libIndex(true);
    else if (id === 7 || id === 8) setLayout(id === 8 ? "grid" : "array");
    else if (id >= 300 && PER_PAGE[id - 300]) setPerPage(PER_PAGE[id - 300]);
    else if (id >= 100 && skins[id - 100]) send("skin", skins[id - 100].id);
}
