"use strict";
// Drawing primitives shared by the scripted panels and simple hit areas for the mouse.

// 1 dp hairline (horizontal / vertical), in whole device pixels so it stays crisp
const hline = (gr, x, y, w, colour = C.hair, t = HAIR) => gr.FillSolidRect(Math.round(x), Math.round(y), Math.round(w), t, colour);
const vline = (gr, x, y, h, colour = C.hair, t = HAIR) => gr.FillSolidRect(Math.round(x), Math.round(y), t, Math.round(h), colour);
// square mark of `size` dp centred on (cx, cy)
const square = (gr, cx, cy, size, colour) => { const s = dp(size); gr.FillSolidRect(Math.round(cx - s / 2), Math.round(cy - s / 2), s, s, colour); };

// registration cross: 11 dp, `mark` at 58 %, top-left corner at (x, y)
function regCross(gr, x, y) {
    const s = dp(11), c = withAlpha(C.mark, 0.58), m = Math.floor(s / 2);
    gr.FillSolidRect(x, y + m, s, HAIR, c);
    gr.FillSolidRect(x + m, y, HAIR, s, c);
}

// outline box (inside the rectangle)
function box(gr, x, y, w, h, colour, t = HAIR) {
    gr.FillSolidRect(x, y, w, t, colour); gr.FillSolidRect(x, y + h - t, w, t, colour);
    gr.FillSolidRect(x, y, t, h, colour); gr.FillSolidRect(x + w - t, y, t, h, colour);
}

// the theme's square toggle mark: 5 dp, filled orange when on, outlined when off
function toggleMark(gr, x, cy, on, colour) {
    const s = dp(5), y = Math.round(cy - s / 2);
    if (on) bullet(gr, x, y, s, C.accent); else box(gr, x, y, s, s, colour);   // (a pack's waffle square, below)
    return s;
}

// Hit areas: rebuilt while painting, queried by the mouse callbacks.
function Hits() {
    let list = [];
    return {
        clear() { list = []; },
        add(id, x, y, w, h, data) { list.push({ id, x, y, w, h, data }); },
        at(x, y) { for (let i = list.length - 1; i >= 0; i--) { const a = list[i]; if (x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h) return a; } return null; },
        get(id) { return list.find(a => a.id === id) || null; },
        size() { return list.length; },
        // the areas added since `from` cut to y0 … y1 (a part that scrolls: what is out of sight cannot be hit)
        clipY(from, y0, y1) {
            list = list.slice(0, from).concat(list.slice(from).filter(a => a.y < y1 && a.y + a.h > y0)
                .map(a => { const t = Math.max(a.y, y0); a.h = Math.min(a.y + a.h, y1) - t; a.y = t; return a; }));
        },
    };
}

// A part of the character pack in use (lib/pack.js) that names a look, such as pack.json "icons": "waffle", when it is
// one of `known`; else null (and always null with no pack, so nothing below changes then). Read once per pack: the
// shapes ask on every paint, and a pack's folder is not looked at again for each of them.
const PACK_LOOK = { pack: undefined, v: {} };
function packValue(key) {
    if (!STATE.pack) return null;
    if (PACK_LOOK.pack !== STATE.pack) { PACK_LOOK.pack = STATE.pack; PACK_LOOK.v = {}; }
    if (!(key in PACK_LOOK.v)) {
        let p = null;
        try { p = typeof packPart === "function" ? packPart(key) : null; } catch (e) { p = null; }
        PACK_LOOK.v[key] = p;
    }
    return PACK_LOOK.v[key];
}
const packLook = (key, known) => { const v = packValue(key); return typeof v === "string" && known.includes(v) ? v : null; };

