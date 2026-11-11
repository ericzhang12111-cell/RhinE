"use strict";
// 01 · ARCHIVE, ROOM layout (stage.js includes this after grid.js): the array seen as the artist file's room. The same
// shelves, selection and springs as the array (archive.js: archiveUpdate moves them), the cases in cream polymer drawn
// through a perspective camera, low along the shelves: each case is projected through the camera of
// assets/render/room/<mode>/room.json and drawn face by face (its front, top and near end, rendered at the distance
// nearest its own), each face fitted onto the case's own face as the camera sees it: seen this near edge-on, a case
// changes a lot across the view, and a sprite fitted as a whole bends its other faces out of line with the
// neighbours'. The shelves stand one behind the other, the selected one in the middle with two in front; a swell runs
// through the field around the selected case,
// highest there, and the cases near the mouse rise with their neighbours. Empty cases fill the room beyond the ends of
// the shelves (a little apart from their albums) and behind them: they hold no album, but they rise under the mouse as
// the others do, and a click on one goes to its shelf's album nearest it. The shelves behind sink into a haze (a
// blurred whole case in place of the faces, darker), so that shelves coming and going back there are not seen.
//   ← → (or the wheel): the album before / after · ↑ ↓: the shelf behind / in front
//   click a case: select it · double-click or Space: play the album · Enter: open it in the Archive playlist

const ROOM_ROOT = THEME_ROOT + "assets\\render\\room\\";
const ROOM = { mode: "", forMode: "", dir: "", meta: null, img: null, geo: null, hov: new Map(), under: null, want: new Set() };
const ROOM_BEHIND = 6, ROOM_FRONT = 2;   // shelves kept behind the selected one and in front of it
const ROOM_FILL = 9;                     // shelves shown behind it (beyond the ones kept: empty cases), the last two fading
const ROOM_SLOTS = [-70, 60];            // the places of a shelf shown, from its selected one (earlier albums: -)
const ROOM_FADE = [12, 2];               // over how many places the far end of the shelves fades, and over how many shelves the back
// the fog, the same in both modes (the renders' own differ): from START to START + DEPTH from the camera, up to MAX
// (never all the way, so the field ends where its shelves end, a straight edge, not where the fog swallows it)
const ROOM_FOG = { start: 24, depth: 55, max: .9 };
const ROOM_END_GAP = 1.5;                // places between a shelf's albums and the empty cases beyond them
const ROOM_PICK = 1.6;                   // how far the selected case rises out of the swell (room units): half its cover shows
const ROOM_HOVER = .6;                   // how far the case under the mouse rises (its neighbours less), at the selected case's distance
const ROOM_HAZE = [1.5, 3.5];            // the shelves behind go into the haze between these places
const ROOM_LIGHT_R = 9;                  // how far the light under the selected case reaches (room units)
// how much darker the cases away from it are: the floor's glow (cream, jade) a pool under the selection; the opaque
// cases' own lights (ROOM_LIGHTS) are in their sprites already (rendered under them), so none
const ROOM_LIGHT_FALL = { "": .75 };

