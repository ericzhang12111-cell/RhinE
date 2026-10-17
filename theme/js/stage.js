"use strict";
// Stage: the full-width view panel shared by 01 · ARCHIVE (archive.js), 03 · LYRICS (this file) and 04 · SIGNAL
// (signal.js). One panel for all three keeps the number of JSplitter child panels down (each costs ≈ 1 % of a CPU core
// even when hidden).
//
// Lyrics view:
//   left   section label, data block (spectrum, peak, RMS, stereo, rate, session), analysis log
//   centre synced lyrics across the whole centre (original + translation), or a NO LYRICS / WARNING panel, in a
//          Swiss frame: registration crosses, LYRICS MONITOR · 03 with a state chip, crop marks around the lines and
//          a line index on the right (one mark per lyric line, the current one orange)
//   right  signal profile card, as tall as the view (the Playlists view's card, ending in QUEUE / NEXT)
// The left column and the card are cached as bitmaps and rebuilt only when their content changes; while music plays the
// view repaints ten times a second (and every frame while lines scroll); nothing runs while paused, stopped or hidden.

include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\core.js");
for (const f of ["emblem", "audio", "ring", "lyrics", "translate", "waveform", "album", "playlists", "nowplaying", "library"]) include(fb.ProfilePath + `themes\\audio-archive\\js\\lib\\${f}.js`);
include(fb.ProfilePath + "themes\\audio-archive\\js\\archive.js");
include(fb.ProfilePath + "themes\\audio-archive\\js\\grid.js");
include(fb.ProfilePath + "themes\\audio-archive\\js\\customcase.js");
include(fb.ProfilePath + "themes\\audio-archive\\js\\style.js");
include(fb.ProfilePath + "themes\\audio-archive\\js\\signal.js");

const ST = {
    sbar: { size: 11, weight: 600, track: .14 },
    key: { size: 8.5, weight: 500, track: .12 },
    val: { size: 10, weight: 400, track: .04 },
    tag: { size: 8, weight: 600, track: .14 },
    anaH: { size: 10, weight: 600, track: .2 },
    anaL: { size: 8.5, weight: 500, track: .12 },
    tog: { size: 9, weight: 500, track: .14 },
    tiny: { size: 8, weight: 500, track: .14 },
    ph: { size: 9, weight: 600, track: .14 },
};
const st = (s, colour, bg = C.bg) => Object.assign({ colour, bg }, s);
// the two side columns mirror each other: the read-outs on the left are as wide as the card (lib/nowplaying.js, as wide
// as the Playlists view's) on the right, each with a 24 dp margin to the window and to the lyrics
const CARD_W = 328, LEFT_W = CARD_W + 48;

let W = 0, H = 0;
const hits = Hits();
let hover = null;
Ring.mode = getSetting("ringMode", "3d");

// ------------------------------------------------------------------------------------------------- track state
// (lib/nowplaying.js reads the track; this view adds its lyrics and the signal trace)
const lyrOff = Spring(0, 9);
let lyrIdx = -1;            // the line last drawn in the middle
// scrolling the lyrics: the wheel moves the middle `n` lines away from the sung one; five seconds after the last turn
// it glides back. A click on a line plays from it.
// Unsynced (plain) lyrics have no sung line: the wheel moves through them from the first and they stay where they are.
const LYR_SCROLL = { n: 0, until: 0 };
const LYR_BACK_MS = 5000;
const lyrSynced = () => !(T.lyrics && T.lyrics.synced === false);
const sameHandle = h => !!(T.handle && h && T.handle.RawPath === h.RawPath && T.handle.SubSong === h.SubSong);
// the current lyrics translated (lib/translate.js), when that is on and they have one language
function trLyrics(h) {
    translateLyrics(h, T.lyrics, () => { if (sameHandle(h)) { dirty.left = true; window.Repaint(); } });
}
// the translation settings changed (MENU): load the lyrics again without the old translation
onMessage("lyrics-translate", () => { if (T.handle) { T.lyrics = null; npChanged(false, T.handle); } });

// The lyrics source, the switch at the right of the LYRICS MONITOR row (and the same four in the MENU): AUTO keeps the
// original priority, LOCAL never goes online, LRCLIB and NETEASE are fixed sources and the only ones used while they are
// on (the file is not read at all). Kept in the settings like the other view options; the current track is read again, so
// the change shows at once. This panel is the only sender, so `send` does not come back to it (NotifyOthers skips the
// sender) and the reload below is not run twice.
function setLyricsSource(v) {
    const p = pickLyricsSource(v);
    if (p === STATE.lyricsSource) return;
    STATE.lyricsSource = p;
    send("lyrics-source", p);   // frame.js saves it and broadcasts the state
    if (T.handle) { T.lyrics = null; npChanged(false, T.handle); }
    clock.wake(); window.Repaint();
}
// changed in another panel (the MENU): apply it here too and read the track again
onMessage("lyrics-source", v => {
    STATE.lyricsSource = pickLyricsSource(v);
    if (T.handle) { T.lyrics = null; npChanged(false, T.handle); }
    clock.wake(); window.Repaint();
});
// the translation source changed in the MENU (lib/translate.js reads it): drop what the old one added and translate again
onMessage("lyrics-trans", () => {
    if (T.handle) { T.lyrics = null; npChanged(false, T.handle); }
    clock.wake(); window.Repaint();
});
// The translation source, from the state chip's menu (the chip's TR / MT is its doing). Kept the same way as the lyrics
// source; like it, this panel is the only sender, so the reload is not run twice.
function setLyricsTrans(v) {
    const p = pickLyricsTrans(v);
    if (p === STATE.lyricsTrans) return;
    STATE.lyricsTrans = p;
    send("lyrics-trans", p);   // frame.js saves it and broadcasts the state
    if (T.handle) { T.lyrics = null; npChanged(false, T.handle); }
    clock.wake(); window.Repaint();
}
// the state chip's menu: the same four as MENU › Audio Archive › Translate lyrics, at the chip
function lyricsTransMenu(x, y) {
    const m = window.CreatePopupMenu();
    LYR_TRANS.forEach(([, name], i) => m.AppendMenuItem(0, 1 + i, tr(name)));
    m.CheckMenuRadioItem(1, LYR_TRANS.length, 1 + Math.max(0, LYR_TRANS.findIndex(([k]) => k === STATE.lyricsTrans)));
    const id = m.TrackPopupMenu(x, y, 0);
    if (id > 0 && id <= LYR_TRANS.length) setLyricsTrans(LYR_TRANS[id - 1][0]);
}

