"use strict";
// 04 · SIGNAL (drawn by the stage panel; stage.js includes this file): a purely graphical monitor of what is playing.
//   the ∞ ring with its light pulses (3D render or 2D stroke, MODEL toggle / R), a 48-band spectrum strip under it and
//   the whole-track signal trace along the bottom (click to seek), framed by corner brackets and registration crosses.
//   PANELS (or a right-click) swaps the strip for lyrics, level meters or a stereo scope, and the trace for lyrics or a
//   level history (each keeps a thin seek rule), or leaves either out.
// MODEL [3D | 2D | CLASSIC]: CLASSIC swaps the monitor for a familiar player screen set as a specimen plate
// (drawClassic): the cover in a dial of progress and spectrum, title and time under it, the lyric on a caption plate.
// Everything here is drawn every frame while music plays and not at all while paused, stopped or hidden.
// A character pack (lib/pack.js) can bring its own ring (lib/ring.js; signalGeom gives it room by its shape) and a
// honey spectrum strip (drawHoneyStrip); with none in use the view is exactly as above.

const SG_ST = {
    head: { size: 9, weight: 600, track: .16 },
    tog: { size: 9, weight: 500, track: .14 },
    tiny: { size: 8, weight: 500, track: .14 },
};

// ------------------------------------------------------------------------------------------------- the two panels
// What shows under the ring (SIG.strip) and along the bottom (SIG.base): the panel's settings signalStrip and
// signalBase, picked with PANELS or a right-click in the view. CLASSIC is not affected.
const SIG_STRIPS = [["spectrum", "Spectrum"], ["lyrics", "Lyrics"], ["meters", "Level meters"], ["scope", "Stereo scope"], ["off", "Off"]];
const SIG_BASES = [["trace", "Signal trace"], ["lyrics", "Lyrics"], ["history", "Level history"], ["off", "Off"]];
const sigPick = (v, list) => list.some(([k]) => k === v) ? v : list[0][0];   // a saved value not (or no longer) offered: the default
const SIG_HIST = 600, SIG_PTS = 384;   // the level history: 60 s at ten samples a second; the scope: points per frame
const SIG = {
    strip: sigPick(getSetting("signalStrip", "spectrum"), SIG_STRIPS), base: sigPick(getSetting("signalBase", "trace"), SIG_BASES),
    rms: new Float32Array(SIG_HIST), peak: new Float32Array(SIG_HIST), hn: 0, hi: 0, at: 0, paused: 0,   // the history: a ring buffer
    colR: new Float32Array(1024), colP: new Float32Array(1024),                                // (its columns, as drawn)
    lv: [0, 0], hold: [0, 0], held: [0, 0],                     // the meters: level, peak held and for how long
    sx: new Float32Array(SIG_PTS), sy: new Float32Array(SIG_PTS), sn: 0, gain: 1,   // the scope: side and mid of each point
    fits: new Map(),                                            // lyric lines fitted to their width (lyricFit), by line
};
const SIG_CORR_ENDS = ["−1", "0", "+1"], SIG_BAL_ENDS = ["L", "C", "R"];

function setSignalPanel(slot, v) {
    SIG[slot] = v;
    setSetting(slot === "strip" ? "signalStrip" : "signalBase", v);
    window.Repaint();
}
// PANELS and the right-click menu: the two choices as radio groups
function signalPanelsMenu(x, y) {
    const m = window.CreatePopupMenu(), sel = (list, v) => Math.max(0, list.findIndex(([k]) => k === v));
    if (Ring.mode === "classic") { m.AppendMenuItem(0x1, 1, tr("For the 3D and 2D models")); m.AppendMenuSeparator(); }   // MF_GRAYED
    m.AppendMenuItem(0x1, 2, tr("Under the ring"));
    SIG_STRIPS.forEach(([, name], i) => m.AppendMenuItem(0, 10 + i, tr(name)));
    m.CheckMenuRadioItem(10, 10 + SIG_STRIPS.length - 1, 10 + sel(SIG_STRIPS, SIG.strip));
    m.AppendMenuSeparator();
    m.AppendMenuItem(0x1, 3, tr("Along the bottom"));
    SIG_BASES.forEach(([, name], i) => m.AppendMenuItem(0, 30 + i, tr(name)));
    m.CheckMenuRadioItem(30, 30 + SIG_BASES.length - 1, 30 + sel(SIG_BASES, SIG.base));
    const id = m.TrackPopupMenu(x, y);
    if (id >= 10 && id < 10 + SIG_STRIPS.length) setSignalPanel("strip", SIG_STRIPS[id - 10][0]);
    else if (id >= 30 && id < 30 + SIG_BASES.length) setSignalPanel("base", SIG_BASES[id - 30][0]);
}
// a new track: its level history starts empty
function signalNewTrack() { SIG.hn = SIG.hi = 0; SIG.at = SIG.paused = 0; }
// paused or resumed (stage.js, whatever the view): time spent paused is not played, so the history's clock skips it
function signalPaused(paused) {
    const now = performance.now();
    if (paused) SIG.paused = now;
    else { if (SIG.at && SIG.paused) SIG.at += now - SIG.paused; SIG.paused = 0; }
}

// once a frame while the view shows and music plays (stage.js, after analyseAudio): the meters, the level history and
// the scope's points; while paused nothing changes, so the frame drawn then stays right
function signalUpdate(dt, playing) {
    if (!playing) return;
    // the meters follow the level fast up and slow down; a peak holds for a second, then falls
    for (let c = 0; c < 2; c++) {
        const t = c ? AUDIO.r : AUDIO.l, v = SIG.lv[c], p = c ? AUDIO.pr : AUDIO.pl;
        SIG.lv[c] = v + (t - v) * clamp(dt * (t > v ? 30 : 4), 0, 1);
        SIG.held[c] += dt;
        if (p >= SIG.hold[c]) { SIG.hold[c] = p; SIG.held[c] = 0; }
        else if (SIG.held[c] > 1) SIG.hold[c] = Math.max(p, SIG.hold[c] - dt * .6);
    }
    // the history: RMS and peak ten times a second, on the meters' 48 dB scale, timed by the wall clock (the frame's
    // dt is capped). Time played while nothing sampled it (another view, the mini player) is left empty, so the 60 s
    // stay true; a short stall takes the level of now.
    const now = performance.now();
    if (!SIG.at) SIG.at = now;
    let due = Math.floor((now - SIG.at) / 100);
    SIG.at += due * 100;
    due = Math.min(due, SIG_HIST);
    const lvl = db => AUDIO.live && isFinite(db) ? clamp((db + 48) / 48, 0, 1) : 0;
    for (let k = 0; k < due; k++) {
        const heard = due <= 5 || k === due - 1;
        SIG.rms[SIG.hi] = heard ? lvl(AUDIO.rmsDb) : -1; SIG.peak[SIG.hi] = heard ? lvl(AUDIO.peakDb) : 0;
        SIG.hi = (SIG.hi + 1) % SIG_HIST; SIG.hn = Math.min(SIG_HIST, SIG.hn + 1);
    }
    // the scope: points of the last chunk (lib/audio.js) as side (R − L) and mid (L + R), each −1 … 1; a mono stream
    // has no side, a vertical line. The gain follows the loudest point: quick to come down, slow to go up.
    if (SIG.strip !== "scope") return;
    const n = AUDIO.n, ch = AUDIO.ch;
    if (!n) { SIG.sn = 0; return; }
    const m = Math.min(SIG_PTS, n), step = n / m;
    let top = 0;
    for (let k = 0; k < m; k++) {
        const i = Math.floor(k * step) * ch, l = _pcm[i], r = ch >= 2 ? _pcm[i + 1] : l, sx = (r - l) / 2, sy = (l + r) / 2;
        SIG.sx[k] = sx; SIG.sy[k] = sy;
        top = Math.max(top, Math.abs(sx) + Math.abs(sy));
    }
    SIG.sn = m;
    const g = .92 / Math.max(top, .025);
    SIG.gain += (g - SIG.gain) * clamp(dt * (g < SIG.gain ? 14 : 1.2), 0, 1);
}

