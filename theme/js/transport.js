"use strict";
// Transport + status line (all views, 64 + 32 dp): the playing album's cover (click: inspect it in the Archive;
// right-click: show the track in Playlists),
// previous / play-pause / next / stop, the seek line (elapsed, remaining, START marker, orange playhead; click, drag,
// wheel ±5 s), volume line, SHUFFLE ALL (the whole library, lib/bus.js), playback order, the LIGHT / DARK toggle with a
// sliding plate; below, the section label (per view) and the signature with library counts.

include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\core.js");

const ST = {
    marker: { size: 7.5, weight: 600, track: .06 },
    key: { size: 9, weight: 500, track: .14 },
    val: { size: 9, weight: 500, track: .14 },
    sec: { size: 10, weight: 600, track: .16 },
    sig: { size: 10, weight: 400, track: .08 },
    sigB: { size: 10, weight: 700, track: .06 },
};
const st = (s, colour, bg = C.bg) => Object.assign({ colour, bg }, s);
const ORDERS = ["DEFAULT", "REPEAT PLAYLIST", "REPEAT TRACK", "RANDOM", "SHUFFLE TRACKS", "SHUFFLE ALBUMS", "SHUFFLE FOLDERS"];
const ORDER_NAMES = ["Default", "Repeat (playlist)", "Repeat (track)", "Random", "Shuffle (tracks)", "Shuffle (albums)", "Shuffle (folders)"];

let W = 0, H = 0;
const hits = Hits();
let hover = null, drag = null;            // drag: { id: "seek" | "vol", value }
const tog = { x: Spring(0, 14), w: Spring(0, 14), placed: false };
let togRects = {};
const counts = { files: -1, albums: -1 };
let section = { text: "", sc: null };

// ---------------------------------------------------------------------------------------------------- geometry
const M = TOKENS.metrics;
const TP = () => dp(M.transport);                 // controls row height; the status line sits below it
const ROW_Y = 33;                                 // dp: the one centre line of the buttons, the seek line and the right group
function rulerGeom() {
    const r = hits.get("ruler");
    return r ? r.data : null;                     // { x0, x1, y }
}

// ------------------------------------------------------------------------------------------- animation & timers
const clock = Clock(dt => {
    const more = stepSpring(tog.x, dt) | stepSpring(tog.w, dt);
    const sc = section.sc && !scrambleDone(section.sc);
    window.Repaint();
    return more || sc;
});

// while playing, the controls row repaints 20 times a second so the playhead glides (it moves a few px per second)
let playTimer = 0;
function startPlayTimer() {
    window.ClearInterval(playTimer);
    playTimer = window.SetInterval(() => { if (!drag) repaintRuler(); }, 50);
}
function stopPlayTimer() { window.ClearInterval(playTimer); playTimer = 0; }
function repaintRuler() { window.RepaintRect(0, 0, W, TP()); }

function on_playback_starting() { startPlayTimer(); repaintRuler(); }
function on_playback_new_track() { nowCover(); repaintRuler(); }
function on_playback_pause(paused) { paused ? stopPlayTimer() : startPlayTimer(); repaintRuler(); }
function on_playback_stop(reason) { if (reason !== 2) { stopPlayTimer(); nowCover(); } repaintRuler(); }   // 2 = starting another track
function on_playback_seek() { repaintRuler(); }
function on_playback_time() { repaintRuler(); }
function on_volume_change() { repaintRuler(); }
function on_playback_order_changed() { repaintRuler(); }
if (fb.IsPlaying && !fb.IsPaused) startPlayTimer();

// --------------------------------------------------------------------------------------------- library counts
// counted by the stage panel's library worker (lib/library.js), off the UI thread
onMessage("library", d => { counts.files = d.files; counts.albums = d.albums; window.Repaint(); });
send("library?");