function npChanged(same, h, what) {
    if (what === "cover") { dirty.card = true; window.Repaint(); return; }
    if (!h) T.lyrics = null;
    else if (!same) {
        // AUTO (the default): lyrics found online replace none, or plain (unsynced) ones from the file, so synced lyrics
        // follow the song. LRCLIB and NETEASE are fixed sources and the only ones allowed to supply lyrics while they
        // are on: the file's are not used at all, so what the switch says is what is shown. When they have nothing the
        // panel reports no lyrics instead of quietly falling back to the file.
        const src = STATE.lyricsSource, fixed = lyrFixed();
        T.lyrics = fixed ? null : loadLyrics(h);
        trLyrics(h);
        LYR.src = "";   // a new track: no source has been asked yet (the notice names whichever one is, see drawLyricsView)
        const unsynced = () => !T.lyrics || T.lyrics.synced === false;
        const found = L => { if (sameHandle(h) && (fixed || unsynced())) { T.lyrics = L; lyrIdx = -1; LYR_SCROLL.n = 0; dirty.left = true; trLyrics(h); clock.wake(); window.Repaint(); } };
        // LRCLIB first; only under AUTO does NetEase follow it (lib/translate.js; which source is on is lyrLrclib/lyrNetease)
        const ne = () => neteaseLyrics(h, L => { if (sameHandle(h)) { LYR.state = ""; found(L); } });
        if (lyrLrclib()) lyricsOnline(h, found, () => { if (src === "auto") ne(); });
        else if (lyrNetease()) ne();
        lyrIdx = -1; LYR_SCROLL.n = 0;
        waveLoad(h, () => { if (STATE.view === "signal") window.Repaint(); });
        clock.wake();
    }
    dirty.card = dirty.left = true;
    window.Repaint();
}

// the archive's file panel marks the playing track
const playingChanged = () => { AR.tracks.key = ""; AR.listVer++; AR.dirtyInfo = true; if (STATE.view === "archive") window.Repaint(); };
function on_playback_new_track() { loadTrack(); playingChanged(); }
function on_playback_starting() { clock.wake(); }
function on_playback_pause() { dirty.card = true; clock.wake(); window.Repaint(); }
function on_playback_stop(reason) { if (reason !== 2) { loadTrack(); playingChanged(); } }
function on_playback_seek() { lyrIdx = -2; clock.wake(); }
function on_playback_queue_changed() { if (T.handle) { T.next = nextTitle(); dirty.left = dirty.card = true; window.Repaint(); } }
function on_playlist_items_reordered(i) { plDirty(i); }
function on_item_focus_change() { if (!fb.IsPlaying) loadTrack(); }
// a track changed (tags, a rating): the card and the album file read it again
function on_metadb_changed() {
    if (T.handle) loadTrack();
    AR.listVer++; AR.dirtyInfo = true;
    if (STATE.view === "archive") window.Repaint();
}
onMessage("rating-store", () => { if (T.handle) loadTrack(); AR.listVer++; AR.dirtyInfo = true; window.Repaint(); });

// ----------------------------------------------------------------------------------------------- animation clock
let lastPaint = 0, lastLeft = 0, alertShown = false, lyrBar = null, specRect = null, LEFT_SPEC = null;   // lyrBar: the karaoke rule's rect, repainted every frame
const visible = () => (STATE.view === "lyrics" || STATE.view === "signal") && W > 0;
const clock = Clock((dt, now) => {
    if (W <= 0) return false;
    if (STATE.view === "archive") {
        let more = archiveUpdate(dt);
        if (AR.layout === "grid") more = gridUpdate(dt) || more;
        window.RepaintRect(0, 0, AR.dirtyInfo ? W : arrayW(), H);
        return more;
    }
    if (!visible()) return false;
    const playing = fb.IsPlaying && !fb.IsPaused;
    if (playing) analyseAudio(dt);
    if (STATE.view === "signal") { ringUpdate(dt, playing); window.Repaint(); return playing; }
    // lyrics: every frame while something moves, otherwise ten times a second while playing (line changes, read-outs)
    // or while a pop-up's dots cycle; the karaoke rule alone is repainted every frame
    if (LYR_SCROLL.n && now > LYR_SCROLL.until && lyrSynced()) { LYR_SCROLL.n = 0; window.Repaint(); }
    let anim = stepSpring(lyrOff, dt);
    if (stepSpring(heroClear, dt)) { anim = true; dirty.card = true; }
    if (T.title && !scrambleDone(T.title)) { anim = true; dirty.card = true; }
    if (playing && now - lastLeft > 250) { lastLeft = now; dirty.left = true; }
    if (anim || ((playing || alertShown) && now - lastPaint > 100)) { lastPaint = now; window.Repaint(); }
    else if (playing && (lyrBar || specRect)) { if (lyrBar) window.RepaintRect(...lyrBar); if (specRect) window.RepaintRect(...specRect); }
    return anim || playing || alertShown || (LYR_SCROLL.n !== 0 && lyrSynced());
});
let arrayScaleWas = STATE.arrayScale;
let halftoneWas = "";
onMessage("state", () => {
    if (stageSkin() !== CASE_SKIN && loadSkin(stageSkin())) dirty.card = true;
    // another halftone (05 STYLE): the album file and the card are drawn again
    const ht = STATE.halftone + STATE.halftoneLevel;
    if (ht !== halftoneWas) { halftoneWas = ht; AR.dirtyInfo = dirty.card = true; }
    const on = STATE.view === "archive";
    if (on !== ARCHIVE_ON) { ARCHIVE_ON = on; if (on) requestVisibleThumbs(); else archiveHidden(); }
    if (on) inspectPending();
    // a new Array scale: the shelves hold another number of cases, so the selection is placed again
    if (STATE.arrayScale !== arrayScaleWas) { arrayScaleWas = STATE.arrayScale; placeSelection(curAlbum() ? curAlbum().key : AR.selAlbum); requestVisibleThumbs(); }
    // the ring's image is kept only while the Signal view is shown
    if (STATE.view !== "signal" && Ring.img.mode) Ring.img = { mode: "", still: null, shadow: null };
    styleShown(STATE.view === "style");
    if (on) clock.wake();
    if (visible()) { loadTrack(); clock.wake(); }
    window.Repaint();
});
// (no transition watcher on STATE.lyricsSource: setLyricsSource above and the "lyrics-source" message cover every change,
// so watching the broadcast as well would read the track twice and start the same lookup a second time)
// the transport's cover and the Playlists view's profile card ask to inspect the playing album
onMessage("inspect", () => inspectRequest());
onMessage("library?", () => { if (LIB.live) send("library", { files: LIB.tracks, albums: LIB.albums.length }); });
window.DlgCode = 0x0004;   // DLGC_WANTALLKEYS: Enter and Esc reach the archive
send("hello");
window.SetTimeout(loadTrack, 0);
window.SetTimeout(libStart, 0);