function signalGeom() {
    const m = dp(48), cx = Math.round(W / 2);
    // lyrics along the bottom: the sung line alone, in the trace's own height (taller with larger text)
    const traceH = SIG.base === "lyrics" ? Math.round(dp(44) * Math.max(1, TEXT_SCALE)) : dp(44);
    const traceW = Math.min(W - 2 * m - dp(80), dp(1100)), traceY = H - dp(64) - traceH;
    const ringW = Math.round(Math.min(dp(860), W - dp(240), (traceY - dp(150)) / .56));
    const ringY = Math.round(dp(40) + (traceY - dp(110)) * .46);
    // a character pack's ring (lib/ring.js ringShape: { a: height / width }) is no 2:1 ∞: the factors above are the
    // ∞'s height (.50 of its width) plus air, and its strip sits .36 of its width under its centre. Such a ring gets a
    // width that fits its own height with more air (a tall shape nears the header), is kept clear of the header, and
    // has the strip a fixed 72 dp under its foot (the cells and, in light mode, a floor shadow fit between); the strip
    // keeps the ∞'s width.
    const sh = ringShape();
    if (sh) {
        const a = clamp(sh.a, .2, 5);
        const w = Math.max(dp(40), Math.round(Math.min(dp(560), W - dp(240), (traceY - dp(150)) / (a + .16))));
        const y = Math.round(Math.max(ringY, dp(64) + a * w / 2));
        return { m, cx, ringW: w, ringY: y, shape: { a }, specY: Math.round(y + a * w / 2 + dp(72)), specW: Math.round(ringW * .62), traceW, traceH, traceY };
    }
    return { m, cx, ringW, ringY, specY: Math.round(ringY + ringW * .36), specW: Math.round(ringW * .62), traceW, traceH, traceY };
}

function drawSignal(gr) {
    if (Ring.mode === "classic") { drawClassic(gr); return; }
    const g = signalGeom(), playing = fb.IsPlaying, state = tr(!playing ? "STANDBY" : fb.IsPaused ? "PAUSED" : "LIVE");
    // registration crosses in the corners, corner brackets around the ring's field
    for (const [x, y] of [[dp(16), dp(16)], [W - dp(27), dp(16)], [dp(16), H - dp(27)], [W - dp(27), H - dp(27)]]) regCross(gr, x, y);
    // the ring's drawn box (ring.json bounds around its centre) plus a margin, down to below the strip under it (or the
    // ring, when there is none)
    // (a pack's ring: its box centred on ringY, a * ringW tall, and wide enough for the strip under it)
    const b = RING_META.bounds, c = RING_META.center, s = g.ringW / (b[2] - b[0]), sh = g.shape, L = dp(18);
    const half = sh ? Math.max(g.ringW, g.specW) / 2 : g.ringW / 2;
    const bx0 = Math.round(g.cx - half - dp(48)), bx1 = Math.round(g.cx + half + dp(48));
    const top = sh ? sh.a * g.ringW / 2 : (c[1] - b[1]) * s, bottom = sh ? sh.a * g.ringW / 2 : (b[3] - c[1]) * s;
    const by0 = Math.round(g.ringY - top + (sh ? -dp(12) : dp(8)));
    const by1 = Math.round(SIG.strip === "off" ? g.ringY + bottom + dp(24) : g.specY + dp(24));
    for (const [x, y, sx, sy] of [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx0, by1, 1, -1], [bx1, by1, -1, -1]]) {
        gr.FillSolidRect(Math.round(sx > 0 ? x : x - L), Math.round(y), L, HAIR, C["line-dim"]);
        gr.FillSolidRect(Math.round(x), Math.round(sy > 0 ? y : y - L), HAIR, L, C["line-dim"]);
    }
    // ■ SIGNAL MONITOR · 04   [LIVE]
    gr.FillSolidRect(g.m, dp(30) + dp(2), dp(5), dp(5), C.fg);
    const lw = label(gr, tr("SIGNAL MONITOR  ·  04"), st(SG_ST.head, C.fg), g.m + dp(15), dp(30) - dp(2));
    const cw = chip(gr, state, g.m + dp(15) + lw + dp(14), dp(24), dp(18), playing && !fb.IsPaused ? "acc" : "inv", 8.5, C.bg);
    // MODEL 3D / 2D, top right (clear of the state chip)
    drawModelToggle(gr, W - g.m, dp(22), g.m + dp(15) + lw + dp(14) + cw + dp(12));
    // the ring
    ringDraw(gr, g.cx, g.ringY, g.ringW);
    // under it and along the bottom: the panels picked (PANELS)
    if (SIG.strip === "spectrum") drawSpecStrip(gr, g, playing);
    else if (SIG.strip === "lyrics") drawStripLyrics(gr, g);
    else if (SIG.strip === "meters") drawStripMeters(gr, g, playing);
    else if (SIG.strip === "scope") drawStripScope(gr, g, playing);
    const tx = g.cx - g.traceW / 2;
    if (SIG.base === "trace") drawTrace(gr, tx, g.traceY, g.traceW, g.traceH);
    else if (SIG.base === "lyrics") drawBaseLyrics(gr, tx, g.traceY, g.traceW, g.traceH);
    else if (SIG.base === "history") drawHistory(gr, tx, g.traceY, g.traceW, g.traceH);
}