// Vector icons (drawn shapes: Geist Mono lacks ▶ ■ in usable form at small sizes), in sets: "archive", the theme's own,
// and the sets a character pack may pick (pack.json "icons"). Two kinds of glyph:
//   on a 12-unit square  prev next play pause stop: (gr, x, y, u, colour), the square's top left at (x, y), u px a unit;
//                        icon() and iconPx() place them
//   in place             the header's menu (gr, x, cy, colour), gear (gr, cx, cy, colour), search (gr, cx, cy, colour),
//                        clear (gr, cx, cy, colour) and report (gr, x, cy, colour), each drawn where and as large as the
//                        header has always drawn it (glyph() gives the function)
// A set may leave a glyph out: the archive one stands in. The heart (lib/favourite.js) and the rating's marks
// (lib/rating.js) ask the set in use for theirs ("heart", "rate") and keep their own shapes when it has none.
const iconPoly = (gr, colour, x, y, u, pts) => gr.FillPolygon(colour, 0, pts.map((v, i) => i % 2 ? y + v * u : x + v * u));
const ICON_SETS = {
    archive: {
        prev: (gr, x, y, u, c) => { gr.FillSolidRect(x, y + u, 2 * u, 10 * u, c); iconPoly(gr, c, x, y, u, [12, 1, 12, 11, 3, 6]); },
        next: (gr, x, y, u, c) => { gr.FillSolidRect(x + 10 * u, y + u, 2 * u, 10 * u, c); iconPoly(gr, c, x, y, u, [0, 1, 0, 11, 9, 6]); },
        play: (gr, x, y, u, c) => iconPoly(gr, c, x, y, u, [2, 1, 2, 11, 11, 6]),
        pause: (gr, x, y, u, c) => { gr.FillSolidRect(x + 2 * u, y + u, 3 * u, 10 * u, c); gr.FillSolidRect(x + 7 * u, y + u, 3 * u, 10 * u, c); },
        stop: (gr, x, y, u, c) => gr.FillSolidRect(x + u, y + u, 10 * u, 10 * u, c),
        // three hairlines 14 dp wide, 4 dp apart
        menu: (gr, x, cy, c) => { const iy = cy - dp(4.5); for (const k of [0, 4, 8]) gr.FillSolidRect(x, iy + dp(k), dp(14), HAIR, c); },
        // a ring with eight short teeth
        gear: (gr, qx, qy, c) => {
            const qr = dp(3.5);
            gr.DrawEllipse(qx - qr, qy - qr, 2 * qr, 2 * qr, HAIR, c);
            for (let k = 0; k < 8; k++) {
                const t = k * Math.PI / 4, cs = Math.cos(t), sn = Math.sin(t);
                gr.DrawLine(qx + cs * dp(4.5), qy + sn * dp(4.5), qx + cs * dp(6.5), qy + sn * dp(6.5), Math.max(HAIR, dp(1.5)), c);
            }
        },
        // a magnifier, its lens centred on (gx, gy)
        search: (gr, gx, gy, c) => {
            const r = dp(3.5);
            gr.DrawEllipse(gx - r, gy - r, 2 * r, 2 * r, HAIR, c);
            gr.DrawLine(gx + r * .7, gy + r * .7, gx + r * 1.8, gy + r * 1.8, HAIR, c);
        },
        clear: (gr, gx, cy, c) => {
            const q = dp(3.5);
            gr.DrawLine(gx - q, cy - q, gx + q, cy + q, Math.max(HAIR, dp(1.2)), c);
            gr.DrawLine(gx - q, cy + q, gx + q, cy - q, Math.max(HAIR, dp(1.2)), c);
        },
        report: (gr, x, cy, c) => gr.FillSolidRect(x, cy - dp(4), dp(8), dp(8), c),
    },
};
// the set in use: the pack's (pack.json "icons") when there is such a set, else the archive's
const iconSetName = () => packLook("icons", Object.keys(ICON_SETS)) || "archive";
const glyph = name => ICON_SETS[iconSetName()][name] || ICON_SETS.archive[name];
// a glyph of the set in use that is not the archive's (null: draw the archive's own shape)
const packGlyph = name => { const n = iconSetName(); return n !== "archive" && ICON_SETS[n][name] || null; };
// a 12-unit icon `size` dp square centred on (cx, cy); iconPx: `s` px square
// (ground: the colour under it, for a glyph with an eye cut in, lib: MARKS below)
function icon(gr, name, cx, cy, size, colour, ground) { iconPx(gr, name, cx, cy, dp(size), colour, ground); }
function iconPx(gr, name, cx, cy, s, colour, ground) {
    const f = glyph(name);
    if (f) f(gr, Math.round(cx - s / 2), Math.round(cy - s / 2), s / 12, colour, ground);
}