// ------------------------------------------------------------------------------------------------------ layout
const cardX = () => W - dp(24 + CARD_W);
function lyricsGeom() {
    const x0 = dp(LEFT_W), x1 = cardX() - dp(24), cx = Math.round((x0 + x1) / 2), cw = x1 - x0 - dp(160);   // room for the line index on the right, mirrored on the left
    return { x0, x1, cx, cw, cy: Math.round(H * .46) };
}

function on_size(w, h) { W = w; H = h; dirty.left = dirty.card = true; layers.left = layers.card = null; AR.dirtyInfo = true; AR.info = null; if (w > 0 && h > 0) archiveResize(); }

// layers: bitmaps of the left column and the card, rebuilt when dirty
const dirty = { left: true, card: true };
const layers = { left: null, card: null };
TOKEN_LISTENERS.push(() => { dirty.left = dirty.card = true; });

function on_paint(gr) {
    hits.clear();
    gr.FillSolidRect(0, 0, W, H, C.bg);
    // the wallpaper (lib/wallpaper.js) where it is on: LABEL_LIVE then also tells the views they draw over it
    LABEL_LIVE = STATE.view !== "style" && wallpaperOn(STATE.view) && drawWallpaper(gr, "stage", 0, 0, W, H);
    try {
        if (STATE.view === "archive") AR.layout === "grid" ? drawGrid(gr) : drawArchive(gr);
        else if (STATE.view === "signal") drawSignal(gr);
        else if (STATE.view === "lyrics") drawLyricsView(gr);
        else if (STATE.view === "style") drawStyle(gr);
    } finally { LABEL_LIVE = false; }
    drawGrain(gr, 0, 0, W, H);
}

function drawLyricsView(gr) {
    // left column
    const wp = LABEL_LIVE ? WP.comp : null;   // the wallpaper's bitmap under the column (it is part of the layer)
    if (dirty.left || !layers.left || layers.left.wp !== wp) { layers.left = renderLayer(dp(LEFT_W), H, drawLeft, layers.left); layers.left.wp = wp; dirty.left = false; }
    gr.DrawImage(layers.left.img, 0, 0, layers.left.w, layers.left.h, 0, 0, layers.left.w, layers.left.h);
    gr.FillSolidRect(dp(LEFT_W), 0, HAIR, H, withAlpha(C["line-dim"], .6));
    drawSpectrumBox(gr);
    // card, as tall as the view
    const ch = Math.max(cardHeight(), H - 2 * dp(24));
    if (dirty.card || !layers.card || layers.card.h !== ch) {
        layers.card = renderLayer(dp(CARD_W), ch, (g, w, h) => drawCard(g, w, h, "queue", tr("INFO")), layers.card);
        dirty.card = false;
    }
    gr.DrawImage(layers.card.img, cardX(), dp(24), layers.card.w, layers.card.h, 0, 0, layers.card.w, layers.card.h);
    hitsCard(cardX(), dp(24));
    if (hover && (hover.id === "profile" || hover.id === "folder")) box(gr, hover.x, hover.y, hover.w, hover.h, C.accent);
    // centre
    const g = lyricsGeom();
    drawLyricsFrame(gr, g);
    alertShown = false;
    if (T.missing) drawAlert(gr, g, { head: [tr("SYSTEM WARNING"), tr("PLAYBACK · 03")], title: tr("WARNING"), wait: tr("ADVANCING"),
        lines: [[tr("FILE NOT FOUND"), 0], [tr("DECODER · NO INPUT"), 0], [tr("ADVANCING TO NEXT TRACK"), 1]] });
    else if (!T.info) drawAlert(gr, g, { head: [tr("SYSTEM NOTICE"), tr("PLAYBACK · 03")], title: tr("STANDBY"), wait: tr("AWAITING SIGNAL"),
        lines: [[tr("NO TRACK LOADED"), 0], [tr("OUTPUT · IDLE"), 0]], tone: C["fg-soft"] });
    else if (T.lyrics) drawLyrics(gr, g);
    else {
        // the source actually being asked, not the configured one: under AUTO it moves from LRCLIB to NetEase
        const srcName = tr(LYR.src === "NETEASE" ? "NETEASE" : "LRCLIB");
        const online = tr(!lyrOnline() ? "OFF" : LYR.state || "NOT FOUND"), searching = LYR.state === "SEARCHING";
        // what the notice lists is what was actually looked at: a fixed source only its own lookup, LOCAL only the file
        // and the tag (it never goes online, so a "LRCLIB · OFF" line described something that was never tried), AUTO both
        const file = [[tr("LRC FILE · NOT FOUND"), 0], [tr("LYRICS TAG · NOT FOUND"), 0]];
        const remote = [[`${srcName} · ${online}`, searching ? 1 : 0]], done = [[tr("PLAYBACK CONTINUES"), 1]];
        const lines = lyrFixed() ? [...remote, ...done] : lyrOnline() ? [...file, ...remote, ...done] : [...file, ...done];
        drawAlert(gr, g, { head: [tr("SYSTEM NOTICE"), tr("LYRICS · 03")], title: tr(searching ? "SEARCHING" : "NO LYRICS"), wait: tr(searching ? "QUERYING {0}" : "AWAITING INPUT", srcName), lines });
    }
}