// spectrum strip: 48 bands mirrored about a hairline, low frequencies in the middle
function drawSpecStrip(gr, g, playing) {
    if (STATE.pack && packPart("strip") === "honey") { drawHoneyStrip(gr, g, playing); return; }
    const n = 48, half = g.specW / 2, step = half / (n / 2), bw = Math.max(HAIR, Math.round(step * .55)), hmax = dp(26);
    gr.FillSolidRect(g.cx - half, g.specY, g.specW, HAIR, withAlpha(C["line-dim"], .7));
    if (playing) for (let i = 0; i < n / 2; i++) {
        const v = clamp(AUDIO.bands[i * 2] || 0, 0, 1), h = Math.max(HAIR, Math.round(v * hmax)), col = withAlpha(i < 3 ? C.accent : C.fg, .35 + .55 * v);
        for (const sx of [-1, 1]) {
            const x = Math.round(g.cx + sx * (i + .5) * step - bw / 2);
            gr.FillSolidRect(x, g.specY - h, bw, h, col);
            gr.FillSolidRect(x, g.specY + HAIR, bw, Math.round(h * .45), withAlpha(col, .35));
        }
    }
}

// a character pack's honey strip (pack.json strip "honey"): the same 24 + 24 mirrored bands, each a stack of small
// rounded waffle cells that fill with honey from the bottom (the top one partly, with a glint on the surface); the
// empty cells stay as a faint grid, also while nothing plays. Under the hairline a loud band drips a little honey.
function drawHoneyStrip(gr, g, playing) {
    const n = 48, half = g.specW / 2, step = half / (n / 2), cs = Math.max(dp(3), Math.round(step * .7));
    const gp = Math.max(HAIR, Math.round(cs * .22)), pitch = cs + gp, rows = clamp(Math.round(dp(32) / pitch), 3, 6);
    const ch = Math.max(1, cs * .16), empty = withAlpha(C["line-dim"], .35), glint = withAlpha(0xFFF6E0, .55);
    // a cell's outline (a square with cut corners), its top cut at `cut` (the honey's level)
    const cell = (x, y, cut, col) => {
        const P = [x + ch, y, x + cs - ch, y, x + cs, y + ch, x + cs, y + cs - ch, x + cs - ch, y + cs, x + ch, y + cs, x, y + cs - ch, x, y + ch];
        if (cut > y) for (let k = 1; k < P.length; k += 2) P[k] = Math.max(P[k], cut);
        gr.FillPolygon(col, 0, P);
    };
    gr.FillSolidRect(g.cx - half, g.specY, g.specW, HAIR, withAlpha(C["line-dim"], .7));
    for (let i = 0; i < n / 2; i++) {
        const v = playing ? clamp(AUDIO.bands[i * 2] || 0, 0, 1) : 0, lvl = v * rows, honey = withAlpha(C.accent, .5 + .5 * v);
        for (const sx of [-1, 1]) {
            const x = Math.round(g.cx + sx * (i + .5) * step - cs / 2);
            for (let r = 0; r < rows; r++) {
                const y = g.specY - (r + 1) * pitch, fill = clamp(lvl - r, 0, 1);
                if (fill < 1) cell(x, y, 0, empty);
                if (fill > .04) {
                    const cut = y + cs * (1 - fill);
                    cell(x, y, fill < 1 ? cut : 0, honey);
                    if (fill < 1 && fill > .2) gr.FillSolidRect(x + ch, Math.round(cut), cs - 2 * ch, HAIR, glint);
                }
            }
            // the drip under the hairline: a thread with a bead, for the bands above half
            if (v > .7) {
                const len = Math.round((v - .7) / .3 * dp(9)), tw = Math.max(HAIR, Math.round(cs * .22)), br = Math.max(1, cs * .22);
                const dx = x + cs / 2, col = withAlpha(C.accent, .55);
                gr.FillSolidRect(Math.round(dx - tw / 2), g.specY + HAIR, tw, len, col);
                gr.FillEllipse(dx - br, g.specY + HAIR + len - br, 2 * br, 2 * br, col);
            }
        }
    }
}

// [■ PANELS] [■ VISUALIZATIONS]  MODEL [■ 3D | □ 2D | □ CLASSIC], right-aligned at x; PANELS only in 3D and 2D, as its
// mark alone when its name would reach minX, and not at all when that would (the right-click menu has it too)
const MODELS = ["3d", "2d", "classic"];
function drawModelToggle(gr, xRight, y, minX = 0) {
    const items = [["3d", "3D"], ["2d", "2D"], ["classic", tr("CLASSIC")]], hh = dp(22), s = st(SG_ST.tog, 0);
    const widths = items.map(([, t]) => dp(9) + dp(5) + dp(6) + labelWidth(t, s) + dp(9)), total = widths.reduce((a, b) => a + b, 0);
    let ix = xRight - total;
    const mw = labelWidth(tr("MODEL"), st(SG_ST.tog, 0));
    // VISUALIZATIONS: foobar2000's and installed components' visualizations, each in a window of its own (lib/bus.js)
    const vt = tr("VISUALIZATIONS"), vw = dp(9) + dp(5) + dp(6) + labelWidth(vt, s) + dp(9), vx = ix - mw - dp(14) - dp(22) - vw;
    const vhov = hover && hover.id === "vis";
    // PANELS: what shows under the ring and along the bottom (3D and 2D only)
    let panels = Ring.mode !== "classic", pt = tr("PANELS"), pw = dp(9) + dp(5) + dp(6) + labelWidth(pt, s) + dp(9);
    if (panels && vx - dp(16) - pw < minX) { pt = ""; pw = dp(23); panels = vx - dp(16) - pw >= minX; }
    const px = vx - dp(10) - pw;
    const x0 = panels ? px : vx;
    gr.FillSolidRect(x0 - dp(6), y - dp(6), xRight - x0 + dp(12), hh + dp(12), C.bg);   // a plate (CLASSIC draws over a picture)
    if (panels) {
        const phov = hover && hover.id === "sig-panels";
        box(gr, px, y, pw, hh, phov ? C.accent : C["line-faint"]);
        gr.FillSolidRect(px + dp(9), y + hh / 2 - dp(2.5), dp(5), dp(5), phov ? C.accent : C.fg);
        if (pt) label(gr, pt, st(SG_ST.tog, phov ? C.fg : C["fg-soft"]), px + dp(20), y + Math.round((hh - labelHeight(SG_ST.tog)) / 2));
        hits.add("sig-panels", px, y, pw, hh);
    }
    box(gr, vx, y, vw, hh, vhov ? C.accent : C["line-faint"]);
    gr.FillSolidRect(vx + dp(9), y + hh / 2 - dp(2.5), dp(5), dp(5), vhov ? C.accent : C.fg);
    label(gr, vt, st(SG_ST.tog, vhov ? C.fg : C["fg-soft"]), vx + dp(20), y + Math.round((hh - labelHeight(SG_ST.tog)) / 2));
    hits.add("vis", vx, y, vw, hh);
    label(gr, tr("MODEL"), st(SG_ST.tog, C["text-muted"]), ix - dp(14), y + Math.round((hh - labelHeight(SG_ST.tog)) / 2), 2);
    items.forEach(([m, t], i) => {
        const on = Ring.mode === m, col = on ? C.bg : C["text-muted"];
        if (on) gr.FillSolidRect(ix, y, widths[i], hh, C.fg);
        toggleMark(gr, ix + dp(9), y + hh / 2, on, col);
        label(gr, t, st(SG_ST.tog, col, on ? C.fg : C.bg), ix + dp(20), y + Math.round((hh - labelHeight(SG_ST.tog)) / 2));
        hits.add("model", ix, y, widths[i], hh, m);
        ix += widths[i];
    });
    box(gr, xRight - total, y, total, hh, C["line-faint"]);
}