// WAFFLE (the SWEETPIE pack): the same glyphs cut into waffle cells. A shape is split along a few lines into pieces
// with narrow gaps between them, so the ground shows through as the ridges between a waffle's pockets: no hole is ever
// painted, and the glyph sits on any ground. Pieces are worked out once per gap width (in units) and kept.
//   a convex polygon clipped to the half-plane a·x + b·y <= c (Sutherland–Hodgman), points as a flat array
function clipHalf(pts, a, b, c) {
    const out = [], n = pts.length / 2;
    for (let i = 0; i < n; i++) {
        const px = pts[2 * i], py = pts[2 * i + 1], j = (i + 1) % n, qx = pts[2 * j], qy = pts[2 * j + 1];
        const dp0 = a * px + b * py - c, dq = a * qx + b * qy - c;
        if (dp0 <= 0) out.push(px, py);
        if ((dp0 < 0 && dq > 0) || (dp0 > 0 && dq < 0)) { const f = dp0 / (dp0 - dq); out.push(px + (qx - px) * f, py + (qy - py) * f); }
    }
    return out;
}
// a convex polygon (corners [[x, y], …]) with each corner rounded off by r (at most a third of its shorter side)
function roundPoly(corners, r, steps = 4) {
    const out = [], n = corners.length;
    for (let i = 0; i < n; i++) {
        const [px, py] = corners[(i + n - 1) % n], [cx, cy] = corners[i], [nx, ny] = corners[(i + 1) % n];
        const l1 = Math.hypot(px - cx, py - cy), l2 = Math.hypot(nx - cx, ny - cy), rr = Math.min(r, l1 / 3, l2 / 3);
        const ax = cx + (px - cx) / l1 * rr, ay = cy + (py - cy) / l1 * rr, bx = cx + (nx - cx) / l2 * rr, by = cy + (ny - cy) / l2 * rr;
        // a quadratic curve from a to b with the corner as its control point
        for (let k = 0; k <= steps; k++) {
            const t = k / steps, m = 1 - t;
            out.push(m * m * ax + 2 * m * t * cx + t * t * bx, m * m * ay + 2 * m * t * cy + t * t * by);
        }
    }
    return out;
}
// the pieces of `poly` cut along x = each of xs and y = each of ys, `gap` units wide at each cut
function cellCut(poly, xs, ys, gap) {
    const g = gap / 2, bx = [-1e3, ...xs, 1e3], by = [-1e3, ...ys, 1e3], out = [];
    for (let i = 0; i + 1 < bx.length; i++) for (let j = 0; j + 1 < by.length; j++) {
        let p = poly;
        if (i > 0) p = clipHalf(p, -1, 0, -(bx[i] + g));
        if (i + 2 < bx.length) p = clipHalf(p, 1, 0, bx[i + 1] - g);
        if (j > 0) p = clipHalf(p, 0, -1, -(by[j] + g));
        if (j + 2 < by.length) p = clipHalf(p, 0, 1, by[j + 1] - g);
        if (p.length >= 6) out.push(p);
    }
    return out;
}
// the waffle glyphs' pieces, in units, by name and gap
const WAFFLE_PIECES = new Map();
const WAFFLE_SHAPES = {
    // a rounded square of four pockets
    stop: g => cellCut(roundPoly([[1, 1], [11, 1], [11, 11], [1, 11]], 2.2), [6], [6], g),
    // two bars of two pockets each
    pause: g => [[1.6, 5], [7, 10.4]].flatMap(([a, b]) => cellCut(roundPoly([[a, 1], [b, 1], [b, 11], [a, 11]], 1.3), [], [6], g)),
    // a rounded triangle with a ridge down its back
    play: g => cellCut(roundPoly([[1.8, .8], [11.4, 6], [1.8, 11.2]], 1.6, 5), [5.2], [], g),
    // a bar of two pockets and a rounded triangle
    prev: g => [...cellCut(roundPoly([[0, 1], [2.4, 1], [2.4, 11], [0, 11]], 1), [], [6], g), roundPoly([[12, 1], [12, 11], [3.4, 6]], 1.3, 5)],
    next: g => WAFFLE_SHAPES.prev(g).map(p => p.map((v, i) => i % 2 ? v : 12 - v)),
};
function wafflePieces(name, u) {
    // the ridges: a unit wide, but never under 1.1 px, so they stay open on a small icon
    const g = Math.round(Math.max(1, 1.1 / Math.max(u, .1)) * 20) / 20, key = name + "|" + g;
    let p = WAFFLE_PIECES.get(key);
    if (!p) { p = WAFFLE_SHAPES[name](g); WAFFLE_PIECES.set(key, p); }
    return p;
}
const waffleIcon = name => (gr, x, y, u, c) => { for (const p of wafflePieces(name, u)) iconPoly(gr, c, x, y, u, p); };
// a square of 2 × 2 pockets, `s` px, its top left at (x, y), on whole pixels (the header's small marks)
function waffleSquare(gr, x, y, s, c) {
    const g = Math.max(1, Math.round(s * .16)), a = Math.floor((s - g) / 2), b = s - g - a;
    gr.FillSolidRect(x, y, a, a, c); gr.FillSolidRect(x + a + g, y, b, a, c);
    gr.FillSolidRect(x, y + a + g, a, b, c); gr.FillSolidRect(x + a + g, y + a + g, b, b, c);
}
ICON_SETS.waffle = {
    prev: waffleIcon("prev"), next: waffleIcon("next"), play: waffleIcon("play"), pause: waffleIcon("pause"), stop: waffleIcon("stop"),
    // the "waffle menu": 3 × 3 pockets in the box of the three lines
    menu: (gr, x, cy, c) => {
        const s = dp(3), g = Math.max(1, dp(2.5)), y0 = Math.round(cy - dp(.5) - (3 * s + 2 * g) / 2);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) gr.FillSolidRect(x + i * (s + g), y0 + j * (s + g), s, s, c);
    },
    // a square lens with a ridge across it, and the handle
    search: (gr, gx, gy, c) => {
        const r = dp(3.3), t = HAIR;
        box(gr, Math.round(gx - r), Math.round(gy - r), Math.round(2 * r), Math.round(2 * r), c, t);
        gr.FillSolidRect(Math.round(gx - r), Math.round(gy - t / 2), Math.round(2 * r), t, c);
        gr.FillSolidRect(Math.round(gx - t / 2), Math.round(gy - r), t, Math.round(2 * r), c);
        gr.DrawLine(gx + r, gy + r, gx + r * 1.85, gy + r * 1.85, Math.max(HAIR, dp(1.5)), c);
    },
    report: (gr, x, cy, c) => waffleSquare(gr, x, cy - dp(4), dp(8), c),
};

