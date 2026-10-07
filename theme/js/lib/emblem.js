"use strict";
// The header plate's small vector Möbius emblem: the ring's centreline (art/mobius.py, two circles of radius 1 with
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
function drawEmblem(gr, t, x, y, w, h, sc, colour, reveal = 1) {
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
