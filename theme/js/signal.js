"use strict";
// 04 · SIGNAL (drawn by the stage panel; stage.js includes this file): a purely graphical monitor of what is playing.
//   the ∞ ring with its light pulses (3D render or 2D stroke, MODEL toggle / R), a 48-band spectrum strip under it and
//   the whole-track signal trace along the bottom (click to seek), framed by corner brackets and registration crosses;
//   no read-outs (those are in 03 · LYRICS).
// MODEL [3D | 2D | CLASSIC]: CLASSIC swaps the monitor for a familiar player screen set as a specimen plate
// (drawClassic): the cover in a dial of progress and spectrum, title and time under it, the lyric on a caption plate.
// Everything here is drawn every frame while music plays and not at all while paused, stopped or hidden.

const SG_ST = {
    head: { size: 9, weight: 600, track: .16 },
    tog: { size: 9, weight: 500, track: .14 },
    tiny: { size: 8, weight: 500, track: .14 },
};

function signalGeom() {
    const m = dp(48), cx = Math.round(W / 2);
    const traceW = Math.min(W - 2 * m - dp(80), dp(1100)), traceH = dp(44), traceY = H - dp(64) - traceH;
    const ringW = Math.round(Math.min(dp(860), W - dp(240), (traceY - dp(150)) / .56));
    const ringY = Math.round(dp(40) + (traceY - dp(110)) * .46);
    return { m, cx, ringW, ringY, specY: Math.round(ringY + ringW * .36), specW: Math.round(ringW * .62), traceW, traceH, traceY };
}

function drawSignal(gr) {
    if (Ring.mode === "classic") { drawClassic(gr); return; }
    const g = signalGeom(), playing = fb.IsPlaying, state = tr(!playing ? "STANDBY" : fb.IsPaused ? "PAUSED" : "LIVE");
    // registration crosses in the corners, corner brackets around the ring's field
    for (const [x, y] of [[dp(16), dp(16)], [W - dp(27), dp(16)], [dp(16), H - dp(27)], [W - dp(27), H - dp(27)]]) regCross(gr, x, y);
    // the ring's drawn box (ring.json bounds around its centre) plus a margin, down to below the spectrum strip
    const b = RING_META.bounds, c = RING_META.center, s = g.ringW / (b[2] - b[0]);
    const bx0 = Math.round(g.cx - g.ringW / 2 - dp(48)), bx1 = Math.round(g.cx + g.ringW / 2 + dp(48));
    const by0 = Math.round(g.ringY - (c[1] - b[1]) * s + dp(8)), by1 = Math.round(g.specY + dp(24)), L = dp(18);
    for (const [x, y, sx, sy] of [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx0, by1, 1, -1], [bx1, by1, -1, -1]]) {
        gr.FillSolidRect(Math.round(sx > 0 ? x : x - L), Math.round(y), L, HAIR, C["line-dim"]);
        gr.FillSolidRect(Math.round(x), Math.round(sy > 0 ? y : y - L), HAIR, L, C["line-dim"]);
    }
    // ■ SIGNAL MONITOR · 04   [LIVE]
    gr.FillSolidRect(g.m, dp(30) + dp(2), dp(5), dp(5), C.fg);
    const lw = label(gr, tr("SIGNAL MONITOR  ·  04"), st(SG_ST.head, C.fg), g.m + dp(15), dp(30) - dp(2));
    chip(gr, state, g.m + dp(15) + lw + dp(14), dp(24), dp(18), playing && !fb.IsPaused ? "acc" : "inv", 8.5, C.bg);
    // MODEL 3D / 2D, top right
    drawModelToggle(gr, W - g.m, dp(22));
    // the ring
    ringDraw(gr, g.cx, g.ringY, g.ringW);
    // spectrum strip: 48 bands mirrored about a hairline, low frequencies in the middle
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
    // the whole-track trace
    drawTrace(gr, g.cx - g.traceW / 2, g.traceY, g.traceW, g.traceH);
}