// SWEETPIE's own marks, beside the waffle glyphs: her three-headed dog's head (a cookie dog seen side on, facing right:
// two pointed ears, a tuft at the back, the jaws open on a row of teeth) and the round honey waffle. The dog plays (the
// play key, the playhead running after a waffle at the line's end, the playing row), the waffle stands in for the
// theme's small squares. Shapes in units of a 12-unit square, as the glyphs above; a small one (under DOG_FULL px)
// has the plain outline, without the teeth, which would only blur there. The eye is painted in `ground` (the colour
// under the glyph) when the caller knows it and the head is large enough to show it.
const DOG_FULL = 17, DOG_EYE = 13;
// The outlines as paths: [x, y] a corner, [qx, qy, x, y] a curve to (x, y) with (qx, qy) as its control point.
function pathPts(spec, steps = 5) {
    const out = [];
    for (const p of spec) {
        if (p.length === 2) { out.push(p[0], p[1]); continue; }
        const x0 = out[out.length - 2], y0 = out[out.length - 1];
        for (let k = 1; k <= steps; k++) {
            const t = k / steps, m = 1 - t;
            out.push(m * m * x0 + 2 * m * t * p[0] + t * t * p[2], m * m * y0 + 2 * m * t * p[1] + t * t * p[3]);
        }
    }
    return out;
}
const DOG_JAW = [[11.5, 8.8, 10.8, 9.7], [10.2, 10.8, 8, 10.9], [5.5, 11.3, 3.2, 11]];
const DOG_BACK = [[.3, 5, 1.4, 3.6], [1.9, .9], [3.9, 2.7], [5.8, .2], [7.1, 3], [8.6, 3, 10.4, 3.9], [12, 4.4, 11.8, 5.6]];
const DOG = {
    // two tufts at the back, two teeth in each jaw
    full: pathPts([[3.2, 11], [1.9, 10.3], [.3, 9.9], [1.3, 8.9], [.1, 8], [1, 7.2], ...DOG_BACK,
        [11.2, 5.9], [10.65, 6], [10.25, 7.25], [9.75, 6.15], [9.3, 7.3], [8.85, 6.3], [6.9, 7],
        [8.6, 8.35], [9.05, 7.15], [9.5, 8.45], [10.05, 7.35], [10.4, 8.5], [10.9, 8.5], ...DOG_JAW]),
    lite: pathPts([[3.2, 11], [1.3, 10.3], [.2, 9.4], [.9, 8.4], ...DOG_BACK, [11, 6], [6.9, 7.2], [11, 8.5], ...DOG_JAW]),
    eye: (() => { const o = []; for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; o.push(7.1 + .72 * Math.cos(t), 4.9 + .8 * Math.sin(t)); } return o; })(),
};
// unit points -> px: about (6, 6) of a 12-unit square `s` px centred on (cx, cy), mirrored (flip) and turned by `a` rad
function unitPts(pts, cx, cy, s, flip = false, a = 0) {
    const u = s / 12, cs = Math.cos(a), sn = Math.sin(a), out = [];
    for (let i = 0; i < pts.length; i += 2) {
        const x = (flip ? 6 - pts[i] : pts[i] - 6) * u, y = (pts[i + 1] - 6) * u;
        out.push(cx + x * cs - y * sn, cy + x * sn + y * cs);
    }
    return out;
}
function dogHead(gr, cx, cy, s, c, ground, flip = false, a = 0) {
    gr.FillPolygon(c, 0, unitPts(s >= dp(DOG_FULL) ? DOG.full : DOG.lite, cx, cy, s, flip, a));
    if (ground != null && s >= dp(DOG_EYE)) gr.FillPolygon(ground, 0, unitPts(DOG.eye, cx, cy, s, flip, a));
}
// the round waffle: a scalloped disc cut into 3 × 3 pieces (2 × 2 when small), in units
const WAFFLE_DISC = (() => {
    const pts = [], N = 60;
    for (let i = 0; i < N; i++) {
        const t = i / N * Math.PI * 2, r = 5.6 - .45 * (1 - Math.abs(Math.cos(5 * t)));   // 10 round bumps
        pts.push(6 + r * Math.cos(t), 6 + r * Math.sin(t));
    }
    return pts;
})();
const DISC_PIECES = new Map();
function waffleDisc(gr, cx, cy, s, c) {
    const u = s / 12, three = s >= dp(12), g = Math.round(Math.max(three ? .9 : 1.1, 1.05 / Math.max(u, .1)) * 20) / 20, key = three + "|" + g;
    let p = DISC_PIECES.get(key);
    if (!p) { p = three ? cellCut(WAFFLE_DISC, [4.3, 7.7], [4.3, 7.7], g) : cellCut(WAFFLE_DISC, [6], [6], g); DISC_PIECES.set(key, p); }
    for (const q of p) iconPoly(gr, c, cx - s / 2, cy - s / 2, u, q);
}
// a bar of waffle pockets (the status line's mark), x, y, w, h px, whole pixels
function waffleStrip(gr, x, y, w, h, c, n = 3) {
    const g = Math.max(1, Math.round(h * .3)), cw = (w - (n - 1) * g) / n;
    for (let i = 0; i < n; i++) { const a = Math.round(x + i * (cw + g)), b = Math.round(x + i * (cw + g) + cw); gr.FillSolidRect(a, y, b - a, h, c); }
}