// The room's assets: assets/render/room/<set>/<mode>/, the material chosen in 05 STYLE (ARCHIVE › ROOM: cream
// polymer, jade glass, or the white and blackout cases, each of those two in one of its lights: ROOM LIGHT; roomSet()
// in lib/bus.js), the dark ones when the mode has none.
function roomAssets() {
    const set = roomSet(), want = set + "|" + MODE;
    if (ROOM.forMode === want) return ROOM.meta;   // (looked for once per material and mode, not on every paint)
    ROOM.forMode = want;
    const has = (m, md) => utils.IsFile(`${ROOM_ROOT}${m}\\${md}\\room.json`);
    // (a set's other mode when it has none for this one: most were first rendered dark, RHINE LAB light)
    const other = MODE === "dark" ? "light" : "dark", mat = has(set, MODE) || has(set, other) ? set : "cream", k = `${mat}\\${has(mat, MODE) ? MODE : other}`;
    if (ROOM.mode === k) return ROOM.meta;
    ROOM.mode = k; ROOM.dir = `${ROOM_ROOT}${k}\\`; ROOM.geo = null;
    ARIMG.faded.clear();   // (the faded copies of the set before: a node set has hundreds)
    try {
        ROOM.meta = JSON.parse(utils.ReadTextFile(ROOM.dir + "room.json", 65001));
        ROOM.img = { plate: d2d.Image(ROOM.dir + "plate.jpg"), sel: d2d.Image(ROOM.dir + "sel.png"), rest: new Map(), node: new Map(),
            valley: ROOM.meta.valley && utils.IsFile(ROOM.dir + "valley.png") ? d2d.Image(ROOM.dir + "valley.png") : null };
    } catch (e) { ROOM.meta = ROOM.img = null; console.log("audio-archive room: " + e); }
    return ROOM.meta;
}
const roomOn = () => AR.layout === "room" && !!roomAssets();
const ROOM_FACES = [["side", "ADC"], ["top", "ABD"], ["front", "ABC"]];   // drawn in this order; fitted on these corners
// the case at rest rendered at the distance nearest d (by ratio), its faces read on first use
function roomLevel(d) {
    const L = ROOM.meta.levels;
    let n = 0;
    for (let i = 1; i < L.length; i++) if (Math.abs(Math.log(L[i].depth / d)) < Math.abs(Math.log(L[n].depth / d))) n = i;
    let img = ROOM.img.rest.get(n);
    if (!img) {
        img = {};
        for (const k of [...ROOM_FACES.map(([f]) => f), "haze"]) { try { img[k] = d2d.Image(`${ROOM.dir}rest-L${n}-${k}.png`); } catch (e) { img[k] = null; } }
        ROOM.img.rest.set(n, img);
    }
    return { S: L[n], img, name: "room-rest" + n };
}

// The nodes (the white and blackout cases, lit by lights of their own: room.json nodes): the case at rest rendered where
// it stands, at places all over the room (shelf s, place p), so that each case gets the light of its own place (its
// falloff, the glare off its top, the floor's glow), blended from the nodes round it. Per shelf its nodes by place.
function roomNodeIndex() {
    if (ROOM.nodeIdx && ROOM.nodeIdx.dir === ROOM.dir) return ROOM.nodeIdx.by;
    const by = new Map(), N = ROOM.meta.nodes || [];
    N.forEach((n, i) => { if (!by.has(n.s)) by.set(n.s, []); by.get(n.s).push(i); });
    for (const L of by.values()) L.sort((a, b) => N[a].p - N[b].p);
    ROOM.nodeIdx = { dir: ROOM.dir, by, shelves: [...by.keys()].sort((a, b) => a - b) };
    return by;
}
function roomNodeImg(i) {
    let img = ROOM.img.node.get(i);
    if (!img) {
        img = {};
        for (const k of [...ROOM_FACES.map(([f]) => f), "haze"]) { try { img[k] = utils.IsFile(`${ROOM.dir}node-${ROOM.meta.nodes[i].s}_${ROOM.meta.nodes[i].p}-${k}.png`) ? d2d.Image(`${ROOM.dir}node-${ROOM.meta.nodes[i].s}_${ROOM.meta.nodes[i].p}-${k}.png`) : null; } catch (e) { img[k] = null; } }
        ROOM.img.node.set(i, img);
    }
    return img;
}
// the nodes a case at x, y draws from: the shelves either side of it (one when it stands on a shelf), on each the
// places either side; [{ S, img, name, w }], the weights adding up to 1, the heaviest first. null: no nodes (cream, jade)
function roomNodes(x, y) {
    const by = roomNodeIndex();
    if (!by.size) return null;
    const M = ROOM.meta, sh = ROOM.nodeIdx.shelves, sx = clamp(x / M.dx, sh[0], sh[sh.length - 1]), p = -y / M.dy, out = [];
    const s0 = Math.floor(sx), fx = sx - s0;
    for (const [s, wx] of [[s0, 1 - fx], [s0 + 1, fx]]) {
        if (wx < .02 || !by.has(s)) continue;
        const L = by.get(s), N = M.nodes;
        let j = 0;
        while (j < L.length - 1 && N[L[j + 1]].p <= p) j++;
        const a = N[L[j]], b = j < L.length - 1 ? N[L[j + 1]] : null, fy = b && p > a.p ? clamp((p - a.p) / (b.p - a.p), 0, 1) : 0;
        for (const [i, w] of [[L[j], wx * (1 - fy)], [b ? L[j + 1] : -1, wx * fy]])
            if (i >= 0 && w >= .02) out.push({ S: N[i], img: roomNodeImg(i), name: "room-node" + i, w });
    }
    if (!out.length) return null;
    const sum = out.reduce((t, o) => t + o.w, 0);
    for (const o of out) o.w /= sum;
    return out.sort((a, b) => b.w - a.w);
}