// ------------------------------------------------------------------------------------------------- section label
function sectionText() {
    if (STATE.view === "archive") return "ARCHIVE SECTION · BROWSE";
    if (STATE.view === "lyrics") return "LYRICS SECTION · PLAYBACK";
    if (STATE.view === "signal") return "SIGNAL SECTION · MONITOR";
    if (STATE.view === "style") return "STYLE SECTION · APPEARANCE";
    const ap = plman.ActivePlaylist;
    return ap < 0 ? "PLAYLIST SECTION" : `PLAYLIST SECTION · ${pad(ap + 1, 3)} ${plman.GetPlaylistName(ap).toUpperCase()}`;
}
function updateSection(animate) {
    const t = sectionText();
    if (t === section.text) return;
    section.text = t;
    section.sc = animate ? Scramble(t) : null;
    if (animate) clock.wake(); else window.Repaint();
}
onMessage("state", () => { updateSection(true); window.Repaint(); });
function on_playlist_switch() { updateSection(true); }
function on_playlists_changed() { updateSection(false); }
send("hello");

// ------------------------------------------------------------------------------------------------------- paint
function on_size(w, h) { W = w; H = h; togRects = {}; tog.placed = false; }

function on_paint(gr) {
    hits.clear();
    gr.FillSolidRect(0, 0, W, H, C.bg);
    hline(gr, 0, 0, W);
    const right = drawRight(gr);
    drawCover(gr);
    drawButtons(gr);
    drawRuler(gr, BTN_X() + dp(172), right - dp(28));
    drawStatus(gr);
    drawGrain(gr, 0, 0, W, H);
}

// the playing album's cover, a 44 dp square left of the buttons; loaded once per track
const COVER_S = 44, NOW = { key: "", img: null, title: "", artist: "" };
const TF_NOW = fb.TitleFormat("%title%\u0001[%artist%]");
const BTN_X = () => dp(24 + COVER_S + 14);
function nowCover() {
    const h = fb.GetNowPlaying(), key = h ? h.RawPath + "|" + h.SubSong : "";
    if (key === NOW.key) return;
    NOW.key = key; NOW.img = null;
    const v = h ? TF_NOW.EvalWithMetadb(h).split("\u0001") : ["", ""];
    NOW.title = v[0]; NOW.artist = v[1];
    if (!h) return;
    utils.GetAlbumArtAsyncV2(window.ID, h, 0).then(r => {
        if (NOW.key !== key || !r || !r.image) return;
        const s = dp(COVER_S) * 2, src = r.image;
        NOW.img = src.Width > s || src.Height > s ? src.Resize(s, s) : src;
        repaintRuler();
    }).catch(() => {});
}
nowCover();
function drawCover(gr) {
    const s = dp(COVER_S), x = dp(24), y = Math.round(dp(ROW_Y) - s / 2), hov = !!(hover && hover.id === "cover");
    if (NOW.img) gr.DrawImage(NOW.img, x, y, s, s, 0, 0, NOW.img.Width, NOW.img.Height);
    else {
        gr.FillSolidRect(x, y, s, s, C.well);
        if (fb.IsPlaying) square(gr, x + s / 2, y + s / 2, 5, C["line-dim"]);
    }
    box(gr, x, y, s, s, hov ? C.accent : C["line-faint"]);
    if (fb.IsPlaying) gr.FillSolidRect(x, y + s - dp(3), dp(10), dp(3), C.accent);   // the playing tab
    hits.add("cover", x, y, s, s);
}
// the playing track, selected and focused in its playlist, in the Playlists view
function showPlaying() {
    const loc = plman.GetPlayingItemLocation();
    if (!loc.IsValid) return;
    plman.ActivePlaylist = loc.PlaylistIndex;
    plman.ClearPlaylistSelection(loc.PlaylistIndex);
    plman.SetPlaylistSelectionSingle(loc.PlaylistIndex, loc.PlaylistItemIndex, true);
    plman.SetPlaylistFocusItem(loc.PlaylistIndex, loc.PlaylistItemIndex);
    send("view", "playlists");
}

function drawButtons(gr) {
    const names = ["prev", fb.IsPlaying && !fb.IsPaused ? "pause" : "play", "next", "stop"];
    const s = dp(34), y = Math.round(dp(ROW_Y) - s / 2);
    names.forEach((n, i) => {
        const x = BTN_X() + i * (s + dp(6)), main = i === 1, hov = !!(hover && hover.id === "btn" && hover.data === i);
        const fill = main !== hov;        // the main button is inverse; hovering inverts any button
        if (fill) gr.FillSolidRect(x, y, s, s, C.fg); else gr.FillSolidRect(x, y, s, s, C.bg);
        box(gr, x, y, s, s, fill ? C.fg : main ? C.fg : C["line-faint"]);
        icon(gr, n, x + s / 2, y + s / 2, 12, fill ? C.bg : C.fg);
        hits.add("btn", x, y, s, s, i);
    });
}