// [■ VISUALIZATIONS]  MODEL [■ 3D | □ 2D | □ CLASSIC], right-aligned at x
const MODELS = ["3d", "2d", "classic"];
function drawModelToggle(gr, xRight, y) {
    const items = [["3d", "3D"], ["2d", "2D"], ["classic", tr("CLASSIC")]], hh = dp(22), s = st(SG_ST.tog, 0);
    const widths = items.map(([, t]) => dp(9) + dp(5) + dp(6) + labelWidth(t, s) + dp(9)), total = widths.reduce((a, b) => a + b, 0);
    let ix = xRight - total;
    const mw = labelWidth(tr("MODEL"), st(SG_ST.tog, 0));
    // VISUALIZATIONS: foobar2000's and installed components' visualizations, each in a window of its own (lib/bus.js)
    const vt = tr("VISUALIZATIONS"), vw = dp(9) + dp(5) + dp(6) + labelWidth(vt, s) + dp(9), vx = ix - mw - dp(14) - dp(22) - vw;
    const vhov = hover && hover.id === "vis";
    gr.FillSolidRect(vx - dp(6), y - dp(6), xRight - vx + dp(12), hh + dp(12), C.bg);   // a plate (CLASSIC draws over a picture)
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
    if (playing) label(gr, `${fmtTime(fb.PlaybackTime)} / ${fmtTime(len)}`, st(SG_ST.tiny, C["text-muted"]), x + w, y - dp(18), 2);
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
// a plate with its top-right and bottom-left corners cut off
const chamfer = (gr, x, y, w, h, c, colour) => gr.FillPolygon(colour, 0, [x, y, x + w - c, y, x + w, y + c, x + w, y + h, x + c, y + h, x, y + h - c]);
// hazard stripes leaning right, clipped to the box
function hazard(gr, x, y, w, h, colour, pitch = dp(9)) {
    gr.PushClip(x, y, w, h);
    for (let sx = x - h; sx < x + w; sx += pitch * 2) gr.FillPolygon(colour, 0, [sx, y + h, sx + h, y, sx + h + pitch, y, sx + pitch, y + h]);
    gr.PopClip();
}

function drawClassic(gr) {
    const h = T.handle, I = T.info, cov = h ? cover(h, () => window.Repaint()) : null, bd = classicBackdrop(cov);
    const dark = MODE === "dark", playing = fb.IsPlaying, live = playing && !fb.IsPaused, len = fb.PlaybackLength;
    const el = playing ? fb.PlaybackTime : 0, prog = playing && len > 0 ? clamp(el / len, 0, 1) : 0;
    const m = dp(48), cx = Math.round(W / 2), muted = C["text-muted"];
    const tt = (str, s, colour, x, y, align) => trackedText(gr, str, Object.assign({ colour }, s), x, y, align);
    // ground: the frosted cover toned towards the page colour
    if (bd) {
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
    else { gr.FillSolidRect(x, y, s, s, C.well); gr.DrawText(tr("NO COVER"), fontFor(tr("NO COVER"), 9, 500), muted, x, y, s, s, DT_CENTER_SINGLE); }
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
    // the playhead: an orange needle across track and spectrum, a square on the track
    if (playing) {
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
        chip(gr, `${tr("FILE")} ${T.file ? pad(T.file, 3) : "—"}`, m, ty, dp(18), "inv", 8.5);
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
    gr.DrawText(title, fontFor(title, 30, 700), C.fg, m - dp(2), ry + dp(12), tw, dp(44), DT_SINGLE | DT_ELLIPSIS);
    const meta = I ? [I.artist, I.album, I.year].filter(Boolean).join("  ·  ").toUpperCase() : tr("AWAITING SIGNAL");
    gr.DrawText(meta, fontFor(meta, 11, 500), C["fg-soft"], m, ry + dp(58), tw, dp(20), DT_SINGLE | DT_ELLIPSIS);
    gr.DrawText(playing ? fmtTime(el) : "--:--", font(30, 300), C.fg, W - m - dp(240), ry + dp(12), dp(240), dp(44), DT_RIGHT_SINGLE);
    text(gr, playing && len > 0 ? `/ ${fmtTime(len)}` : "/ --:--", 11, 500, C["fg-soft"], W - m - dp(240), ry + dp(58), dp(240), dp(20), 2);

    // caption plate: the current lyric line with its own progress, else what plays next
    const L = T.lyrics, li = L && playing ? lyricIndex(L.lines, el) : -1, line = li >= 0 ? L.lines[li] : null;
    const nxt = line ? null : upNext(1)[0];
    const caption = line ? (line.a || line.b) : nxt ? CL_TF.EvalWithMetadb(nxt.handle) : I ? tr("END OF PLAYLIST") : "";
    const ph = dp(46), py = H - dp(36) - ph, pw = W - 2 * m;
    if (caption && py > ry + dp(96)) {
        chamfer(gr, m, py, pw, ph, dp(12), C.fg);
        const tag = line ? `LRC  ${pad(li + 1, 2)} / ${pad(L.lines.length, 2)}` : nxt ? `${tr("NEXT")}  ${nxt.index >= 0 ? pad(nxt.index + 1, 3) : "Q"}` : tr("END"), ts = st(CL_ST.tag, C["on-accent"], C.accent);
        const tgw = labelWidth(tag, ts) + dp(20), lx = m + tgw + dp(28), lw = pw - tgw - dp(140);
        gr.FillSolidRect(m + dp(10), py + dp(10), tgw, ph - dp(20), C.accent);
        label(gr, tag, ts, m + dp(20), py + Math.round((ph - labelHeight(CL_ST.tag)) / 2));
        gr.DrawText(caption, fontFor(caption, 17, 500), C.bg, lx, py, lw, ph, DT_SINGLE | DT_ELLIPSIS);
        hazard(gr, m + pw - dp(84), py + dp(10), dp(60), ph - dp(20), C.accent);
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
