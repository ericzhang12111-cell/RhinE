"use strict";
// The ∞ Möbius ring, drawn into any rectangle: centre (cx, cy) and width w in px. A pure display.
//   3D — the Blender still for the active mode (assets/render/ring/ring-{day,night}.png) with light pulses along the
//        exported inlay path (ring.json → fiber: x, y, depth, visible; two laps = one groove); only the pulses move
//   2D — the same centreline as one thick stroke with the front branch passing over the back one, a fine centre
//        channel, a travelling gap with orange end marks (one lap ≈ 29 s), pulses along the channel and ±0.6 % breathing
// Pulses are spawned on bass onsets and run faster with energy (lib/audio.js); everything freezes while paused.
// A character pack (lib/pack.js) can swap both shapes (the end of this file):
//   ring   3D — a turntable of frames (a picture of the character's motif turning) in place of the Blender still; it
//          turns faster the more intense the music is right now (ringHeat), and holds still while paused
//   ring2d 2D — "waffle": a round scalloped waffle with a 4 × 4 grid in the ∞'s stroke-and-channel language; in its
//          travelling gap a little waffle runs ahead and the pack's dogs chase it (chase, below)
//   chase  pictures that run along the ring (a waffle and three dog heads, dogs.json): in the 2D waffle's gap, and in
//          CLASSIC round the dial in place of the playhead's needle (signal.js drawClassic → ringChaseRound)
// With no pack in use everything above draws exactly as it always has.

const RING_DIR = THEME_ROOT + "assets\\render\\ring\\";
const RING_META = JSON.parse(utils.ReadTextFile(RING_DIR + "ring.json", 65001));
const RING_GAP = { len: .42, speed: .22 };   // 2D: radians of u; per second
const RING_FIBN = RING_META.fiber.length;     // points over two laps

const Ring = {
    mode: "3d",
    t: 0,          // seconds of playback seen by the ring (drives the 2D gap)
    pulses: [],
    cool: 0,
    img: { mode: "", still: null, shadow: null },
    // packs only: how intense the music is now (0..1, smoothed), the turntable's playhead (frames, or radians for a
    // synthesised turn), the waffle's own clock (seconds, run at the intensity's rate), the chase's clock (its stride)
    // and how hard the lead dog lunges just now (0..1, on onsets)
    heat: 0, flux: 0, turn: 0, wt: 0, ct: 0, lunge: 0,
};

// the ring image for the active colour mode
function ringLoad() {
    const m = MODE === "dark" ? "night" : "day";
    if (Ring.img.mode === m) return;
    Ring.img = { mode: m, still: d2d.Image(RING_DIR + `ring-${m}.png`), shadow: null };
    if (m === "day") {
        // light mode: a soft shadow under the ring, as in the prototype (half-size blurred copy at 16 %)
        const s = Ring.img.still, sh = s.Resize(Math.round(s.Width / 2), Math.round(s.Height / 2));
        sh.StackBlur(10);
        Ring.img.shadow = sh;
    }
}

// pulses: { p: 0..1 along the path, v: speed, len: fraction of the path, a: alpha }
function ringUpdate(dt, playing) {
    if (REDUCE_MOTION) playing = false;   // Reduce motion: the pulses and the 2D gap hold still
    if (playing) Ring.t += dt;
    Ring.cool -= dt;
    if (playing && ((AUDIO.surge > .12 && Ring.cool <= 0) || Ring.pulses.length < 2)) {
        Ring.pulses.push({ p: Math.random(), v: .035 + .05 * Math.random(), len: .05 + .05 * AUDIO.energy, a: .6 + .5 * clamp(AUDIO.surge * 4, 0, 1) });
        Ring.cool = .38;
    }
    for (const p of Ring.pulses) {
        p.p = (p.p + p.v * dt * (playing ? 1 + 2.2 * AUDIO.energy : 0)) % 1;
        if (playing) p.a *= Math.pow(.86, dt);
    }
    Ring.pulses = Ring.pulses.filter(p => p.a > .08).slice(-7);
    if (STATE.pack) ringPackUpdate(dt, playing);
}

// the 2D centreline (shared with the header emblem's INF, two circles r = 1 at ±1.42 joined by tangent diagonals)
const INF_W = 2 * 2.42 + .6;   // centreline width + tube diameter, as in the 3D model
function inf2(u, cx, cy, w) {
    const k = w / INF_W, n = INF.length, x = ((u / TAU) % 1 + 1) % 1 * n, i = Math.floor(x) % n, j = (i + 1) % n, f = x - Math.floor(x);
    return [cx + k * (INF[i][0] * (1 - f) + INF[j][0] * f), cy + k * (INF[i][1] * (1 - f) + INF[j][1] * f)];
}

const RING_ROUND = d2d.StrokeStyle({ startCap: 0, endCap: 0, lineJoin: 2 });

