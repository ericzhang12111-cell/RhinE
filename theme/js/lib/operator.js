"use strict";
// The operator: a character pack's character standing at the edge of some views (pack.json "operator": { dir, views },
// lib/pack.js). Her idle loop is a folder of RGBA frames with operator.json beside them:
//   frames   how many (frame-001.png …)        fps   the rate (idle and clips)        size   [w, h] of an idle frame in px
//   file     the frames' name, with ### for the number (default "frame-###.png")
//   anchor   "bottom": the picture is cut at her legs, so she stands with its bottom edge on the view's
//   clips    (optional) short actions played now and then over the idle: [{ name, frames, file, from, to, box, when }]
//            file "toss-###.png"; from: the idle frame the clip takes over at (its first frames are already blended
//            from that pose); to: the idle frame it hands back to; box [x, y, w, h]: where its frames sit in idle-frame
//            pixels (x may be negative, w wider than the idle's); when "new" (played as a new track starts) or "any"
//   every    (optional) [lo, hi] seconds of playing between two clips (default [12, 25])
//   bob      (optional) 1: she breathes a little with the music's level (a tiny stretch from her feet)
// The view hands drawOperator the room she may take (stage.js, the Lyrics view: below the sung line, right of the
// lyrics' centre, down to the bottom edge) and draws her before its own content, so she never covers a lyric line.
// The idle and every clip share one canvas (the union of their boxes): its right edge stands on the room's right edge,
// so an arm thrown out in a clip never reaches past it.
// She fades in when the view is shown, plays while music plays, holds her pose while paused and stands still (idle
// frame 1, no clips, no bob) with Reduce motion. The idle frames are decoded in the background (four at a time, from
// the playhead on) and kept while the view is shown: 55 frames of 376 × 600 ≈ 50 MB. A clip's frames are streamed:
// a few ahead of its playhead are decoded and the ones behind let go (≈ 10 frames of 578 × 600 ≈ 14 MB at most).
// Everything is let go when the view or the pack is left.
// With no pack in use (or one without an operator) nothing here draws, loads or ticks.

const OP = {
    meta: null, metaOf: "",           // the operator.json read (opMeta), and the folder it was read from
    frames: [], framesOf: "", pending: 0, gen: 0,   // the idle frames (undefined: not asked, false: asked, null: failed) and their folder
    last: null, lastBox: null,        // the frame drawn last and its box (shown while the next one decodes)
    t: 0,                             // the idle loop's playhead in seconds (advances only while music plays)
    clip: null,                       // the clip playing: { c, t, frames: Map, pending }
    queued: null,                     // the clip waiting for the idle to reach its `from` frame: { c, frames: Map, pending }
    wait: 0,                          // seconds of playing left before the next clip is queued
    pt: -1,                           // the playback time last seen (a new track: it falls back to the start)
    level: 0, avg: 0, kick: 0,        // the music's smoothed level, its slow average and a beat's kick (the bob)
    seen: 0, fade0: 0,                // when she was last drawn, when she began to fade in
    rect: null,                       // where she was drawn, [x, y, w, h], repainted by the ticker
    timer: false, tickAt: 0,
};
const OP_AHEAD = 8;                   // clip frames decoded ahead of its playhead