// the plate fills the array area (cover-fit); k: screen px per plate px
function roomGeom() {
    const aw = arrayW(), [pw, ph] = ROOM.meta.size;
    if (ROOM.geo && ROOM.geo.aw === aw && ROOM.geo.h === H) return ROOM.geo;
    const k = Math.max(aw / pw, H / ph);
    return (ROOM.geo = { aw, h: H, k, ox: (aw - pw * k) / 2, oy: (H - ph * k) / 2 });
}
// a point of the room (x across the shelves, away from the camera; y along them, the earlier albums further away, so
// that a shelf reads from left to right as the array's; z up; the selected case stands at 0, 0) on the plate:
// [x, y, depth along the camera's axis]
function roomProject(x, y, z) {
    const c = ROOM.meta.camera, [w, h] = ROOM.meta.size, px = x - c.pos[0], py = y - c.pos[1], pz = z - c.pos[2];
    const d = px * c.fwd[0] + py * c.fwd[1] + pz * c.fwd[2];
    const u = px * c.right[0] + py * c.right[1] + pz * c.right[2], v = px * c.up[0] + py * c.up[1] + pz * c.up[2];
    return [w / 2 + c.f * u / d, h / 2 - c.f * v / d, d];
}

// archive.js asks these in the room: the selected case stays where the camera looks (the shelf moves under it), the
// cases kept are those that can be in view, and their lift is the room's swell (caseTargets)
const roomScroll = (sel, row) => slotOf(row, sel);
function roomCaseWindow(r, row, scroll) {
    const n = row ? row.albums.length : 0;
    let i0 = -1, i1 = -1;
    for (let i = 0; i < n; i++) {
        const y = slotOf(row, i) - scroll;
        if (y < ROOM_SLOTS[0] || y > ROOM_SLOTS[1]) continue;
        if (i0 < 0) i0 = i;
        i1 = i;
    }
    return i0 < 0 ? [0, -1] : [i0, i1];
}
// the swell: highest at the selected case (d places from it along the shelf), over many cases along the shelf and less
// on the shelves beside it (pos: the shelf's place)
const roomSwell = (d, pos) => { const M = ROOM.meta.wave; return M.h * Math.exp(-d * d / (M.r * M.r) - pos * pos / (M.c * M.c)); };
// the selected case out of the swell (the lift under the mouse is the shelf's: roomBump)
function roomTargets(i, r, active, row) {
    const isSel = active && i === r.sel, M = ROOM.meta, gap = M.gap === undefined ? .3 : M.gap;   // (RHINE LAB: its own, as it was rendered)
    return {
        lift: roomSwell(slotOf(row, i) - slotOf(row, r.sel), r.pos.x) + (isSel ? M.pick || ROOM_PICK : 0),
        clear: isSel ? 1 : 0,
        gap: active ? (i > r.sel ? gap : i < r.sel ? -gap : 0) : 0,
        hov: 0,
    };
}
// The mouse over a case, a shelf's album or an empty one: a bump of that shelf, gliding along it to the place under the
// mouse and sinking when the mouse leaves the shelf (per shelf: its place s and height a, springs), so that the cases
// near the mouse rise with their neighbours, the empty ones as the others: on every shelf kept (ROOM_BEHIND), not on
// the empty ones far back in the fog (they answer the mouse all the same).
function roomPointer(u) {
    const was = ROOM.under;
    if ((u && u.gi) === (was && was.gi) && (u && u.slot) === (was && was.slot)) return;
    ROOM.under = u;
    clock.wake();
}
function roomUpdate(dt) {
    if (!roomOn()) return false;
    const u = ROOM.under;
    let more = false;
    if (u && !ROOM.hov.has(u.gi)) ROOM.hov.set(u.gi, { s: Spring(u.slot, 14, .002), a: Spring(0, 12, .002) });
    for (const [gi, h] of ROOM.hov) {
        const on = !!u && u.gi === gi;
        if (on) h.s.to = u.slot;
        h.a.to = on ? 1 : 0;
        more = stepSpring(h.s, dt) || more;
        more = stepSpring(h.a, dt) || more;
        if (!on && h.a.x < .002) ROOM.hov.delete(gi);
    }
    return more;
}
const roomBump = (gi, s, pos) => { const h = ROOM.hov.get(gi), d = h ? s - h.s.x : 0; return h ? ROOM_HOVER * h.a.x * Math.exp(-d * d / 6) * clamp((ROOM_BEHIND + 2 - pos) / 2, 0, 1) : 0; };
// how far a shelf at pos is in the haze (0 - 1)
const roomHaze = pos => { const t = clamp((pos - ROOM_HAZE[0]) / (ROOM_HAZE[1] - ROOM_HAZE[0]), 0, 1); return t * t * (3 - 2 * t); };
// a shelf fades in at the back and out beyond the last one in front; along it, it fades out at its far end
const roomRowAlpha = pos => Math.round(255 * clamp((ROOM_FILL + 1 - pos) / ROOM_FADE[1], 0, 1) * clamp(ROOM_FRONT + 1 + pos, 0, 1));
const roomEndFade = d => clamp((d - ROOM_SLOTS[0]) / ROOM_FADE[0], 0, 1);
// how far a case is tinted towards the background: the fog by its distance from the camera (as the render's mist),
// and the dark away from the light under the selected case
// (the sets with nodes, rendered each with their own light: their render's own mist, as its compositor mixed it:
// mist × amount, RHINE LAB's over an even veil)
function roomTint(x, y, d) {
    const lit = !!ROOM.meta.nodes, M = ROOM.meta.fog, F = lit && M ? { start: M.start, depth: M.depth, max: M.amount } : ROOM_FOG, veil = lit && M && M.veil || 0;
    const fog = veil + Math.pow(clamp((d - F.start) / F.depth, 0, 1), 2) * ((lit ? F.max : 1) - veil);
    const k = lit ? 0 : ROOM_LIGHT_FALL[""], r = Math.hypot(x, y) / ROOM_LIGHT_R, light = 1 - k + k * Math.exp(-r * r);
    return clamp(1 - (1 - fog) * light, 0, F.max);
}