// draws the ring with its pulses. `reveal` (0..1) draws only part of the 2D stroke (boot animation).
function ringDraw(gr, cx, cy, w, reveal = 1) {
    if (Ring.mode === "3d") {
        const M = ringPackMeta();
        if (M) { if (M.synth) ringSynth(gr, M, cx, cy, w); else ringTurntable(gr, M, cx, cy, w); return; }   // a pack's turntable (no pulses: it is a picture)
        ringLoad(); ringPulses(gr, ring3D(gr, cx, cy, w), 1, false); return;
    }
    const breath = 1 + .006 * AUDIO.energy;
    gr.PushTransform();
    gr.Scale(breath, breath, cx, cy);
    if (ringWaffle2D()) {
        ringPulses(gr, waffle2D(gr, cx, cy, w, reveal), Math.max(1, w / dp(600)), true, WAF_PATH.n);
        gr.PopTransform();
        waffleChase(gr, cx, cy, w, reveal);   // (after the breathing: the pictures are placed by their own transform)
        return;
    }
    // the 2D pulses ride the channel, so they grow with the stroke (tuned at the Phase 3 width, 600 dp)
    ringPulses(gr, ring2D(gr, Ring.t, cx, cy, w, reveal), Math.max(1, w / dp(600)), true);
    gr.PopTransform();
}

function ring3Dgeom(cx, cy, w) {
    const b = RING_META.bounds, s = w / (b[2] - b[0]), c = RING_META.center;
    return { s, ox: cx - c[0] * s, oy: cy - c[1] * s };
}

function ring3D(gr, cx, cy, w) {
    const { s, ox, oy } = ring3Dgeom(cx, cy, w), [iw, ih] = RING_META.resolution, I = Ring.img;
    if (I.shadow) gr.DrawImage(I.shadow, ox + dp(6), oy + dp(30), iw * s, ih * s, 0, 0, I.shadow.Width, I.shadow.Height, 0, 41);
    gr.DrawImage(accentShift(I.still), ox, oy, iw * s, ih * s, 0, 0, iw, ih);   // the inlay in the scheme's accent
    // pulses vanish where the groove rolls behind the tube
    const F = RING_META.fiber;
    return k => { const q = F[k]; return [ox + q[0] * s, oy + q[1] * s, !!q[3]]; };
}

function ring2D(gr, t, cx, cy, w, reveal) {
    const SW = Math.max(dp(16), w * .6 / INF_W), N = 720, gapU = (t * RING_GAP.speed) % TAU, umax = reveal >= 1 ? Infinity : TAU * reveal;
    const inGap = u => reveal >= 1 && ((u - gapU) % TAU + TAU) % TAU < RING_GAP.len;
    // strokes the centreline over [u0, u1] minus the gap (and beyond `umax` while revealing). Each piece starts and ends
    // exactly on its boundary with evenly spaced points (≈ TAU / N apart): ends that fell between samples left the caps
    // skewed, a wedge or a notch at the strand's edge.
    const stroke = (u0, u1, col, lw) => {
        let parts = [[u0, Math.min(u1, umax)]].filter(([a, b]) => b - a > 1e-4);
        if (reveal >= 1) for (const g of [gapU - TAU, gapU, gapU + TAU]) {
            const g1 = g + RING_GAP.len;
            parts = parts.flatMap(([a, b]) => g1 <= a || g >= b ? [[a, b]] : [[a, g], [g1, b]].filter(([p, q]) => q - p > 1e-4));
        }
        for (const [a, b] of parts) {
            const n = Math.max(1, Math.ceil((b - a) / TAU * N)), pts = [];
            for (let k = 0; k <= n; k++) { const [x, y] = inf2(a + (b - a) * k / n, cx, cy, w); pts.push(x, y); }
            gr.DrawLines(col, lw, pts, RING_ROUND);
        }
    };
    const chan = Math.max(1, dp(1.4)), m = dp(8) * Math.max(1, w / dp(600)), cut = SW / 2 + dp(7);
    const mark = u => { const [x, y] = inf2(u, cx, cy, w); gr.FillSolidRect(x - m / 2, y - m / 2, m, m, C.accent); };
    // the centreline is arc-length parametrised: the front `\` branch is the straight run u = π ± .47 and the back `/`
    // one u = 0 ± .47, crossing at the centre
    const front = u => Math.abs(((u % TAU) + TAU) % TAU - Math.PI) < .47;
    // the closed loop runs a little past its start, so the two flat caps never meet in a seam at the centre
    stroke(0, TAU + .06, C.fg, SW);
    stroke(0, TAU + .06, C.bg, chan);
    // the gap's orange end marks, unless they are on the front branch: those are drawn over it below, the others are
    // cut and covered with the back branch
    const ends = reveal >= 1 ? [gapU, gapU + RING_GAP.len] : [];
    for (const u of ends) if (!front(u)) mark(u);
    // the front branch passes over the back one: a bg outline cuts the back stroke where they cross, then the front
    // branch is drawn again over a longer stretch than the cut, so the ends of the cut never show on its edges
    stroke(Math.PI - .38, Math.PI + .38, C.bg, SW + dp(14));
    stroke(Math.PI - .46, Math.PI + .46, C.fg, SW);
    stroke(Math.PI - .46, Math.PI + .46, C.bg, chan);
    for (const u of ends) if (front(u)) mark(u);
    // while it draws itself (boot), one mark leads the stroke
    if (reveal < 1) mark(umax);
    // pulses vanish under the front branch: on the back branch within the cut around the centre
    return i => {
        const u = i / RING_FIBN * 2 * TAU, uu = u % TAU, [x, y] = inf2(u, cx, cy, w);
        const under = (uu < .47 || uu > TAU - .47) && Math.hypot(x - cx, y - cy) < cut;
        return [x, y, !(under || inGap(uu) || uu > umax)];
    };
}

