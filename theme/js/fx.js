"use strict";
// Transition overlay. The theme's views are separate windows (scripted panels and the native playlist),
// so a transition cannot draw over them; instead this small top-most panel is moved across the window by frame.js:
//   view  — a panel as large as the view area slides right off the window, uncovering the new view left to right;
//           its left edge is the 2 dp scan head with a scan-line wake
//   mode  — a 222 dp band of scan lines with the head at its right edge sweeps across the whole window after the colours
//           have swapped
// frame.js only moves this panel, never resizes it during a transition (a resize rebuilds the Direct2D surface every
// frame, which made the motion stutter), so Windows just shifts its pixels and it rarely repaints.

include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\core.js");

let W = 0, H = 0, kind = "cover";   // "cover" (plain dark until frame.js says what to play), "view", "mode", "boot"
onMessage("fx", k => {
    if (k === "boot") startBoot();
    if (k !== kind) { kind = k; window.Repaint(); }
});

function on_size(w, h) { W = w; H = h; }

// one tile of the wake (its width × 64 dp of scan lines), rebuilt when the kind or the colours change
let tile = null;
function wakeTile(wake) {
    const step = dp(4), th = step * 16, key = `${kind}|${wake}|${C.bg}|${C.fg}`;
    if (tile && tile.key === key) return tile;
    const img = d2d.CreateImage(wake, th), g = img.GetGraphics();
    g.FillSolidRect(0, 0, wake, th, C.bg);
    // 1 px line every 4 dp, fading away from the head
    const strong = withAlpha(C.fg, .2), none = withAlpha(C.fg, 0);
    for (let y = 0; y < th; y += step)
        g.FillGradRect(0, y, wake, 1, 0, kind === "view" ? strong : none, kind === "view" ? none : strong, 1);
    img.ReleaseGraphics(g);
    tile = { key, img, w: wake, h: th };
    return tile;
}

function on_paint(gr) {
    if (kind === "cover") { gr.FillSolidRect(0, 0, W, H, argb(TOKENS.schemes[SCHEME].dark.bg)); return; }
    gr.FillSolidRect(0, 0, W, H, C.bg);
    if (kind === "boot") { drawBoot(gr, performance.now() - boot.t0); drawGrain(gr, 0, 0, W, H); return; }
    drawGrain(gr, 0, 0, W, H);
    const head = dp(2), wake = Math.min(W - head, dp(kind === "view" ? 160 : 220));
    if (wake <= 0) return;
    const T = wakeTile(wake), wx = kind === "view" ? head : W - head - wake;
    for (let y = 0; y < H; y += T.h) gr.DrawImage(T.img, wx, y, T.w, Math.min(T.h, H - y), 0, 0, T.w, Math.min(T.h, H - y));
    // the head: a bright 2 dp line with a soft glow
    const hx = kind === "view" ? 0 : W - head;
    for (let i = 3; i >= 1; i--) gr.FillSolidRect(hx - i * dp(2), 0, head + 2 * i * dp(2), H, withAlpha(C.fg, .06));
    gr.FillSolidRect(hx, 0, head, H, C.fg);
}

function on_colours_changed() { refreshTokens(); window.Repaint(); }