function drawRoom(gr) {
    THUMB_KEEP.clear();
    const G = arRows();
    if (!G.length) { drawArchiveEmpty(gr); return; }
    if (AF.open) { AR.hits = []; drawArtistFile(gr); drawInfoLayer(gr); return; }   // artist.js
    const RG = roomGeom(), M = ROOM.meta, I = ROOM.img, aw = RG.aw;
    gr.PushClip(0, 0, aw, H);
    gr.DrawImage(I.plate, RG.ox, RG.oy, I.plate.Width * RG.k, I.plate.Height * RG.k, 0, 0, I.plate.Width, I.plate.Height);
    // every case in view (the shelves', then the empty ones), the far ones first: by where they stand on the floor (a
    // lifted case does not come nearer)
    const items = [];
    // a case at x, y, z, raised by b under the mouse (b at the selected case's distance: as much of the screen near and
    // far, where a room unit is more or less of it)
    const place = (it, x, y, z, b) => {
        it.x = x; it.y = y; it.p = roomProject(x, y, z);
        if (it.p[2] < 1) return;
        it.z = z + b * it.p[2] / M.sel.depth;
        if (it.z !== z) it.p = roomProject(x, y, it.z);
        it.gd = roomProject(x, y, 0)[2];
        items.push(it);
    };
    // empty cases on shelf gi at pos, scrolled to scroll (its selected place sel there), at the places not in ends (the
    // shelf's albums): those beyond them stand ROOM_END_GAP apart
    const fill = (gi, pos, scroll, sel, ends, ra) => {
        const x = pos * M.dx;
        for (let t = Math.ceil(scroll + ROOM_SLOTS[0]); t <= scroll + ROOM_SLOTS[1]; t++) {
            if (ends && t >= ends[0] && t <= ends[1]) continue;
            const s = !ends ? t : t < ends[0] ? t - ROOM_END_GAP : t + ROOM_END_GAP, y = -(s - scroll) * M.dy, z = roomSwell(s - sel, pos);
            place({ gi, slot: s, ra: Math.round(ra * roomEndFade(s - scroll)), haze: roomHaze(pos), rest: [x, y, z] }, x, y, z, roomBump(gi, s, pos));
        }
    };
    for (const [gi, r] of AR.rows) {
        const ra = roomRowAlpha(r.pos.x);
        if (!ra) continue;
        const row = G[gi], active = gi === AR.group, [i0, i1] = roomCaseWindow(r, row, r.scroll.x), x = r.pos.x * M.dx;
        for (let i = i0; i <= i1; i++) {
            const c = r.cases.get(i), s = slotOf(row, i);
            if (!c) continue;
            // where the case rests without the lift under the mouse: its click area, as the array's (#7)
            const rest = [x, -(s - r.scroll.x + c.gap.to) * M.dy, roomTargets(i, r, active, row).lift];
            place({ gi, i, slot: s, c, a: row.albums[i], isSel: active && i === r.sel, ra: Math.round(ra * roomEndFade(s - r.scroll.x)), haze: roomHaze(r.pos.x), rest },
                x, -(s - r.scroll.x + c.gap.x) * M.dy, c.lift.x, roomBump(gi, s, r.pos.x));
        }
        const n = row.albums.length;
        fill(gi, r.pos.x, r.scroll.x, slotOf(row, r.sel), n ? [slotOf(row, 0), slotOf(row, n - 1)] : null, ra);
    }
    // the shelves not kept (beyond the library's, or further back): empty, moving with the others
    const ref = AR.rows.get(AR.group), strip = ref ? ref.pos.x : 0;
    for (let o = -ROOM_FRONT; o <= ROOM_FILL; o++) {
        if (AR.rows.has(AR.group + o)) continue;
        const ra = roomRowAlpha(o + strip);
        if (ra) fill(AR.group + o, o + strip, 0, 0, null, ra);
    }
    items.sort((p, q) => q.gd - p.gd);
    AR.hits = [];
    let selAt = null;
    for (const it of items) selAt = drawRoomCase(gr, it, RG) || selAt;
    // the PV's shape, baked at pack time beside the grade (rhine): the middle a little deeper, the edges dissolving
    // into the page; stretched over the render's frame, the same mapping as the plate
    if (I.valley) gr.DrawImage(I.valley, RG.ox, RG.oy, I.plate.Width * RG.k, I.plate.Height * RG.k, 0, 0, I.valley.Width, I.valley.Height);
    // the mouse's case, looked for again in this frame's click areas (the shelves may have moved under it)
    if (AR.mouseX >= 0 && AR.mouseX < aw) {
        const c = caseUnder(AR.mouseX, AR.mouseY), h = c ? c.i : -1, hg = c ? c.gi : -1;
        roomPointer(c);
        if (h !== AR.hover || hg !== AR.hoverRow) { AR.hover = h; AR.hoverRow = hg; clock.wake(); }
    }
    // the plates led out of the cover's top corner (drawCasePlate measures from the array's cover: given that corner)
    const top = CASE_META.array.cover[1];
    const plateText = (a, txt) => { const t = [...(txt || a.title || tr("UNTITLED"))]; return t.length > 40 ? t.slice(0, 39).join("") + "…" : t.join(""); };
    if (selAt) drawCasePlate(gr, selAt.a, selAt.x - top[0], selAt.y - top[1], 1, 255, plateText(selAt.a));
    if (AR.hoverPlate) {
        const h = AR.hoverPlate;
        drawCasePlate(gr, h.a, h.x - top[0], h.y - top[1], 1, h.alpha, plateText(h.a, h.txt));
        AR.hoverPlate = null;
    }
    // the room dissolves into the page towards the album file and the controls, as the array does
    const edge = LABEL_LIVE ? withAlpha(C.bg, .8) : C.bg;
    gr.FillGradRect(aw - dp(100), 0, dp(100) + 1, H, 0, withAlpha(C.bg, 0), edge);
    gr.FillGradRect(0, H - dp(139), aw, dp(80) + 1, 90, withAlpha(C.bg, 0), edge);
    gr.FillSolidRect(0, H - dp(60), aw, dp(60), edge);
    drawSelectNumeral(gr);
    drawRuler(gr);
    drawGroupSwitch(gr);
    drawArchiveBar(gr);
    gr.PopClip();
    drawInfoLayer(gr);
}

