"use strict";
// The header plate's small vector emblem, as chosen in 06 STYLE (STATE.emblem): the Möbius ring ("ring", the default),
// nested triangles ("delta") or a waffle ("waffle", the SWEETPIE pack's). All of them move slowly while music plays.
//
// DELTA: equilateral triangles about one centre, each 0.88 × the size of the one outside it and turned 4° further, ~50
// deep. They flow inwards without end: every one shrinks and turns into the place of the next, a new one fades in at
// the outside and the innermost fade out below a pixel.
const DELTA = { ratio: .88, turn: 4 * Math.PI / 180, speed: .32 };   // speed: steps per second
function drawDelta(gr, t, x, y, w, h, sc, colour, reveal = 1) {
    const X = x + w / 2, Y = y + h / 2 + sc * .2, R0 = sc * 1.95, p = (t * DELTA.speed) % 1, lw = Math.max(1, .8 * SCALE);
    const n = Math.max(3, Math.round(60 * reveal));
    for (let k = -1; k < n; k++) {
        const u = k + p, r = R0 * Math.pow(DELTA.ratio, u);
        if (u < 0) continue;
        if (r < SCALE) break;
        // fade in over the first step, out as the triangles get smaller than a few pixels
        const a = Math.min(1, u) * clamp((r - SCALE) / (7 * SCALE), 0, 1);
        if (a <= .01) continue;
        const th = -Math.PI / 2 + u * DELTA.turn, pts = [];
        for (let i = 0; i < 3; i++) { const q = th + i * TAU / 3; pts.push(X + r * Math.cos(q), Y + r * Math.sin(q)); }
        gr.DrawPolygon(withAlpha(colour, a), lw, pts);
    }
}
function drawEmblem(gr, t, x, y, w, h, sc, colour, reveal = 1) {
    if (STATE.emblem === "delta") drawDelta(gr, t, x, y, w, h, sc, colour, reveal);
    else if (STATE.emblem === "waffle") drawWaffle(gr, t, x, y, w, h, sc, colour, reveal);
    else drawMobius(gr, t, x, y, w, h, sc, colour, reveal);
}

// WAFFLE: a round waffle seen face on — a scalloped rim of 12 bumps, a crust ring inside it and 4 × 4 square pockets
// (the outer ones cut off by the crust, as in the pack's picture of one). Every few seconds while music plays it is
// flipped over about its upright axis, like a waffle turned in the iron: the face narrows to its edge and opens again
// (both faces are the same), its thickness showing as short slats along the side that turns towards the viewer, and
// it settles with a little overshoot. At t = 0 it lies face on (the Archive's shelf ends draw it so, still).
// Shapes in units of the rim's radius, worked out once: the rim, the crust's circle and the pockets.
const WAFFLE = (() => {
    const rim = [], N = 96;
    for (let i = 0; i < N; i++) {
        const a = i / N * TAU, r = 1 - .075 * (1 - Math.abs(Math.cos(6 * a)));   // 12 round bumps with sharp dips between
        rim.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    // each rim point's outward normal, sideways part only (which side of the edge it is on when the waffle turns)
    const nx = rim.map((p, i) => { const a = rim[(i + N - 1) % N], b = rim[(i + 1) % N], tx = b[0] - a[0], ty = b[1] - a[1]; return ty / (Math.hypot(tx, ty) || 1); });
    const crust = .8, P = .43, S = .31, pockets = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        // a rounded square, its points outside the crust's circle pulled in onto it
        const cx = (i - 1.5) * P, cy = (j - 1.5) * P, h = S / 2, pts = [];
        for (const [qx, qy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) for (let k = 0; k <= 3; k++) {
            const a = (Math.atan2(qy, qx) - Math.PI / 4) + k / 3 * Math.PI / 2, rr = .05;
            pts.push([cx + qx * (h - rr) + rr * Math.cos(a), cy + qy * (h - rr) + rr * Math.sin(a)]);
        }
        let out = 0;
        const cut = pts.map(([px, py]) => { const d = Math.hypot(px, py); if (d <= crust - .035) return [px, py]; out++; const f = (crust - .035) / d; return [px * f, py * f]; });
        // the order the pockets fill in as the emblem is revealed: from the middle out
        pockets.push({ pts: cut, d: Math.hypot(cx, cy) + (out ? .01 : 0) });
    }
    pockets.sort((a, b) => a.d - b.d);
    const ring = [];
    for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; ring.push([crust * Math.cos(a), crust * Math.sin(a)]); }
    return { rim, nx, ring, pockets, period: 7.5, flip: 1.4, depth: .17, body: .12, pocket: .5 };
})();
// the turn at t seconds: half a turn every period, eased in and out with a little lift before and overshoot after
// (easeInOutBack)
function waffleTurn(t) {
    const n = Math.floor(t / WAFFLE.period), f = clamp((t - n * WAFFLE.period) / WAFFLE.flip, 0, 1), c = 1.1 * 1.525;
    const e = f < .5 ? Math.pow(2 * f, 2) * ((c + 1) * 2 * f - c) / 2 : (Math.pow(2 * f - 2, 2) * ((c + 1) * (2 * f - 2) + c) + 2) / 2;
    return (n + e) * Math.PI;
}
function drawWaffle(gr, t, x, y, w, h, sc, colour, reveal = 1) {
    const X = x + w / 2, Y = y + h / 2, R = sc * 1.42, phi = waffleTurn(Math.max(0, t || 0)), k = Math.cos(phi), sd = Math.sin(phi);
    const lw = Math.max(1, .9 * SCALE), px = v => X + v * R * k, py = v => Y + v * R, flat = pts => pts.flatMap(([a, b]) => [px(a), py(b)]);
    // the edge: slats from the face's rim back to the other face, on the side turning towards the viewer
    if (Math.abs(sd) > .02) {
        // the other face lies `off` px aside; the slats stand on the half of the rim that faces that way
        const off = -WAFFLE.depth * R * sd, side = Math.sign(off) * Math.sign(k || 1);
        WAFFLE.rim.forEach(([a, b], i) => {
            const f = WAFFLE.nx[i] * side;
            if (i % 2 || f <= .05) return;
            gr.DrawLine(px(a), py(b), px(a) + off, py(b), lw, withAlpha(colour, .35 + .45 * f));
        });
    }
    // the face: a faint body, the rim, the crust's ring and the pockets (fewer while it is revealed)
    const rim = flat(WAFFLE.rim);
    gr.FillPolygon(withAlpha(colour, WAFFLE.body), 0, rim);
    gr.DrawPolygon(colour, lw, rim);
    if (Math.abs(k) > .08) {
        gr.DrawPolygon(withAlpha(colour, .55), Math.max(1, .7 * SCALE), flat(WAFFLE.ring));
        const n = Math.round(16 * clamp(reveal, 0, 1));
        for (let i = 0; i < n; i++) gr.FillPolygon(withAlpha(colour, WAFFLE.pocket), 0, flat(WAFFLE.pockets[i].pts));
    }
}

