"use strict";
// The ∞ Möbius ring, drawn into any rectangle: centre (cx, cy) and width w in px. A pure display.
//   3D — the Blender still for the active mode (assets/render/ring/ring-{day,night}.png) with light pulses along the
//        exported inlay path (ring.json → fiber: x, y, depth, visible; two laps = one groove); only the pulses move
//   2D — the same centreline as one thick stroke with the front branch passing over the back one, a fine centre
//        channel, a travelling gap with orange end marks (one lap ≈ 29 s), pulses along the channel and ±0.6 % breathing
// Pulses are spawned on bass onsets and run faster with energy (lib/audio.js); everything freezes while paused.

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
    if (Ring.mode === "3d") { ringLoad(); ringPulses(gr, ring3D(gr, cx, cy, w), 1, false); return; }
    const breath = 1 + .006 * AUDIO.energy;
    gr.PushTransform();
    gr.Scale(breath, breath, cx, cy);
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
function ringPulses(gr, P, k, flat) {
    const CH = 12, dark = MODE === "dark";
    const glow = flat ? C.accent : dark ? 0xFFB040 : 0xFF7A10;
    const core = flat ? (dark ? 0xC24A00 : 0xFFF3E2) : dark ? 0xFFF6EA : 0xFFFDF8, ga = flat ? .9 : .55;
    const gw = dp(10) * k, cw = dp(3) * k;
    for (const p of Ring.pulses) {
        const head = Math.floor(p.p * RING_FIBN), L = Math.max(2, Math.floor(p.len * RING_FIBN));
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
                const q = P((head - j + RING_FIBN) % RING_FIBN);
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