// The box's corners the faces are fitted on (A the near top front, B the far top front, C the near bottom front, D the
// near top back), for a case standing at x, y, z, on the plate; and its outline (the box's corners' hull)
function roomCorners(x, y, z) {
    const [hx, hd, ch] = ROOM.meta.box;
    return { A: roomProject(x - hx, y - hd, z + ch), B: roomProject(x + hx, y - hd, z + ch), C: roomProject(x - hx, y - hd, z), D: roomProject(x - hx, y + hd, z + ch) };
}
// a case's cover on screen, as quadImage takes it (top left, top right, bottom right, bottom left)
function roomWindow(x, y, z, RG) {
    const [x0, z0, x1, z1, cy] = ROOM.meta.cover;
    return [[x0, z1], [x1, z1], [x1, z0], [x0, z0]].map(([cx, cz]) => { const p = roomProject(x + cx, y + cy, z + cz); return [RG.ox + p[0] * RG.k, RG.oy + p[1] * RG.k]; });
}
function roomOutline(x, y, z, RG) {
    const [hx, hd, ch] = ROOM.meta.box, pts = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [0, 1]) {
        const p = roomProject(x + sx * hx, y + sy * hd, z + sz * ch);
        pts.push([RG.ox + p[0] * RG.k, RG.oy + p[1] * RG.k]);
    }
    pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const half = ps => {
        const h = [];
        for (const p of ps) {
            while (h.length >= 2 && (h[h.length - 1][0] - h[h.length - 2][0]) * (p[1] - h[h.length - 2][1]) - (h[h.length - 1][1] - h[h.length - 2][1]) * (p[0] - h[h.length - 2][0]) <= 0) h.pop();
            h.push(p);
        }
        return h;
    };
    return half(pts).slice(0, -1).concat(half(pts.reverse()).slice(0, -1));
}
// The map (sprite px → screen px) taking three points of a sprite (src) onto three of the case's own (dst, plate px):
// a face fitted on its corners runs exactly as the camera sees it
function roomFit(src, dst, RG) {
    const [s0, s1, s3] = src, [p0, p1, p3] = dst, k = RG.k;
    const ux = s1[0] - s0[0], uy = s1[1] - s0[1], vx = s3[0] - s0[0], vy = s3[1] - s0[1], det = ux * vy - uy * vx;
    const Ux = p1[0] - p0[0], Uy = p1[1] - p0[1], Vx = p3[0] - p0[0], Vy = p3[1] - p0[1];
    const a = (Ux * vy - Vx * uy) / det * k, c = (Vx * ux - Ux * vx) / det * k, b = (Uy * vy - Vy * uy) / det * k, d = (Vy * ux - Uy * vx) / det * k;
    const e = RG.ox + p0[0] * k - a * s0[0] - c * s0[1], f = RG.oy + p0[1] * k - b * s0[0] - d * s0[1];
    return ([px, py]) => [a * px + c * py + e, b * px + d * py + f];
}
// the rectangle (sprite px: x, y, w, h) through a map, as quadImage takes it
const roomRect = (map, x, y, w, h) => [map([x, y]), map([x + w, y]), map([x + w, y + h]), map([x, y + h])];
// a sprite into its rectangle q, tinted towards the background by f (as drawTinted)
// (not partly transparent, the sprite and its tinted copy drawn one over the other leave the sprite showing through the
// copy, a blend of two nodes a quarter of it: the sprite's alpha so that the two come to alpha with the share f tinted)
function roomDraw(gr, img, name, f, q, alpha) {
    const t = alpha / 255, top = t * f, a0 = top < 1 ? Math.round(255 * t * (1 - f) / (1 - top)) : 0;
    if (a0 > 0) quadImage(gr, img, q, 0, 0, 1, a0);
    const a = Math.round(alpha * f);
    if (a > 0) quadImage(gr, tinted(img, 1, name), q, 0, 0, 1, a);
}
// one case: its faces, each fitted onto the case's own; the selected one clear (its sprite fitted on its front), its
// cover in the window; every other case its album's cover in its window too, under the glass (blurred under frosted
// glass, as the array's: 05 STYLE › GLASS), an empty one a dark well; a case in the haze, the blurred whole case (fitted on its front: under the blur the other faces'
// bend does not show), coming in over the faces as they go. Returns { a, x, y } (the cover's top corner on screen) for
// the selected case.
function drawRoomCase(gr, it, RG) {
    const I = ROOM.img, Sel = ROOM.meta.sel, cl = it.c ? clamp(it.c.clear.x, 0, 1) : 0, fogTop = ROOM.meta.sealed ? 1 : ROOM_FOG.max;   // (RHINE LAB's field goes all the way into the page, as rendered)
    const out = roomOutline(it.x, it.y, it.z, RG), xs = out.map(p => p[0]), ys = out.map(p => p[1]);
    if (Math.min(...xs) > RG.aw || Math.max(...xs) < 0 || Math.min(...ys) > H || Math.max(...ys) < 0) return null;
    const alpha = it.ra, f = roomTint(it.x, it.y, it.p[2]);
    const P = roomCorners(it.x, it.y, it.z);
    if (cl < .99) {
        // the case's sprites: the nodes round its place (blended: each over the ones before it by its share), else the
        // shared one rendered at its distance
        const Ls = roomNodes(it.x, it.y) || [{ ...roomLevel(roomProject(it.x, it.y, it.z + ROOM.meta.box[2] / 2)[2]), w: 1 }];
        const w = it.haze || 0, a = Math.round(alpha * (1 - cl) * (1 - w));
        // the window, under the case's glass (the sprites' window is a hole): the cover where the camera sees it
        const aw0 = Math.round(alpha * (1 - cl)), win = roomWindow(it.x, it.y, it.z, RG), t = it.c && ROOM.want.has(coverKey(it.a)) ? thumbOf(it.a) : null;
        // (tinted as archive.js tintedCover does it: a thin bright edge otherwise, flickering as the shelves move)
        // (RHINE LAB's cases at rest are opaque and hold no cover: only the selected one shows it)
        if (!ROOM.meta.sealed) tintedCover(gr, win, 0, 0, 1, aw0, f > 0 ? Math.min(fogTop, f + (1 - f) * .35 * w) : 0, t ? (AR.frost || w > .5 ? t.blur : t.img) : null);
        let acc = 0;
        for (const L of Ls) {
            acc += L.w;
            const share = L.w / acc;   // (over what the ones before it drew)
            if (w > 0 && L.img.haze && L.S.haze) {
                const Z = L.S.haze, map = roomFit(["A", "B", "C"].map(c => L.S.fit[c]), [P.A, P.B, P.C], RG);
                roomDraw(gr, L.img.haze, L.name + "haze" + ROOM.dir, Math.min(fogTop, f + (1 - f) * .35 * w), roomRect(map, Z.off[0], Z.off[1], Z.size[0], Z.size[1]), Math.round(alpha * (1 - cl) * Math.min(1, 3 * w) * share));
            }
            const af = Math.round(a * share);
            if (af > 0) for (const [k, pts] of ROOM_FACES) {
                const img = L.img[k], F = L.S.layers[k];
                if (!img || !F) continue;
                const map = roomFit([...pts].map(c => L.S.fit[c]), [...pts].map(c => P[c]), RG);
                roomDraw(gr, img, L.name + k + ROOM.dir, f, roomRect(map, F.off[0], F.off[1], F.size[0], F.size[1]), af);
            }
        }
    }
    // the case at its resting place answers the mouse (an empty one too: it hides the cases behind it from the mouse)
    if (alpha > 0) {
        const still = it.rest[1] === it.y && it.rest[2] === it.z;
        AR.hits.push({ i: it.c ? it.i : -1, gi: it.gi, slot: it.slot, empty: !it.c, quad: still ? out : roomOutline(...it.rest, RG) });
    }
    // the one under the mouse is outlined or labelled (an empty one too, as EMPTY: the shelves beyond the library's
    // look as full as the others)
    const u = ROOM.under, hovered = alpha > 0 && !it.isSel && (it.c ? it.i === AR.hover && it.gi === AR.hoverRow : !!u && u.empty && u.gi === it.gi && u.slot === it.slot);
    if (hovered && AR.hoverMode === "label") {
        const [x, y] = out.reduce((m, p) => p[1] < m[1] ? p : m);   // the case's top corner
        AR.hoverPlate = { a: it.a, txt: it.c ? null : tr("EMPTY"), x, y, alpha };
    }
    if (hovered && AR.hoverMode === "outline") gr.DrawPolygon(withAlpha(C.accent, alpha / 255), Math.max(HAIR, dp(1.5)), out.flat());
    if (!it.c) return null;   // an empty case
    let Q = null;
    if (cl > .01) {
        const map = roomFit(["A", "B", "C"].map(c => Sel.fit[c]), [P.A, P.B, P.C], RG);
        Q = Sel.cover.map(map);
        const big = it.isSel ? cover(albumFirst(it.a), () => window.Repaint()) : null, t = thumbOf(it.a);
        const img = big && big.img ? big.img : t ? t.img : null, a = Math.round(alpha * cl);
        tintedCover(gr, Q, 0, 0, 1, a, f, img);
        roomDraw(gr, I.sel, "room-sel" + ROOM.dir, f, roomRect(map, 0, 0, Sel.size[0], Sel.size[1]), a);
    }
    if (!it.isSel || cl < .6 || !Q) return null;
    for (const [px, py] of Q) gr.FillSolidRect(Math.round(px - dp(3)), Math.round(py - dp(3)), dp(6), dp(6), C.accent);
    return { a: it.a, x: Q[1][0], y: Q[1][1] };
}