// ------------------------------------------------------------------------------------------------- boot sequence
// Optional start-up sequence (≈ 6.5 s, any key or click skips). frame.js shows this panel over the
// whole window for it. "DEPLOYMENT": a pre-rendered film (assets/intro/<skin>/) streamed frame by
// frame under live overlays:
//   bars      letterbox bars: identity and timecode at the top, the chapter line at the bottom
//   callouts  pinned to points tracked in the film (intro.json): the ignition front, ROW 02's nose, the locked case
//   manifest  the self-check as a deployment manifest: eight plates fill, run and resolve to OK, with a step counter
//   verdict   SESSION AUTHORIZED over the case window's orange, then the overlay flickers out
// The film is dark, so its overlays use the dark token set in both modes.
// one film per case skin (assets/intro/<skin>/, the same camera and timing in each); a skin without its own plays the
// default skin's
const INTRO_ROOT = THEME_ROOT + "assets\\intro\\";
let INTRO_DIR = INTRO_ROOT + SKIN_DEFAULT + "\\";
const INTRO = utils.IsFile(INTRO_DIR + "intro.json") ? JSON.parse(utils.ReadTextFile(INTRO_DIR + "intro.json", 65001)) : null;
function filmDir() { const d = INTRO_ROOT + STATE.skin + "\\"; return utils.IsFile(d + "intro.json") ? d : INTRO_ROOT + SKIN_DEFAULT + "\\"; }
const FILM_M = new Float32Array([1, 0, 0, 1, 0, 0]);
const FPS = INTRO ? INTRO.fps : 24, NF = INTRO ? INTRO.frames : 144, LAND = INTRO ? INTRO.land : 94;
const FILM_MS = NF / FPS * 1000;
// the overlays are timed in frames of the 24 fps cut; a film at another rate (a 60 fps render) keeps their timing
const F24 = 24 / FPS, LAND24 = LAND * F24;
const BK = {};   // the active scheme's dark set (refreshed with the tokens)
const refreshBK = () => { for (const [k, v] of Object.entries(TOKENS.schemes[SCHEME].dark)) BK[k] = argb(v); };
refreshBK();
TOKEN_LISTENERS.push(refreshBK);

const boot = { t0: 0, req: 0, started: false, end: FILM_MS + 600, ended: false, steps: [], files: 0 };
const film = { frames: [], pending: 0, gen: 0, last: null };
const bootClock = Clock(() => {
    if (kind !== "boot" || boot.ended) return false;
    const now = performance.now();
    if (!boot.started) {
        // hold the clock until the first frames are decoded (or a short wait passed), so the film does not open on black
        let ready = 0;
        while (ready < 4 && film.frames[ready]) ready++;
        if (ready >= Math.min(4, NF) || now - boot.req > 600 || !INTRO) { boot.started = true; boot.t0 = now; }
        else return true;
    }
    if (now - boot.t0 > boot.end) { endBoot(); return false; }
    if (INTRO) filmWant(filmIndex(now - boot.t0));
    window.Repaint();
    return true;
});

const filmIndex = ms => clamp(Math.floor(ms * FPS / 1000), 0, NF - 1);
// keep up to 14 frames decoded ahead of the playhead (6 loads in flight), drop the ones behind it
function filmWant(i) {
    const g = film.gen;
    for (let j = i; j < Math.min(NF, i + 14) && film.pending < 6; j++) {
        if (film.frames[j] || film.frames[j] === false) continue;
        film.frames[j] = false;          // requested
        film.pending++;
        d2d.LoadImageAsyncV2(0, INTRO_DIR + `frame-${pad(j + 1, 3)}.jpg`)
            .then(img => { if (g === film.gen) { film.frames[j] = img || null; film.pending--; } },
                  () => { if (g === film.gen) { film.frames[j] = null; film.pending--; } });
    }
    for (let j = 0; j < i - 1; j++) if (film.frames[j]) film.frames[j] = null;
}

function bootSteps() {
    let files = 0;
    try { files = fb.GetLibraryItems().Count; } catch (e) { /* no library */ }
    const land = LAND / FPS * 1000;
    return [
        ["SYS-01", tr("OUTPUT DEVICE"), 300, 1000],
        ["SYS-02", tr("DECODER CHAIN"), 800, 1700],
        ["SYS-03", `${tr("LIBRARY INDEX")}  ·  ${files ? fmtCount(files) : tr("EMPTY")}`, 1400, 2500],
        ["SYS-04", tr("ARTWORK CACHE"), 2200, 2900],
        ["SYS-05", tr("LYRICS ENGINE"), 2600, 3300],
        ["SYS-06", tr("SIGNAL PATH  ·  48 BANDS"), 3000, 3700],
        ["SYS-07", tr("RAIL 02  ·  SLOT 01  ·  LOCK"), 2300, land],
        ["SYS-08", tr("SESSION LINK"), land + 300, FILM_MS - 700],
    ].map(([code, name, t0, t1]) => ({ code, name, t0, t1 }));
}