// each pulse: a few chunks of falling alpha, each drawn as one polyline — a wide glow, then a core — and a bright
// head. 3D: a warm glow with a near-white core, to read over the inlay, which is itself orange. 2D: a full orange glow
// with a core that contrasts with the stroke (deep orange on the light stroke of dark mode, near-white on the dark one).
// `n`: the points along the path P walks (the ∞'s fiber; a pack's 2D shape has its own)
function ringPulses(gr, P, k, flat, n = RING_FIBN) {
    const CH = 12, dark = MODE === "dark";
    const glow = flat ? C.accent : dark ? 0xFFB040 : 0xFF7A10;
    const core = flat ? (dark ? 0xC24A00 : 0xFFF3E2) : dark ? 0xFFF6EA : 0xFFFDF8, ga = flat ? .9 : .55;
    const gw = dp(10) * k, cw = dp(3) * k;
    for (const p of Ring.pulses) {
        const head = Math.floor(p.p * n), L = Math.max(2, Math.floor(p.len * n));
        for (let c = 0; c < CH; c++) {
            const j0 = Math.floor(c * L / CH), j1 = Math.floor((c + 1) * L / CH) + 1;
            const a = clamp(p.a * Math.pow(1 - (j0 + j1) / 2 / L, 1.4), 0, 1);
            let pts = [];
            const flush = () => {
                if (pts.length >= 4) {
                    gr.DrawLines(withAlpha(glow, a * ga), gw, pts, RING_ROUND);
                    gr.DrawLines(withAlpha(core, Math.min(1, a * 1.4)), cw, pts, RING_ROUND);
                }
                pts = [];
            };
            for (let j = j0; j < j1 && j < L; j++) {
                const q = P((head - j + n) % n);
                if (!q[2]) { flush(); continue; }
                pts.push(q[0], q[1]);
            }
            flush();
        }
        const h = P(head);
        if (h[2]) {
            const r = dp(5) * k;
            gr.FillEllipse(h[0] - r, h[1] - r, 2 * r, 2 * r, withAlpha(glow, Math.min(1, p.a * (flat ? 1 : .8))));
            gr.FillEllipse(h[0] - r / 2, h[1] - r / 2, r, r, withAlpha(core, Math.min(1, p.a * 1.5)));
        }
    }
}

// ------------------------------------------------------------------------------------------- character packs
// (lib/pack.js; drawn only while a pack with a "ring" or "ring2d" part is in use)

// How intense the music is right now, 0..1: mostly loudness (RMS on a 30 dB scale) and bass energy, with a little
// spectral flux (how much the bands rise from one frame to the next: busy, percussive music has more). It climbs in
// about a second and settles in two, so the speed it sets changes like a dial turned by hand, never jittering.
const RING_PREV = new Float32Array(48);
function ringHeat(dt) {
    const B = AUDIO.bands;
    let rise = 0;
    for (let b = 0; b < 48; b++) { const d = B[b] - RING_PREV[b]; if (d > 0) rise += d; RING_PREV[b] = B[b]; }
    // the flux per second (frames come at any rate), itself smoothed: a single hit should not count as busy
    const flux = dt > 0 ? rise / Math.max(dt, 1 / 120) : 0;
    if (isFinite(flux)) Ring.flux += (flux - Ring.flux) * clamp(dt * 2, 0, 1);
    const loud = AUDIO.live && isFinite(AUDIO.rmsDb) ? clamp((AUDIO.rmsDb + 36) / 30, 0, 1) : 0;
    const bass = clamp((AUDIO.energy - .3) / .5, 0, 1);
    const raw = clamp(.5 * loud + .32 * bass + .18 * clamp(Ring.flux / 30, 0, 1), 0, 1);
    Ring.heat += (raw - Ring.heat) * clamp(dt * (raw > Ring.heat ? 1.1 : .5), 0, 1);
    if (!isFinite(Ring.heat)) Ring.heat = 0;
}
// the speed it sets, a multiple of the shape's own: 0.3 × (quiet) … 1 × (heat ≈ .45) … 2.5 × (intense), evenly on a
// log scale so each step of intensity feels like the same step of speed
const ringRate = () => .3 * Math.pow(2.5 / .3, clamp(Ring.heat, 0, 1));