// the Swiss frame of the centre field (under the lyrics or the pop-up)
const LF_ST = { head: { size: 9, weight: 600, track: .16 }, tiny: { size: 8, weight: 500, track: .14 } };
function drawLyricsFrame(gr, g) {
    for (const [x, y] of [[g.x0 + dp(16), dp(16)], [g.x1 - dp(27), dp(16)], [g.x0 + dp(16), H - dp(27)], [g.x1 - dp(27), H - dp(27)]]) regCross(gr, x, y);
    // ■ LYRICS MONITOR · 03   [LRC · SYNCED]
    //                                                        SOURCE [AUTO | LOCAL | LRCLIB | NETEASE]
    const L = T.lyrics, playing = fb.IsPlaying && !fb.IsPaused, lx = g.x0 + dp(40), ty = dp(30);
    gr.FillSolidRect(lx, ty + dp(2), dp(5), dp(5), C.fg);
    const lw = label(gr, tr("LYRICS MONITOR  ·  03"), st(LF_ST.head, C.fg), lx + dp(15), ty - dp(2));
    const state = T.missing ? tr("FAULT") : !T.info ? tr("STANDBY") : L ? `${tr(L.source)} · ${tr(L.synced === false ? "UNSYNCED" : !L.translated ? "SYNCED" : L.translated === "netease" ? "TR" : "MT")}` : tr("NO LYRICS");
    const cx0 = lx + dp(15) + lw + dp(14), cw = chip(gr, state, cx0, dp(24), dp(18), L && playing ? "acc" : "inv", 8.5, C.bg);
    // The state chip opens the translation source menu (its TR / MT is that setting's doing); the lyrics source is the
    // switch below it. Both are drawn before the early return below, so they stay reachable while the panel reports
    // NO LYRICS too: that is when the source is most likely to be changed. The line / language count the row used to
    // carry sits on the status line under the lyrics now (drawLyrics).
    hits.add("lyr-trans", cx0, dp(24), cw, dp(18));
    if (hover && hover.id === "lyr-trans") box(gr, cx0, dp(24), cw, dp(18), C.accent);
    // A second line, not the head row: the four values are wider than the room left beside the chip, so on a narrow
    // window the switch and the chip would collide. At dp(46) its plate runs 42..72 — against the chip's bottom (42) and
    // just above the crop marks (dp(72)) — so the two only have to clear each other vertically.
    segToggle(gr, g.x1 - dp(40), dp(46), "SOURCE", LYR_SOURCES, STATE.lyricsSource, "lyr-source");
    if (!L || T.missing || !T.info) return;
    // crop marks around the lines
    const pitch = dp(58), bx0 = Math.round(g.cx - g.cw / 2 - dp(24)), bx1 = Math.round(g.cx + g.cw / 2 + dp(24));
    const by0 = Math.max(dp(72), Math.round(g.cy - 4.5 * pitch)), by1 = Math.min(H - dp(72), Math.round(g.cy + 5.5 * pitch + dp(26))), M = dp(18);
    for (const [x, y, sx, sy] of [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx0, by1, 1, -1], [bx1, by1, -1, -1]]) {
        gr.FillSolidRect(sx > 0 ? x : x - M, y, M, HAIR, C["line-dim"]);
        gr.FillSolidRect(x, sy > 0 ? y : y - M, HAIR, M, C["line-dim"]);
    }
    // line index: one mark per lyric line (or per equal share of a long text), passed lines soft, the current one orange
    const lines = L.lines, cur = Math.max(0, lyricIndex(lines, fb.IsPlaying ? fb.PlaybackTime : 0));
    const avail = by1 - by0 - dp(40), n = Math.max(1, Math.min(lines.length, Math.floor(avail / dp(4))));
    const step = Math.min(dp(9), avail / n), rx = g.x1 - dp(58), ry0 = Math.round(g.cy + dp(26) - n * step / 2);
    label(gr, tr("LINE"), st(LF_ST.tiny, C["text-muted"]), rx, ry0 - dp(20));
    const curK = Math.min(n - 1, Math.floor(cur * n / lines.length));
    for (let k = 0; k < n; k++) {
        const y = Math.round(ry0 + k * step);
        gr.FillSolidRect(rx, y, dp(14), Math.max(HAIR, dp(1.5)), k === curK ? C.accent : k < curK ? C["fg-soft"] : C["line-dim"]);
    }
}

// draws fn into a bitmap; the previous bitmap is reused when the size is the same (layers are redrawn every frame while
// a title scrambles or the hero case decrypts, and a new bitmap each time would pile up megabytes for the GC)
function renderLayer(w, h, fn, prev = null) {
    w = Math.max(1, w); h = Math.max(1, h);
    const img = prev && prev.w === w && prev.h === h ? prev.img : d2d.CreateImage(w, h), g = img.GetGraphics();
    try { fn(g, w, h); } finally { img.ReleaseGraphics(g); }
    return { img, w, h };
}

