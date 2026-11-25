"use strict";
// The mini player (2.0; stage.js includes this file): foobar2000's main window shrunk to one small, frameless panel
// that stays on top in a corner of the screen (frame.js gives this panel the whole window, tools/window.ps1 sizes it).
// A rack unit of the Rhine Lab: the cover in an inset frame, a dot-matrix window with the current lyric line (or the
// track), four lamps over the L/R level meters, the progress line, and the keys — previous / play-pause / next in the
// middle, LRC | TRK and back to the full window on the right. Its colours are its own, whatever the scheme: a black
// plate with an amber display, or a white one with a paper-grey display (right-click > Colour; it can follow light /
// dark); the accent is the scheme's.
//   design: the D3 board of the mini player canvas, 80 dp wider (560 × 136 dp) for the lyric line: 336 dp of window
// It comes in two shapes (right-click > Shape; MINI_SIZES in lib/bus.js): the wide one, and a square one (304 × 304 dp)
// with the same parts — a large cover, the lamps, meters, volume fader and time in a column beside it, the window, the
// progress line and the keys under them.

// where the parts sit on each shape's board, in dp: the engraving, the cover's inset (x, y, side), the window (x, y, w,
// h), the right column's x (96 dp wide: lamps, meters; on the square also the volume and the time), the progress line's
// y, the transport keys' x
const MINI_LAYOUTS = {
    wide: { mark: ["RHINE LAB · AUDIO TERMINAL", "MT-07 · S/N 0269"], cover: [22, 20, 66], display: [96, 20, 336, 66], col: 440, prog: 94, keys: 221 },
    square: { mark: ["RHINE LAB", "MT-07 SQ"], cover: [22, 20, 152], display: [22, 182, 258, 66], col: 184, prog: 256, keys: 22 },
};
const MC_SETS = {
    dark: {
        plate: 0xff171715, edge: 0xff45443f, hi: 0xff2c2b28,
        ink: 0xffd9d6cf, dim: 0xff7d7a73, lbl: 0xff8a877f, win: 0xff0b0905, amber: 0xffffb347, amberSub: 0xffc98a3a,
        amberLo: 0xffb4772b, green: 0xff5bd17a, yellow: 0xffd9c14a, off: 0xff3a3833, key: 0xff24231f, keyEdge: 0xff4c4b45,
        keyHi: 0xff3a3934, track: 0xff2c2b27, cover: 0xff262522,
        // the sunken parts, the shadows under the raised ones, the lines over the display
        pit: 0xff0f0f0d, groove: 0xff0b0a08, rim: 0xff000000, lip: 0xff2f2e2a, shade: 0x66000000, drop: 0xff0a0a09,
        down: 0xff1b1a17, downShade: 0x80000000, scan: 0x47000000, mark: 0xffe9e7e2, glow: .25,
    },
    // the white unit: painted off-white, grey keys, a paper-grey display printed in near black
    white: {
        plate: 0xffeeede8, edge: 0xffb4b2ab, hi: 0xffffffff,
        ink: 0xff2a2926, dim: 0xff8f8c84, lbl: 0xff76736c, win: 0xffdad8cf, amber: 0xff1d1c1a, amberSub: 0xff5e5b54,
        amberLo: 0xff7f7c74, green: 0xff2fa25c, yellow: 0xffc59b00, off: 0xffcbc9c1, key: 0xfff8f7f3, keyEdge: 0xffb0aea7,
        keyHi: 0xffffffff, track: 0xffcfcdc5, cover: 0xffd3d1c9,
        pit: 0xffdddbd3, groove: 0xffd0cec6, rim: 0xffa9a79f, lip: 0xffffffff, shade: 0x22000000, drop: 0xffc4c2ba,
        down: 0xffe2e0d8, downShade: 0x26000000, scan: 0x0f000000, mark: 0xff6b6861, glow: .3,
    },
    // SWEETPIE (a character pack's, pack.json "mini": "sweetpie"; it stands in for the Colour picked while the pack is
    // in use): her honey-yellow panel, black keys and a black window lit in cream. Three things only a pack's set has:
    //   engrave   the plate's two engravings for each shape, in place of the Rhine Lab's
    //   plateAcc  the accent for what sits on the plate itself (lamps, the meters' top, a hovered key's edge, MUTE): the
    //             scheme's honey would vanish on the yellow, so a deeper amber; in the black parts the accent stays
    //   pitInk    the LRC | TRK switch's unlit label, in its black pit (lbl is for the plate)
    sweetpie: {
        plate: 0xffffc21a, edge: 0xffa87a00, hi: 0xffffda6b,
        ink: 0xfff4eee2, dim: 0xff3d2e06, lbl: 0xff4d3a08, win: 0xff0d0b08, amber: 0xfff4eee2, amberSub: 0xffb8ae9c,
        amberLo: 0xffffc21a, green: 0xff151310, yellow: 0xff6b4200, off: 0xffdea712, key: 0xff151310, keyEdge: 0xff5a4306,
        keyHi: 0xff34302a, track: 0xff131110, cover: 0xff1b1815,
        pit: 0xff131110, groove: 0xff131110, rim: 0xff6e5208, lip: 0xffffd75e, shade: 0x66000000, drop: 0xffa27900,
        down: 0xff0a0908, downShade: 0x80000000, scan: 0x47000000, mark: 0xfff4eee2, glow: .3,
        plateAcc: 0xff8a3200, pitInk: 0xffb8ae9c,
        engrave: { wide: ["SWEETPIE · HONEY TERMINAL", "WF-03 · S/N 0303"], square: ["SWEETPIE", "WF-03 SQ"] },
    },
};
const miniSkin = () => STATE.miniSkin === "auto" ? (MODE === "light" ? "white" : "dark") : STATE.miniSkin === "white" ? "white" : "dark";
let MC = MC_SETS.dark;
const MINI = { hover: null, level: [0, 0], drag: false, press: null, plateAcc: 0 };   // drag: the volume fader held; press: the plate held (x, y); plateAcc: this paint's accent on the plate (0: the scheme's)