// The view tabs' own icons (header.js), 12-unit glyphs as the keys': ARCHIVE the round waffle, PLAYLISTS a list of
// waffle bullets, LYRICS a speech bubble with its lines as ridges, SIGNAL a waffle meter, ONLINE the dog calling out,
// STYLE a honey dipper.
const VIEW_GLYPHS = (() => {
    const rot = (pts, a, tx, ty) => { const cs = Math.cos(a), sn = Math.sin(a), o = []; for (let i = 0; i < pts.length; i += 2) o.push(tx + pts[i] * cs - pts[i + 1] * sn, ty + pts[i] * sn + pts[i + 1] * cs); return o; };
    const arc = (cx, cy, r0, r1, a0, a1, n = 8) => {
        const o = [];
        for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; o.push(cx + r1 * Math.cos(t), cy + r1 * Math.sin(t)); }
        for (let i = n; i >= 0; i--) { const t = a0 + (a1 - a0) * i / n; o.push(cx + r0 * Math.cos(t), cy + r0 * Math.sin(t)); }
        return o;
    };
    const ellipse = (rx, ry, n = 20) => { const o = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; o.push(rx * Math.cos(t), ry * Math.sin(t)); } return o; };
    return {
        // the round waffle (the pack's case)
        archive: g => cellCut(WAFFLE_DISC, [4.3, 7.7], [4.3, 7.7], g),
        // three rows: a waffle bullet and its line
        playlists: g => [1.3, 5, 8.7].flatMap(y => [roundPoly([[.6, y], [3.2, y], [3.2, y + 2.6], [.6, y + 2.6]], .6, 2),
            roundPoly([[4.8, y + .4], [11.4, y + .4], [11.4, y + 2.2], [4.8, y + 2.2]], .5, 2)]),
        // a speech bubble, its lines cut across it as ridges, and its tail
        lyrics: g => [...cellCut(roundPoly([[.6, 1.2], [11.4, 1.2], [11.4, 8.6], [.6, 8.6]], 2.2, 4), [], [3.8, 6.1], g),
            [2.6, 8.6 - .05, 6.2, 8.6 - .05, 2.4, 11.4]],
        // five bars of a meter, each a column of pockets
        signal: g => [[.6, 6.5], [3, 2.2], [5.4, 4.4], [7.8, .8], [10.2, 5.4]].flatMap(([x, top]) =>
            cellCut(roundPoly([[x, top], [x + 1.8, top], [x + 1.8, 11.4], [x, 11.4]], .5, 2), [], [8.2, 5].filter(y => y > top + 1.6), g)),
        // the dog, calling out: its head and two arcs from its open mouth
        online: () => [unitPts(DOG.lite, 3.6, 6.6, 8), arc(6.9, 7.2, 1.9, 2.9, -.8, .8), arc(6.9, 7.2, 3.7, 4.7, -.72, .72)],
        // a honey dipper: the handle, and a ribbed bulb at its end
        style: g => {
            const a = -Math.PI / 4, cx = 7.4, cy = 4.6;
            const bulb = cellCut(ellipse(3.3, 2.5), [-1.15, 1.15], [], g).map(p => rot(p, a, cx, cy));
            const tip = rot(roundPoly([[3, -.9], [4.4, -.9], [4.4, .9], [3, .9]], .4, 2), a, cx, cy);
            const handle = rot(roundPoly([[-10.2, -.75], [-3.4, -.75], [-3.4, .75], [-10.2, .75]], .6, 2), a, cx, cy);
            return [...bulb, tip, handle];
        },
    };
})();
const VIEW_PIECES = new Map();
// a view's icon `s` px square centred on (cx, cy); false when the set in use has none (the tab keeps its number)
function viewGlyph(gr, view, cx, cy, s, c) {
    if (iconSetName() !== "waffle" || !VIEW_GLYPHS[view]) return false;
    const u = s / 12, g = Math.round(Math.max(.8, 1.05 / Math.max(u, .1)) * 20) / 20, key = view + "|" + g;
    let p = VIEW_PIECES.get(key);
    if (!p) { p = VIEW_GLYPHS[view](g); VIEW_PIECES.set(key, p); }
    for (const q of p) iconPoly(gr, c, Math.round(cx - s / 2), Math.round(cy - s / 2), u, q);
    return true;
}

