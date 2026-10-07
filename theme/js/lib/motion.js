"use strict";
// Motion: one animation clock per panel, critically damped springs, easing, title scramble and rolling digits.
//
// Rules: the clock runs only while something moves and stops by itself when every animation has
// settled; with Reduce motion everything jumps to its end state.

let REDUCE_MOTION = false;

const easeOut = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);                 // ≈ cubic-bezier(.16, 1, .3, 1)
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// gentler than easeOut: at the ≈ 64 fps the default timer allows, the first frames move less than a tenth of the way
const easeOutCubic = t => t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);

// Spring: { x, v, to }. step() returns true while it still moves.
function Spring(x = 0, w = 16) { return { x, v: 0, to: x, w }; }
function stepSpring(s, dt) {
    if (REDUCE_MOTION) { s.x = s.to; s.v = 0; return false; }
    const a = s.w * s.w * (s.to - s.x) - 2 * s.w * s.v;
    s.v += a * dt;
    s.x += s.v * dt;
    if (Math.abs(s.to - s.x) < 0.01 && Math.abs(s.v) < 0.05) { s.x = s.to; s.v = 0; return false; }
    return true;
}

// Clock(update): update(dt, now) is called every frame and returns true while anything still moves; the clock then
// schedules the next frame, otherwise it stops. Call clock.wake() whenever a new animation starts.
// The default Windows timer ticks every 15.6 ms; frames are requested at that rate (≈ 60 fps when the high-resolution
// timer option is on, ≈ 32–64 fps otherwise) and dt is measured, so motion speed does not depend on the frame rate.
function Clock(update) {
    let running = false, last = 0;
    const tick = () => {
        const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        let more = false;
        try { more = update(dt, now); } catch (e) { console.log("audio-archive clock: " + e); }
        if (more) window.SetTimeout(tick, 8); else running = false;
    };
    return {
        wake() { if (running) return; running = true; last = performance.now(); window.SetTimeout(tick, 1); },
        get running() { return running; },
    };
}

// Tween over a fixed duration: { t0, dur } -> progress 0..1
const Tween = (dur) => ({ t0: performance.now(), dur });
const tweenK = tw => REDUCE_MOTION ? 1 : clamp((performance.now() - tw.t0) / tw.dur, 0, 1);

// Title scramble-resolve: letters resolve left to right, the rest cycles through terminal glyphs (440 ms).
const SCRAMBLE_GLYPHS = "#%&/\\|=+<>01_-";
function Scramble(text, dur = 440) { return { text, tw: Tween(dur), seed: text.length * 31 + 7 }; }
function scrambleText(sc) {
    const k = tweenK(sc.tw);
    if (k >= 1) return sc.text;
    const chars = [...sc.text], n = Math.floor(easeOut(k) * chars.length);
    let r = sc.seed + Math.floor(performance.now() / 50);
    return chars.map((ch, i) => {
        if (i < n || ch === " ") return ch;
        r = (r * 1103515245 + 12345) & 0x7fffffff;
        return SCRAMBLE_GLYPHS[r % SCRAMBLE_GLYPHS.length];
    }).join("");
}
const scrambleDone = sc => tweenK(sc.tw) >= 1;

// Rolling digits: each digit that changed rolls up from the old value to the new one (460 ms).
function Roll(str) { return { from: str, to: str, tw: Tween(0) }; }
function setRoll(r, str) { if (str === r.to) return; r.from = r.to; r.to = str; r.tw = Tween(460); }
const rollDone = r => tweenK(r.tw) >= 1;
// draws r at (x, y) with a fixed-width font; each glyph cell is `cell` px wide and h px tall. Returns the width.
function drawRoll(gr, r, f, colour, x, y, cell, h) {
    const k = easeOut(tweenK(r.tw)), to = [...r.to], from = [...r.from.padStart(to.length).slice(-to.length)];
    gr.PushClip(x, y, cell * to.length + dp(2), h);
    to.forEach((ch, i) => {
        const cx = x + i * cell, old = from[i];
        if (k >= 1 || ch === old || !/\d/.test(ch)) { gr.DrawText(ch, f, colour, cx, y, cell + dp(2), h, DT_SINGLE); return; }
        const off = Math.round(h * k);
        gr.DrawText(old, f, colour, cx, y - off, cell + dp(2), h, DT_SINGLE);
        gr.DrawText(ch, f, colour, cx, y + h - off, cell + dp(2), h, DT_SINGLE);
    });
    gr.PopClip();
    return cell * to.length;
}