function startBoot() {
    boot.steps = bootSteps();
    boot.req = performance.now(); boot.started = false; boot.ended = false;
    film.gen++; film.frames = []; film.pending = 0; film.last = null;
    INTRO_DIR = filmDir();
    if (INTRO) filmWant(0);
    bootClock.wake();
}
function endBoot() {
    if (boot.ended) return;
    boot.ended = true;
    film.gen++; film.frames = []; film.last = null;   // release the decoded frames
    send("boot-end");
}
function on_key_down() { if (kind === "boot") endBoot(); }
function on_mouse_lbtn_up() { if (kind === "boot") endBoot(); }

const BT = {
    bar: { size: 9, weight: 600, track: .16 },
    barSoft: { size: 9, weight: 500, track: .16 },
    tiny: { size: 8.5, weight: 500, track: .14 },
    tag: { size: 9.5, weight: 600, track: .14 },
    co: { size: 13, weight: 700, track: .1 },          // callout titles
    coSub: { size: 10, weight: 500, track: .12 },
    row: { size: 9.5, weight: 500, track: .08 },
};
const bl = (str, s, colour, bg, x, y, align) => label(gr_, str, Object.assign({ colour, bg }, s), x, y, align);
let gr_ = null;
const tx = (str, s, colour, x, y, align) => trackedText(gr_, str, Object.assign({ colour }, s), x, y, align);

function drawBoot(gr, ms) {
    gr_ = gr;
    gr.FillSolidRect(0, 0, W, H, BK.bg);
    if (!boot.started) return;
    const k = (a, b) => clamp((ms - a) / (b - a), 0, 1), f = filmIndex(ms), g = f * F24;
    // the film, cover-fitted
    const res = INTRO ? INTRO.res : [1600, 900], sc = Math.max(W / res[0], H / res[1]), fw = res[0] * sc, fh = res[1] * sc;
    const fx0 = (W - fw) / 2, fy0 = (H - fh) / 2;
    if (INTRO) {
        let img = film.frames[f];
        if (img) film.last = img; else img = film.last;
        if (img) {
            // under another colour scheme the film's orange is turned to its accent on the way to the screen
            const e = accentEffect(img);
            if (e) {
                FILM_M[0] = fw / img.Width; FILM_M[3] = fh / img.Height; FILM_M[4] = fx0; FILM_M[5] = fy0;
                gr.SetTransform(FILM_M);
                gr.DrawEffect(e, 0, 0, 0, 0, img.Width, img.Height);
                gr.ResetTransform();
            } else gr.DrawImage(img, fx0, fy0, fw, fh, 0, 0, img.Width, img.Height);
        }
    }
    gr.FillSolidRect(0, 0, W, H, withAlpha(BK.bg, 1 - easeOut(k(0, 500))));   // up from black
    const bh = dp(52), m = dp(40);
    // machine vision and callouts on tracked points
    if (INTRO) {
        const trk = INTRO.track[f], at = p => [fx0 + p[0] * fw, fy0 + p[1] * fh, p[2]];
        if (g < 124) drawVision(gr, trk, g, ms, fx0, fy0, fw, fh, bh, m);
        const lit = clamp(Math.round((g - 8) / 36 * 13), 0, 13);
        callout(gr, at(trk.front), tr("IGNITION"), `RAIL 02  ·  ${pad(lit, 2)} / 13`, clamp((g - 8) / 4, 0, 1) * clamp((44 - g) / 4, 0, 1), 1, bh);
        callout(gr, at(trk.nose), "ROW 02", tr("RAIL ONLINE"), clamp((g - 58) / 4, 0, 1) * clamp((100 - g) / 4, 0, 1), -1, bh);
        const locked = g >= LAND24, flash = locked && g < LAND24 + 6;
        callout(gr, at(trk.case), locked ? tr("LOCKED") : "ARC-0001", tr(locked ? "SPECIMEN  ·  SLOT 01" : "SPECIMEN  ·  LOWERING"),
                clamp((g - 72) / 4, 0, 1) * clamp((124 - g) / 4, 0, 1), 1, bh, flash);
    }
    // the window's glow taken to the theme's orange as the camera enters it
    if (g >= 122) gr.FillSolidRect(0, 0, W, H, withAlpha(BK.accent, .82 * easeOut(clamp((g - 122) / 14, 0, 1))));
    drawManifest(gr, ms, k, bh);
    drawVerdict(gr, ms, k);
    // letterbox bars
    gr.FillSolidRect(0, 0, W, bh, BK.bg);
    gr.FillSolidRect(0, H - bh, W, bh, BK.bg);
    const ty = Math.round((bh - labelHeight(BT.bar)) / 2);
    gr.FillSolidRect(m, ty + dp(4), dp(5), dp(5), BK.accent);
    const lw = bl("AUDIO ARCHIVE", BT.bar, BK.fg, BK.bg, m + dp(15), ty);
    bl(`·  LISTENING TERMINAL  ·  ${tr("DEPLOYMENT SEQUENCE")}`, BT.barSoft, BK["text-muted"], BK.bg, m + dp(15) + lw + dp(10), ty);
    const secs = (ms / 1000).toFixed(2).padStart(5, "0");
    bl(`T+${secs}   ·   FRAME ${pad(f + 1, 3)} / ${NF}`, BT.barSoft, BK["fg-soft"], BK.bg, W - m, ty, 2);
    if (Math.floor(ms / 500) % 2 === 0) gr.FillSolidRect(W - m - dp(14) - labelWidth(`T+${secs}   ·   FRAME ${pad(f + 1, 3)} / ${NF}`, Object.assign({ colour: BK["fg-soft"], bg: BK.bg }, BT.barSoft)), ty + dp(4), dp(5), dp(5), BK.accent);
    drawChapters(gr, f, m, H - bh, bh);
    // the end: up into the page colour of the active mode, then frame.js flickers the panels in
    if (ms > FILM_MS) gr.FillSolidRect(0, 0, W, H, withAlpha(C.bg, easeOut(k(FILM_MS, boot.end - 100))));
}