// a click on a case selects it; on an empty one, its shelf's album nearest it (none: a shelf beyond the library's)
function roomClick() {
    const u = ROOM.under, row = u ? arRows()[u.gi] : null;
    if (!row || !row.albums.length) return;
    const i = u.empty ? (u.slot < slotOf(row, 0) ? 0 : row.albums.length - 1) : u.i;
    if (u.gi !== AR.group) { selectCase(u.gi, i); return; }
    const r = AR.rows.get(AR.group);
    if (r && i !== r.sel) moveAlbum(i - r.sel);
}
// The covers asked for: the albums on the shelves kept nearest the selection, as many as the cover memory holds
// (ROOM.want; the other cases show none). The room has far more cases in view than that: drawn with their covers, every
// one of them would be kept, and the covers arriving for a shelf just reached put out again at once, never asked anew.
function roomThumbs() {
    const G = arRows(), list = [];
    // (the shelves kept, by rowState: asked before the first paint, AR.rows has none of them yet)
    for (let gi = Math.max(0, AR.group - ROOM_FRONT); gi <= Math.min(G.length - 1, AR.group + ROOM_BEHIND); gi++) {
        const r = rowState(gi), row = G[gi], [i0, i1] = roomCaseWindow(r, row, r.scroll.to);
        for (let i = i0; i <= i1; i++) list.push({ a: row.albums[i], d: Math.abs(gi - AR.group) * 12 + Math.abs(i - r.sel) });
    }
    list.sort((p, q) => p.d - q.d);
    const n = THUMB_PX > 256 ? 300 : 640, want = list.slice(0, n).map(e => e.a);
    ROOM.want = new Set(want.map(coverKey));
    setThumbBudget(n + 40);
    requestThumbs(want, n);
}
function roomDoubleClick() {
    const r = AR.rows.get(AR.group);
    if (AR.hover >= 0 && AR.hoverRow === AR.group && r && AR.hover === r.sel) { playAlbum(); return true; }
    return false;
}
// the shelf runs across the view and the shelves stand one behind the other: ← → along it, ↑ ↓ between them
function roomKey(vk) {
    switch (vk) {
        case 0x25: moveAlbum(-1); return true;   // ←
        case 0x27: moveAlbum(1); return true;    // →
        case 0x26: moveGroup(1); return true;    // ↑: the shelf behind
        case 0x28: moveGroup(-1); return true;   // ↓
        case 0x0D: if (curAlbum()) openAlbum(); return true;   // Enter: no inspection in the room
    }
    return false;
}