// design dp → px in this window (the window is made the shape's size; a rounding of its size scales the drawing with
// it, and until a new shape's window is there the board is drawn in the old one, as large as fits)
const miniK = () => { const [mw, mh] = miniDims(); return Math.min(W / dp(mw), H / dp(mh)) || 1; };
const mu = v => Math.round(dp(v) * miniK());
// a fixed-size label style (the mini window does not follow the text size)
const mst = (size, colour, bg, weight = 600, track = .12) => ({ size: size * miniK(), weight, track, colour, bg, fixed: true });

function drawMini(gr) {
    const [mw, mh] = miniDims(), sq = STATE.miniShape === "square", L = MINI_LAYOUTS[sq ? "square" : "wide"];
    const k = miniK(), w = mu(mw), h = mu(mh), ox = Math.round((W - w) / 2), oy = Math.round((H - h) / 2);
    const X = v => ox + mu(v), Y = v => oy + mu(v);
    MC = MC_SETS[packLook("mini", ["sweetpie"]) || miniSkin()];   // a character pack may bring its own colours
    const PA = MC.plateAcc || C.accent, mark = MC.engrave && MC.engrave[sq ? "square" : "wide"] || L.mark;
    MINI.plateAcc = PA;
    gr.FillSolidRect(0, 0, W, H, MC.plate);
    box(gr, ox, oy, w, h, MC.edge, HAIR);
    gr.FillSolidRect(ox + HAIR, oy + HAIR, w - 2 * HAIR, HAIR, MC.hi);
    // the plate's engraving
    label(gr, mark[0], mst(7.5, MC.dim, MC.plate, 600, .22), X(24), Y(5));
    label(gr, mark[1], mst(7.5, MC.dim, MC.plate, 600, .22), X(mw - 24), Y(5), 2);

    const h0 = T.handle;
    // the cover, in an inset frame (the placeholder is drawn for the wide unit's 56 dp, and scaled)
    const [cx0, cy0, side] = L.cover, cd = side - 10, f = cd / 56;
    inset(gr, X(cx0), Y(cy0), mu(side), mu(side));
    const cv = h0 ? cover(h0, () => window.Repaint()) : null, cs = mu(cd), cx = X(cx0 + 5), cy = Y(cy0 + 5);
    if (cv && cv.img) gr.DrawImage(cv.img, cx, cy, cs, cs, 0, 0, cv.img.Width, cv.img.Height);
    else {
        gr.FillSolidRect(cx, cy, cs, cs, MC.cover);
        gr.FillSolidRect(cx + mu(10 * f), cy + mu(32 * f), mu(34 * f), mu(2 * f), C.accent);
        gr.DrawEllipse(cx + mu(10 * f), cy + mu(12 * f), mu(10 * f), mu(10 * f), Math.max(HAIR, mu(2 * f)), MC.mark);
    }

    // the dot-matrix window: the lyric line or the track
    const dx = X(L.display[0]), dy = Y(L.display[1]), dw = mu(L.display[2]), dh = mu(L.display[3]);
    inset(gr, dx, dy, dw, dh);
    const d = miniDisplay();
    const head = mst(9, MC.amberLo, MC.win, 500, .08);
    label(gr, d.head, head, dx + mu(10), dy + mu(6));
    label(gr, d.right, head, dx + dw - mu(10), dy + mu(6), 2);
    gr.PushClip(dx + mu(2), dy + mu(2), dw - mu(4), dh - mu(4));
    miniLine(gr, d.main, [16, 14.5, 13], MC.amber, 600, .02, dx + mu(10), dy + mu(21), dw - mu(20), d.mainP);
    miniLine(gr, d.sub, [10, 9], MC.amberSub, 500, .04, dx + mu(10), dy + mu(45), dw - mu(20), d.subP);
    miniScan(gr, dx, dy, dw, dh, k);
    gr.PopClip();

    // the lamps over the meters
    const RC = L.col, playing = fb.IsPlaying && !fb.IsPaused, lrc = STATE.miniShow !== "trk";
    const lamps = [["PWR", MC.green, true], ["PLAY", PA, playing], ["LRC", PA, lrc], ["TRK", PA, !lrc]];
    lamps.forEach(([name, col, on], i) => {
        const lx = X(RC + 12 + i * 24) - mu(3.5);
        if (on) gr.FillEllipse(lx - mu(2), Y(25) - mu(2), mu(11), mu(11), withAlpha(col, MC.glow));
        gr.FillEllipse(lx, Y(25), mu(7), mu(7), on ? col : MC.off);
        label(gr, name, mst(6.5, MC.lbl, MC.plate, 600, .1), lx + mu(3.5), Y(35), 1);
    });
    gr.FillSolidRect(X(RC), Y(49), mu(96), HAIR, MC.track);
    ["L", "R"].forEach((ch, r) => {
        const ry = Y(56 + r * 11), lit = Math.round(clamp(MINI.level[r], 0, 1) * 12);
        label(gr, ch, mst(6.5, MC.lbl, MC.plate), X(RC), ry - mu(1));
        for (let s = 0; s < 12; s++) {
            const col = s >= lit ? MC.off : s < 7 ? MC.green : s < 9 ? MC.yellow : PA;
            gr.FillSolidRect(X(RC + 11 + s * 7), ry, mu(5), mu(7), col);
        }
    });
    // the square: under the meters the volume fader across the column, then the time, down to the cover's foot
    if (sq) {
        gr.FillSolidRect(X(RC), Y(80), mu(96), HAIR, MC.track);
        drawMiniVolume(gr, X(RC), Y(86), mu(30), mu(96));
        gr.FillSolidRect(X(RC), Y(122), mu(96), HAIR, MC.track);
        miniTime(gr, X(RC), Y(128), mu(96), mu(44), k);
    }

    // progress: the whole width; a click seeks
    const px = X(22), pw = mu(mw - 46), py = Y(L.prog), len = fb.PlaybackLength, pf = fb.IsPlaying && len > 0 ? clamp(fb.PlaybackTime / len, 0, 1) : 0;
    gr.FillSolidRect(px, py, pw, mu(2), MC.track);
    gr.FillSolidRect(px, py, Math.round(pw * pf), mu(2), C.accent);
    // the playhead (a character pack's dog runs there instead, lib/draw.js markAt)
    if (fb.IsPlaying && !markAt(gr, "dog", px + pw * pf - mu(4), py + mu(1), mu(11), MC.ink)) gr.FillSolidRect(px + Math.round(pw * pf) - mu(1), py - mu(3), mu(2), mu(8), MC.ink);
    hits.add("mini-seek", px, py - mu(5), pw, mu(12));

    // the keys: previous / play-pause / next in the middle (the square: on the left), the volume fader left of them on
    // the wide unit, LRC | TRK and back on the right
    const ky = Y(mh - 31), kh = mu(22), kx = X(L.keys);
    if (!sq) drawMiniVolume(gr, X(24), ky, kh);
    // (a character pack's icon set, lib/draw.js ICON_SETS, draws the glyphs: its 12-unit square is 10 units high, as
    // tall as the keys' own glyphs)
    const own = iconSetName() !== "archive", glyphKey = (n, c) => (x, y, s) => iconPx(gr, n, x, y, s * 1.2, c);
    miniKey(gr, "mini-prev", kx, ky, mu(34), kh, false, own ? glyphKey("prev", MC.ink) : (x, y, s) => { gr.FillSolidRect(x - s * .55, y - s / 2, Math.max(HAIR, s * .16), s, MC.ink); tri(gr, x + s * .5, y, -s * .85, s, MC.ink); });
    miniKey(gr, "mini-play", kx + mu(40), ky, mu(42), kh, playing, own ? glyphKey(playing ? "pause" : "play", playing ? C.accent : MC.ink) : (x, y, s) => {
        if (playing) { gr.FillSolidRect(x - s * .42, y - s / 2, s * .26, s, C.accent); gr.FillSolidRect(x + s * .16, y - s / 2, s * .26, s, C.accent); }
        else tri(gr, x - s * .4, y, s * .9, s, MC.ink);
    });
    miniKey(gr, "mini-next", kx + mu(88), ky, mu(34), kh, false, own ? glyphKey("next", MC.ink) : (x, y, s) => { tri(gr, x - s * .5, y, s * .85, s, MC.ink); gr.FillSolidRect(x + s * .4, y - s / 2, Math.max(HAIR, s * .16), s, MC.ink); });
    // LRC | TRK
    const tw = mu(27), tx = X(mw - 24 - 26 - 6) - 2 * tw, hov = MINI.hover === "mini-show";
    gr.FillSolidRect(tx, ky, 2 * tw, kh, MC.pit);
    box(gr, tx, ky, 2 * tw, kh, hov ? PA : MC.keyEdge, HAIR);
    gr.FillSolidRect(tx + (lrc ? HAIR : tw), ky + HAIR, tw - HAIR, kh - 2 * HAIR, C.accent);
    label(gr, "LRC", mst(7.5, lrc ? 0xff111111 : MC.pitInk || MC.lbl, lrc ? C.accent : MC.pit), tx + tw / 2, ky + Math.round((kh - labelHeight(mst(7.5, 0, 0))) / 2), 1);
    label(gr, "TRK", mst(7.5, !lrc ? 0xff111111 : MC.pitInk || MC.lbl, !lrc ? C.accent : MC.pit), tx + tw * 1.5, ky + Math.round((kh - labelHeight(mst(7.5, 0, 0))) / 2), 1);
    hits.add("mini-show", tx, ky, 2 * tw, kh);
    miniKey(gr, "mini-back", X(mw - 24 - 26), ky, mu(26), kh, false, (x, y, s) => {
        const a = s * .5, t = Math.max(HAIR, mu(1.2));
        gr.DrawLine(x - a, y - a, x - a * .2, y - a * .2, t, MC.ink); gr.DrawLine(x + a, y + a, x + a * .2, y + a * .2, t, MC.ink);
        gr.FillSolidRect(x - a, y - a, a * .9, t, MC.ink); gr.FillSolidRect(x - a, y - a, t, a * .9, MC.ink);
        gr.FillSolidRect(x + a * .1, y + a - t, a * .9, t, MC.ink); gr.FillSolidRect(x + a - t, y + a * .1, t, a * .9, MC.ink);
    });
}
// scan lines over a window's glass
function miniScan(gr, x, y, w, h, k) {
    for (let yy = y + mu(1); yy < y + h - mu(1); yy += Math.max(2, Math.round(3 * k * SCALE))) gr.FillSolidRect(x + mu(1), yy, w - mu(2), HAIR, MC.scan);
}
// the square's time: a small window, the track's length over the time played
function miniTime(gr, x, y, w, h, k) {
    inset(gr, x, y, w, h);
    const on = fb.IsPlaying, len = fb.PlaybackLength, head = mst(9, MC.amberLo, MC.win, 500, .08);
    label(gr, "TIME", head, x + mu(8), y + mu(6));
    label(gr, on && len > 0 ? fmtTime(len) : "--:--", head, x + w - mu(8), y + mu(6), 2);
    label(gr, on ? fmtTime(fb.PlaybackTime) : "--:--", mst(16, MC.amber, MC.win, 600, .02), x + mu(8), y + mu(19));
    gr.PushClip(x + mu(2), y + mu(2), w - mu(4), h - mu(4));
    miniScan(gr, x, y, w, h, k);
    gr.PopClip();
}