// width of a tracked string without drawing it
function textW(str, s) {
    const f = fontFor(str, s.size, s.weight || 400), adv = advances(gr_, str, f);
    return adv.reduce((a, b) => a + b, 0) + (s.track || 0) * dp(s.size) * Math.max(0, adv.length - 1);
}
// four L-shaped corners round a box
function brackets(gr, x0, y0, x1, y1, L, colour, t = HAIR) {
    for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
        gr.FillSolidRect(Math.round(sx > 0 ? x : x - L), Math.round(sy > 0 ? y : y - t), Math.round(L), t, colour);
        gr.FillSolidRect(Math.round(sx > 0 ? x : x - t), Math.round(sy > 0 ? y : y - L), t, Math.round(L), colour);
    }
}

// The camera's machine vision: viewfinder corners, a scan line, the centre reticle, detection boxes on the stored cases
// (nearest five that do not overlap much, acquired with a blink, labelled with id, confidence and range), the lowered
// case as the target (orange brackets, cross-lines to the frame edges, range), the camera telemetry and a status line.
const VIS = { seen: new Map() };
function conf(id) { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return .86 + (h % 1300) / 10000; }
// f: the film's time in frames of the 24 fps cut (see F24)
function drawVision(gr, trk, f, ms, fx0, fy0, fw, fh, bh, m) {
    const top = bh, bot = H - bh, faint = withAlpha(BK.fg, .5);
    if (f === 0) VIS.seen.clear();
    // viewfinder corners and the scan line
    brackets(gr, m - dp(16), top + dp(16), W - m + dp(16), bot - dp(16), dp(34), withAlpha(BK.fg, .7));
    const sy = top + ((ms % 2200) / 2200) * (bot - top);
    gr.FillGradRect(0, sy - dp(48), W, dp(48), 90, withAlpha(BK.fg, 0), withAlpha(BK.fg, .05));
    gr.FillSolidRect(0, Math.round(sy), W, HAIR, withAlpha(BK.fg, .22));
    // centre reticle
    const cx = Math.round(W / 2), cy = Math.round((top + bot) / 2), g = dp(10), l = dp(16);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) gr.DrawLine(cx + dx * g, cy + dy * g, cx + dx * (g + l), cy + dy * (g + l), HAIR, faint);
    gr.DrawEllipse(cx - dp(40), cy - dp(40), dp(80), dp(80), HAIR, withAlpha(BK.fg, .25));
    // detections: boxes clipped to the picture, nearest first, skipping ones that mostly overlap a nearer one
    const iou = (a, b) => {
        const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
        const i = ix * iy, u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i;
        return u > 0 ? i / u : 0;
    };
    // a case mostly inside a nearer one's box stands behind it (the cases are opaque plates): not detected
    const inside = (a, b) => {
        const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
        return ix * iy / Math.max(1, (a[2] - a[0]) * (a[3] - a[1]));
    };
    const kept = [], near = [];
    let target = null;
    for (const b of trk.boxes || []) {
        const r = [fx0 + b[1] * fw, Math.max(top + dp(4), fy0 + b[2] * fh), fx0 + b[3] * fw, Math.min(bot - dp(4), fy0 + b[4] * fh), b[0], b[5]];
        const hidden = near.some(k => inside(r, k) > .6);
        near.push(r);
        if (b[0] === "H") { if (f >= 66) target = r; continue; }
        if (hidden || r[3] - r[1] < dp(48) || r[2] - r[0] < dp(24) || kept.length >= 5 || kept.some(k => iou(k, r) > .3)) continue;
        kept.push(r);
    }
    for (const r of kept) {
        if (!VIS.seen.has(r[4])) VIS.seen.set(r[4], f);
        const age = Math.floor(f - VIS.seen.get(r[4]));
        if (age < 5 && age % 2) continue;                       // blinks while it is acquired
        const grow = (1 - easeOut(clamp(age / 5, 0, 1))) * dp(22);
        const x0 = r[0] - grow, y0 = r[1] - grow, x1 = r[2] + grow, y1 = r[3] + grow;
        brackets(gr, x0, y0, x1, y1, Math.min(dp(20), (x1 - x0) * .25, (y1 - y0) * .25), withAlpha(BK.fg, .85));
        const id = `SPC ${r[4]}`, ts = Object.assign({ colour: BK.bg, bg: BK.fg }, BT.tag), w1 = labelWidth(id, ts) + dp(14), lh = dp(20);
        const lx = Math.round(x0), ly = Math.round(y0 - lh - dp(4) > top + dp(40) ? y0 - lh - dp(4) : y0 + dp(6));   // inside the box when cut off at the top
        gr.FillSolidRect(lx, ly, w1, lh, BK.fg);
        label(gr, id, ts, lx + dp(7), ly + Math.round((lh - labelHeight(BT.tag)) / 2));
        const info = `${(conf(r[4]) + .004 * Math.sin(ms / 90 + r[5])).toFixed(2)}  ·  ${r[5].toFixed(1)} M`, iw = textW(info, BT.tiny) + dp(14);
        gr.FillSolidRect(lx + w1, ly, iw, lh, withAlpha(BK.bg, .78));
        tx(info, BT.tiny, BK["fg-soft"], lx + w1 + dp(7), ly + dp(5));
    }
    // the target
    const aimed = !!target;
    if (aimed && target[2] - target[0] < W * .85) {
        const [x0, y0, x1, y1] = target, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, locked = f >= LAND24;
        const col = locked ? BK.accent : withAlpha(BK.accent, Math.floor(ms / 120) % 2 ? 1 : .55);
        brackets(gr, x0, y0, x1, y1, dp(30), col, Math.max(HAIR, dp(2)));
        const lc = withAlpha(BK.accent, .45);
        gr.FillSolidRect(0, Math.round(my), Math.max(0, Math.round(x0 - dp(8))), HAIR, lc);
        gr.FillSolidRect(Math.round(x1 + dp(8)), Math.round(my), Math.max(0, Math.round(W - x1 - dp(8))), HAIR, lc);
        gr.FillSolidRect(Math.round(mx), top, HAIR, Math.max(0, Math.round(y0 - dp(8) - top)), lc);
        gr.FillSolidRect(Math.round(mx), Math.round(y1 + dp(8)), HAIR, Math.max(0, Math.round(bot - y1 - dp(8))), lc);
        const rng = `RNG ${target[5].toFixed(2)} M   ·   ${tr(locked ? "LOCK CONFIRMED" : "TRACKING")}`, rw = textW(rng, BT.coSub) + dp(16);
        gr.FillSolidRect(Math.round(x1 - rw), Math.round(y1 + dp(6)), Math.round(rw), dp(22), locked ? BK.accent : withAlpha(BK.bg, .8));
        tx(rng, BT.coSub, locked ? BK["on-accent"] : BK.accent, x1 - rw + dp(8), y1 + dp(11));
    }
    // status line under the top bar, telemetry above the bottom bar
    const n = kept.length + (aimed ? 1 : 0);
    if (Math.floor(ms / 400) % 2) gr.FillSolidRect(m, top + dp(31), dp(6), dp(6), BK.accent);
    tx(`VISION  ·  CAM-01  ·  OBJ ${pad(n, 2)}  ·  ${tr(aimed ? (f >= LAND24 ? "TARGET LOCKED" : "TARGET ACQUIRED") : "SCANNING")}`, BT.tag, BK.fg, m + dp(14), top + dp(26));
    const c = trk.cam;
    if (c) {
        const sg = v => (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(2).padStart(5, "0");
        const rows = [`POS   X ${sg(c[0])}   Y ${sg(c[1])}   Z ${sg(c[2])}`, `HDG   ${c[3].toFixed(1).padStart(5, "0")}°   PITCH ${sg(c[4])}°`,
                      `LENS  ${c[5].toFixed(1)} MM   ·   VEL ${c[6].toFixed(2)} U/S`];
        const pw = dp(310), ph = dp(30) + rows.length * dp(16), px = m, py = bot - dp(34) - ph;
        gr.FillSolidRect(px, py, pw, ph, withAlpha(BK.bg, .7));
        gr.FillSolidRect(px, py, dp(3), ph, BK.accent);
        tx(tr("TELEMETRY"), BT.tag, BK.fg, px + dp(14), py + dp(9));
        rows.forEach((t, i) => tx(t, BT.tiny, BK["fg-soft"], px + dp(14), py + dp(29) + i * dp(16)));
        // the speed as a ten-cell meter
        const v = clamp(c[6] / 9, 0, 1);
        for (let i = 0; i < 10; i++) gr.FillSolidRect(px + pw - dp(14) - (10 - i) * dp(7), py + dp(13), dp(5), dp(3), i < v * 10 ? BK.accent : withAlpha(BK.fg, .2));
    }
}