// once a frame (ringUpdate, while a pack is in use): the turntable's playhead, the waffle's clock and the chase's.
// While paused (or with Reduce motion) nothing moves.
function ringPackUpdate(dt, playing) {
    const M = Ring.mode === "3d" ? ringPackMeta() : null, waffle = Ring.mode === "2d" && ringWaffle2D();
    const chase = (waffle || Ring.mode === "classic") && !!chaseMeta();
    if ((!M && !waffle && !chase) || !playing) return;
    ringHeat(dt);
    const rate = ringRate();
    // the playhead is fractional: a change of speed changes how fast it moves, never where it is
    // (a synthesised turn: its playhead is the angle in radians, M.speed per second at 1 ×)
    if (M) {
        Ring.turn = M.synth ? (Ring.turn + dt * M.speed * rate) % TAU : (Ring.turn + dt * M.fps * (M.fixed ? 1 : rate)) % M.n;
        if (!isFinite(Ring.turn) || Ring.turn < 0) Ring.turn = 0;
    }
    if (waffle) {
        Ring.wt += dt * rate;
        if (!isFinite(Ring.wt)) Ring.wt = 0;
    }
    if (chase) {
        // the stride quickens with the music; an onset makes the lead dog lunge, which settles in about half a second
        Ring.ct += dt * (.7 + .5 * rate);
        if (!isFinite(Ring.ct)) Ring.ct = 0;
        // (eased both ways: set at once, the jump on every onset read as a twitch)
        Ring.lungeT = Math.max((Ring.lungeT || 0) * Math.pow(.004, dt), AUDIO.surge > .13 ? 1 : 0);
        Ring.lunge += (Ring.lungeT - Ring.lunge) * (1 - Math.exp(-dt * 8));
        if (!isFinite(Ring.lunge) || !isFinite(Ring.lungeT)) Ring.lunge = Ring.lungeT = 0;
    }
}

// The pack's turntable: ring.json in the pack's ring folder (w, h: the frames' size; frames; fps; file: the frames'
// name with %02d for the number; spans: each frame's visible width as a share of w), pack.json's ring part over it.
// { key, dir, n, fps, w, h, a: h / w, file(i), spans } or null; read once per pack.
let RING_PACK = { key: null, meta: null };
function ringPackMeta() {
    if (!STATE.pack) return null;   // (no pack: nothing to look up)
    const part = packPart("ring"), p = part && packOn();
    if (!p || typeof part !== "object") return null;
    const key = p.dir + "|" + (part.dir || "ring");
    if (RING_PACK.key === key) return RING_PACK.meta;
    let meta = null;
    const dir = packFile(part.dir || "ring", p);
    if (dir) {
        let j = {};
        try { j = JSON.parse(utils.ReadTextFile(dir + "\\ring.json", 65001)) || {}; } catch (e) { j = {}; }
        const num = (v, lo, hi, def) => { v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : def; };
        const P = j.profile, list = v => Array.isArray(v) && v.length >= 3 && v.every(q => isFinite(Number(q))) ? v.map(Number) : null;
        const prof = j.kind === "synth" && P ? { y: list(P.y), xl: list(P.xl), xr: list(P.xr) } : null;
        const sw = num(j.w, 1, 8192, 0), sh = num(j.h, 1, 8192, 0);
        if (prof && prof.y && prof.xl && prof.xr && prof.y.length === prof.xl.length && prof.y.length === prof.xr.length && sw && sh) {
            // a synthesised turn (ringSynth): one face picture turned at run time, no frames
            const meta = {
                key, synth: true, dir: dir + "\\", w: sw, h: sh, a: clamp(sh / sw, .2, 5), prof,
                face: String(j.face || "face.png"), gloss: j.gloss ? String(j.gloss) : "", shade: j.shade ? String(j.shade) : "",
                thick: num(j.thick, 0, .6, .16), speed: num(j.speed, 1, 720, 60) * Math.PI / 180,
            };
            RING_PACK = { key, meta };
            return meta;
        }
        const n =Math.round(num(j.frames, 1, 240, num(part.frames, 1, 240, 0)));
        const w = num(j.w, 1, 8192, 0), h = num(j.h, 1, 8192, 0), pat = typeof j.file === "string" ? j.file : "frame-%02d.png";
        if (n && w && h) meta = {
            key, dir: dir + "\\", n, w, h, a: clamp(h / w, .2, 5),
            fps: num(part.fps, .1, 60, num(j.fps, .1, 60, 10)),
            fixed: !!(part.fixed || j.fixed),   // (true: at its own rate whenever music plays, not the music's intensity)
            file: i => pat.replace("%02d", pad(i, 2)).replace("%03d", pad(i, 3)),
            spans: Array.isArray(j.spans) && j.spans.length === n ? j.spans.map(s => num(s, 0, 1, 1)) : null,
        };
    }
    RING_PACK = { key, meta };
    return meta;
}

// the frames, decoded in the background (four at a time, from the playhead on) and kept on Ring.img, which the stage
// drops when the Signal view is left (stage.js): 30 frames of 524 × 531 are ≈ 32 MB while it shows
function ringFrames(M) {
    const mode = "pack:" + M.key;
    if (Ring.img.mode !== mode) Ring.img = { mode, still: null, shadow: null, frames: new Array(M.n).fill(undefined), pending: 0 };
    const I = Ring.img, at = Math.floor(Ring.turn) % M.n;
    for (let k = 0; k < M.n && I.pending < 4; k++) {
        const i = (at + k) % M.n;
        if (I.frames[i] !== undefined) continue;
        I.frames[i] = false;   // asked for
        I.pending++;
        // (no timers from here: JSplitter 3.9.4 has crashed on timers set in promise callbacks; a repaint is enough)
        const done = img => { if (Ring.img !== I) return; I.frames[i] = img || null; I.pending--; window.Repaint(); };
        d2d.LoadImageAsyncV2(0, M.dir + M.file(i)).then(done, () => done(null));
    }
    return I.frames;
}