// ------------------------------------------------------------------------------------------------ left column
function drawLeft(gr, w, h) {
    gr.FillSolidRect(0, 0, w, h, C.bg);
    if (LABEL_LIVE) drawWallpaper(gr, "stage", 0, 0, w, h);
    const x = dp(24);
    let y = dp(26);
    gr.FillSolidRect(x, y + dp(2.5), dp(22), dp(6), C.fg);
    label(gr, tr("LYRICS SECTION · PLAYBACK"), st(ST.sbar, C.fg), x + dp(34), y);
    y += dp(29);
    const I = T.info, playing = fb.IsPlaying;
    const rows = [
        [tr("SPECTRUM"), tr("48 BANDS / LIVE")],
        [tr("PEAK"), playing ? fmtDb(AUDIO.peakDb) : "—"],
        [tr("RMS"), playing ? fmtDb(AUDIO.rmsDb) : "—"],
        [tr("STEREO"), playing ? tr("{0} CORR", AUDIO.corr.toFixed(2)) : "—"],
        [tr("RATE"), I && I.rate ? `${+(I.rate / 1000).toFixed(1)} KHZ${I.bits ? " / " + I.bits + " BIT" : ""}` : "—"],
        [tr("SESSION"), fmtTime((Date.now() - T.session0) / 1000).padStart(8, "00:")],
    ];
    for (const [k, v] of rows) {
        label(gr, k, st(ST.key, C["text-muted"]), x, y + dp(1));
        label(gr, v, st(ST.val, C.fg), x + dp(96), y);
        y += dp(18);
    }
    // analysis log
    y += dp(18);
    const tw = labelWidth(tr("ANALYSIS LOG"), st(ST.tag, 0)) + dp(12), th = dp(13);
    gr.FillSolidRect(x, y, tw, th, C.fg);
    label(gr, tr("ANALYSIS LOG"), st(ST.tag, C.bg, C.fg), x + dp(6), y + Math.round((th - labelHeight(ST.tag)) / 2));
    y += th + dp(10);
    const bw = dp(CARD_W), lines = analysisLines(), bh = dp(12 + 10 + 10) + HAIR + lines.length * dp(18) + dp(12);
    box(gr, x, y, bw, bh, C["line-faint"]);
    const fault = T.missing;
    label(gr, tr("ANALYSIS"), st(ST.anaH, C.fg), x + dp(14), y + dp(12));
    label(gr, tr(fault ? "FAULT" : fb.IsPlaying ? (fb.IsPaused ? "PAUSED" : "ACTIVE") : "STANDBY"), st(ST.anaH, fault || fb.IsPlaying ? C.accent : C["text-muted"]), x + bw - dp(14), y + dp(12), 2);
    hline(gr, x + dp(14), y + dp(32), bw - dp(28));
    let ly = y + dp(32) + HAIR + dp(10);
    lines.forEach(([text, on], i) => {
        const last = i === lines.length - 1;
        label(gr, fitLabel(text, st(ST.anaL, 0), bw - dp(60)), st(ST.anaL, C["fg-soft"]), x + dp(14), ly + dp(4));
        const s = dp(6), sx = x + bw - dp(14) - s, sy = ly + dp(5);
        if (last && on) gr.FillSolidRect(sx, sy, s, s, C.accent); else box(gr, sx, sy, s, s, C["fg-soft"]);
        ly += dp(18);
    });
    // the live spectrum takes the rest of the column, down to where the card ends (drawn every frame by drawSpectrumBox)
    const sy = y + bh + dp(22);
    LEFT_SPEC = { x, y: sy, w: bw, h: h - dp(24) - sy };
}

// SPECTRUM: the 48 live bands as bars, the loudest in orange; a flat line while nothing plays. Hidden when the
// column has no room for it.
function drawSpectrumBox(gr) {
    const R = LEFT_SPEC;
    specRect = null;
    if (!R || R.h < dp(110)) return;
    const th = dp(13), ts = st(ST.tag, C.bg, C.fg), tw = labelWidth(tr("SPECTRUM"), ts) + dp(12);
    gr.FillSolidRect(R.x, R.y, tw, th, C.fg);
    label(gr, tr("SPECTRUM"), ts, R.x + dp(6), R.y + Math.round((th - labelHeight(ST.tag)) / 2));
    const by = R.y + th + dp(10), bh = R.h - th - dp(10), padX = dp(14);
    box(gr, R.x, by, R.w, bh, C["line-faint"]);
    if (!LABEL_LIVE) gr.FillSolidRect(R.x + 1, by + 1, R.w - 2, bh - 2, C.bg);
    const n = 48, gw = (R.w - 2 * padX) / n, top = by + dp(16), base = by + bh - dp(30), live = fb.IsPlaying;
    for (let i = 0; i < n; i++) {
        const v = live ? clamp(AUDIO.bands[i] || 0, 0, 1) : 0, hb = Math.max(HAIR, Math.round((base - top) * v));
        gr.FillSolidRect(Math.round(R.x + padX + i * gw), base - hb, Math.max(1, Math.round(gw * .55)), hb, v > .78 ? C.accent : withAlpha(C.fg, .3 + .6 * v));
    }
    gr.FillSolidRect(R.x + padX, base + dp(4), R.w - 2 * padX, HAIR, C["line-dim"]);
    label(gr, "20 HZ", st(ST.key, C["text-muted"]), R.x + padX, base + dp(10));
    label(gr, "20 KHZ", st(ST.key, C["text-muted"]), R.x + R.w - padX, base + dp(10), 2);
    specRect = [R.x, by, R.w, bh];
}

function analysisLines() {
    const I = T.info;
    if (!I) return [["DECODE · —", false], ["REPLAYGAIN · —", false], ["LYRICS · —", false], ["OUTPUT · —", false], ["NEXT · —", false]];
    const res = I.bits && I.rate ? ` ${I.bits}/${+(I.rate / 1000).toFixed(1)}` : I.bitrate ? ` ${I.bitrate} KBPS` : "";
    const L = T.lyrics;
    return [
        [`${tr("DECODE")} · ${I.codec.toUpperCase()}${res}`, true],
        [`${tr("REPLAYGAIN")} · ${I.gain ? tr("TRACK") + " " + I.gain.toUpperCase().replace("-", "−") : tr("NONE")}`, true],
        [`${tr("LYRICS")} · ${L ? `${tr(L.source)} · ${tr(L.langs > 1 ? "{0} LANGUAGES" : "{0} LANGUAGE", L.langs)}` : tr("NONE")}`, true],
        [tr("OUTPUT · {0} CH · VOLUME {1}", I.ch || 2, fb.Volume <= -100 ? tr("MUTED") : fmtDb(fb.Volume)), true],
        [`${tr("NEXT")} · ${T.next}`, true],
    ];
}

