"use strict";
// Grain: a seamless noise tile per mode (assets/grain-*.png) laid over
// everything a scripted panel draws, through one tiling bitmap brush, 1:1 in device pixels. It only darkens paper and
// only lightens void (≈ 2 levels on average, so the flat native playlist beside the panels shows no seam) and leaves
// content of the opposite tone almost untouched. Off when STATE.grain is false (MENU).

const GRAIN = { mode: "", brush: null };
function drawGrain(gr, x, y, w, h) {
    if (!STATE.grain || w <= 0 || h <= 0) return;
    if (GRAIN.mode !== MODE) {
        GRAIN.mode = MODE;
        try { GRAIN.brush = d2d.Brush(3, d2d.Image(THEME_ROOT + `assets\\grain-${MODE}.png`), 0); }
        catch (e) { GRAIN.brush = null; console.log("audio-archive grain: " + e); }
    }
    if (GRAIN.brush) gr.FillSolidRect(x, y, w, h, GRAIN.brush);
}