// The volume: VOL, a fader (its groove, the accent up to its cap) and the level in dB. The same curve as the transport
// bar's volume (transport.js pos2vol): a click puts the cap there, a drag moves it, the wheel anywhere on the mini
// player steps it.
const miniPos2Vol = p => p <= 0 ? -100 : 50 * Math.log10(0.99 * p + 0.01);
const miniVol2Pos = db => db <= -100 ? 0 : clamp((Math.pow(10, db / 50) - 0.01) / 0.99, 0, 1);
// In a row (the wide unit's keys): VOL, the fader, the level. Given a width cw (the square's column): VOL and the level
// over the fader, which runs across it.
function drawMiniVolume(gr, x, y, h, cw = 0) {
    const cy = cw ? y + mu(20) : Math.round(y + h / 2), muted = fb.Volume <= -100, lh = Math.round(labelHeight(mst(7, 0, 0)) / 2);
    label(gr, "VOL", mst(7, MC.dim, MC.plate, 600, .14), x, cw ? y : cy - lh);
    const gx = x + mu(cw ? 4 : 26), gw = cw ? cw - mu(8) : mu(84), p = miniVol2Pos(fb.Volume), hov = MINI.hover === "mini-vol" || MINI.drag;
    // the groove, its ticks, the level up to the cap
    gr.FillSolidRect(gx, cy - mu(2), gw, mu(4), MC.groove);
    box(gr, gx, cy - mu(2), gw, mu(4), MC.rim, HAIR);
    for (let t = 0; t <= 4; t++) gr.FillSolidRect(gx + Math.round(gw * t / 4), cy + mu(5), HAIR, mu(t % 2 ? 2 : 4), MC.dim);
    if (!muted) gr.FillSolidRect(gx + HAIR, cy - mu(1), Math.round((gw - 2 * HAIR) * p), mu(2), C.accent);
    // the cap: a small block with a line across it
    const capW = mu(8), capH = mu(14), capX = Math.round(gx + gw * p - capW / 2);
    gr.FillSolidRect(capX, cy - capH / 2 + mu(2), capW, capH, MC.drop);
    gr.FillSolidRect(capX, cy - capH / 2, capW, capH, MC.key);
    box(gr, capX, cy - capH / 2, capW, capH, hov ? MINI.plateAcc || C.accent : MC.keyEdge, HAIR);
    gr.FillSolidRect(capX + HAIR, Math.round(cy - HAIR / 2), capW - 2 * HAIR, HAIR, hov ? C.accent : MC.ink);
    // the level
    const db = fb.Volume, txt = muted ? "MUTE" : db > -0.05 ? "0 dB" : `${db.toFixed(db > -10 ? 1 : 0)} dB`;
    const lst = mst(7, muted ? MINI.plateAcc || C.accent : MC.lbl, MC.plate, 500, .06);
    if (cw) label(gr, txt, lst, x + cw, y, 2); else label(gr, txt, lst, gx + gw + mu(8), cy - lh);
    hits.add("mini-vol", gx - mu(4), y, gw + mu(8), h, { x0: gx, w: gw });
}
function miniVolumeAt(x) {
    const a = hits.get("mini-vol");
    if (a) fb.Volume = miniPos2Vol(clamp((x - a.data.x0) / a.data.w, 0, 1));
}
// the left button down: on the fader it starts a drag (and sets the volume there); anywhere off the controls it may start
// moving the window (once the mouse has gone 3 px: a click or a double-click stays one)
function miniDown(x, y) {
    const a = hits.at(x, y);
    if (a && a.id === "mini-vol") { MINI.drag = true; miniVolumeAt(x); window.Repaint(); }
    else if (!a) MINI.press = { x, y };
}
// the wheel: the volume, 1 dB a notch (2 dB below −20)
function miniWheel(step) {
    const v = fb.Volume, d = v < -20 ? 2 : 1;
    fb.Volume = clamp(v + step * d, -100, 0);
    window.Repaint();
}