// ------------------------------------------------------------------------------------------------------ lyrics
// A lyric line in the column: on one line, shrunk (by `step`) down to `min` dp if need be; still too wide, it wraps onto
// up to `most` lines, shrinking further down to `floor` if it needs more (the last line ends in … when even that is not
// enough). { lines, f, lh }
function lyricFit(gr, text, size, min, step, weight, w, most = 2, floor = min) {
    let f = fontFor(text, size, weight);
    while (size > min && gr.CalcTextWidth(text, f) > w) f = fontFor(text, size = Math.max(min, size - step), weight);
    if (gr.CalcTextWidth(text, f) <= w) return { lines: [text], f, lh: Math.ceil(f.Height) };
    let lines = wrapLines(gr, text, f, w);
    while (lines.length > most && size > floor) { f = fontFor(text, size = Math.max(floor, size - step), weight); lines = wrapLines(gr, text, f, w); }
    if (lines.length > most) lines = [...lines.slice(0, most - 1), lines.slice(most - 1).join(isCJK(text) ? "" : " ")];
    return { lines, f, lh: Math.ceil(f.Height) };
}
// the lines `text` wraps into; none starts with closing punctuation (it stays at the end of the line before)
function wrapLines(gr, text, f, w) {
    const out = gr.EstimateLineWrap(text, f, w).filter((_, j) => j % 2 === 0);
    for (let j = 1; j < out.length; j++) {
        const m = out[j].match(/^[，。、！？：；）」』,.!?:;)]+/);
        if (m) { out[j - 1] += m[0]; out[j] = out[j].slice(m[0].length).trimStart(); }
    }
    return out.filter(Boolean);
}
function drawFit(gr, fit, colour, x, cy, w) {
    const n = fit.lines.length, y0 = Math.round(cy - n * fit.lh / 2);
    // only the last line may end in … (a line before it keeps the punctuation it was given, hanging at the edge)
    fit.lines.forEach((t, j) => gr.DrawText(t, fit.f, colour, x - dp(8), y0 + j * fit.lh, w + dp(16), fit.lh, j === n - 1 ? DT_CENTER_SINGLE | DT_ELLIPSIS : DT_CENTER_SINGLE));
}

// the current line large in the middle with its translation under it; earlier lines above and later ones below, fading
// with distance; the block slides up by one line when the next line starts
function drawLyrics(gr, g) {
    const L = T.lyrics.lines, el = fb.IsPlaying ? fb.PlaybackTime : 0, pitch = dp(58), synced = lyrSynced();
    const sung = Math.max(0, lyricIndex(L, el));
    LYR_SCROLL.n = clamp(LYR_SCROLL.n, -sung, L.length - 1 - sung);
    // unsynced lyrics: the middle line is just where the wheel left them (no sung line, karaoke rule or time stamp)
    const i = sung + LYR_SCROLL.n, scrolled = synced && LYR_SCROLL.n !== 0;
    if (i !== lyrIdx) {
        if (lyrIdx >= 0 && !REDUCE_MOTION && Math.abs(i - lyrIdx) <= 6) { lyrOff.x += pitch * (i - lyrIdx); clock.wake(); }
        lyrIdx = i;
    }
    const o = lyrOff.x, cx = g.cx, cy = g.cy, cur = L[i], hasTr = !!(cur && cur.a && cur.b), left = cx - g.cw / 2;
    // the current line on two lines pushes the ones after it down
    const curFit = cur ? lyricFit(gr, cur.a || cur.b, 30, 22, 2, 700, g.cw, 3, 18) : null, extra = curFit ? (curFit.lines.length - 1) * curFit.lh : 0;
    lyrBar = null;
    gr.PushClip(g.x0 + HAIR, dp(52), g.x1 - g.x0 - HAIR, H - dp(122));   // under the LYRICS MONITOR head
    for (let k = -4; k <= 5; k++) {
        const line = L[i + k];
        if (!line) continue;
        const off = k * pitch + (k > 0 ? dp(hasTr ? 34 : 8) + extra : 0), y = cy + off + o, a = line.a || line.b;
        if (y > dp(60) && y < H - dp(90)) hits.add("lyric", left, Math.round(y - pitch / 2), g.cw, pitch, i + k);   // a whole row each
        // the sung line, when scrolled away from the middle: an orange mark to its left
        if (scrolled && i + k === sung && k !== 0) {
            const tw = Math.min(g.cw, gr.CalcTextWidth(a, fontFor(a, 17, 500)));
            gr.FillSolidRect(Math.round(cx - tw / 2 - dp(22)), Math.round(y - dp(3)), dp(6), dp(6), C.accent);
        }
        if (k === 0) {
            // the line shrinks (down to 22 dp) when it is wider than the column, then wraps onto a second line
            const fa = curFit.f;
            drawFit(gr, curFit, scrolled ? C["fg-soft"] : C.fg, left, y - dp(1) + extra / 2, g.cw);
            if (hasTr) gr.DrawText(line.b.toUpperCase(), fontFor(line.b, 13, 500), C["fg-soft"], left, y + dp(22) + extra, g.cw, dp(22), DT_CENTER_SINGLE | DT_ELLIPSIS);
            const wa = Math.min(g.cw, Math.max(...curFit.lines.map(t => gr.CalcTextWidth(t, fa))));
            if (!synced) continue;
            // karaoke rule under the line (and its translation): a hairline, filled in orange through the line's time
            const ftr = hasTr ? fontFor(line.b, 13, 500) : null, wb = ftr ? gr.CalcTextWidth(line.b.toUpperCase(), ftr) : 0;
            const rw = Math.min(g.cw - dp(40), Math.max(wa, wb)), ry = Math.round(y + dp(hasTr ? 52 : 30) + extra);
            const next = L[i + 1] ? L[i + 1].t : line.t + 8, prog = clamp((el - line.t) / Math.max(.1, next - line.t), 0, 1);
            gr.FillSolidRect(cx - rw / 2, ry, rw, HAIR, C.hair);
            if (!scrolled) {
                gr.FillSolidRect(cx - rw / 2, ry - dp(1), rw * prog, dp(3), C.accent);
                lyrBar = [Math.floor(cx - rw / 2) - 1, Math.floor(ry - dp(2)), Math.ceil(rw) + 2, Math.ceil(dp(5)) + 1];
            }
            // the line's time stamp and marker to its left, when there is room for them in the column
            if (cx - wa / 2 - dp(40) > g.x0 + dp(8)) gr.FillSolidRect(cx - wa / 2 - dp(40), y - dp(3), dp(6), dp(6), scrolled ? C["text-muted"] : C.accent);
            if (cx - wa / 2 - dp(170) > g.x0 + dp(8))
                gr.DrawText(`${fmtTime(line.t)}.${pad(Math.floor(line.t % 1 * 100), 2)}`, font(9, 500), C["text-muted"], cx - wa / 2 - dp(170), y - dp(9), dp(118), dp(16), DT_RIGHT_SINGLE);
        } else {
            const d = Math.abs(off + o) / pitch;
            drawFit(gr, lyricFit(gr, a, k < 0 ? 17 : 18, 14, 1, 500, g.cw, 2, 12), withAlpha(k < 0 ? C["text-muted"] : C["fg-soft"], clamp(1.05 - d * .19, .1, .85)), left, y, g.cw);
        }
    }
    gr.PopClip();
    const trNote = TR.state ? `  ·  ${tr(TR_STATE_TEXT[TR.state] || TR.state)}` : T.lyrics.translated ? `  ·  ${tr("TRANSLATED")} · ${tr(T.lyrics.translated.toUpperCase())}` : "";
    const where = scrolled ? `  ·  ${tr("CLICK A LINE TO PLAY FROM IT")}` : "", plainNote = synced ? "" : `  ·  ${tr("UNSYNCED")}`;
    // the line count is already in "LINE {0} OF {1}", so only how many languages the text carries is added (it moved
    // here from the LYRICS MONITOR row, which needed the room for the source switch)
    // a single language is "1 LANGUAGE", as the Signal view's read-out already puts it
    const langNote = `  ·  ${tr(T.lyrics.langs > 1 ? "{0} LANGUAGES" : "{0} LANGUAGE", T.lyrics.langs)}`;
    label(gr, `${tr("LYRICS")} / ${tr(T.lyrics.source)}  ·  ${tr("LINE {0} OF {1}", pad(i + 1, 2), pad(L.length, 2))}${langNote}${scrolled ? where : plainNote + trNote}`, st(ST.key, C["text-muted"]), cx, H - dp(46), 1);
}

