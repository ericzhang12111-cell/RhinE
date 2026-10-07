"use strict";
// The track rail's hover card: a small panel above the playlist that frame.js moves next to the
// hovered rail line and shows only while the rail is hovered. manager.js sends its content with the "tip" message:
// a 6 dp orange bar and a 1 dp frame around FILE 009 · ALBUM, the title, and ARTIST · LENGTH.

include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\core.js");

const TST = { file: { size: 8.5, weight: 500, track: .12 }, meta: { size: 8.5, weight: 500, track: .12 } };
let W = 0, H = 0, tip = null;

onMessage("tip", t => { if (t) { tip = t; window.Repaint(); } });
function on_size(w, h) { W = w; H = h; }

function on_paint(gr) {
    gr.FillSolidRect(0, 0, W, H, C.bg);
    box(gr, 0, 0, W, H, C.fg);
    gr.FillSolidRect(0, 0, dp(6), H, C.accent);
    if (!tip) return;
    const x = dp(22), iw = W - x - dp(14);
    label(gr, fitLabel(tip.file, Object.assign({ colour: 0, bg: 0 }, TST.file), iw), Object.assign({ colour: C["text-muted"], bg: C.bg }, TST.file), x, dp(14));
    gr.DrawText(tip.title, fontFor(tip.title, 13, 700), C.fg, x, dp(30), iw - (tip.playing ? dp(14) : 0), dp(20), DT_SINGLE | DT_ELLIPSIS);
    if (tip.playing) gr.FillSolidRect(W - dp(20), dp(37), dp(6), dp(6), C.accent);   // the playing track (orange never sets text on paper)
    label(gr, fitLabel(tip.meta, Object.assign({ colour: 0, bg: 0 }, TST.meta), iw), Object.assign({ colour: C["text-muted"], bg: C.bg }, TST.meta), x, dp(54));
    drawGrain(gr, 0, 0, W, H);
}

function on_colours_changed() { refreshTokens(); window.Repaint(); }