// A line of the window: at the largest of the sizes it fits at (centred on the first one's line); longer than that
// at the smallest, it slides along as it is sung — p, 0 – 1, how far through its line the song is — so its last word
// shows as the line ends; p "auto": back and forth on its own while playing (a long title); null: cut with an ellipsis.
function miniLine(gr, str, sizes, colour, weight, track, x, y, w, p) {
    if (!str) return;
    let s = sizes[sizes.length - 1];
    for (const z of sizes) if (labelWidth(str, mst(z, colour, MC.win, weight, track)) <= w) { s = z; break; }
    const st0 = mst(s, colour, MC.win, weight, track), lw = labelWidth(str, st0);
    const ly = y + Math.round((labelHeight(mst(sizes[0], 0, 0, weight)) - labelHeight(st0)) / 2);
    if (lw <= w) { label(gr, str, st0, x, ly); return; }
    let f = typeof p === "number" ? clamp(p, 0, 1) : null;
    if (p === "auto" && fb.IsPlaying && !fb.IsPaused) {
        // there and back at 30 dp a second, resting 1.5 s at each end
        const over = lw - w, run = over / dp(30), cycle = 2 * (run + 1.5), t = (Date.now() / 1000) % cycle;
        f = t < 1.5 ? 0 : t < 1.5 + run ? (t - 1.5) / run : t < 3 + run ? 1 : 1 - (t - 3 - run) / run;
    }
    if (f == null) { label(gr, fitLabel(str, st0, w), st0, x, ly); return; }
    gr.PushClip(x, y - mu(4), w, labelHeight(mst(sizes[0], 0, 0, weight)) + mu(8));
    label(gr, str, st0, x - Math.round((lw - w) * f), ly);
    gr.PopClip();
}

