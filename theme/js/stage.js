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
for (const f of ["emblem", "audio", "ring", "lyrics", "waveform", "album", "playlists", "nowplaying", "library"]) include(fb.ProfilePath + `themes\\audio-archive\\js\\lib\\${f}.js`);
include(fb.ProfilePath + "themes\\audio-archive\\js\\archive.js");
include(fb.ProfilePath + "themes\\audio-archive\\js\\grid.js");
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
let lyrIdx = -1;
function npChanged(same, h, what) {
    if (what === "cover") { dirty.card = true; window.Repaint(); return; }
    if (!h) T.lyrics = null;
    else if (!same) {
        T.lyrics = loadLyrics(h);
        if (!T.lyrics) lyricsOnline(h, L => { if (T.handle && T.handle.RawPath === h.RawPath && T.handle.SubSong === h.SubSong) { T.lyrics = L; lyrIdx = -1; dirty.left = true; clock.wake(); window.Repaint(); } });
        lyrIdx = -1;
        waveLoad(h, () => { if (STATE.view === "signal") window.Repaint(); });
        clock.wake();
    }
    dirty.card = dirty.left = true;
    window.Repaint();
}

// the archive's file panel marks the playing track
const playingChanged = () => { AR.tracks.key = ""; AR.dirtyInfo = true; if (STATE.view === "archive") window.Repaint(); };
function on_playback_new_track() { loadTrack(); playingChanged(); }
function on_playback_starting() { clock.wake(); }
function on_playback_pause() { dirty.card = true; clock.wake(); window.Repaint(); }
function on_playback_stop(reason) { if (reason !== 2) { loadTrack(); playingChanged(); } }
function on_playback_seek() { lyrIdx = -2; clock.wake(); }
function on_playback_queue_changed() { if (T.handle) { T.next = nextTitle(); dirty.left = dirty.card = true; window.Repaint(); } }
function on_playlist_items_reordered(i) { plDirty(i); }
function on_item_focus_change() { if (!fb.IsPlaying) loadTrack(); }
function on_metadb_changed() { if (T.handle) loadTrack(); }

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
    let anim = stepSpring(lyrOff, dt);
    if (stepSpring(heroClear, dt)) { anim = true; dirty.card = true; }
    if (T.title && !scrambleDone(T.title)) { anim = true; dirty.card = true; }
    if (playing && now - lastLeft > 250) { lastLeft = now; dirty.left = true; }
    if (anim || ((playing || alertShown) && now - lastPaint > 100)) { lastPaint = now; window.Repaint(); }
    else if (playing && (lyrBar || specRect)) { if (lyrBar) window.RepaintRect(...lyrBar); if (specRect) window.RepaintRect(...specRect); }
    return anim || playing || alertShown;
});
let arrayScaleWas = STATE.arrayScale;
onMessage("state", () => {
    if (STATE.skin !== CASE_SKIN && loadSkin(STATE.skin)) dirty.card = true;
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
let lyricsWasOnline = STATE.lyricsOnline;
onMessage("state", () => {
    if (STATE.lyricsOnline && !lyricsWasOnline && T.handle && !T.lyrics) npChanged(false, T.handle);
    lyricsWasOnline = STATE.lyricsOnline;
});
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

function on_size(w, h) { W = w; H = h; dirty.left = dirty.card = true; layers.left = layers.card = null; AR.dirtyInfo = true; AR.info = null; }

// layers: bitmaps of the left column and the card, rebuilt when dirty
const dirty = { left: true, card: true };
const layers = { left: null, card: null };
TOKEN_LISTENERS.push(() => { dirty.left = dirty.card = true; });

function on_paint(gr) {
    hits.clear();
    gr.FillSolidRect(0, 0, W, H, C.bg);
    if (STATE.view === "archive") AR.layout === "grid" ? drawGrid(gr) : drawArchive(gr);
    else if (STATE.view === "signal") drawSignal(gr);
    else if (STATE.view === "lyrics") drawLyricsView(gr);
    else if (STATE.view === "style") drawStyle(gr);
    drawGrain(gr, 0, 0, W, H);
}

function drawLyricsView(gr) {
    // left column
    if (dirty.left || !layers.left) { layers.left = renderLayer(dp(LEFT_W), H, drawLeft, layers.left); dirty.left = false; }
    gr.DrawImage(layers.left.img, 0, 0, layers.left.w, layers.left.h, 0, 0, layers.left.w, layers.left.h);
    gr.FillSolidRect(dp(LEFT_W), 0, HAIR, H, withAlpha(C["line-dim"], .6));
    drawSpectrumBox(gr);
    // card, as tall as the view
    const ch = Math.max(cardHeight(), H - 2 * dp(24));
    if (dirty.card || !layers.card || layers.card.h !== ch) {
        layers.card = renderLayer(dp(CARD_W), ch, (g, w, h) => drawCard(g, w, h, "queue", "INFO"), layers.card);
        dirty.card = false;
    }
    gr.DrawImage(layers.card.img, cardX(), dp(24), layers.card.w, layers.card.h, 0, 0, layers.card.w, layers.card.h);
    hitsCard(cardX(), dp(24));
    if (hover && hover.id === "profile") box(gr, hover.x, hover.y, hover.w, hover.h, C.accent);
    // centre
    const g = lyricsGeom();
    drawLyricsFrame(gr, g);
    alertShown = false;
    if (T.missing) drawAlert(gr, g, { head: ["SYSTEM WARNING", "PLAYBACK · 03"], title: "WARNING", wait: "ADVANCING",
        lines: [["FILE NOT FOUND", 0], ["DECODER · NO INPUT", 0], ["ADVANCING TO NEXT TRACK", 1]] });
    else if (!T.info) drawAlert(gr, g, { head: ["SYSTEM NOTICE", "PLAYBACK · 03"], title: "STANDBY", wait: "AWAITING SIGNAL",
        lines: [["NO TRACK LOADED", 0], ["OUTPUT · IDLE", 0]], tone: C["fg-soft"] });
    else if (T.lyrics) drawLyrics(gr, g);
    else {
        const online = !STATE.lyricsOnline ? "OFF" : LYR.state || "NOT FOUND", searching = LYR.state === "SEARCHING";
        drawAlert(gr, g, { head: ["SYSTEM NOTICE", "LYRICS · 03"], title: searching ? "SEARCHING" : "NO LYRICS", wait: searching ? "QUERYING LRCLIB" : "AWAITING INPUT",
            lines: [["LRC FILE · NOT FOUND", 0], ["LYRICS TAG · NOT FOUND", 0], [`LRCLIB · ${online}`, searching ? 1 : 0], ["PLAYBACK CONTINUES", 1]] });
    }
}

// the Swiss frame of the centre field (under the lyrics or the pop-up)
const LF_ST = { head: { size: 9, weight: 600, track: .16 }, tiny: { size: 8, weight: 500, track: .14 } };
function drawLyricsFrame(gr, g) {
    for (const [x, y] of [[g.x0 + dp(16), dp(16)], [g.x1 - dp(27), dp(16)], [g.x0 + dp(16), H - dp(27)], [g.x1 - dp(27), H - dp(27)]]) regCross(gr, x, y);
    // ■ LYRICS MONITOR · 03   [LRC · SYNCED]                                                      06 LINES · 2 LANG
    const L = T.lyrics, playing = fb.IsPlaying && !fb.IsPaused, lx = g.x0 + dp(40), ty = dp(30);
    gr.FillSolidRect(lx, ty + dp(2), dp(5), dp(5), C.fg);
    const lw = label(gr, "LYRICS MONITOR  ·  03", st(LF_ST.head, C.fg), lx + dp(15), ty - dp(2));
    const state = T.missing ? "FAULT" : !T.info ? "STANDBY" : L ? `${L.source} · SYNCED` : "NO LYRICS";
    chip(gr, state, lx + dp(15) + lw + dp(14), dp(24), dp(18), L && playing ? "acc" : "inv", 8.5, C.bg);
    if (L) label(gr, `${pad(L.lines.length, 2)} LINES  ·  ${L.langs} LANG`, st(LF_ST.tiny, C["text-muted"]), g.x1 - dp(40), ty, 2);
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
    label(gr, "LINE", st(LF_ST.tiny, C["text-muted"]), rx, ry0 - dp(20));
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
    const x = dp(24);
    let y = dp(26);
    gr.FillSolidRect(x, y + dp(2.5), dp(22), dp(6), C.fg);
    label(gr, "LYRICS SECTION · PLAYBACK", st(ST.sbar, C.fg), x + dp(34), y);
    y += dp(29);
    const I = T.info, playing = fb.IsPlaying;
    const rows = [
        ["SPECTRUM", "48 BANDS / LIVE"],
        ["PEAK", playing ? fmtDb(AUDIO.peakDb) : "—"],
        ["RMS", playing ? fmtDb(AUDIO.rmsDb) : "—"],
        ["STEREO", playing ? `${AUDIO.corr.toFixed(2)} CORR` : "—"],
        ["RATE", I && I.rate ? `${+(I.rate / 1000).toFixed(1)} KHZ${I.bits ? " / " + I.bits + " BIT" : ""}` : "—"],
        ["SESSION", fmtTime((Date.now() - T.session0) / 1000).padStart(8, "00:")],
    ];
    for (const [k, v] of rows) {
        label(gr, k, st(ST.key, C["text-muted"]), x, y + dp(1));
        label(gr, v, st(ST.val, C.fg), x + dp(96), y);
        y += dp(18);
    }
    // analysis log
    y += dp(18);
    const tw = labelWidth("ANALYSIS LOG", st(ST.tag, 0)) + dp(12), th = dp(13);
    gr.FillSolidRect(x, y, tw, th, C.fg);
    label(gr, "ANALYSIS LOG", st(ST.tag, C.bg, C.fg), x + dp(6), y + Math.round((th - labelHeight(ST.tag)) / 2));
    y += th + dp(10);
    const bw = dp(CARD_W), lines = analysisLines(), bh = dp(12 + 10 + 10) + HAIR + lines.length * dp(18) + dp(12);
    box(gr, x, y, bw, bh, C["line-faint"]);
    const fault = T.missing;
    label(gr, "ANALYSIS", st(ST.anaH, C.fg), x + dp(14), y + dp(12));
    label(gr, fault ? "FAULT" : fb.IsPlaying ? (fb.IsPaused ? "PAUSED" : "ACTIVE") : "STANDBY", st(ST.anaH, fault || fb.IsPlaying ? C.accent : C["text-muted"]), x + bw - dp(14), y + dp(12), 2);
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
    const th = dp(13), ts = st(ST.tag, C.bg, C.fg), tw = labelWidth("SPECTRUM", ts) + dp(12);
    gr.FillSolidRect(R.x, R.y, tw, th, C.fg);
    label(gr, "SPECTRUM", ts, R.x + dp(6), R.y + Math.round((th - labelHeight(ST.tag)) / 2));
    const by = R.y + th + dp(10), bh = R.h - th - dp(10), padX = dp(14);
    box(gr, R.x, by, R.w, bh, C["line-faint"]);
    gr.FillSolidRect(R.x + 1, by + 1, R.w - 2, bh - 2, C.bg);
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
        [`DECODE · ${I.codec.toUpperCase()}${res}`, true],
        [`REPLAYGAIN · ${I.gain ? "TRACK " + I.gain.toUpperCase().replace("-", "−") : "NONE"}`, true],
        [`LYRICS · ${L ? `${L.source} · ${L.langs} LANGUAGE${L.langs > 1 ? "S" : ""}` : "NONE"}`, true],
        [`OUTPUT · ${I.ch || 2} CH · VOLUME ${fb.Volume <= -100 ? "MUTED" : fmtDb(fb.Volume)}`, true],
        [`NEXT · ${T.next}`, true],
    ];
}

// ------------------------------------------------------------------------------------------------------ lyrics
// the current line large in the middle with its translation under it; earlier lines above and later ones below, fading
// with distance; the block slides up by one line when the next line starts
function drawLyrics(gr, g) {
    const L = T.lyrics.lines, el = fb.IsPlaying ? fb.PlaybackTime : 0, pitch = dp(58);
    const i = Math.max(0, lyricIndex(L, el));
    if (i !== lyrIdx) {
        if (lyrIdx >= 0 && !REDUCE_MOTION && Math.abs(i - lyrIdx) <= 3) { lyrOff.x += pitch * (i - lyrIdx); clock.wake(); }
        lyrIdx = i;
    }
    const o = lyrOff.x, cx = g.cx, cy = g.cy, cur = L[i], hasTr = !!(cur && cur.a && cur.b), left = cx - g.cw / 2;
    lyrBar = null;
    gr.PushClip(g.x0 + HAIR, 0, g.x1 - g.x0 - HAIR, H - dp(70));
    for (let k = -4; k <= 5; k++) {
        const line = L[i + k];
        if (!line) continue;
        const off = k * pitch + (k > 0 ? dp(hasTr ? 34 : 8) : 0), y = cy + off + o, a = line.a || line.b;
        if (k === 0) {
            // the line shrinks (down to 18 dp) rather than being cut short when it is wider than the column
            let size = 30, fa = fontFor(a, size, 700);
            while (size > 18 && gr.CalcTextWidth(a, fa) > g.cw) fa = fontFor(a, size -= 2, 700);
            gr.DrawText(a, fa, C.fg, left, y - dp(24), g.cw, dp(46), DT_CENTER_SINGLE | DT_ELLIPSIS);
            if (hasTr) gr.DrawText(line.b.toUpperCase(), fontFor(line.b, 13, 500), C["fg-soft"], left, y + dp(22), g.cw, dp(22), DT_CENTER_SINGLE | DT_ELLIPSIS);
            const wa = Math.min(g.cw, gr.CalcTextWidth(a, fa));
            // karaoke rule under the line (and its translation): a hairline, filled in orange through the line's time
            const ftr = hasTr ? fontFor(line.b, 13, 500) : null, wb = ftr ? gr.CalcTextWidth(line.b.toUpperCase(), ftr) : 0;
            const rw = Math.min(g.cw - dp(40), Math.max(wa, wb)), ry = Math.round(y + dp(hasTr ? 52 : 30));
            const next = L[i + 1] ? L[i + 1].t : line.t + 8, prog = clamp((el - line.t) / Math.max(.1, next - line.t), 0, 1);
            gr.FillSolidRect(cx - rw / 2, ry, rw, HAIR, C.hair);
            gr.FillSolidRect(cx - rw / 2, ry - dp(1), rw * prog, dp(3), C.accent);
            lyrBar = [Math.floor(cx - rw / 2) - 1, Math.floor(ry - dp(2)), Math.ceil(rw) + 2, Math.ceil(dp(5)) + 1];
            // the line's time stamp and marker to its left, when there is room for them in the column
            if (cx - wa / 2 - dp(40) > g.x0 + dp(8)) gr.FillSolidRect(cx - wa / 2 - dp(40), y - dp(3), dp(6), dp(6), C.accent);
            if (cx - wa / 2 - dp(170) > g.x0 + dp(8))
                gr.DrawText(`${fmtTime(line.t)}.${pad(Math.floor(line.t % 1 * 100), 2)}`, font(9, 500), C["text-muted"], cx - wa / 2 - dp(170), y - dp(9), dp(118), dp(16), DT_RIGHT_SINGLE);
        } else {
            const d = Math.abs(off + o) / pitch;
            let size = k < 0 ? 17 : 18, fo = fontFor(a, size, 500);
            while (size > 12 && gr.CalcTextWidth(a, fo) > g.cw) fo = fontFor(a, --size, 500);
            gr.DrawText(a, fo, withAlpha(k < 0 ? C["text-muted"] : C["fg-soft"], clamp(1.05 - d * .19, .1, .85)),
                left, y - dp(16), g.cw, dp(32), DT_CENTER_SINGLE | DT_ELLIPSIS);
        }
    }
    gr.PopClip();
    label(gr, `LYRICS / ${T.lyrics.source}  ·  LINE ${pad(i + 1, 2)} OF ${pad(L.length, 2)}`, st(ST.key, C["text-muted"]), cx, H - dp(46), 1);
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
}
function on_mouse_move(x, y, mask) {
    // (a drag whose button went up outside the panel ends at the next move)
    if (GRID.drag) { if (mask & 0x0001) gridBarMove(y); else gridBarUp(); return; }
    const a = hits.at(x, y), onCase = STATE.view === "archive" && archiveMouseMove(x, y, a);
    if (STATE.view === "style") styleMouseMove(a);
    window.SetCursor(a || onCase ? 32649 : 32512);
    if ((a && a.id) !== (hover && hover.id) && STATE.view === "lyrics") window.Repaint();
    hover = a;
}
function on_mouse_leave() {
    if (STATE.view === "archive") archiveMouseLeave();
    if (STATE.view === "style") styleMouseMove(null);
    if (hover) { hover = null; if (STATE.view === "lyrics") window.Repaint(); }
}
function on_mouse_lbtn_dblclk(x, y) { if (STATE.view === "archive" && AR.layout === "grid" && !hits.at(x, y)) gridDblClick(x, y); }
function on_mouse_wheel(step) { if (STATE.view === "archive") archiveWheel(step); }
function on_mouse_rbtn_up(x, y, mask) {
    if (STATE.view !== "archive" || (mask & 0x0004)) return false;   // Shift: JSplitter's own menu
    archiveMenu(x, y);
    return true;
}
function on_mouse_lbtn_up(x, y) {
    if (GRID.drag) { gridBarUp(); return; }
    const a = hits.at(x, y);
    if (STATE.view === "archive") { archiveClick(x, y, a); return; }
    if (STATE.view === "style") { styleClick(a); return; }
    if (!a) return;
    if (a.id === "model" && a.data !== Ring.mode) { Ring.mode = a.data; setSetting("ringMode", a.data); window.Repaint(); }
    else if (a.id === "profile") inspectRequest();
    else if (a.id === "pager") { if (a.data === 0) fb.Prev(); else if (a.data === 2) fb.Next(); }
    else if (a.id === "queue") plman.ExecutePlaylistDefaultAction(a.data.pl, a.data.index);
    else if (a.id === "trace" && fb.IsPlaying && fb.PlaybackLength > 0) fb.PlaybackTime = clamp((x - a.x) / a.w, 0, 1) * fb.PlaybackLength;
}
function on_char(code) { searchChar(code); }
// online lyrics (lib/lyrics.js) arrive as downloads
function on_download_file_done(path, success) { if (lyricsDownloaded(path, success)) window.Repaint(); }
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