// the turntable centred on (cx, cy), w wide (its height from the frames' aspect): one frame at a time (laying the next
// one over it at the playhead's fraction showed as a double image, a ghost trail). Reduce motion: the front view.
function ringTurntable(gr, M, cx, cy, w) {
    const F = ringFrames(M), h = w * M.a, x = cx - w / 2, y = cy - h / 2;
    const pos = REDUCE_MOTION ? 0 : Ring.turn, i0 = Math.floor(pos) % M.n;
    // until the frame wanted is decoded, the nearest one before it that is
    let a = null;
    for (let k = 0; k < M.n && !a; k++) a = F[(i0 - k + M.n) % M.n] || null;
    if (!a) return;
    // light mode: a soft floor shadow, as wide as the frame shows the motif (stacked ellipses, no blur pass)
    if (MODE !== "dark") {
        ringFloorShadow(gr, cx, y + h + dp(10), w * (M.spans ? M.spans[i0] : .9));
    }
    gr.DrawImage(a, x, y, w, h, 0, 0, a.Width, a.Height);
}
// light mode: a soft floor shadow `span` px wide at y (stacked ellipses, no blur pass)
function ringFloorShadow(gr, cx, sy, span) {
    for (let k = 0; k < 5; k++) {
        const rx = span * (.3 + .06 * k), ry = dp(5) + dp(2.2) * k;
        gr.FillEllipse(cx - rx, sy - ry, 2 * rx, 2 * ry, withAlpha(0x000000, .035));
    }
}

// ---- a synthesised turn (ring.json kind "synth"): the motif's face picture turned about its vertical axis at run time,
// so it moves at the display's own frame rate (no frames to step between, no ghosting) and stays sharp. ring.json:
//   w, h      the face's size          face   the face (RGBA)       gloss  its speculars alone (slide and fade as it turns)
//   shade     its silhouette in black, darkening the face as it turns away
//   profile   { y, xl, xr }: the silhouette's left and right edge on rows from top to bottom (face px)
//   thick     the motif's thickness × w      speed  degrees per second at 1 × (the music's intensity scales it)
// The face is drawn squeezed to |cos θ| of its width; behind it the side (a baked crust) is the silhouette swept from
// the far face to the near one in thin slices, the ones nearest the faces a little smaller, so its edges round off.
// Memory: three pictures (768 × 766: ≈ 2.4 + 2.4 + 0.6 MB decoded), loaded in the background, dropped with Ring.img.
const SYNTH_RAMP = [[0, 0x4a2208], [.2, 0x8e4a14], [.5, 0xc8822e], [.8, 0xa05818], [1, 0x6a340e]];   // far face … near face
const synthRamp = f => {
    for (let i = 1; i < SYNTH_RAMP.length; i++) {
        const [a, ca] = SYNTH_RAMP[i - 1], [b, cb] = SYNTH_RAMP[i];
        if (f <= b) return mix(ca, cb, (f - a) / (b - a));
    }
    return SYNTH_RAMP[SYNTH_RAMP.length - 1][1];
};
function ringSynthImages(M) {
    const mode = "synth:" + M.key;
    if (Ring.img.mode !== mode) {
        const I = Ring.img = { mode, still: null, shadow: null, face: undefined, gloss: undefined, shade: undefined };
        for (const k of ["face", "gloss", "shade"]) {
            if (!M[k]) { I[k] = null; continue; }
            I[k] = false;   // asked for
            // (no timers from here: JSplitter 3.9.4 has crashed on timers set in promise callbacks; a repaint is enough)
            const done = img => { if (Ring.img !== I) return; I[k] = img || null; window.Repaint(); };
            d2d.LoadImageAsyncV2(0, M.dir + M[k]).then(done, () => done(null));
        }
    }
    return Ring.img;
}
const SYNTH_PTS = { n: 0, l: null };
function ringSynth(gr, M, cx, cy, w) {
    const I = ringSynthImages(M), face = I.face;
    if (!face) return;
    const th = REDUCE_MOTION ? 0 : Ring.turn, c = Math.cos(th), s = Math.sin(th), ac = Math.abs(c), sg = c >= 0 ? 1 : -1;
    const k = w / M.w, T = M.thick * M.w * k, o = T / 2 * s * sg, x0 = M.w / 2, y0 = M.h / 2, ext = Math.abs(T * s), P = M.prof;
    if (MODE !== "dark") ringFloorShadow(gr, cx, cy + M.h * k / 2 + dp(10), w * .9 * ac + ext);
    // the side: slices from the far face (f 0) to the near one (f 1), each the silhouette (squeezed to |cos θ|) moved
    // along the thickness and padded by half a slice, so edge-on they still meet; lit more the more it faces us
    if (ext > .5) {
        const nb = clamp(Math.ceil(ext / 1.5), 2, 40), lit = .62 + .38 * Math.abs(s), pad = ext / nb / 2 + .5, n = P.y.length;
        if (SYNTH_PTS.n !== n) { SYNTH_PTS.n = n; SYNTH_PTS.l = new Array(4 * n).fill(0); }
        const pts = SYNTH_PTS.l;
        for (let j = 0; j < nb; j++) {
            const f = (j + .5) / nb, d = o * (2 * f - 1), sc = 1 - .05 * (1 - Math.sqrt(Math.max(0, 1 - (2 * f - 1) * (2 * f - 1))));
            for (let r = 0; r < n; r++) {
                const y = cy + (P.y[r] - y0) * k * sc;
                pts[2 * r] = cx + d - pad + (P.xl[r] - x0) * k * ac * sc; pts[2 * r + 1] = y;
                const q = 4 * n - 2 - 2 * r;   // the right edge back up
                pts[q] = cx + d + pad + (P.xr[r] - x0) * k * ac * sc; pts[q + 1] = y;
            }
            gr.FillPolygon((mix(0x1a0c04, synthRamp(f), lit) | 0xFF000000) >>> 0, 0, pts);
        }
    }
    // the near face, then the shade as it turns away, then the speculars sliding a little against the turn
    const fw = M.w * k * ac, fh = M.h * k;
    if (fw < 1) return;
    const fx = cx + o - fw / 2, fy = cy - fh / 2;
    gr.DrawImage(face, fx, fy, fw, fh, 0, 0, face.Width, face.Height);
    if (I.shade && ac < .995) gr.DrawImage(I.shade, fx, fy, fw, fh, 0, 0, I.shade.Width, I.shade.Height, 0, Math.round((1 - ac) * .55 * 255));
    if (I.gloss) {
        const phi = Math.atan2(s * sg, ac), g = Math.min(1, .2 + .85 * Math.pow(Math.max(0, Math.cos(phi - .21)), 10));
        const gx = fx - phi / (Math.PI / 2) * .025 * M.w * k * ac;
        if (g > .01) gr.DrawImage(I.gloss, gx, fy, fw, fh, 0, 0, I.gloss.Width, I.gloss.Height, 0, Math.round(g * 255));
    }
}