// a sunken window in the plate
function inset(gr, x, y, w, h) {
    gr.FillSolidRect(x, y, w, h, MC.win);
    box(gr, x, y, w, h, MC.rim, HAIR);
    gr.FillSolidRect(x + HAIR, y + HAIR, w - 2 * HAIR, mu(2), MC.shade);
    gr.FillSolidRect(x, y + h, w, HAIR, MC.lip);
}
// a triangle pointing right (dir > 0) or left, its flat side at x
function tri(gr, x, y, len, s, col) { gr.FillPolygon(col, 0, [x, y - s / 2, x + len, y, x, y + s / 2]); }
// a push key: raised, or sunk in (down) with the accent edge; icon(x, y, size) draws in its middle
function miniKey(gr, id, x, y, w, h, down, icon) {
    const hov = MINI.hover === id;
    if (down) {
        gr.FillSolidRect(x, y + HAIR, w, h, MC.down);
        box(gr, x, y + HAIR, w, h, MINI.plateAcc || C.accent, HAIR);
        gr.FillSolidRect(x + HAIR, y + 2 * HAIR, w - 2 * HAIR, mu(2), MC.downShade);
    } else {
        gr.FillSolidRect(x, y + h, w, mu(2), MC.drop);
        gr.FillSolidRect(x, y, w, h, MC.key);
        box(gr, x, y, w, h, hov ? MINI.plateAcc || C.accent : MC.keyEdge, HAIR);
        gr.FillSolidRect(x + HAIR, y + HAIR, w - 2 * HAIR, HAIR, MC.keyHi);
    }
    icon(Math.round(x + w / 2), Math.round(y + h / 2 + (down ? HAIR : 0)), mu(9));
    hits.add(id, x, y, w, h);
}

