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
    if (on) gr.FillSolidRect(x, y, s, s, C.accent); else box(gr, x, y, s, s, colour);
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
    };
}

// Vector icons for the transport (drawn shapes: Geist Mono lacks ▶ ■ in usable form at small sizes)
function icon(gr, name, cx, cy, size, colour) {
    const s = dp(size), x = Math.round(cx - s / 2), y = Math.round(cy - s / 2), u = s / 12;
    const poly = pts => gr.FillPolygon(colour, 0, pts.map((v, i) => i % 2 ? y + v * u : x + v * u));
    switch (name) {
        case "prev": gr.FillSolidRect(x, y + u, 2 * u, 10 * u, colour); poly([12, 1, 12, 11, 3, 6]); break;
        case "next": gr.FillSolidRect(x + 10 * u, y + u, 2 * u, 10 * u, colour); poly([0, 1, 0, 11, 9, 6]); break;
        case "play": poly([2, 1, 2, 11, 11, 6]); break;
        case "pause": gr.FillSolidRect(x + 2 * u, y + u, 3 * u, 10 * u, colour); gr.FillSolidRect(x + 7 * u, y + u, 3 * u, 10 * u, colour); break;
        case "stop": gr.FillSolidRect(x + u, y + u, 10 * u, 10 * u, colour); break;
    }
}

// chip: 1 dp border, letter-spaced caps; kind "" (line-faint border), "inv" (fg fill) or "acc"
// (orange border + orange square). Draws with its left edge at x, top at y on `bg`; returns its width.
function chip(gr, str, x, y, h, kind = "", size = 9.5, bg = C.panel) {
    const inv = kind === "inv", acc = kind === "acc", padX = dp(8), sq = acc ? dp(5) + dp(7) : 0;
    const st = { size, weight: inv || acc ? 600 : 500, track: .1, colour: inv ? C.bg : acc ? C.fg : C["fg-soft"], bg: inv ? C.fg : bg };
    const w = padX * 2 + sq + labelWidth(str, st);
    gr.FillSolidRect(x, y, w, h, inv ? C.fg : bg);
    box(gr, x, y, w, h, inv ? C.fg : acc ? C.accent : C["line-faint"]);
    if (acc) gr.FillSolidRect(x + padX, y + Math.round((h - dp(5)) / 2), dp(5), dp(5), C.accent);
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