function drawTrace(gr, x, y, w, h) {
    const len = fb.PlaybackLength, playing = fb.IsPlaying && len > 0, prog = playing ? clamp(fb.PlaybackTime / len, 0, 1) : 0;
    const P = Wave.peaks, step = dp(2.7), n = Math.max(1, Math.floor(w / step)), bw = Math.max(1, step - dp(.8));
    label(gr, tr("SIGNAL TRACE  ·  WHOLE TRACK"), st(SG_ST.tiny, C["text-muted"]), x, y - dp(18));
    sigTime(gr, x + w, y - dp(18));
    const played = C.fg, rest = withAlpha(C["line-dim"], .7);
    for (let i = 0; i < n; i++) {
        let v = .04;
        if (P && Wave.loaded) {
            const a = Math.floor(i / n * P.length), b = Math.max(a + 1, Math.floor((i + 1) / n * P.length));
            if (a < Wave.loaded) { v = 0; for (let j = a; j < b; j++) v = Math.max(v, P[j]); v = Math.max(.04, v); }
        }
        const bh = Math.max(HAIR, v * h);
        gr.FillSolidRect(x + i * step, y + (h - bh) / 2, bw, bh, i / n < prog ? played : rest);
    }
    if (playing) {
        const px = Math.round(x + w * prog);
        gr.FillSolidRect(px - dp(.75), y - dp(6), Math.max(HAIR, dp(1.5)), h + dp(12), C.accent);
        gr.FillSolidRect(px - dp(3), y - dp(9), dp(6), dp(6), C.accent);
    }
    hits.add("trace", x, y - dp(8), w, h + dp(16));
}

// the time over the bottom panel, at its right edge
function sigTime(gr, xRight, y) {
    const len = fb.PlaybackLength;
    if (fb.IsPlaying && len > 0) label(gr, `${fmtTime(fb.PlaybackTime)} / ${fmtTime(len)}`, st(SG_ST.tiny, C["text-muted"]), xRight, y, 2);
}
// the thin seek rule under lyrics and the level history (the trace's place as the view's seek bar): the played part
// heavier, the playhead orange; the same hit as the trace
function sigSeekRule(gr, x, y, w) {
    const len = fb.PlaybackLength, playing = fb.IsPlaying && len > 0, prog = playing ? clamp(fb.PlaybackTime / len, 0, 1) : 0;
    gr.FillSolidRect(x, y, w, HAIR, withAlpha(C["line-dim"], .7));
    if (playing) {
        const px = Math.round(x + w * prog), t = Math.max(2 * HAIR, dp(2));
        gr.FillSolidRect(x, y + HAIR - t, px - x, t, C.fg);
        gr.FillSolidRect(px - dp(3), y - dp(3), dp(6), dp(6), C.accent);
    }
    hits.add("trace", x, y - dp(8), w, dp(16));
}

// ---- lyrics (under the ring or along the bottom)
// the lines at the playing time: { L, lines, i, cur, prev, next, synced, prog } or null when there are none. Unsynced
// (plain) lyrics have no sung line: they show from the top.
function sigLyric() {
    const L = T.lyrics;
    if (!L || !L.lines || !L.lines.length) return null;
    const lines = L.lines, synced = lines[0].t != null, el = fb.IsPlaying ? fb.PlaybackTime : 0;
    const i = synced ? lyricIndex(lines, el) : 0, cur = i >= 0 ? lines[i] : null, next = lines[i + 1] || null;
    let prog = 0;
    if (synced && cur) { const t1 = next ? next.t : cur.t + 8; prog = clamp((el - cur.t) / Math.max(.1, t1 - cur.t), 0, 1); }
    return { L, lines, i, cur, prev: i > 0 ? lines[i - 1] : null, next, synced, prog };
}
const sigText = l => l ? l.a || l.b || "" : "";
// what goes under a line: its translation (in capitals, as in 03 · LYRICS), else its romanization when that is on;
// both: the romanization first
function sigSub(l, both) {
    if (!l || !l.a) return "";
    const b = l.b ? l.b.toUpperCase() : "", r = STATE.lyricsRoma && l.r ? l.r : "";
    return both && b && r ? `${r}  ·  ${b}` : b || r;
}
const sigNone = () => tr(LYR.state === "SEARCHING" ? "SEARCHING" : "NO LYRICS");
// a line on one line, shrunk to fit w (lyricFit); kept, as the same line is drawn every frame. { lines, f, lh, w }
function sigFit(gr, str, size, min, w) {
    const key = `${str}|${size}|${Math.round(w)}|${TEXT_SCALE}|${FONT_FAMILY}`;
    let F = SIG.fits.get(key);
    if (!F) {
        if (SIG.fits.size >= 24) SIG.fits.clear();
        F = lyricFit(gr, str, size, min, 1, 600, w, 1);
        F.w = Math.min(w, Math.max(...F.lines.map(t => gr.CalcTextWidth(t, F.f))));
        SIG.fits.set(key, F);
    }
    return F;
}
// the karaoke rule under the sung line: a hairline filled in orange through the line's time
function sigKaraoke(gr, cx, y, w, prog) {
    gr.FillSolidRect(Math.round(cx - w / 2), y, Math.round(w), HAIR, C.hair);
    gr.FillSolidRect(Math.round(cx - w / 2), y - HAIR, Math.round(w * prog), 2 * HAIR + Math.max(0, dp(1) - HAIR), C.accent);
}