let TIME_W = new Map();
function timeW(f, s) {
    const k = f.Size + s;
    if (!TIME_W.has(k)) { const img = d2d.CreateImage(1, 1), g = img.GetGraphics(); TIME_W.set(k, Math.ceil(g.CalcTextWidth(s, f))); img.ReleaseGraphics(g); }
    return TIME_W.get(k);
}
function drawRuler(gr, left, right) {
    const len = fb.PlaybackLength, playing = fb.IsPlaying && len > 0;
    // the time read-outs are as wide as their text at the current text size
    const tf = font(15, 500), lw = Math.max(dp(64), timeW(tf, "00:00") + dp(10)), rw = Math.max(dp(74), timeW(tf, "−00:00") + dp(12));
    const y = dp(ROW_Y), x0 = left + lw, x1 = right - rw;
    if (x1 - x0 < dp(80)) return;
    let el = playing ? fb.PlaybackTime : 0;
    if (drag && drag.id === "seek") el = drag.value;
    const cur = playing ? x0 + (x1 - x0) * clamp(el / len, 0, 1) : x0;
    text(gr, fmtTime(el), 15, 500, playing ? C.fg : C["text-muted"], left, y - dp(12), lw, dp(24));
    text(gr, playing ? "−" + fmtTime(len - el) : "−00:00", 15, 500, C["text-muted"], x1 + dp(12), y - dp(12), rw, dp(24));
    gr.FillSolidRect(x0, y, x1 - x0, HAIR, C["line-dim"]);
    if (playing) gr.FillSolidRect(x0, y - HAIR, Math.round(cur - x0), HEAVY, C.fg);
    // START marker (orange once passed); chapter and cue markers join it when a track has them
    const mc = playing ? C.accent : C["line-dim"];
    gr.FillSolidRect(x0, y - dp(14), HAIR, dp(12), mc);
    label(gr, "START", st(ST.marker, mc), x0 + dp(4), y - dp(15));
    // the playhead: a plain orange line
    if (playing) gr.FillSolidRect(Math.round(cur - dp(.75)), y - dp(10), Math.max(HAIR, dp(1.5)), dp(20), C.accent);
    // NOW PLAYING  title · artist, under the line
    if (fb.IsPlaying && NOW.title) {
        const ny = y + dp(9), kw = label(gr, "NOW PLAYING", st(ST.marker, C.accent), x0, ny + dp(2));
        const t = NOW.title + (NOW.artist ? "  ·  " + NOW.artist : "");
        text(gr, t, 9.5, 500, C["fg-soft"], x0 + kw + dp(10), ny - dp(1), x1 - x0 - kw - dp(10), dp(16));
    }
    hits.add("ruler", x0 - dp(4), y - dp(25), x1 - x0 + dp(8), dp(50), { x0, x1, y });
}

// volume (dB) <-> position 0..1 on a perceptual curve
const vol2pos = db => clamp((Math.pow(10, db / 50) - 0.01) / 0.99, 0, 1);
const pos2vol = p => p <= 0 ? -100 : 50 * Math.log10(0.99 * p + 0.01);