// what the window shows: { head, right, main, sub }
function miniDisplay() {
    const info = T.info, L = T.lyrics;
    if (!info) return { head: "STANDBY", right: "", main: "NO SIGNAL", sub: "— — —", mainP: null, subP: null };
    const trk = () => {
        const pl = plman.PlayingPlaylist >= 0 ? plman.PlayingPlaylist : plman.ActivePlaylist, n = pl >= 0 ? plman.PlaylistItemCount(pl) : 0;
        const fmt = [info.codec !== "—" ? info.codec : "", info.bits && info.rate ? `${info.bits}/${Math.round(info.rate / 1000)}` : info.bitrate ? `${info.bitrate}K` : ""].filter(Boolean).join(" ");
        return { head: `TRK ${pad(T.file || 0, 3)}/${pad(n, 3)}`, right: fmt.toUpperCase(), main: info.title || "—",
                 sub: [info.artist, info.album].filter(Boolean).join(" — ") || "—", mainP: "auto", subP: "auto" };
    };
    if (STATE.miniShow === "trk") return trk();
    if (!L || !L.lines || !L.lines.length) { const t = trk(); return { ...t, head: "LRC —", right: LYR.state === "SEARCHING" ? "SEARCHING" : "NO LYRICS" }; }
    const lines = L.lines, synced = lines[0].t != null, i = synced ? lyricIndex(lines, fb.IsPlaying ? fb.PlaybackTime : 0) : 0;
    const cur = lines[Math.max(0, i)], next = lines[Math.max(0, i) + 1];
    const main = i < 0 ? "· · ·" : cur.a || "· · ·";
    // under it: the translation, else the romanized line, else what comes next
    const own = i >= 0 && !!(cur.b || cur.r), sub = own ? (cur.b || cur.r) : next ? next.a : "";
    // how far through the line: from just after it starts to a little before the next (an unsynced text: on its own)
    let p = "auto";
    if (synced && i >= 0) {
        const t = fb.IsPlaying ? fb.PlaybackTime : 0, end = next && next.t != null ? next.t : (fb.PlaybackLength || cur.t + 5);
        p = clamp((t - cur.t - .4) / Math.max(1, end - cur.t - 1.2), 0, 1);
    }
    return { head: `LRC ${pad(Math.max(0, i) + 1, 3)}/${pad(lines.length, 3)}`, right: synced ? (L.source || "LRC") : "PLAIN", main, sub,
             mainP: p, subP: own ? p : null };
}