// a warning pop-up: a framed window with a filled title strip and a hatched drop shadow; inside, the triangle, the title
// in an outlined bar, a checklist and a last line that waits with cycling dots. `a`: { head: [left, right], title,
// lines: [[text, marked]], wait, tone }. The dots need repaints, so the clock keeps ticking while one is shown.
function drawAlert(gr, g, a) {
    const tone = a.tone || C.accent, pad = dp(28), w = Math.min(dp(440), g.cw - 2 * pad), cx = g.cx, x = Math.round(cx - w / 2);
    const headH = dp(24), triH = dp(34), barH = dp(58), lh = dp(24), t2 = Math.max(HAIR, dp(1.5));
    const body = triH + dp(18) + barH + dp(22) + a.lines.length * lh + dp(14) + lh;
    const fx = x - pad, fw = w + 2 * pad, fh = headH + pad + body + dp(22), fy = Math.round(g.cy - fh / 2);
    // hatched shadow down and to the right, then the window
    const off = dp(8);
    gr.PushClip(fx + off, fy + off, fw, fh);
    for (let d = -fh; d < fw; d += dp(6)) gr.DrawLine(fx + off + d, fy + off + fh, fx + off + d + fh, fy + off, HAIR, withAlpha(tone, .35));
    gr.PopClip();
    gr.FillSolidRect(fx, fy, fw, fh, C.bg);
    box(gr, fx, fy, fw, fh, tone, t2);
    // title strip
    gr.FillSolidRect(fx, fy, fw, headH, tone);
    const hs = st(ST.anaL, C.bg, tone), hy = fy + Math.round((headH - labelHeight(ST.anaL)) / 2);
    gr.FillSolidRect(fx + dp(10), fy + Math.round(headH / 2 - dp(2.5)), dp(5), dp(5), C.bg);
    label(gr, a.head[0], hs, fx + dp(22), hy);
    label(gr, a.head[1], hs, fx + fw - dp(10), hy, 2);
    // triangle with "!"
    const ty = fy + headH + pad, tw = dp(19);
    gr.DrawPolygon(tone, dp(2), [cx, ty, cx + tw, ty + triH, cx - tw, ty + triH]);
    gr.FillSolidRect(Math.round(cx - dp(1)), ty + dp(11), dp(2), dp(12), tone);
    gr.FillSolidRect(Math.round(cx - dp(1)), ty + dp(26), dp(2), dp(3), tone);
    // the title in an outlined bar
    const by = ty + triH + dp(18);
    box(gr, x, by, w, barH, tone, t2);
    box(gr, x + dp(5), by + dp(5), w - dp(10), barH - dp(10), withAlpha(tone, .45), HAIR);
    const ts = { size: 26, weight: 300, track: .32, colour: tone, bg: C.bg };
    label(gr, a.title, ts, cx, by + Math.round((barH - labelHeight(ts)) / 2), 1);
    // checklist
    let ly = by + barH + dp(22);
    for (const [text, marked] of a.lines) {
        const col = marked ? tone : C["fg-soft"], s = dp(7), sx = x + w - dp(4) - s;
        label(gr, text, st(ST.anaL, col), x + dp(4), ly + Math.round((lh - labelHeight(ST.anaL)) / 2));
        if (marked) gr.FillSolidRect(sx, ly + Math.round((lh - s) / 2), s, s, tone); else box(gr, sx, ly + Math.round((lh - s) / 2), s, s, C["fg-soft"]);
        ly += lh;
    }
    // waiting: a dashed rule, then the last line with dots that fill in one by one and a blinking block
    ly += dp(6);
    for (let dx = 0; dx < w; dx += dp(6)) gr.FillSolidRect(x + dx, ly, Math.min(dp(3), w - dx), HAIR, withAlpha(tone, .5));
    ly += dp(8);
    // (Reduce motion: three dots and the block, still)
    const now = performance.now(), n = REDUCE_MOTION ? 3 : Math.floor(now / 380) % 4, wy = ly + Math.round((lh - labelHeight(ST.anaL)) / 2);
    const ww = label(gr, a.wait, st(ST.anaL, tone), x + dp(4), wy);
    const dw = labelWidth(".", st(ST.anaL, 0)) + dp(3);
    for (let k = 0; k < 3; k++) if (k < n) label(gr, ".", st(ST.anaL, tone), x + dp(4) + ww + dp(3) + k * dw, wy);
    if (REDUCE_MOTION || Math.floor(now / 530) % 2 === 0) gr.FillSolidRect(x + w - dp(11), ly + Math.round(lh / 2 - dp(5)), dp(7), dp(10), tone);
    alertShown = !REDUCE_MOTION;
}