// right group, right to left: LIGHT / DARK toggle, ORDER, VOL. Returns its left edge.
function drawRight(gr) {
    const cy = dp(ROW_Y), keyH = labelHeight(ST.key), ky = cy - Math.round(keyH / 2);
    // toggle
    const items = [["light", "LIGHT"], ["dark", "DARK"]];
    const iw = items.map(([, t]) => dp(10) + dp(5) + dp(7) + labelWidth(t, st(ST.key, 0)) + dp(10));
    const th = dp(26), ty = cy - th / 2, tw = iw[0] + iw[1], tx = W - dp(24) - tw;
    if (!togRects.light) { togRects.light = [tx, iw[0]]; togRects.dark = [tx + iw[0], iw[1]]; placeToggle(false); }
    box(gr, tx, ty, tw, th, C["line-faint"]);
    // as in the header navigation: page labels, the sliding plate, then inverted labels clipped to the plate
    const px = Math.round(tog.x.x), pw = Math.round(tog.w.x);
    const drawItems = inverse => items.forEach(([m, t]) => {
        const [x] = togRects[m], hov = !inverse && hover && hover.id === "mode" && hover.data === m;
        const col = inverse ? C.bg : hov ? C.fg : C["text-muted"];
        toggleMark(gr, x + dp(10), cy, inverse, col);
        label(gr, t, st(ST.key, col, inverse ? C.fg : C.bg), x + dp(22), ky);
    });
    drawItems(false);
    gr.FillSolidRect(px, ty, pw, th, C.fg);
    gr.PushClip(px, ty, pw, th);
    drawItems(true);
    gr.PopClip();
    items.forEach(([m]) => hits.add("mode", togRects[m][0], ty, togRects[m][1], th, m));
    let x = tx - dp(18);
    // ORDER
    const order = clamp(plman.PlaybackOrder, 0, ORDERS.length - 1), ohov = hover && hover.id === "order";
    const ow = labelWidth(ORDERS[order], st(ST.val, 0));
    x -= ow;
    label(gr, ORDERS[order], st(ST.val, ohov ? C.accent : C.fg), x, ky);
    const okw = labelWidth("ORDER", st(ST.key, 0));
    label(gr, "ORDER", st(ST.key, C["text-muted"]), x - dp(8) - okw, ky);
    hits.add("order", x - dp(8) - okw, ty, okw + dp(8) + ow, th);
    x -= dp(8) + okw + dp(18);
    // SHUFFLE ALL: the whole library in a random order
    const shov = hover && hover.id === "shuffle", sw = labelWidth("SHUFFLE ALL", st(ST.key, 0)) + dp(20) + dp(9);
    x -= sw;
    box(gr, x, ty, sw, th, shov ? C.accent : C["line-faint"]);
    gr.FillSolidRect(x + dp(9), cy - dp(2), dp(5), dp(5), shov ? C.accent : C.fg);
    label(gr, "SHUFFLE ALL", st(ST.key, shov ? C.fg : C["fg-soft"]), x + dp(20), ky);
    hits.add("shuffle", x, ty, sw, th);
    x -= dp(18);
    // VOL
    const p = drag && drag.id === "vol" ? drag.value : vol2pos(fb.Volume), vtxt = pad(Math.round(p * 100), 2);
    const vw = labelWidth("100", st(ST.val, 0));
    x -= vw;
    label(gr, vtxt, st(ST.val, C.fg), x + vw, ky, 2);
    const lw = dp(74), lx = x - dp(8) - lw;
    gr.FillSolidRect(lx, cy, lw, HAIR, C["line-dim"]);
    gr.FillSolidRect(lx, cy - HAIR, Math.round(lw * p), HEAVY, C.fg);
    gr.FillSolidRect(Math.round(lx + lw * p - dp(3)), cy - dp(3), dp(6), dp(6), C.accent);
    hits.add("vol", lx - dp(4), ty, lw + dp(8), th, { x0: lx, w: lw });
    const vkw = labelWidth("VOL", st(ST.key, 0));
    label(gr, "VOL", st(ST.key, C["text-muted"]), lx - dp(8) - vkw, ky);
    return lx - dp(8) - vkw;
}

function placeToggle(animate) {
    const r = togRects[MODE];
    if (!r) return;
    tog.x.to = r[0]; tog.w.to = r[1];
    if (!animate || !tog.placed) { tog.x.x = r[0]; tog.w.x = r[1]; tog.placed = true; return; }
    clock.wake();
}

function drawStatus(gr) {
    const y = TP(), h = H - y, cy = y + Math.round(h / 2);
    hline(gr, dp(24), y, W - dp(48));
    gr.FillSolidRect(dp(24), cy - dp(2.5), dp(18), dp(5), C.fg);
    if (!section.text) updateSection(false);
    const shown = section.sc ? scrambleText(section.sc) : section.text;
    label(gr, shown, st(ST.sec, C.fg), dp(24 + 18 + 12), cy - Math.round(labelHeight(ST.sec) / 2));
    // signature: counts · AUDIO ARCHIVE ▬
    const by = cy - Math.round(labelHeight(ST.sig) / 2);
    let x = W - dp(24) - dp(16);
    gr.FillSolidRect(x, cy - dp(2), dp(16), dp(4), C.fg);
    x -= dp(10);
    x -= label(gr, "AUDIO ARCHIVE", st(ST.sigB, C.fg), x, by, 2);
    if (counts.files >= 0) label(gr, `${fmtCount(counts.files)} FILES · ${fmtCount(counts.albums)} ALBUMS`, st(ST.sig, C["text-muted"]), x - dp(10), by, 2);
}