// once a frame while playing: the meters follow the level (fast up, slow down)
function miniUpdate(dt) {
    const target = [AUDIO.l || 0, AUDIO.r || 0];
    for (let c = 0; c < 2; c++) {
        const t = target[c], v = MINI.level[c];
        MINI.level[c] = t > v ? v + (t - v) * clamp(dt * 30, 0, 1) : v + (t - v) * clamp(dt * 4, 0, 1);
    }
}

// ---- the mouse ----
function miniMouseMove(x, mask, a, y = 0) {
    if (MINI.drag) { if (mask & 0x0001) miniVolumeAt(x); else MINI.drag = false; window.Repaint(); return; }
    if (MINI.press) {
        if (!(mask & 0x0001)) MINI.press = null;
        else if (Math.abs(x - MINI.press.x) + Math.abs(y - MINI.press.y) > 3) { MINI.press = null; send("window-drag"); window.SetCursor(32646); return; }   // IDC_SIZEALL
    }
    const id = a && a.id.startsWith("mini-") ? a.id : null;
    if (id !== MINI.hover) { MINI.hover = id; window.Repaint(); }
    window.SetCursor(id ? 32649 : 32512);
}
function miniClick(x, a) {
    MINI.press = null;
    if (MINI.drag) { MINI.drag = false; window.Repaint(); return; }   // (the fader: set as it moved)
    if (!a) return;
    if (a.id === "mini-prev") fb.Prev();
    else if (a.id === "mini-play") fb.PlayOrPause();
    else if (a.id === "mini-next") fb.Next();
    else if (a.id === "mini-show") send("mini-show", STATE.miniShow === "trk" ? "lrc" : "trk");
    else if (a.id === "mini-back") send("mini", false);
    else if (a.id === "mini-seek" && fb.IsPlaying && fb.PlaybackLength > 0) fb.PlaybackTime = clamp((x - a.x) / a.w, 0, 1) * fb.PlaybackLength;
    window.Repaint();
}
// right-click: the corner it sits in, its shape and colours, and back to the full window
const MINI_CORNERS = [["tl", "Top left"], ["tr", "Top right"], ["bl", "Bottom left"], ["br", "Bottom right"]];
function miniMenu(x, y) {
    const m = window.CreatePopupMenu(), c = window.CreatePopupMenu(), k = window.CreatePopupMenu(), sh = window.CreatePopupMenu();
    MINI_CORNERS.forEach(([, name], i) => c.AppendMenuItem(0, 10 + i, tr(name)));
    c.CheckMenuRadioItem(10, 13, 10 + Math.max(0, MINI_CORNERS.findIndex(k => k[0] === STATE.miniCorner)));
    c.AppendTo(m, 0, tr("Corner"));
    MINI_SHAPES.forEach(([, name], i) => sh.AppendMenuItem(0, 40 + i, tr(name)));
    sh.CheckMenuRadioItem(40, 41, 40 + Math.max(0, MINI_SHAPES.findIndex(f => f[0] === STATE.miniShape)));
    sh.AppendTo(m, 0, tr("Shape"));
    MINI_SKINS.forEach(([, name], i) => k.AppendMenuItem(0, 30 + i, tr(name)));
    k.CheckMenuRadioItem(30, 32, 30 + Math.max(0, MINI_SKINS.findIndex(f => f[0] === STATE.miniSkin)));
    k.AppendTo(m, 0, tr("Colour"));
    m.AppendMenuItem(STATE.miniShow !== "trk" ? 0x8 : 0, 20, tr("Show lyrics"));
    m.AppendMenuSeparator();
    m.AppendMenuItem(0, 1, tr("Back to the full window") + "\tM");
    const id = m.TrackPopupMenu(x, y);
    if (id >= 10 && id <= 13) send("mini-corner", MINI_CORNERS[id - 10][0]);
    else if (id === 20) send("mini-show", STATE.miniShow === "trk" ? "lrc" : "trk");
    else if (id >= 30 && id <= 32) send("mini-skin", MINI_SKINS[id - 30][0]);
    else if (id >= 40 && id <= 41) send("mini-shape", MINI_SHAPES[id - 40][0]);
    else if (id === 1) send("mini", false);
}