// ------------------------------------------------------------------------------------------------------- mouse
function on_mouse_lbtn_down(x, y) {
    const a = hits.at(x, y);
    if (STATE.view === "archive" && AR.layout === "grid" && a && a.id === "grid-bar") gridBarDown(y, a);
    if (STATE.view === "archive" && AR.layout !== "grid" && a && a.id === "ar-ruler") rulerDown(x);
}
function on_mouse_move(x, y, mask) {
    // (a drag whose button went up outside the panel ends at the next move)
    if (GRID.drag) { if (mask & 0x0001) gridBarMove(y); else gridBarUp(); return; }
    if (AR.rulerDrag) { if (mask & 0x0001) rulerMove(x); else rulerUp(); return; }
    const a = hits.at(x, y), onCase = STATE.view === "archive" && archiveMouseMove(x, y, a);
    if (STATE.view === "style") styleMouseMove(a);
    window.SetCursor(a || onCase ? 32649 : 32512);
    if ((a && a.id) !== (hover && hover.id) && (STATE.view === "lyrics" || STATE.view === "signal")) window.Repaint();
    hover = a;
    // the card's RATING row: the rating its marks would give, previewed
    const n = a && a.id === "rate" ? ratingAt(x, a.x + a.data.pad, a.data.size) : 0;
    if (n !== NP_RATE.hover) { NP_RATE.hover = n; dirty.card = true; window.Repaint(); }
}
function on_mouse_leave() {
    if (NP_RATE.hover) { NP_RATE.hover = 0; dirty.card = true; }
    if (STATE.view === "archive") archiveMouseLeave();
    if (STATE.view === "style") styleMouseMove(null);
    if (hover) { hover = null; if (STATE.view === "lyrics" || STATE.view === "signal") window.Repaint(); }
}
function on_mouse_lbtn_dblclk(x, y) { if (STATE.view === "archive" && AR.layout === "grid" && !hits.at(x, y)) gridDblClick(x, y); }
function on_mouse_wheel_h(step) { if (STATE.view === "archive") archiveWheelH(step); }   // a sideways wheel: shelves
function on_mouse_wheel(step) {
    if (STATE.view === "archive") { archiveWheel(step); return; }
    if (STATE.view === "lyrics" && T.lyrics) {
        LYR_SCROLL.n -= step;
        LYR_SCROLL.until = performance.now() + LYR_BACK_MS;
        clock.wake(); window.Repaint();
    }
}
function on_mouse_rbtn_up(x, y, mask) {
    if (STATE.view !== "archive" || (mask & 0x0004)) return false;   // Shift: JSplitter's own menu
    archiveMenu(x, y);
    return true;
}
function on_mouse_lbtn_up(x, y) {
    if (GRID.drag) { gridBarUp(); return; }
    if (AR.rulerDrag) { rulerUp(); return; }
    const a = hits.at(x, y);
    if (STATE.view === "archive") { archiveClick(x, y, a); return; }
    if (STATE.view === "style") { styleClick(a); return; }
    if (!a) return;
    if (a.id === "vis") visMenu(a.x, a.y + a.h);
    else if (a.id === "model" && a.data !== Ring.mode) { Ring.mode = a.data; setSetting("ringMode", a.data); window.Repaint(); }
    else if (a.id === "rate") setRating(T.handle, ratingAt(x, a.x + a.data.pad, a.data.size));
    else if (a.id === "profile") inspectRequest();
    else if (a.id === "folder") openFolder(T.handle);
    else if (a.id === "pager") { if (a.data === 0) fb.Prev(); else if (a.data === 2) fb.Next(); }
    else if (a.id === "queue") plman.ExecutePlaylistDefaultAction(a.data.pl, a.data.index);
    else if (a.id === "lyr-source") setLyricsSource(a.data);
    else if (a.id === "lyr-trans") lyricsTransMenu(a.x, a.y + a.h);
    else if (a.id === "lyric" && T.lyrics && T.lyrics.lines[a.data] && T.lyrics.lines[a.data].t != null && fb.IsPlaying) { LYR_SCROLL.n = 0; fb.PlaybackTime = T.lyrics.lines[a.data].t; }
    else if (a.id === "trace" && fb.IsPlaying && fb.PlaybackLength > 0) fb.PlaybackTime = clamp((x - a.x) / a.w, 0, 1) * fb.PlaybackLength;
}
function on_char(code) { searchChar(code); }
// online lyrics (lib/lyrics.js) arrive as downloads
function on_download_file_done(path, success) { if (lyricsDownloaded(path, success)) window.Repaint(); }
function on_locations_added(task, handles) { libLocationsAdded(task, handles); }   // CUE sheets read for the archive (lib/library.js)
function on_key_down(vk) {
    if (searchKey(vk)) return;
    if (STATE.view === "archive" && archiveKey(vk)) return;
    if (STATE.view === "signal" && vk === 0x52) { Ring.mode = MODELS[(MODELS.indexOf(Ring.mode) + 1) % MODELS.length]; setSetting("ringMode", Ring.mode); window.Repaint(); return; }   // R
    if ((STATE.view === "signal" || STATE.view === "lyrics") && (vk === 0x25 || vk === 0x27) && fb.IsPlaying) {
        fb.PlaybackTime = clamp(fb.PlaybackTime + (vk === 0x27 ? 5 : -5), 0, fb.PlaybackLength - 1);
        return;
    }
    if (vk === 0x20) { fb.PlayOrPause(); return; }
    globalKey(vk);
}

function on_colours_changed() { refreshTokens(); window.Repaint(); }