// under the ring: the sung line, and under it its translation or romanization, else the next line (dim)
function drawStripLyrics(gr, g) {
    const w = g.specW, x = g.cx - w / 2, y = g.specY, Y = sigLyric();
    if (!Y) { text(gr, sigNone(), 11, 500, C["text-muted"], x, y - dp(22), w, dp(20), 1); return; }
    const main = sigText(Y.cur), F = sigFit(gr, main || "· · ·", 17, 11, w);
    drawFit(gr, F, main ? C.fg : C["text-muted"], x, y - dp(14), w);
    if (Y.synced && Y.cur) sigKaraoke(gr, g.cx, y - dp(1), F.w, Y.prog);
    const own = sigSub(Y.cur), sub = !Y.synced ? tr("UNSYNCED") : own || sigText(Y.next);
    if (sub) text(gr, sub, 11, 500, own ? C["fg-soft"] : C["text-muted"], x, y + dp(3), w, dp(16), 1);
}

// along the bottom: the sung line and nothing else (no heading, time or seek rule: the transport under the view has
// them), centred in the box, with only its karaoke rule under it (how long until the next line); before the first
// line, the coming one, dim. A click on it plays it again.
function drawBaseLyrics(gr, x, y, w, h) {
    const Y = sigLyric(), muted = C["text-muted"], cy = Math.round(y + h / 2);
    if (!Y) { text(gr, sigNone(), 11, 500, muted, x, y, w, h, 1); return; }
    const main = sigText(Y.cur), F = sigFit(gr, main || sigText(Y.next) || "· · ·", 17, 12, w);
    drawFit(gr, F, main ? C.fg : withAlpha(muted, .75), x, cy, w);
    if (Y.synced && Y.cur) {
        const half = Math.round(dp(11) * Math.max(1, TEXT_SCALE));
        hits.add("sig-lyric", x, cy - half, w, 2 * half, Y.i);
        sigKaraoke(gr, x + w / 2, cy + half + dp(3), F.w, Y.prog);
    }
}

// ---- level meters, stereo scope, level history
// under the ring: L and R as segmented bars (RMS, a held peak tick; the top 6 dB orange), PEAK · RMS · CORR under them
function drawStripMeters(gr, g, playing) {
    const w = g.specW, x0 = g.cx - w / 2, y = g.specY, muted = C["text-muted"], lw = dp(16), th = labelHeight(SG_ST.tiny);
    const pitch = Math.max(3, dp(6)), sw = Math.max(1, pitch - Math.max(1, dp(2))), N = Math.max(8, Math.floor((w - lw) / pitch));
    const hot = Math.ceil(N * 42 / 48), bh = dp(7), off = withAlpha(C["line-dim"], .45), bx = Math.round(x0 + lw + (w - lw - N * pitch) / 2);
    for (let c = 0; c < 2; c++) {
        const by = y - dp(26) + c * dp(11);
        label(gr, c ? "R" : "L", st(SG_ST.tiny, muted), x0, by + Math.round((bh - th) / 2));
        const lit = playing ? Math.round(SIG.lv[c] * N) : 0, hold = playing && SIG.hold[c] > .02 ? Math.min(N - 1, Math.floor(SIG.hold[c] * N)) : -1;
        for (let k = 0; k < N; k++) {
            const on = k < lit || k === hold;
            gr.FillSolidRect(bx + k * pitch, by, sw, bh, !on ? off : k >= hot ? C.accent : k === hold ? C.fg : withAlpha(C.fg, .78));
        }
    }
    gr.FillSolidRect(x0, y - dp(2), w, HAIR, withAlpha(C["line-dim"], .7));
    // the read-outs: three cells, the name at the left and the value at the right of each
    const cw = w / 3, ry = y + dp(4), rh = Math.max(th, dp(14)), corr = AUDIO.corr;
    const cells = [["PEAK", fmtDb(AUDIO.peakDb)], ["RMS", fmtDb(AUDIO.rmsDb)], ["CORR", `${corr < 0 ? "−" : "+"}${Math.abs(corr).toFixed(2)}`]];
    cells.forEach(([key, v], i) => {
        const cx0 = Math.round(x0 + i * cw);
        label(gr, tr(key), st(SG_ST.tiny, muted), cx0 + (i ? dp(10) : 0), ry + Math.round((rh - th) / 2));
        text(gr, playing ? v : "—", 8.5, 500, C.fg, cx0, ry, Math.round(cw) - (i < 2 ? dp(10) : 0), rh, 2);
    });
}

// under the ring: a goniometer (the two channels' sum upright, their difference across: a mono signal is a vertical
// line, one channel alone leans to its side, out-of-phase sound spreads sideways) between the balance and the stereo
// correlation
function drawStripScope(gr, g, playing) {
    const hs = dp(24), cx = g.cx, cy = g.specY - dp(6), dim = withAlpha(C["line-dim"], .7), faint = withAlpha(C["line-dim"], .4);
    gr.DrawPolygon(dim, HAIR, [cx, cy - hs, cx + hs, cy, cx, cy + hs, cx - hs, cy]);
    gr.FillSolidRect(cx, cy - hs, HAIR, 2 * hs, faint);
    gr.FillSolidRect(cx - hs, cy, 2 * hs, HAIR, faint);
    const th = labelHeight(SG_ST.tiny);
    label(gr, "L", st(SG_ST.tiny, C["text-muted"]), cx - hs / 2 - dp(6), cy - hs / 2 - th, 2);
    label(gr, "R", st(SG_ST.tiny, C["text-muted"]), cx + hs / 2 + dp(6), cy - hs / 2 - th);
    if (playing && SIG.sn) {
        const ds = Math.max(1, Math.round(dp(1.5))), col = withAlpha(C.fg, .55), k = SIG.gain;
        for (let i = 0; i < SIG.sn; i++) {
            let sx = SIG.sx[i] * k, sy = SIG.sy[i] * k;
            const e = Math.abs(sx) + Math.abs(sy);
            if (e > 1) { sx /= e; sy /= e; }   // kept inside the field
            gr.FillSolidRect(Math.round(cx + sx * hs - ds / 2), Math.round(cy - sy * hs - ds / 2), ds, ds, col);
        }
    }
    const bw = Math.min(dp(150), g.specW / 2 - hs - dp(36)), gap = hs + dp(28);
    if (bw < dp(48)) return;
    // left: the balance, L to R (12 dB apart at the ends); right: the correlation, −1 (out of phase) to +1 (mono)
    const d = (SIG.lv[1] - SIG.lv[0]) * 48, mono = AUDIO.ch < 2;
    const bal = !playing ? "—" : mono ? tr("MONO") : Math.abs(d) < .5 ? "C" : `${d < 0 ? "L" : "R"} ${Math.abs(d).toFixed(1)} DB`;
    sigBar(gr, cx - gap - bw, cy, bw, tr("BALANCE"), bal, playing ? (mono ? 0 : clamp(d / 12, -1, 1)) : null, SIG_BAL_ENDS, false);
    const corr = AUDIO.corr;
    sigBar(gr, cx + gap, cy, bw, tr("CORR"), playing ? `${corr < 0 ? "−" : "+"}${Math.abs(corr).toFixed(2)}` : "—", playing ? clamp(corr, -1, 1) : null, SIG_CORR_ENDS, corr < 0);
}
// a −1 … +1 scale with its name and value over it and its ends under it; the value as a bar from the middle and a mark
// (orange when it warns)
function sigBar(gr, x, cy, w, name, value, pos, ends, warn) {
    const muted = C["text-muted"], line = withAlpha(C["line-dim"], .7), th = labelHeight(SG_ST.tiny), ty = cy - dp(8) - th;
    label(gr, name, st(SG_ST.tiny, muted), x, ty);
    text(gr, value, 8.5, 500, C.fg, x, ty, w, th, 2);
    gr.FillSolidRect(x, cy, w, HAIR, line);
    for (let k = 0; k < 3; k++) {
        const tx = Math.round(x + w * k / 2) - (k === 2 ? HAIR : 0);
        gr.FillSolidRect(tx, cy - dp(3), HAIR, dp(6) + HAIR, line);
        label(gr, ends[k], st(SG_ST.tiny, muted), tx, cy + dp(6), k);
    }
    if (pos == null) return;
    const px = Math.round(x + w * (pos + 1) / 2), mx = Math.round(x + w / 2);
    gr.FillSolidRect(Math.min(px, mx), cy - dp(1), Math.abs(px - mx), dp(2) + HAIR, C.fg);
    gr.FillSolidRect(px - dp(3), cy - dp(3), dp(6), dp(6) + HAIR, warn ? C.accent : C.fg);
}