// a square on the point, a 45° leader and a plate: title (inverse) over a sub line; side 1 = to the right, -1 left
function callout(gr, p, title, sub, a, side, bh, flash = false) {
    if (a <= 0 || !p[2]) return;
    const [x, y] = p;
    if (y < bh + dp(10) || y > H - bh - dp(10)) return;
    const L = dp(58), run = dp(36), e = easeOut(a);
    const x1 = x + side * L * e, y1 = y - L * e, x2 = x1 + side * run * e;
    gr.FillSolidRect(Math.round(x - dp(5)), Math.round(y - dp(5)), dp(10), dp(10), BK.accent);
    box(gr, Math.round(x - dp(10)), Math.round(y - dp(10)), dp(20), dp(20), withAlpha(BK.fg, .7));
    gr.DrawLine(x, y, x1, y1, HAIR, BK.fg);
    gr.DrawLine(x1, y1, x2, y1, HAIR, BK.fg);
    if (a < 1) return;
    const ts = Object.assign({ colour: flash ? BK["on-accent"] : BK.bg, bg: flash ? BK.accent : BK.fg }, BT.co);
    const tw = labelWidth(title, ts) + dp(24), th = dp(30), px = side > 0 ? x2 : x2 - tw, py = Math.round(y1 - th / 2);
    gr.FillSolidRect(Math.round(px), py, tw, th, ts.bg);
    label(gr, title, ts, Math.round(px + dp(12)), py + Math.round((th - labelHeight(BT.co)) / 2));
    const sw = textW(sub, BT.coSub) + dp(16);
    const sx = side > 0 ? px : px + tw - sw;
    gr.FillSolidRect(Math.round(sx), py + th, sw, dp(22), withAlpha(BK.bg, .82));
    tx(sub, BT.coSub, BK["fg-soft"], sx + dp(8), py + th + dp(5));
}