// RING: the Möbius ring's centreline (art/mobius.py, two circles of radius 1 with
// centres at ±1.42 joined by tangent diagonals) carries a twisting ribbon drawn as ~110 short slats, shaded by how
// much each slat faces the viewer. Monochrome on the inverse plate; it turns slowly while music plays.

// centreline sampled by arc length: u = 0 on the back `/` branch heading up-right, u = π on the front `\` branch
const INF = (() => {
    const R = 1, Cx = 1.42, th = Math.asin(R / Cx), t = Math.sqrt(Cx * Cx - R * R), ct = Math.cos(th), st = Math.sin(th), sw = Math.PI + 2 * th;
    const pc = [["L", 0, 0, t * ct, t * st], ["A", Cx, 0, Math.PI / 2 + th, -sw], ["L", t * ct, -t * st, 0, 0],
                ["L", 0, 0, -t * ct, t * st], ["A", -Cx, 0, Math.PI / 2 - th, sw], ["L", -t * ct, -t * st, 0, 0]];
    const len = pc.map(p => p[0] === "L" ? t : R * Math.abs(p[4])), L = len.reduce((a, b) => a + b), N = 1440, out = [];
    for (let i = 0; i < N; i++) {
        let s = i / N * L, k = 0;
        while (s > len[k] && k < 5) s -= len[k++];
        const p = pc[k], f = s / len[k];
        out.push(p[0] === "L" ? [p[1] + (p[3] - p[1]) * f, -(p[2] + (p[4] - p[2]) * f)]
                              : [p[1] + R * Math.cos(p[3] + p[4] * f), -(p[2] + R * Math.sin(p[3] + p[4] * f))]);
    }
    return out;
})();

// draws the emblem centred in (x, y, w, h); t = seconds of animation time, sc = px per unit, reveal 0..1
function drawMobius(gr, t, x, y, w, h, sc, colour, reveal = 1) {
    const N = Math.max(4, Math.floor(110 * reveal)), cy_ = Math.cos(.5 * Math.sin(t * .2)), sy_ = Math.sin(.5 * Math.sin(t * .2));
    const cp = Math.cos(.32), spn = Math.sin(.32), segs = [], X = x + w / 2, Y = y + h / 2;
    const rot = (a, b, c) => { const x1 = a * cy_ + c * sy_, z1 = -a * sy_ + c * cy_; return [x1, b * cp - z1 * spn, b * spn + z1 * cp]; };
    const at = u => { const n = INF.length, q = INF[Math.floor(((u / TAU) % 1 + 1) % 1 * n) % n]; return [q[0] * .67, -q[1] * .67, -Math.cos(u) * .55]; };
    for (let i = 0; i < N; i++) {
        const u = i / 110 * TAU, [px, py, pz] = at(u), p1 = at(u + .02), p0 = at(u - .02);
        let tx = p1[0] - p0[0], ty = p1[1] - p0[1], tz = p1[2] - p0[2];
        const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
        let bx = ty, by = -tx;
        const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
        const nx = by * tz, ny = -bx * tz, nz = bx * ty - by * tx;
        const th = u * 1.5 + t * .32, c = Math.cos(th), s = Math.sin(th), dx = bx * c + nx * s, dy = by * c + ny * s, dz = nz * s, rw = .34;
        const A = rot(px + dx * rw, py + dy * rw, pz + dz * rw), B = rot(px - dx * rw, py - dy * rw, pz - dz * rw);
        const sn = rot(ty * dz - tz * dy, tz * dx - tx * dz, tx * dy - ty * dx);
        segs.push({ ax: X + A[0] * sc, ay: Y - A[1] * sc, bx: X + B[0] * sc, by: Y - B[1] * sc, z: (A[2] + B[2]) / 2, f: Math.abs(sn[2]) });
    }
    segs.sort((a, b) => b.z - a.z);
    const lw = Math.max(1, 0.9 * SCALE);
    for (const sg of segs) gr.DrawLine(sg.ax, sg.ay, sg.bx, sg.by, lw, withAlpha(colour, .3 + .7 * Math.pow(sg.f, .7)));
}