// the pack's operator folder and its operator.json, or null
function opMeta() {
    const part = packPart("operator"), p = part && packOn();
    if (!p || typeof part !== "object") return null;
    const dir = packFile(part.dir || "operator", p);
    if (!dir) return null;
    const d = dir.replace(/\\*$/, "\\");
    if (OP.metaOf === d) return OP.meta;
    OP.metaOf = d; OP.meta = null;
    let j = null;
    try { j = JSON.parse(utils.ReadTextFile(d + "operator.json", 65001)); } catch (e) { j = null; }
    if (!j || typeof j !== "object") return null;
    const num = (v, lo, hi, def) => v !== null && v !== "" && Number.isFinite(+v) && +v >= lo && +v <= hi ? +v : def;
    const n = Math.round(num(j.frames, 1, 600, 0)), sz = Array.isArray(j.size) ? j.size : [];
    const w = num(sz[0], 1, 8192, 0), h = num(sz[1], 1, 8192, 0);
    if (!n || !w || !h) return null;
    const namer = (f, def) => {
        const file = typeof f === "string" && f.includes("#") ? f : def, digits = (file.match(/#+/) || ["###"])[0].length;
        return i => file.replace(/#+/, pad(i + 1, digits));
    };
    // the clips: any that is malformed is left out
    const clips = [];
    for (const c of Array.isArray(j.clips) ? j.clips : []) {
        if (!c || typeof c !== "object" || typeof c.file !== "string" || !c.file.includes("#")) continue;
        const cn = Math.round(num(c.frames, 1, 2000, 0)), b = Array.isArray(c.box) ? c.box.map(Number) : [0, 0, w, h];
        if (!cn || b.length !== 4 || !b.every(Number.isFinite) || !(b[2] > 0) || !(b[3] > 0)) continue;
        clips.push({ name: String(c.name || c.file), n: cn, file: namer(c.file, c.file), box: b,
                     from: Math.round(num(c.from, 0, n - 1, 0)), to: Math.round(num(c.to, 0, n - 1, 0)), when: c.when === "new" ? "new" : "any" });
    }
    // the canvas: the union of the idle's box and the clips'
    let cx0 = 0, cy0 = 0, cx1 = w, cy1 = h;
    for (const c of clips) { cx0 = Math.min(cx0, c.box[0]); cy0 = Math.min(cy0, c.box[1]); cx1 = Math.max(cx1, c.box[0] + c.box[2]); cy1 = Math.max(cy1, c.box[1] + c.box[3]); }
    const ev = Array.isArray(j.every) ? j.every : [];
    const lo = num(ev[0], 2, 3600, 12), hi = Math.max(lo, num(ev[1], 2, 3600, 25));
    OP.meta = { dir: d, n, fps: num(j.fps, 1, 60, 15), w, h, a: w / h, file: namer(j.file, "frame-###.png"),
                clips, every: [lo, hi], bob: num(j.bob, 0, 1, 0) > 0, canvas: [cx0, cy0, cx1 - cx0, cy1 - cy0],
                views: Array.isArray(part.views) ? part.views : ["lyrics"] };
    return OP.meta;
}

// let the frames go (the view or the pack was left); she fades in again when she is next shown, from her idle
function opRelease() {
    OP.gen++; OP.frames = []; OP.pending = 0; OP.last = null; OP.lastBox = null; OP.rect = null; OP.fade0 = 0;
    OP.clip = null; OP.queued = null;
}
onMessage("state", () => {
    if (!OP.frames.length && !OP.last) return;
    const M = opMeta();
    if (!M || STATE.mini || !M.views.includes(STATE.view)) opRelease();
});

// ask for the idle frames from i on (around the loop), four decoding at a time
function opWant(M, i) {
    if (OP.framesOf !== M.dir || OP.frames.length !== M.n) {   // first time, or another pack's operator
        opRelease();
        OP.frames = new Array(M.n).fill(undefined); OP.framesOf = M.dir;
    }
    const F = OP.frames, g = OP.gen;
    for (let k = 0; k < M.n && OP.pending < 4; k++) {
        const j = (i + k) % M.n;
        if (F[j] !== undefined) continue;
        F[j] = false;
        OP.pending++;
        const done = img => { if (g !== OP.gen) return; OP.frames[j] = img || null; OP.pending--; };
        d2d.LoadImageAsyncV2(0, M.dir + M.file(j)).then(done, () => done(null));
    }
}

// a clip's frames: the ones from i to i + OP_AHEAD asked for (three decoding at a time), the ones before i - 1 let go
function opClipWant(M, s, i) {
    const g = OP.gen;
    for (const k of [...s.frames.keys()]) if (k < i - 1) s.frames.delete(k);
    for (let k = i; k < Math.min(s.c.n, i + OP_AHEAD) && s.pending < 3; k++) {
        if (s.frames.has(k)) continue;
        s.frames.set(k, false);
        s.pending++;
        const done = img => { if (g !== OP.gen) return; if (s.frames.has(k)) s.frames.set(k, img || null); s.pending--; };
        d2d.LoadImageAsyncV2(0, M.dir + s.c.file(k)).then(done, () => done(null));
    }
}
// the first frames of a queued clip are in (decoded, or failed: it is then skipped)
const opReady = s => { for (let k = 0; k < Math.min(s.c.n, 4); k++) { const f = s.frames.get(k); if (f === undefined || f === false) return false; } return true; };

// queue a clip: "new" (a new track starts) prefers a clip made for that, otherwise any clip
function opQueue(M, why) {
    if (!M || !M.clips.length || OP.clip || REDUCE_MOTION) return;
    if (OP.queued && why !== "new") return;
    let list = M.clips.filter(c => c.when === why);
    if (!list.length) list = M.clips;
    const c = list[Math.floor(Math.random() * list.length) % list.length];
    if (OP.queued && OP.queued.c === c) return;
    OP.queued = { c, frames: new Map(), pending: 0 };
    opClipWant(M, OP.queued, 0);
}
const opRearm = M => { OP.wait = M.every[0] + Math.random() * (M.every[1] - M.every[0]); };
// (stage.js may call this from on_playback_new_track; a jump of the playback time back to the start does the same)
function opNewTrack() { const M = OP.meta; if (M && OP.rect) { opQueue(M, "new"); opRearm(M); } }

// advance the playheads by dt seconds of playing
function opAdvance(M, dt) {
    const T = M.n / M.fps;
    if (OP.clip) {
        const s = OP.clip, i = Math.floor(s.t * M.fps), f = s.frames.get(Math.min(i, s.c.n - 1));
        if (f === false) return;   // (the frame due is still decoding: wait for it rather than skip)
        s.t += dt;
        if (s.t * M.fps >= s.c.n) {   // over: back to the idle at the clip's hand-over frame
            OP.t = (s.c.to / M.fps + (s.t - s.c.n / M.fps)) % T;
            OP.clip = null; opRearm(M);
        }
        return;
    }
    const was = OP.t * M.fps;
    OP.t += dt;
    const q = OP.queued;
    if (q) {
        // the idle passes the clip's `from` frame: the clip takes over there (only once its first frames are in)
        let at = q.c.from;
        if (at < was) at += M.n;
        if (OP.t * M.fps >= at && opReady(q)) {
            OP.queued = null;
            if (q.frames.get(0)) { OP.clip = Object.assign(q, { t: Math.max(0, (OP.t * M.fps - at) / M.fps) }); OP.t = q.c.from / M.fps; return; }
        }
    }
    OP.t %= T;
    if (M.clips.length && !OP.clip && !OP.queued) { OP.wait -= dt; if (OP.wait <= 0) { opQueue(M, "any"); opRearm(M); } }
}

// the music's level for the bob (lib/audio.js, analysed by the stage's clock while the Lyrics view plays)
function opLevel(dt, playing) {
    let l = 0, s = 0;
    if (playing && typeof AUDIO === "object" && AUDIO.live) { l = clamp(Math.max(AUDIO.l || 0, AUDIO.r || 0), 0, 1); s = AUDIO.surge || 0; }
    OP.level += (l - OP.level) * clamp(dt * (l > OP.level ? 10 : 2.5), 0, 1);
    OP.avg += (OP.level - OP.avg) * clamp(dt * .4, 0, 1);   // (the bob follows the level's swells, not its loudness)
    if (s > .12 && OP.kick < .3) OP.kick = 1;
    OP.kick *= Math.pow(.02, dt);
}

// the ticker: at the clip/loop rate while she is shown and music plays (or she is still fading in, or frames are
// still coming in); it stops by itself when she has not been drawn for a moment (the view was left)
function opSchedule() {
    if (OP.timer) return;
    const M = OP.meta;
    if (!M) return;
    OP.timer = true; OP.tickAt = performance.now();
    window.SetTimeout(opTick, Math.max(16, Math.round(1000 / M.fps)));
}
function opTick() {
    OP.timer = false;
    const M = OP.meta, now = performance.now();
    if (!M || !OP.rect || now - OP.seen > 600) return;
    const playing = fb.IsPlaying && !fb.IsPaused && !REDUCE_MOTION, dt = clamp((now - OP.tickAt) / 1000, 0, .2);
    if (playing) {
        // a new track: the playback time falls back to its start
        const pt = fb.PlaybackTime;
        if (OP.pt > 1.5 && pt < 1) opNewTrack();
        OP.pt = pt;
        opAdvance(M, dt);
    }
    if (M.bob) opLevel(dt, playing);
    window.RepaintRect(...OP.rect);
    if (playing || opAlpha(now) < 1 || OP.level - OP.avg > .005 || OP.kick > .01 || OP.pending || (OP.queued && OP.queued.pending) || (OP.clip && OP.clip.pending)) opSchedule();
}
const opAlpha = now => REDUCE_MOTION || !OP.fade0 ? 1 : easeOutCubic(clamp((now - OP.fade0) / 700, 0, 1));

// Draws the operator for `view` in the room given: { x0, x1, y0, y1 } (her canvas stands with its right edge on x1 and
// its bottom on y1, no taller than y1 - y0; the idle part no wider than x1 - x0). Nothing when the pack has no operator
// for this view or there is too little room.
function drawOperator(gr, view, room) {
    if (!STATE.pack) return;
    const M = opMeta();
    if (!M || !M.views.includes(view) || !room) return;
    const x0 = +room.x0, x1 = +room.x1, y0 = +room.y0, y1 = +room.y1;
    if (![x0, x1, y0, y1].every(Number.isFinite)) return;
    const cv = M.canvas, right = cv[0] + cv[2] - M.w;   // the canvas's reach right of the idle's box (idle px)
    let h = Math.min(y1 - y0, M.h * 1.15 * Math.max(1, SCALE)), k = h / M.h;
    if ((M.w + right) * k > x1 - x0) { k = (x1 - x0) / (M.w + right); h = M.h * k; }
    if (!(h >= dp(160))) { OP.rect = null; return; }
    // the idle's box in the view (her clips are placed by their boxes against it)
    const ix = x1 - (M.w + right) * k, iy = y1 - h, now = performance.now();
    const still = REDUCE_MOTION;
    if (still) { OP.clip = null; OP.queued = null; }
    const i = still ? 0 : clamp(Math.floor(OP.t * M.fps), 0, M.n - 1);
    opWant(M, i);   // (first: on a new folder it starts over, rect and fade included)
    if (OP.pt < 0) { OP.pt = fb.PlaybackTime; opRearm(M); }
    OP.seen = now;
    // the frame due: the clip's, else the idle's (the last one drawn while it decodes)
    let img = null, box = null;
    if (OP.clip) {
        const s = OP.clip, ci = clamp(Math.floor(s.t * M.fps), 0, s.c.n - 1);
        opClipWant(M, s, ci);
        img = s.frames.get(ci) || null; box = s.c.box;
        if (s.frames.get(ci) === null) { OP.clip = null; img = null; opRearm(M); }   // (a frame failed: back to the idle)
    } else if (OP.queued) opClipWant(M, OP.queued, 0);
    if (!img) { img = OP.frames[i] || null; box = img ? [0, 0, M.w, M.h] : null; }
    if (img) { OP.last = img; OP.lastBox = box; } else { img = OP.last; box = OP.lastBox; }
    if (img && !OP.fade0) OP.fade0 = now;   // the fade in starts with her first decoded frame (opRelease resets it)
    const a = opAlpha(now);
    // the bob: a tiny stretch up from her feet as the music swells, and a little more on a beat (under 1.5 %)
    const bob = M.bob && !still ? .008 * clamp((OP.level - OP.avg) * 5, 0, 1) + .007 * OP.kick : 0, sy = 1 + bob, sx = 1 - bob * .35;
    const pivot = ix + M.w * k / 2;   // (her legs: the middle of the idle's box)
    if (img && box) {
        const dw = box[2] * k * sx, dh = box[3] * k * sy;
        const dx = pivot + ((box[0] - M.w / 2) * k) * sx, dy = y1 - (M.h - box[1]) * k * sy;
        gr.DrawImage(img, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh), 0, 0, img.Width, img.Height, 0, Math.round(a * 255));   // (opacity 0 - 255)
    }
    // the ticker repaints the whole canvas (with room for the bob)
    const pad2 = Math.ceil(h * .03) + 2;
    OP.rect = [Math.floor(ix + cv[0] * k) - pad2, Math.floor(iy + cv[1] * k) - pad2, Math.ceil(cv[2] * k) + 2 * pad2, Math.ceil(cv[3] * k) + 2 * pad2];
    // keep going: music playing, the fade, a frame still decoding, or the bob settling
    if ((fb.IsPlaying && !fb.IsPaused && !still) || a < 1 || !img || OP.pending || OP.level - OP.avg > .005 || OP.kick > .01) opSchedule();
}