// the manifest: a plate on the right with a hazard strip, a step counter and eight rows
function drawManifest(gr, ms, k, bh) {
    const a = easeOut(k(200, 700));
    if (a <= 0) return;
    const pw = Math.min(dp(360), W * .36), rh = dp(32), steps = boot.steps;
    const ph = dp(118) + steps.length * rh + dp(14), px = Math.round(W - dp(40) - pw + (1 - a) * dp(60)), py = Math.round(Math.max(bh + dp(24), (H - ph) / 2));
    gr.FillSolidRect(px, py, pw, ph, withAlpha(BK.bg, .8 * a));
    box(gr, px, py, pw, ph, withAlpha(BK.fg, .35 * a));
    hazardStrip(gr, px, py, pw, dp(6), ms);
    const done = steps.filter(s => ms >= s.t1).length;
    tx(tr("DEPLOYMENT MANIFEST"), BT.tag, BK.fg, px + dp(16), py + dp(22));
    tx(tr("SELF-CHECK  ·  TTY0"), BT.tiny, BK["text-muted"], px + dp(16), py + dp(40));
    gr.DrawText(`${pad(done, 2)}`, font(40, 300), BK.fg, px, py + dp(16), pw - dp(56), dp(52), DT_RIGHT_SINGLE);
    tx(`/ ${pad(steps.length, 2)}`, BT.tag, BK["text-muted"], px + pw - dp(16), py + dp(44), 2);
    let y = py + dp(84);
    gr.FillSolidRect(px + dp(16), y - dp(8), pw - dp(32), HAIR, withAlpha(BK.fg, .35));
    for (const s of steps) {
        const p = clamp((ms - s.t0) / (s.t1 - s.t0), 0, 1), run = ms >= s.t0 && ms < s.t1, ok = ms >= s.t1;
        const ink = ok ? BK.fg : run ? BK["fg-soft"] : withAlpha(BK["text-muted"], .7);
        tx(s.code, BT.tiny, run || ok ? BK.accent : BK["text-muted"], px + dp(16), y + dp(3));
        gr.DrawText(s.name, font(9.5, 500), ink, px + dp(72), y - dp(2), pw - dp(72) - dp(80), dp(18), DT_SINGLE | DT_ELLIPSIS);
        // ten cells under the name
        const cw = Math.floor((pw - dp(72) - dp(84)) / 10);
        for (let c = 0; c < 10; c++) {
            const on = c < Math.floor(p * 10), head = run && c === Math.floor(p * 10);
            gr.FillSolidRect(px + dp(72) + c * cw, y + dp(17), cw - dp(2), dp(3), on ? (ok ? BK.fg : BK["fg-soft"]) : head && Math.floor(ms / 90) % 2 ? BK.accent : withAlpha(BK.fg, .14));
        }
        // status: QUEUED / RUN with a spinner / OK as an inverse plate
        const sx = px + pw - dp(16), sy = y - dp(1);
        if (ok) {
            const okS = Object.assign({ colour: BK.bg, bg: BK.fg }, BT.tag), w = labelWidth("OK", okS) + dp(16);
            gr.FillSolidRect(sx - w, sy, w, dp(18), BK.fg);
            label(gr, "OK", okS, sx - w + dp(8), sy + Math.round((dp(18) - labelHeight(BT.tag)) / 2));
        } else if (run) {
            box(gr, sx - dp(54), sy, dp(54), dp(18), BK.accent);
            tx(`RUN ${"|/-\\"[Math.floor(ms / 80) % 4]}`, BT.tiny, BK.accent, sx - dp(27), sy + dp(4), 1);
        } else tx(tr("QUEUED"), BT.tiny, withAlpha(BK["text-muted"], .7), sx, sy + dp(4), 2);
        y += rh;
    }
}