// The theme's small marks, by name, as the set in use draws them; each returns true when it drew one, and false under a
// set without that mark, where the caller draws its own (so with no pack, nothing changes):
//   mark(gr, "dog" | "dogL" | "dogUp" | "waffle", cx, cy, s, colour, ground)   centred on (cx, cy), s px
//   bullet(gr, x, y, s, colour)    the small solid square (section heads, corner brackets, chips, toggles): a waffle
//                                  square of 2 × 2 pockets under the pack, else the square itself
const MARKS = {
    waffle: {
        dog: (gr, cx, cy, s, c, ground) => dogHead(gr, cx, cy, s, c, ground),
        dogL: (gr, cx, cy, s, c, ground) => dogHead(gr, cx, cy, s, c, ground, true),
        // leaping up and to the right (OPEN ALBUM's arrow)
        dogUp: (gr, cx, cy, s, c, ground) => dogHead(gr, cx, cy, s, c, ground, false, -.62),
        waffle: (gr, cx, cy, s, c) => waffleDisc(gr, cx, cy, s, c),
    },
};
function mark(gr, name, cx, cy, s, colour, ground) {
    const m = MARKS[iconSetName()], f = m && m[name];
    if (!f) return false;
    f(gr, cx, cy, s, colour, ground);
    return true;
}
function bullet(gr, x, y, s, colour) {
    if (iconSetName() === "waffle") waffleSquare(gr, x, y, s, colour); else gr.FillSolidRect(x, y, s, s, colour);
}
const packMarks = () => !!MARKS[iconSetName()];
const markAt = mark;   // (the same, for a panel with a local `mark` of its own: mini.js)