// along the bottom: the last 60 s of level, newest at the right, as the trace draws its bars: the peak (the loudest
// one orange) round the RMS. It starts again with each track; time not sampled (RMS −1) rests like time not heard
// yet; the seek rule under it.
function drawHistory(gr, x, y, w, h) {
    label(gr, tr("LEVEL HISTORY  ·  60 S"), st(SG_ST.tiny, C["text-muted"]), x, y - dp(18));
    sigTime(gr, x + w, y - dp(18));
    const step = dp(2.7), n = clamp(Math.floor(w / step), 1, SIG.colR.length), bw = Math.max(1, step - dp(.8)), per = SIG_HIST / n;
    let top = -1, topV = 0;
    for (let j = 0; j < n; j++) {
        const a0 = Math.floor((n - 1 - j) * per), a1 = Math.max(a0 + 1, Math.floor((n - j) * per));
        let r = -1, p = 0;
        for (let k = a0; k < a1 && k < SIG.hn; k++) {
            const i = (SIG.hi - 1 - k + 2 * SIG_HIST) % SIG_HIST;
            r = Math.max(r, SIG.rms[i]); p = Math.max(p, SIG.peak[i]);
        }
        SIG.colR[j] = r; SIG.colP[j] = p;
        if (r >= 0 && p > topV) { topV = p; top = j; }
    }
    const rest = withAlpha(C["line-dim"], .7), mid = y + h / 2;
    for (let j = 0; j < n; j++) {
        const r = SIG.colR[j], bx = x + j * step;
        if (r < 0) { const bh = Math.max(HAIR, .04 * h); gr.FillSolidRect(bx, mid - bh / 2, bw, bh, rest); continue; }   // not heard yet
        const ph = Math.max(HAIR, SIG.colP[j] * h), rh = Math.max(HAIR, r * h);
        gr.FillSolidRect(bx, mid - ph / 2, bw, ph, j === top ? C.accent : rest);
        gr.FillSolidRect(bx, mid - rh / 2, bw, rh, C.fg);
    }
    sigSeekRule(gr, x, y + h + dp(10), w);
}

// ------------------------------------------------------------------------------------------------- CLASSIC screen
// A specimen plate on a Swiss grid: the left margin carries the header, the file tag, the title and the caption plate,
// the right margin the model switch, the time and what plays next; the cover sits on the centre axis inside a dial
// (the progress track with time marks at the quarters, 72 segmented spectrum bars outside it, mirrored with the low
// bands at the bottom). The frosted cover fills the ground; text over it is drawn live (trackedText).
const CL_ST = {
    head: { size: 9, weight: 600, track: .16 },
    tag: { size: 8.5, weight: 600, track: .14 },
    tiny: { size: 8, weight: 500, track: .14 },
    data: { size: 8.5, weight: 500, track: .12 },
};
const CL_M = new Float32Array(6), CL_TF = fb.TitleFormat("%title%");
// the frosted background: the cover shrunk and blurred once per cover, stretched over the view
function classicBackdrop(cov) {
    if (!cov || !cov.img) return null;
    if (!cov.backdrop) { const b = cov.img.Resize(96, 96); b.StackBlur(10); cov.backdrop = b; }
    return cov.backdrop;
}
// an arc as short chords (JSplitter's Direct2D graphics have no arc primitive)
function arcLine(gr, cx, cy, r, a0, a1, width, colour) {
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / .035));
    let px = cx + Math.cos(a0) * r, py = cy + Math.sin(a0) * r;
    for (let k = 1; k <= n; k++) {
        const a = a0 + (a1 - a0) * k / n, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        gr.DrawLine(px, py, x, y, width, colour); px = x; py = y;
    }
}