// ---- the 2D waffle (ring2d "waffle"), in the ∞'s language: one thick stroke with a fine channel down its middle
// The rim is round with a scallop over each edge pocket and a notch where a grid line meets it; the 4 × 4 grid is
// three lines each way at -½, 0 and ½ of the notch radius, so every line ends exactly in a notch (at 30° steps).
// Units: the waffle's radius = 1; u runs round the rim from the top, clockwise.
const ringWaffle2D = () => !!STATE.pack && packPart("ring2d") === "waffle";
const WAF = { R: .40, sw: .13, scal: .045, gap: .30, speed: .22 };   // R: × w; sw: × R; gap: radians; speed: per second
const wafR = t => (1 - WAF.scal) + WAF.scal * Math.pow(Math.abs(Math.sin(6 * t)), .6);   // rim radius at angle t
function wafRim(u) { const t = Math.PI / 2 - u, r = wafR(t); return [r * Math.cos(t), -r * Math.sin(t)]; }
// the grid lines as chords between notches: [x0, y0, x1, y1] (y down, as drawn)
const WAF_CHORDS = (() => {
    const n = 1 - WAF.scal, out = [];
    for (const g of [-.5, 0, .5]) {
        const x = g * n, l = Math.sqrt(n * n - x * x);
        out.push([x, -l, x, l], [-l, x, l, x]);
    }
    return out;
})();
// the pulses' path: the rim, then each grid line; a piece's first point starts a new stroke ({ x, y, u, cut })
const WAF_PATH = (() => {
    const pts = [], RIM = 540;
    for (let i = 0; i <= RIM; i++) { const u = i / RIM * TAU, [x, y] = wafRim(u); pts.push({ x, y, u, cut: i === 0 }); }
    for (const [x0, y0, x1, y1] of WAF_CHORDS) {
        const k = 60;
        for (let i = 0; i <= k; i++) pts.push({ x: x0 + (x1 - x0) * i / k, y: y0 + (y1 - y0) * i / k, u: -1, cut: i === 0 });
    }
    return { pts, n: pts.length };
})();

function waffle2D(gr, cx, cy, w, reveal) {
    const R = w * WAF.R, SW = Math.max(dp(10), R * WAF.sw), chan = Math.max(1, dp(1.4));
    const gap = waffleGap(R, SW), gapU = ((Ring.wt * WAF.speed) % TAU + TAU) % TAU, umax = reveal >= 1 ? Infinity : TAU * reveal;
    const inGap = u => reveal >= 1 && ((u - gapU) % TAU + TAU) % TAU < gap;
    const at = u => { const [x, y] = wafRim(u); return [cx + x * R, cy + y * R]; };
    // the rim from u0 to u1 as one polyline, evenly sampled (its ends exactly on their boundaries, as the ∞'s pieces)
    const rim = (u0, u1, col, lw) => {
        if (u1 - u0 < 1e-4) return;
        const n = Math.max(1, Math.ceil((u1 - u0) / TAU * 720)), pts = [];
        for (let k = 0; k <= n; k++) { const [x, y] = at(u0 + (u1 - u0) * k / n); pts.push(x, y); }
        gr.DrawLines(col, lw, pts, RING_ROUND);
    };
    // with the gap: from its far end round to its near one; while revealing (boot): from the top to umax, no gap
    const rimAll = (col, lw) => reveal >= 1 ? rim(gapU + gap, gapU + TAU, col, lw) : rim(0, Math.min(TAU + .06, umax), col, lw);
    const grid = (col, lw) => { if (reveal >= 1) for (const [x0, y0, x1, y1] of WAF_CHORDS) gr.DrawLine(cx + x0 * R, cy + y0 * R, cx + x1 * R, cy + y1 * R, lw, col); };   // (x0, y0, x1, y1, width, colour)
    // every stroke first, then every channel, so the channels run into each other where the lines cross
    rimAll(C.fg, SW); grid(C.fg, SW);
    rimAll(C.bg, chan); grid(C.bg, chan);
    // no chase (its pictures missing): the gap's ends as plain accent dots, one leading the stroke while it draws
    if (!chaseMeta()) {
        const dot = u => { const [x, y] = at(u), r = SW * .5; gr.FillEllipse(x - r, y - r, 2 * r, 2 * r, C.accent); };
        if (reveal >= 1) { dot(gapU); dot(gapU + gap); } else dot(umax);
    }
    return i => {
        const q = WAF_PATH.pts[i];
        return [cx + q.x * R, cy + q.y * R, !q.cut && !(q.u >= 0 && (inGap(q.u) || q.u > umax))];
    };
}