// ------------------------------------------------------------------------------------------------------- mouse
function seekValue(x) { const g = rulerGeom(); return clamp((x - g.x0) / (g.x1 - g.x0), 0, 1) * fb.PlaybackLength; }
function volValue(x) { const a = hits.get("vol"); return clamp((x - a.data.x0) / a.data.w, 0, 1); }

function on_mouse_move(x, y) {
    if (drag) {
        drag.value = drag.id === "seek" ? seekValue(x) : volValue(x);
        if (drag.id === "vol") fb.Volume = pos2vol(drag.value);
        repaintRuler();
        return;
    }
    const a = hits.at(x, y);
    window.SetCursor(a ? 32649 : 32512);
    const key = a ? a.id + ":" + a.data : "", old = hover ? hover.id + ":" + hover.data : "";
    if (key !== old) { hover = a; window.Repaint(); }
}
function on_mouse_leave() { if (hover && !drag) { hover = null; window.Repaint(); } }

function on_mouse_lbtn_down(x, y) {
    const a = hits.at(x, y);
    if (!a) return;
    if (a.id === "ruler" && fb.IsPlaying && fb.PlaybackLength > 0) drag = { id: "seek", value: seekValue(x) };
    else if (a.id === "vol") { drag = { id: "vol", value: volValue(x) }; fb.Volume = pos2vol(drag.value); }
    repaintRuler();
}

// right-click on the cover: the playing track in its playlist (JSplitter's own menu with Shift, as elsewhere)
function on_mouse_rbtn_up(x, y, mask) {
    const a = hits.at(x, y);
    if (!a || a.id !== "cover" || (mask & 0x0004)) return false;
    showPlaying();
    return true;
}
function on_mouse_lbtn_up(x, y) {
    if (drag) {
        if (drag.id === "seek") fb.PlaybackTime = drag.value;
        drag = null;
        repaintRuler();
        return;
    }
    const a = hits.at(x, y);
    if (!a) return;
    if (a.id === "btn") [() => fb.Prev(), () => fb.PlayOrPause(), () => fb.Next(), () => fb.Stop()][a.data]();
    else if (a.id === "mode" && a.data !== MODE) send("mode");
    else if (a.id === "order") orderMenu(a);
    else if (a.id === "shuffle") shuffleLibrary();
    else if (a.id === "cover") send("inspect");
}

function on_mouse_wheel(step) {
    const a = hover;
    if (!a) return;
    if (a.id === "ruler" && fb.IsPlaying && fb.PlaybackLength > 0) fb.PlaybackTime = clamp(fb.PlaybackTime + 5 * step, 0, fb.PlaybackLength - 1);
    else if (a.id === "vol") step > 0 ? fb.VolumeUp() : fb.VolumeDown();
}

function orderMenu(a) {
    const m = window.CreatePopupMenu();
    ORDER_NAMES.forEach((n, i) => m.AppendMenuItem(0, i + 1, n));
    m.CheckMenuRadioItem(1, ORDER_NAMES.length, plman.PlaybackOrder + 1);
    m.AppendMenuSeparator();
    m.AppendMenuItem(0, 99, "Shuffle entire library\tS");
    const id = m.TrackPopupMenu(a.x, a.y + a.h, 0);
    if (id === 99) shuffleLibrary();
    else if (id > 0) plman.PlaybackOrder = id - 1;
}

function on_char(code) { searchChar(code); }
function on_key_down(vk) {
    if (searchKey(vk)) return;
    if (vk === 0x20) fb.PlayOrPause();   // Space
    else globalKey(vk);
}

function on_colours_changed() { refreshTokens(); placeToggle(true); window.Repaint(); }

// the toggle and the read-outs are measured from their labels: measure again after a text size change
TOKEN_LISTENERS.push(() => { togRects = {}; tog.placed = false; TIME_W.clear(); });