// hazard stripes sliding slowly to the right
function hazardStrip(gr, x, y, w, h, ms) {
    const pitch = dp(8), off = (ms / 40) % (pitch * 2);
    gr.PushClip(x, y, w, h);
    gr.FillSolidRect(x, y, w, h, BK.bg);
    for (let sx = x - h - pitch * 2 + off; sx < x + w; sx += pitch * 2) gr.FillPolygon(BK.accent, 0, [sx, y + h, sx + h, y, sx + h + pitch, y, sx + pitch, y + h]);
    gr.PopClip();
}

// the bottom bar: the film's chapters along a line, the current one bright, an orange playhead
const CHAPTERS = [[0, "IGNITION"], [40, "TRANSFER"], [70, "DEPLOY"], [94, "LOCK"], [118, "LINK"]].map(([f, n]) => [f, tr(n)]);   // frames of the 24 fps cut
function drawChapters(gr, f, m, y0, bh) {
    const x0 = m, x1 = W - m, ly = y0 + Math.round(bh / 2), w = x1 - x0, at = fr => x0 + w * fr / NF;
    gr.FillSolidRect(x0, ly, w, HAIR, withAlpha(BK.fg, .25));
    gr.FillSolidRect(x0, ly - HAIR, Math.round(w * (f + 1) / NF), HAIR * 2, BK.fg);
    CHAPTERS.forEach(([s0, name], i) => {
        const c0 = s0 / F24, c1 = i + 1 < CHAPTERS.length ? CHAPTERS[i + 1][0] / F24 : NF, cur = f >= c0 && f < c1, past = f >= c1;
        const cx = Math.round(at(c0));
        gr.FillSolidRect(cx, ly - dp(5), HAIR, dp(10), past || cur ? BK.fg : withAlpha(BK.fg, .4));
        bl(`${pad(i + 1, 2)}  ${name}`, BT.tiny, cur ? BK.fg : past ? BK["fg-soft"] : BK["text-muted"], BK.bg, cx + dp(8), ly - dp(16));
    });
    const px = Math.round(at(f + 1));
    gr.FillSolidRect(px - dp(3), ly - dp(3), dp(6), dp(6), BK.accent);
}