function drawClassic(gr) {
    const h = T.handle, I = T.info, cov = h ? cover(h, () => window.Repaint()) : null, bd = classicBackdrop(cov);
    const dark = MODE === "dark", playing = fb.IsPlaying, live = playing && !fb.IsPaused, len = fb.PlaybackLength;
    const el = playing ? fb.PlaybackTime : 0, prog = playing && len > 0 ? clamp(el / len, 0, 1) : 0;
    const m = dp(48), cx = Math.round(W / 2), muted = C["text-muted"];
    const tt = (str, s, colour, x, y, align) => trackedText(gr, str, Object.assign({ colour }, s), x, y, align);
    // ground: the frosted cover toned towards the page colour (unless the wallpaper is under it: LABEL_LIVE, stage.js)
    if (!LABEL_LIVE && bd) {
        const sz = Math.max(W, H), bx = (W - sz) / 2, by = (H - sz) / 2;
        gr.DrawImage(bd, bx, by, sz, sz, 2, 2, bd.Width - 4, bd.Height - 4);
        gr.FillSolidRect(0, 0, W, H, withAlpha(C.bg, dark ? .64 : .56));
    }
    for (const [x, y] of [[dp(16), dp(16)], [W - dp(27), dp(16)], [dp(16), H - dp(27)], [W - dp(27), H - dp(27)]]) regCross(gr, x, y);
    // ■ CLASSIC DISPLAY · 04  [LIVE]                                                 MODEL [3D | 2D | CLASSIC]
    gr.FillSolidRect(m, dp(32), dp(5), dp(5), C.fg);
    const hw = tt(tr("CLASSIC DISPLAY  ·  04"), CL_ST.head, C.fg, m + dp(15), dp(28));
    chip(gr, tr(!playing ? "STANDBY" : fb.IsPaused ? "PAUSED" : "LIVE"), Math.round(m + dp(15) + hw + dp(14)), dp(24), dp(18), live ? "acc" : "inv", 8.5, C.bg);
    drawModelToggle(gr, W - m, dp(22));
    const top = dp(62);
    gr.FillSolidRect(m, top, W - 2 * m, HAIR, withAlpha(C.fg, .55));

    // the dial: cover size s from the height (dial, title block and caption plate stacked) and the width
    let s = Math.min((H - dp(364)) / 1.94, (W / 2 - m - dp(70)) / .97, dp(560));
    s = Math.round(Math.max(dp(96), s));
    const r0 = s * .8, rs = r0 + dp(8), maxL = s * .17, R = rs + maxL + dp(14), qh = labelHeight(CL_ST.tiny);
    const cy = Math.round(top + dp(22) + R + qh / 2), x = cx - s / 2, y = cy - s / 2;
    // the cover, a hairline on its edge, crop brackets round it, the index tab on its top edge
    if (cov && cov.img) gr.DrawImage(cov.img, x, y, s, s, 0, 0, cov.img.Width, cov.img.Height);
    else { gr.FillSolidRect(x, y, s, s, C.well); text(gr, tr("NO COVER"), 9, 500, muted, x, y, s, s, 1); }
    box(gr, Math.round(x), Math.round(y), s, s, withAlpha(C.fg, .25));
    const o = dp(12), M = dp(14);
    for (const [bx, by, sx, sy] of [[x - o, y - o, 1, 1], [x + s + o, y - o, -1, 1], [x - o, y + s + o, 1, -1], [x + s + o, y + s + o, -1, -1]]) {
        gr.FillSolidRect(Math.round(sx > 0 ? bx : bx - M), Math.round(by), M, HAIR, C["fg-soft"]);
        gr.FillSolidRect(Math.round(bx), Math.round(sy > 0 ? by : by - M), HAIR, M, C["fg-soft"]);
    }
    gr.FillSolidRect(Math.round(x + s - dp(46)), Math.round(y - dp(4)), dp(26), dp(4), C.accent);
    // the progress track: four quarter arcs with gaps at the time marks, the played part heavy
    const A0 = -Math.PI / 2, gap = .045, aP = A0 + prog * TAU;
    for (let q = 0; q < 4; q++) {
        const a0 = A0 + q * TAU / 4 + gap, a1 = A0 + (q + 1) * TAU / 4 - gap;
        arcLine(gr, cx, cy, r0, a0, a1, HAIR, withAlpha(C.fg, .3));
        if (aP > a0) arcLine(gr, cx, cy, r0, a0, Math.min(aP, a1), dp(2.5), C.fg);
    }
    // spectrum: 72 bars of 5 segments, mirrored, the low bands at the bottom; a dim first segment at rest
    const N = 72, SEG = 5, sl = maxL / SEG, bw = Math.max(HAIR, dp(2.5));
    for (let i = 0; i < N; i++) {
        const a = A0 + (i + .5) / N * TAU, mm = Math.abs(((i + .5) / N * 2 + 1) % 2 - 1);
        const v = playing ? clamp(AUDIO.bands[Math.round((1 - mm) * 40)] || 0, 0, 1) : 0, lit = Math.ceil(v * SEG - .15);
        const c = Math.cos(a), sn = Math.sin(a), played = (i + .5) / N < prog;
        for (let k = 0; k < Math.max(1, lit); k++) {
            const ra = rs + k * sl, rb = ra + sl - dp(2);
            const col = lit <= 0 ? withAlpha(C.fg, .18) : k === SEG - 1 ? C.accent : withAlpha(C.fg, played ? .85 : .42);
            gr.DrawLine(cx + c * ra, cy + sn * ra, cx + c * rb, cy + sn * rb, bw, col);
        }
    }
    // the quarter time marks
    [0, .25, .5, .75].forEach((f, q) => {
        const a = A0 + f * TAU, tx = cx + Math.cos(a) * R, ty = cy + Math.sin(a) * R;
        tt(len > 0 && playing ? fmtTime(len * f) : "--:--", CL_ST.tiny, muted, tx + (q === 1 ? -dp(10) : q === 3 ? dp(10) : 0), ty - qh / 2, q === 1 ? 0 : q === 3 ? 2 : 1);
    });
    // the playhead: an orange needle across track and spectrum, a square on the track (a pack's chase instead: its
    // waffle at the playhead on the track and the dogs running after it, lib/ring.js ringChaseRound)
    const chased = playing && !!STATE.pack && ringChaseRound(gr, cx, cy, r0, aP, clamp(s * .17, dp(44), dp(96)));
    if (playing && !chased) {
        const c = Math.cos(aP), sn = Math.sin(aP);
        gr.DrawLine(cx + c * (r0 - dp(10)), cy + sn * (r0 - dp(10)), cx + c * (rs + maxL + dp(2)), cy + sn * (rs + maxL + dp(2)), HAIR, C.accent);
        gr.FillSolidRect(Math.round(cx + c * r0 - dp(3.5)), Math.round(cy + sn * r0 - dp(3.5)), dp(7), dp(7), C.accent);
    }
    // the axes: horizontal out to the margins with a square node at each end, vertical up to the header rule
    const ax0 = cx - R - dp(56), ax1 = cx + R + dp(56), side = ax0 - m;
    if (side > dp(40)) {
        gr.FillSolidRect(m, cy, ax0 - m, HAIR, withAlpha(C.fg, .3)); gr.FillSolidRect(ax1, cy, W - m - ax1, HAIR, withAlpha(C.fg, .3));
        gr.FillSolidRect(m, cy - dp(2), dp(5), dp(5), C.fg); gr.FillSolidRect(W - m - dp(5), cy - dp(2), dp(5), dp(5), C.fg);
    }
    gr.FillSolidRect(cx, top, HAIR, Math.max(0, cy - R - qh / 2 - dp(8) - top), withAlpha(C.fg, .3));

    // left margin, above the axis: the file tag and its data
    if (I && side > dp(200)) {
        let ty = cy - dp(112);
        chip(gr, tr("FILE {0}", T.file ? pad(T.file, 3) : "—"), m, ty, dp(18), "inv", 8.5);
        ty += dp(30);
        const rows = [
            `${tr("TRACK")} ${I.track ? I.track + (I.total ? " / " + I.total : "") : "—"}`,
            [I.codec, I.bitrate ? `${Number(I.bitrate).toLocaleString("en-US")} KBPS` : ""].filter(Boolean).join("  ·  "),
            I.rate ? `${+(I.rate / 1000).toFixed(1)} KHZ${I.bits ? " / " + I.bits + " BIT" : ""}` : "",
            T.no ? `ARC-${pad(T.no, 4)}` : "",
        ].filter(Boolean);
        for (const r of rows) { tt(r.toUpperCase(), CL_ST.data, C["fg-soft"], m, ty); ty += dp(16); }
    }
    // right margin, above the axis: the file number, large and light
    if (T.file && side > dp(200)) {
        const ns = Math.round(Math.min(side * .42, (cy - top) * .5) / SCALE / 8) * 8, nf = font(ns, 300);
        gr.DrawText(pad(T.file, 2), nf, withAlpha(C.fg, .16), W - m - dp(600), cy - dp(10) - nf.Height * 1.05, dp(600) + dp(4), nf.Height * 1.05, DT_RIGHT_SINGLE);
    }
    // right margin, below the axis: what plays next
    if (side > dp(200)) {
        const next = upNext(3), nw = Math.min(side - dp(20), dp(300));
        let ny = cy + dp(22);
        tt(tr("NEXT"), CL_ST.tag, muted, W - m, ny, 2);
        gr.FillSolidRect(W - m - nw, ny + dp(18), nw, HAIR, withAlpha(C.fg, .3));
        ny += dp(26);
        if (!next.length) tt(tr("END OF PLAYLIST"), CL_ST.data, muted, W - m, ny + dp(3), 2);
        for (const n of next) {
            const t = CL_TF.EvalWithMetadb(n.handle);
            tt(n.index >= 0 ? pad(n.index + 1, 3) : "Q", CL_ST.data, muted, W - m - nw, ny + dp(3));
            text(gr, t, 11, 500, C["fg-soft"], W - m - nw + dp(44), ny, nw - dp(44), dp(20), 2);
            ny += dp(24);
        }
    }

    // the title block: a heavy rule with a tab on it; title and artist · album · year at the left, time at the right
    const ry = Math.round(cy + R + qh / 2 + dp(30));
    gr.FillSolidRect(m, ry, W - 2 * m, dp(3), C.fg);
    const tabS = st(CL_ST.tag, C.bg, C.fg), tabW = labelWidth(tr("NOW PLAYING"), tabS) + dp(16);
    gr.FillSolidRect(m, ry - dp(18), tabW, dp(18), C.fg);
    label(gr, tr("NOW PLAYING"), tabS, m + dp(8), ry - dp(18) + Math.round((dp(18) - labelHeight(CL_ST.tag)) / 2));
    const title = I ? I.title : tr("NO SIGNAL"), tw = W - 2 * m - dp(240);
    text(gr, title, 30, 700, C.fg, m - dp(2), ry + dp(12), tw, dp(44));
    const meta = I ? [I.artist, I.album, I.year].filter(Boolean).join("  ·  ").toUpperCase() : tr("AWAITING SIGNAL");
    text(gr, meta, 11, 500, C["fg-soft"], m, ry + dp(58), tw, dp(20));
    gr.DrawText(playing ? fmtTime(el) : "--:--", font(30, 300), C.fg, W - m - dp(240), ry + dp(12), dp(240), dp(44), DT_RIGHT_SINGLE);
    text(gr, playing && len > 0 ? `/ ${fmtTime(len)}` : "/ --:--", 11, 500, C["fg-soft"], W - m - dp(240), ry + dp(58), dp(240), dp(20), 2);

    // caption plate: the current lyric line with its own progress, else what plays next
    const L = T.lyrics, li = L && playing ? lyricIndex(L.lines, el) : -1, line = li >= 0 ? L.lines[li] : null;
    const nxt = line ? null : upNext(1)[0];
    const caption = line ? (line.a || line.b) : nxt ? CL_TF.EvalWithMetadb(nxt.handle) : I ? tr("END OF PLAYLIST") : "";
    const ph = dp(46), py = H - dp(36) - ph, pw = W - 2 * m;
    if (caption && py > ry + dp(96)) {
        gr.FillSolidRect(m, py, pw, ph, C.fg);   // a plain plate, square corners
        const tag = line ? `LRC  ${pad(li + 1, 2)} / ${pad(L.lines.length, 2)}` : nxt ? `${tr("NEXT")}  ${nxt.index >= 0 ? pad(nxt.index + 1, 3) : "Q"}` : tr("END"), ts = st(CL_ST.tag, C["on-accent"], C.accent);
        const tgw = labelWidth(tag, ts) + dp(20), lx = m + tgw + dp(28), lw = pw - tgw - dp(56);
        gr.FillSolidRect(m + dp(10), py + dp(10), tgw, ph - dp(20), C.accent);
        label(gr, tag, ts, m + dp(20), py + Math.round((ph - labelHeight(CL_ST.tag)) / 2));
        text(gr, caption, 17, 500, C.bg, lx, py, lw, ph);
        if (line) {
            const t1 = li + 1 < L.lines.length ? L.lines[li + 1].t : len, f = clamp((el - line.t) / Math.max(.1, t1 - line.t), 0, 1);
            gr.FillSolidRect(lx, py + ph - dp(8), lw, HAIR, withAlpha(C.bg, .25));
            gr.FillSolidRect(lx, py + ph - dp(8) - HAIR, Math.round(lw * f), HAIR * 2, C.accent);
        }
    }
    // the edge note, running down the right margin
    if (H > dp(420)) {
        CL_M[0] = 0; CL_M[1] = 1; CL_M[2] = -1; CL_M[3] = 0; CL_M[4] = W - dp(18); CL_M[5] = top + dp(24);
        gr.SetTransform(CL_M);
        tt(`AUDIO ARCHIVE  /  ${tr("SIGNAL SECTION")}  /  ${tr("CLASSIC DISPLAY")}  /  ${T.no ? "ARC-" + pad(T.no, 4) : "ARC-—"}`, CL_ST.tiny, muted, 0, 0);
        gr.ResetTransform();
    }
}
