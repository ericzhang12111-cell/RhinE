"use strict";
// Placeholder for a view region (Phase 1): shows where the region sits and which phase fills it.
// The loader in the panel config defines REGION = { label, note } before including this file.

include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\tokens.js");

let W = 0, H = 0;
function on_size(w, h) { W = w; H = h; }

function on_paint(gr) {
    gr.FillSolidRect(0, 0, W, H, C.bg);
    const m = dp(1);
    gr.DrawRect(m / 2, m / 2, W - m, H - m, m, C.hair);
    if (W < dp(120)) return;   // a narrow strip (the rail): frame only
    gr.FillSolidRect(dp(12), dp(12), dp(18), dp(5), C.fg);
    gr.DrawText(REGION.label, font(10.5, 500), C.fg, dp(38), dp(6), W - dp(50), dp(18), DT_SINGLE);
    gr.DrawText(REGION.note, font(9, 500), C["text-muted"], dp(12), 0, W - dp(24), H, DT_SINGLE | 0x00000001);
    gr.DrawText(`${W} × ${H} PX`, font(9, 500), C["text-muted"], dp(12), H - dp(28), W - dp(24), dp(18), DT_RIGHT_SINGLE);
}

function on_colours_changed() { refreshTokens(); window.Repaint(); }