// SESSION AUTHORIZED: an inverse plate sweeps across the centre while the case window glows
function drawVerdict(gr, ms, k) {
    const t1 = FILM_MS - 1000;
    if (ms < t1) return;
    const pk = easeOut(k(t1, t1 + 360)), big = { size: 22, weight: 700, track: .04 };
    const s = Object.assign({ colour: BK.fg, bg: BK.bg }, big), lw = labelWidth(tr("SESSION AUTHORIZED"), s);
    const pw = lw + dp(48), ph = dp(52), px = Math.round((W - pw) / 2), py = Math.round(H / 2 - ph / 2);
    gr.FillSolidRect(px, py, Math.round(pw * pk), ph, BK.bg);
    gr.FillSolidRect(px + Math.round(pw * pk), py, dp(4), ph, BK.accent);
    if (pk > .3) {
        gr.PushClip(px, py, pw * pk, ph);
        label(gr, tr("SESSION AUTHORIZED"), s, px + dp(24), py + Math.round((ph - labelHeight(big)) / 2));
        gr.PopClip();
    }
    if (pk >= 1) {
        const sub = `${tr("ACCESS GRANTED")}  ·  ARC-0001  ·  ROW 02 / SLOT 01`, ss = Object.assign({ colour: BK["on-accent"] }, BT.tag);
        trackedText(gr, sub, ss, W / 2, py + ph + dp(14), 1);
    }
}