// the keys' glyphs under the pack: play is the dog (its open jaws point the way), next and previous the dog running at
// a waffle bar; pause and stop keep their waffle cells
Object.assign(ICON_SETS.waffle, {
    play: (gr, x, y, u, c, ground) => dogHead(gr, x + 6.3 * u, y + 6 * u, 12.4 * u, c, ground),
    next: (gr, x, y, u, c, ground) => {
        dogHead(gr, x + 4.6 * u, y + 6 * u, 9.6 * u, c, ground);
        for (const p of wafflePieces("barR", u)) iconPoly(gr, c, x, y, u, p);
    },
    prev: (gr, x, y, u, c, ground) => {
        dogHead(gr, x + 7.4 * u, y + 6 * u, 9.6 * u, c, ground, true);
        for (const p of wafflePieces("barL", u)) iconPoly(gr, c, x, y, u, p);
    },
});
WAFFLE_SHAPES.barL = g => cellCut(roundPoly([[0, 1], [2.4, 1], [2.4, 11], [0, 11]], 1), [], [6], g);
WAFFLE_SHAPES.barR = g => WAFFLE_SHAPES.barL(g).map(p => p.map((v, i) => i % 2 ? v : 12 - v));

// chip: 1 dp border, letter-spaced caps; kind "" (line-faint border), "inv" (fg fill) or "acc"
// (orange border + orange square). Draws with its left edge at x, top at y on `bg`; returns its width.
function chip(gr, str, x, y, h, kind = "", size = 9.5, bg = C.panel) {
    const inv = kind === "inv", acc = kind === "acc", padX = dp(8), sq = acc ? dp(5) + dp(7) : 0;
    const st = { size, weight: inv || acc ? 600 : 500, track: .1, colour: inv ? C.bg : acc ? C.fg : C["fg-soft"], bg: inv ? C.fg : bg };
    const w = padX * 2 + sq + labelWidth(str, st);
    gr.FillSolidRect(x, y, w, h, inv ? C.fg : bg);
    box(gr, x, y, w, h, inv ? C.fg : acc ? C.accent : C["line-faint"]);
    if (acc) bullet(gr, x + padX, y + Math.round((h - dp(5)) / 2), dp(5), C.accent);
    label(gr, str, st, x + padX + sq, y + Math.round((h - labelHeight(st)) / 2));
    return w;
}

// Rendered sprites carry the theme orange (the ring's inlay, the rail's light strip and stripes, the boot film). Under
// another colour scheme they are hue-rotated about the grey axis to the scheme's accent: greys and whites keep their
// tone, the orange turns. accentEffect(img) gives the effect (null under ARCHIVE), accentShift(img) a cached copy.
const ORANGE_HUE = 28.7;   // hue of #ff7a01
function hueOf(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return ORANGE_HUE;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
}
// the rotation for the active scheme, from its dark accent (a light set's accent may be white, as on FLARE's page)
function accentTurn() {
    let deg = hueOf(TOKENS.schemes[SCHEME].dark.accent) - ORANGE_HUE;
    if (deg > 180) deg -= 360; else if (deg < -180) deg += 360;
    return Math.abs(deg) < 2 ? 0 : deg;
}
function hueMatrix(deg) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const m = [[.213 + .787 * c - .213 * s, .715 - .715 * c - .715 * s, .072 - .072 * c + .928 * s],
               [.213 - .213 * c + .143 * s, .715 + .285 * c + .140 * s, .072 - .072 * c - .283 * s],
               [.213 - .213 * c - .787 * s, .715 - .715 * c + .715 * s, .072 + .928 * c + .072 * s]];
    // Direct2D's colour matrix is 5 × 4, rows = input channel, columns = output channel
    return new Float32Array([m[0][0], m[1][0], m[2][0], 0, m[0][1], m[1][1], m[2][1], 0, m[0][2], m[1][2], m[2][2], 0, 0, 0, 0, 1, 0, 0, 0, 0]);
}
const ACCENT_FX = { deg: 0, fx: null };
function accentEffect(img) {
    const deg = accentTurn();
    if (!deg || !img) return null;
    if (!ACCENT_FX.fx || ACCENT_FX.deg !== deg) {
        ACCENT_FX.fx = d2d.Effect("{921F03D6-641C-47DF-852D-B4BB6153AE11}");
        ACCENT_FX.fx.SetValue(0, hueMatrix(deg));
        ACCENT_FX.deg = deg;
    }
    ACCENT_FX.fx.SetInput(0, img);
    return ACCENT_FX.fx;
}
const ACCENT_CACHE = new WeakMap();   // source image -> { deg, img }; an entry goes with its source image
function accentShift(img) {
    const fx = accentEffect(img);
    if (!fx) return img;
    const hit = ACCENT_CACHE.get(img);
    if (hit && hit.deg === ACCENT_FX.deg) return hit.img;
    const out = d2d.CreateImage(img.Width, img.Height), g = out.GetGraphics();
    g.DrawEffect(fx, 0, 0, 0, 0, img.Width, img.Height);
    out.ReleaseGraphics(g);
    ACCENT_CACHE.set(img, { deg: ACCENT_FX.deg, img: out });
    return out;
}