// ---- the chase (pack.json "chase": its folder; a pack whose 2D ring is the waffle has it in "dogs" by default)
// dogs.json: { sizes: [px…], dogs: [names, lead first], waffle: name, file: "%s-%d.png", faces: "right" | "left" }:
// square RGBA pictures in a few sizes; the size drawn picks the smallest at least as large (four of 96 px ≈ 150 kB).
// The waffle runs ahead, rolling; the dogs run after it in a line, each with its own bounce, facing the way they run
// (mirrored when that is leftwards) and leaning a little with the path; on an onset the lead dog lunges at the waffle.
let CHASE = { key: null, meta: null, img: null };
function chaseMeta() {
    if (!STATE.pack) return null;
    let part = packPart("chase");
    if (part == null && packPart("ring2d") === "waffle") part = "dogs";
    const p = part && packOn();
    if (!p) return null;
    const rel = typeof part === "string" ? part : typeof part === "object" ? String(part.dir || "dogs") : "";
    const key = p.dir + "|" + rel;
    if (CHASE.key === key) return CHASE.meta;
    let meta = null;
    const dir = rel && packFile(rel, p);
    if (dir) {
        let j = null;
        try { j = JSON.parse(utils.ReadTextFile(dir + "\\dogs.json", 65001)); } catch (e) { j = null; }
        const sizes = j && Array.isArray(j.sizes) ? j.sizes.map(Number).filter(v => isFinite(v) && v >= 8 && v <= 1024).sort((a, b) => a - b) : [];
        const dogs = j && Array.isArray(j.dogs) ? j.dogs.filter(v => typeof v === "string" && v).slice(0, 5) : [];
        const pat = j && typeof j.file === "string" && j.file.includes("%s") ? j.file : "%s-%d.png";
        const waffle = j && typeof j.waffle === "string" ? j.waffle : "";
        if (sizes.length && (dogs.length || waffle)) meta = {
            dir: dir + "\\", sizes, dogs, waffle, left: j.faces === "left",
            file: (name, px) => pat.replace("%s", name).replace("%d", px),
        };
    }
    CHASE = { key, meta, img: new Map() };
    return meta;
}
// a picture of the chase about `px` px across (null when it cannot be read); read once per size
function chaseImg(M, name, px) {
    const size = M.sizes.find(v => v >= px) || M.sizes[M.sizes.length - 1], id = name + "|" + size;
    if (!CHASE.img.has(id)) {
        let img = null;
        try { const f = M.dir + M.file(name, size); img = utils.IsFile(f) ? d2d.Image(f) : null; } catch (e) { img = null; }
        CHASE.img.set(id, img);
    }
    return CHASE.img.get(id);
}
// `img` s px wide, centred on (x, y), turned by `ang` (rad, clockwise on screen) and mirrored first when `flip`
const CHASE_M = new Float32Array(6);
function chaseSprite(gr, img, x, y, s, ang, flip) {
    const h = s * img.Height / Math.max(1, img.Width), c = Math.cos(ang), sn = Math.sin(ang), fx = flip ? -1 : 1;
    CHASE_M[0] = c * fx; CHASE_M[1] = sn * fx; CHASE_M[2] = -sn; CHASE_M[3] = c; CHASE_M[4] = x; CHASE_M[5] = y;
    gr.SetTransform(CHASE_M);
    gr.DrawImage(img, -s / 2, -h / 2, s, h, 0, 0, img.Width, img.Height);
    gr.ResetTransform();
}
// the line, lead to tail, as px behind the lead point: the waffle's centre (0), then each dog's; len: to the tail's end
function chaseLayout(M, sd, sw) {
    const lunge = Ring.lunge * sd * .18, out = { dogs: [], len: 0 };
    let d = M.waffle ? 0 : -sd * .5;
    M.dogs.forEach((_, i) => {
        const breathe = Math.sin(Ring.ct * 1.7 + i * 2.1) * sd * .06;
        d += (i === 0 ? (M.waffle ? sw * .5 + sd * .5 + sd * .22 - lunge : sd * .5) : sd * .94) + breathe;
        out.dogs.push(d);
    });
    out.len = d + sd * .5;
    return out;
}
// the train along a path: at(u) → [x, y] with u growing the way it runs, R px per unit of u, the waffle at u = lead;
// roll: how far (px) the waffle has run, for its spin (continuous, so a lap's wrap of u does not jump it)
// The way a dog faces is read over its own length (the 2D waffle's rim is scalloped: read over 2 px, the direction
// swung with every scallop and the dog flipped back and forth at the top and bottom), turns round only once the path
// clearly runs the other way, and its lean eases towards the path's.
const CHASE_POSE = [];
function chaseTrain(gr, M, at, lead, R, sd, sw, roll = lead * R) {
    const L = chaseLayout(M, sd, sw), du = 1 / Math.max(R, 1), reach = sd * .8 * du;
    for (let i = M.dogs.length - 1; i >= 0; i--) {
        const img = chaseImg(M, M.dogs[i], sd * 1.15);
        if (!img) continue;
        const u = lead - L.dogs[i] * du, [x, y] = at(u), [xa, ya] = at(u - reach), [xb, yb] = at(u + reach);
        const tx = xb - xa, ty = yb - ya, len = Math.hypot(tx, ty) || 1;
        const P = CHASE_POSE[i] || (CHASE_POSE[i] = { back: tx < 0, ang: 0 });
        if (P.back ? tx > len * .3 : tx < -len * .3) P.back = !P.back;
        const want = clamp((P.back ? Math.atan2(-ty, -tx) : Math.atan2(ty, tx)) * .6, -.5, .5);
        P.ang = isFinite(P.ang) ? P.ang + (want - P.ang) * .18 : want;
        const hop = Math.abs(Math.sin(Ring.ct * 5.2 + i * 1.9)) * sd * .12;   // each on its own beat, a hop straight up
        chaseSprite(gr, img, x, y - hop, sd, P.ang, P.back !== M.left);
    }
    const wimg = M.waffle ? chaseImg(M, M.waffle, sw * 1.15) : null;
    if (wimg) {
        // the waffle rolls: turned by the distance it has run over its radius
        const [x, y] = at(lead), hop = Math.abs(Math.sin(Ring.ct * 6.4 + .7)) * sw * .06;
        chaseSprite(gr, wimg, x, y - hop, sw, (roll / (sw / 2)) % TAU, false);
    }
}
// the dogs' and the waffle's size on the 2D waffle, from its stroke
const chaseSizes = SW => { const sd = clamp(SW * 2.8, dp(48), dp(110)); return { sd, sw: sd * .95 }; };
// the length of the train in px, waffle front to last dog's back
const chaseSpan = (M, sd, sw) => chaseLayout(M, sd, sw).len + (M.waffle ? sw * .5 : 0);
// the 2D waffle's gap: WAF.gap, or long enough for the chase with some air at both ends (from the line at rest, so it
// does not breathe with the dogs)
function waffleGap(R, SW) {
    const M = chaseMeta();
    if (!M) return WAF.gap;
    const { sd, sw } = chaseSizes(SW), L = M.dogs.length;
    const span = (M.waffle ? sw : 0) + (L ? sd * (.22 + .94 * (L - 1) + 1) : 0);
    return clamp((span + SW * 1.8) / Math.max(R, 1), WAF.gap, 1.6);
}
// the chase in the 2D waffle's gap, its middle on the gap's middle (the air at both ends stays even as the dogs'
// spacing breathes); while the waffle draws itself (boot) only the little waffle, leading the stroke
function waffleChase(gr, cx, cy, w, reveal) {
    const M = chaseMeta();
    if (!M) return;
    const R = w * WAF.R, SW = Math.max(dp(10), R * WAF.sw), { sd, sw } = chaseSizes(SW);
    const at = u => { const [x, y] = wafRim(u); return [cx + x * R, cy + y * R]; };
    if (reveal < 1) {
        const img = M.waffle ? chaseImg(M, M.waffle, sw * 1.15) : null, u = TAU * reveal;
        if (img) { const [x, y] = at(u); chaseSprite(gr, img, x, y, sw, (u * R / (sw / 2)) % TAU, false); }
        return;
    }
    const gapU = ((Ring.wt * WAF.speed) % TAU + TAU) % TAU, gap = waffleGap(R, SW), span = chaseSpan(M, sd, sw) / R;
    const lead = gapU + gap / 2 + span / 2 - (M.waffle ? sw * .5 : 0) / R;
    chaseTrain(gr, M, at, lead, R, sd, sw, Ring.wt * WAF.speed * R);
}
// CLASSIC (signal.js drawClassic): the chase round the dial's track in place of the playhead's needle, the waffle at
// the playhead (angle a as Math.cos / Math.sin take it on screen, clockwise from 3 o'clock), track radius r, dogs sd
// px. False when no chase is in use (the needle is drawn as always).
function ringChaseRound(gr, cx, cy, r, a, sd) {
    const M = STATE.pack ? chaseMeta() : null;
    if (!M) return false;
    chaseTrain(gr, M, u => [cx + Math.cos(u) * r, cy + Math.sin(u) * r], a, r, sd, sd * .95);
    return true;
}

// the drawn box of the ring in use when a pack shapes it: { a: height / width } (signal.js signalGeom, which then
// gives it its own width), or null for the ∞, whose geometry stays as it always was
function ringShape() {
    if (!STATE.pack) return null;
    if (Ring.mode === "3d") { const M = ringPackMeta(); return M ? { a: M.a } : null; }
    if (Ring.mode === "2d" && ringWaffle2D()) return { a: 1 };   // the waffle (.8 w across) and the chase on its rim
    return null;
}