// The panels' halftone decoration, as chosen in 06 STYLE (STATE.halftone, STATE.halftoneLevel): across the bottom
// `height` px of a w × h area, fading upwards, or into its lower right corner; nothing when off.
// A character pack may ask for another pattern (pack.json "halftone": "grid", the SWEETPIE pack's waffle cells).
const HALFTONE_ALPHA = { low: [.09, .11], mid: [.17, .2], high: [.27, .3] };   // [dark, light]
function halftoneDecor(gr, w, h, height) {
    if (STATE.halftone === "off") return;
    const a = (HALFTONE_ALPHA[STATE.halftoneLevel] || HALFTONE_ALPHA.mid)[MODE === "dark" ? 0 : 1], c = withAlpha(C.fg, a), o = { pitch: 7, max: .9, gamma: 1.3 };
    if (packLook("halftone", ["grid"])) Object.assign(o, { pattern: "grid", pitch: 8, max: .74 });
    if (STATE.halftone === "corner") halftone(gr, w * .2, h - height, w * .8, height, c, Object.assign({ from: "br" }, o));
    else halftone(gr, 0, h - height, w, height, c, Object.assign({ from: "b" }, o));
}

// Halftone: dots on a staggered grid, largest at `from` (a corner "br" "bl" "tr" "tl", or an edge "r" "l" "b" "t") and
// shrinking to nothing across the area, as in the studio's halftone generator. pattern "grid": square cells on a
// square grid instead, like a waffle's pockets (whole pixels, so their edges stay sharp). Decoration under content:
// drawn once into an image per size, colour and settings (kept until the next of those), then copied.
const HALFTONE = new Map();
function halftone(gr, x, y, w, h, colour, { from = "br", pitch = 8, max = .78, gamma = 1.7, pattern = "dots" } = {}) {
    w = Math.round(w); h = Math.round(h);
    if (w < 4 || h < 4) return;
    const grid = pattern === "grid", key = `${w}|${h}|${colour}|${from}|${pitch}|${max}|${gamma}|${SCALE}` + (grid ? "|grid" : "");
    let img = HALFTONE.get(key);
    if (!img) {
        if (HALFTONE.size > 12) HALFTONE.clear();
        img = d2d.CreateImage(w, h);
        const g = img.GetGraphics(), p = dp(pitch), fx = from.includes("r") ? 1 : from.includes("l") ? 0 : -1, fy = from.includes("b") ? 1 : from.includes("t") ? 0 : -1;
        try {
            if (grid) for (let cy = p / 2; cy < h + p; cy += p) for (let cx = p / 2; cx < w + p; cx += p) {
                const dx = fx < 0 ? 0 : Math.abs(cx / w - fx), dy = fy < 0 ? 0 : Math.abs(cy / h - fy);
                const t = Math.pow(clamp(1 - (fx >= 0 && fy >= 0 ? Math.hypot(dx, dy) / Math.SQRT2 * 1.25 : dx + dy), 0, 1), gamma), s = Math.round(p * max * t);
                if (s >= 1) g.FillSolidRect(Math.round(cx - s / 2), Math.round(cy - s / 2), s, s, colour);
            }
            else for (let j = 0, cy = p / 2; cy < h + p; cy += p * .866, j++) for (let cx = (j % 2 ? p : p / 2); cx < w + p; cx += p) {
                // 1 at `from`, 0 at the far side (a corner: by distance; an edge: straight across)
                const dx = fx < 0 ? 0 : Math.abs(cx / w - fx), dy = fy < 0 ? 0 : Math.abs(cy / h - fy);
                const t = Math.pow(clamp(1 - (fx >= 0 && fy >= 0 ? Math.hypot(dx, dy) / Math.SQRT2 * 1.25 : dx + dy), 0, 1), gamma), r = p * max / 2 * t;
                if (r >= .35) g.FillEllipse(cx - r, cy - r, 2 * r, 2 * r, colour);
            }
        } finally { img.ReleaseGraphics(g); }
        HALFTONE.set(key, img);
    }
    gr.DrawImage(img, Math.round(x), Math.round(y), w, h, 0, 0, w, h);
}
