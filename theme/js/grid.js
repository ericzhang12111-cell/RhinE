"use strict";
// 01 · ARCHIVE, GRID layout (stage.js includes this after archive.js): every album as a cover in a grid, in sections by
// the archive's grouping (genre, decade or artist initial), for browsing by eye. It shares the archive's selection and
// its album file on the right; LAYOUT [ARRAY | GRID] (key G) switches between the two.
//   click a cover: select it · double-click / Space: play the album · Enter: open it in the Archive playlist
//   wheel scrolls; arrows move the selection (across sections), Page Up / Down a screen, Home / End
//   PER PAGE 10 · 36 · 50 · 75 · 100 · 200: about that many covers on screen (the cover size follows)
// Only the covers on screen (and a row around them) are drawn and asked for; thumbnails come from the library worker's
// disk cache (lib/library.js), so a few thousand albums scroll as easily as a few dozen.

AR.layout = window.GetProperty("archiveLayout", "array");
const GRID = { scroll: Spring(0, 10), geo: null, hover: null, reveal: true, per: window.GetProperty("gridPerPage", 36) };
const PER_PAGE = [10, 36, 50, 75, 100, 200];
function setPerPage(n) {
    if (n === GRID.per) return;
    GRID.per = n;
    window.SetProperty("gridPerPage", n);
    GRID.geo = null; GRID.reveal = true;   // reveal: jump to the selection at the next paint
    clock.wake(); window.Repaint();
}
const GRID_ST = {
    head: { size: 9, weight: 600, track: .16 },
    count: { size: 8.5, weight: 500, track: .12 },
    year: { size: 8, weight: 600, track: .08 },
};

function setLayout(l) {
    if (l === AR.layout) return;
    const key = curAlbum() ? curAlbum().key : AR.selAlbum;
    AR.layout = l;
    window.SetProperty("archiveLayout", l);
    if (l === "grid") { GRID.geo = null; GRID.reveal = true; }
    placeSelection(key);   // the array's rows are shelves, the grid's sections are groups: find the album again
    requestVisibleThumbs();
    clock.wake();
    window.Repaint();
}

// geometry: covers of `cell` px in `cols` columns; each section is a header and its rows; y in content coordinates
function gridGeom() {
    const aw = arrayW(), padX = dp(32), gap = dp(18), top = dp(100);
    const key = `${aw}|${H}|${LIB.gen}|${LIB.groupBy}|${LIB.sortBy}|${LIB.unit}|${LIB.filter}|${filteredCount()}|${SCALE}|${GRID.per}`;
    if (GRID.geo && GRID.geo.key === key) return GRID.geo;
    // the column count whose covers come closest to GRID.per on one screen (titles under covers of 80 dp and more)
    const viewH = H - top - dp(24), fit = cols => {
        const cell = Math.floor((aw - 2 * padX - (cols - 1) * gap) / cols), lab = cell >= dp(80) ? dp(42) : 0;
        return { cols, cell, lab, n: cols * viewH / (cell + lab + gap) };
    };
    let best = fit(2);
    for (let c = 3; c <= 40; c++) { const f = fit(c); if (f.cell < dp(36)) break; if (Math.abs(f.n - GRID.per) < Math.abs(best.n - GRID.per)) best = f; }
    const { cols, cell, lab } = best, rowH = cell + lab + gap, headH = dp(48);
    const secs = [];
    let y = 0;
    LIB.groups.forEach((g, gi) => {
        const rows = Math.ceil(g.albums.length / cols);
        secs.push({ gi, y, y0: y + headH, rows });
        y += headH + rows * rowH + dp(12);
    });
    GRID.geo = { key, padX, gap, top, cols, cell, lab, rowH, headH, secs, total: y, viewH, aw };
    return GRID.geo;
}
const gridMaxScroll = G => Math.max(0, G.total - G.viewH);

// dragging the scroll bar's thumb (a press on the track first centres the thumb there); the grid follows at once
function gridBarDown(y, a) {
    const b = a.data, grab = y >= b.by && y <= b.by + b.bh ? y - b.by : b.bh / 2;
    GRID.drag = { grab, b };
    gridBarMove(y);
}
function gridBarMove(y) {
    const { grab, b } = GRID.drag, s = clamp((y - grab - b.top) / Math.max(1, b.th - b.bh), 0, 1) * b.max;
    GRID.scroll.to = GRID.scroll.x = s; GRID.scroll.v = 0;
    const now = performance.now();
    if (now - gridAskedAt > 120) { gridAskedAt = now; gridThumbs(); }
    window.RepaintRect(0, 0, arrayW(), H);
}
function gridBarUp() { GRID.drag = null; gridThumbs(); window.RepaintRect(0, 0, arrayW(), H); }
// content position of album i of section s
function cellPos(G, s, i) { return [G.padX + (i % G.cols) * (G.cell + G.gap), s.y0 + Math.floor(i / G.cols) * G.rowH]; }

// scroll so the selected cover is in view (jump: no animation)
function gridReveal(jump = false) {
    const G = gridGeom(), s = G.secs[AR.group], r = AR.rows.get(AR.group);
    if (!s || !r || G.viewH <= 0) { GRID.reveal = true; return; }   // not laid out yet: on the next paint
    GRID.reveal = false;
    const [, y] = cellPos(G, s, r.sel), view = G.viewH;
    let t = GRID.scroll.to;
    if (y - G.headH < t) t = y - (r.sel < G.cols ? G.headH : dp(12));
    else if (y + G.cell + G.lab > t + view) t = y + G.cell + G.lab - view + dp(12);
    GRID.scroll.to = clamp(t, 0, gridMaxScroll(G));
    if (jump) GRID.scroll.x = GRID.scroll.to;
}

let gridAskedAt = 0;
function gridUpdate(dt) {
    const more = stepSpring(GRID.scroll, dt), now = performance.now();
    if (more && now - gridAskedAt > 120) { gridAskedAt = now; gridThumbs(); }
    return more;
}

// the cells whose rows meet content y0..y1: [[section, index]] top to bottom
function gridRange(y0, y1) {
    const G = gridGeom(), out = [];
    for (const s of G.secs) {
        const g = LIB.groups[s.gi];
        if (s.y0 + s.rows * G.rowH < y0 || s.y > y1) continue;
        const r0 = Math.max(0, Math.floor((y0 - s.y0) / G.rowH)), r1 = Math.min(s.rows - 1, Math.floor((y1 - s.y0) / G.rowH));
        for (let i = r0 * G.cols; i <= Math.min(g.albums.length - 1, (r1 + 1) * G.cols - 1); i++) out.push([s, i]);
    }
    return out;
}
const gridVisible = () => { const G = gridGeom(); return gridRange(GRID.scroll.x, GRID.scroll.x + G.viewH); };
// Covers are fetched for where the grid is going (the scroll target), not where it is: that screen first, then two
// screens below it and one above, so they are there before they scroll in. Asked again while it scrolls and whenever
// a cell on screen has none yet (repeated asks for the same covers cost nothing).
function gridThumbs() {
    const G = gridGeom(), t = GRID.scroll.to, h = G.viewH, cell = ([s, i]) => LIB.groups[s.gi].albums[i];
    const list = [...gridRange(t, t + h), ...gridRange(t + h, t + 3 * h), ...gridRange(t - h, t).reverse()].map(cell);
    setThumbBudget(list.length + 40);
    requestThumbs(list, list.length);
}

function drawGrid(gr) {
    THUMB_KEEP.clear();
    if (!LIB.groups.length) { drawArchiveEmpty(gr); return; }
    if (GRID.reveal) { gridReveal(true); gridThumbs(); }
    const G = gridGeom(), sy = Math.round(GRID.scroll.x), aw = G.aw, np = fb.GetNowPlaying(), playingKey = np ? albumKey(np) : "";
    const selR = AR.rows.get(AR.group), selI = selR ? selR.sel : -1;
    gr.PushClip(0, G.top, aw, H - G.top);
    for (const s of G.secs) {
        const g = LIB.groups[s.gi], hy = G.top + s.y - sy;
        if (hy > H || s.y0 + s.rows * G.rowH - sy + G.top < G.top) continue;
        // section header: GENRE 01 · AMBIENT ───── 12 ALBUMS
        if (hy + G.headH > G.top) {
            const ly = hy + dp(14);
            gr.FillSolidRect(G.padX, ly + dp(3), dp(5), dp(5), s.gi === AR.group ? C.accent : C.fg);
            const t = LIB.groupBy === "none" ? g.name : `${GROUP_LABEL[LIB.groupBy]} ${pad(s.gi + 1, 2)}  ·  ${g.name}`.toUpperCase();
            const lw = label(gr, fitLabel(t, st(GRID_ST.head, C.fg), aw - dp(260)), st(GRID_ST.head, C.fg), G.padX + dp(14), ly);
            const c = unitWord(g.albums.length), cw = labelWidth(c, st(GRID_ST.count, C["text-muted"]));
            label(gr, c, st(GRID_ST.count, C["text-muted"]), aw - G.padX, ly + dp(1), 2);
            gr.FillSolidRect(G.padX + dp(14) + lw + dp(14), ly + dp(6), Math.max(0, aw - G.padX - cw - dp(14) - (G.padX + dp(14) + lw + dp(14))), HAIR, C["line-faint"]);
        }
    }
    let missing = false;
    for (const [s, i] of gridVisible()) {
        const a = LIB.groups[s.gi].albums[i], [cx, cyc] = cellPos(G, s, i), x = cx, y = G.top + cyc - sy, c = G.cell;
        const t = thumbOf(a), sel = s.gi === AR.group && i === selI, hov = GRID.hover && GRID.hover.gi === s.gi && GRID.hover.i === i;
        if (t === undefined && !thumbPending.has(coverKey(a))) missing = true;
        if (t && t.img) gr.DrawImage(t.img, x, y, c, c, 0, 0, t.img.Width, t.img.Height);
        else {
            gr.FillSolidRect(x, y, c, c, C.well);
            label(gr, `ARC-${pad(a.no, 4)}`, st(GRID_ST.count, C["text-muted"], C.well), x + c / 2, y + c / 2 - dp(6), 1);
        }
        box(gr, x, y, c, c, hov && !sel ? C.accent : withAlpha(C.fg, .12));
        if (a.year && c >= dp(80)) {
            const yt = String(a.year), ys = st(GRID_ST.year, C.fg, C.bg), yw = labelWidth(yt, ys) + dp(10);
            gr.FillSolidRect(x, y, yw, dp(16), C.bg);
            label(gr, yt, ys, x + dp(5), y + Math.round((dp(16) - labelHeight(GRID_ST.year)) / 2));
        }
        if (np && (a.album ? sameTrack(itemTrack(a), np) : a.key === playingKey)) gr.FillSolidRect(x, y + c - dp(4), dp(18), dp(4), C.accent);
        if (sel) {
            box(gr, x - dp(5), y - dp(5), c + dp(10), c + dp(10), C.fg, Math.max(HAIR, dp(1.5)));
            for (const [px, py] of [[x, y], [x + c, y], [x, y + c], [x + c, y + c]]) gr.FillSolidRect(Math.round(px - dp(3)), Math.round(py - dp(3)), dp(6), dp(6), C.accent);
        }
        if (G.lab) {
            text(gr, a.title || "UNTITLED", 10, sel ? 700 : 600, C.fg, x, y + c + dp(6), c, dp(18));
            text(gr, a.artist || "—", 9, 500, C["text-muted"], x, y + c + dp(23), c, dp(16));
        }
    }
    if (missing) window.SetTimeout(gridThumbs, 0);   // a cell on screen without its cover: ask (after this paint)
    // the scroll bar: a thin track at the right edge of the grid with a thumb that can be dragged (or a click on the
    // track jumps there); it widens under the mouse and while dragged
    const max = gridMaxScroll(G);
    if (max > 0) {
        const th = G.viewH, bh = Math.max(dp(24), th * G.viewH / G.total), by = G.top + (th - bh) * (GRID.scroll.x / max);
        const hot = GRID.drag || (GRID.barHover), tw = hot ? dp(6) : dp(3);
        gr.FillSolidRect(aw - dp(12), G.top, HAIR, th, C["line-faint"]);
        gr.FillSolidRect(Math.round(aw - dp(11.5) - tw / 2), Math.round(by), tw, Math.round(bh), GRID.drag ? C.accent : C.fg);
        hits.add("grid-bar", aw - dp(22), G.top, dp(20), th, { top: G.top, th, bh, by, max });
    }
    gr.PopClip();
    // fade under the top bar
    gr.FillGradRect(0, G.top, aw, dp(18), 90, C.bg, withAlpha(C.bg, 0));
    gr.FillSolidRect(G.padX, G.top - dp(10), G.aw - 2 * G.padX, HAIR, withAlpha(C.fg, .5));
    drawArchiveBar(gr);
    // album file (as in the array layout)
    if (AR.dirtyInfo || !AR.info) { AR.info = renderLayer(W - infoX() + dp(20), H, drawInfo, AR.info); AR.dirtyInfo = false; }
    gr.DrawImage(AR.info.img, infoX() - dp(20), 0, AR.info.w, AR.info.h, 0, 0, AR.info.w, AR.info.h);
    infoHits(infoX() - dp(20));
}

// The archive's top bar, in both layouts (a plate behind each control: the array's cases pass under them):
//   ■ ALBUM GRID · 250 ALBUMS · BY GENRE (grid)       SHOW [ALBUMS | TRACKS]   PER PAGE [10 … 200] (grid)   LAYOUT [ARRAY | GRID]
//   [FILTER · "word" · 12 ALBUMS ×]               GROUP [GENRE | DECADE | A–Z | NONE]   SORT [ARTIST | TITLE | YEAR | ADDED]
function drawArchiveBar(gr) {
    const grid = AR.layout === "grid", xr = arrayW() - dp(32), y1 = dp(22), y2 = dp(54), x0 = dp(32);
    if (grid) {
        gr.FillSolidRect(x0, y1 + dp(10), dp(5), dp(5), C.fg);
        const n = filteredCount();
        const wide = arrayW() > dp(1180);   // the grouping in the title only where the bar has room
        label(gr, `${showTracks() ? "TRACK" : "ALBUM"} GRID  ·  ${unitWord(n)}${LIB.groupBy === "none" || !wide ? "" : `  ·  BY ${GROUP_LABEL[LIB.groupBy]}`}`, st(GRID_ST.head, C.fg), x0 + dp(14), y1 + dp(6));
    }
    drawFilterChip(gr, x0, grid ? y2 : y1);
    let lx = segToggle(gr, xr, y1, "LAYOUT", [["array", "ARRAY"], ["grid", "GRID"]], AR.layout, "ar-layout", true);
    if (grid) lx = segToggle(gr, lx - dp(24), y1, "PER PAGE", PER_PAGE.map(n => [n, String(n)]), GRID.per, "ar-per");
    segToggle(gr, lx - dp(24), y1, "SHOW", [["albums", "ALBUMS"], ["tracks", "TRACKS"]], showTracks() ? "tracks" : "albums", "ar-unit");
    const sx = segToggle(gr, xr, y2, "SORT", SORT_BY, LIB.sortBy, "ar-sort");
    segToggle(gr, sx - dp(24), y2, "GROUP", GROUP_BY, LIB.groupBy, "ar-group");
}

// TITLE [■ A | □ B | …] right-aligned at xr, on a plate; items [[value, text]]; marks: the square toggle marks.
// Returns the left edge (of the title).
function segToggle(gr, xr, y, title, items, cur, hitId, marks = false) {
    const hh = dp(22), s = st(GRID_ST.count, 0), ty = y + Math.round((hh - labelHeight(GRID_ST.count)) / 2);
    const widths = items.map(([, t]) => (marks ? dp(20) : dp(9)) + labelWidth(t, s) + dp(9)), total = widths.reduce((a, b) => a + b, 0);
    const tw = labelWidth(title, s), left = xr - total - dp(12) - tw;
    gr.FillSolidRect(left - dp(8), y - dp(4), xr - left + dp(12), hh + dp(8), C.bg);
    label(gr, title, st(GRID_ST.count, C["text-muted"]), left, ty);
    let x = xr - total;
    items.forEach(([v, t], i) => {
        const on = cur === v, col = on ? C.bg : C["text-muted"];
        if (on) gr.FillSolidRect(x, y, widths[i], hh, C.fg);
        if (marks) toggleMark(gr, x + dp(9), y + hh / 2, on, col);
        label(gr, t, st(GRID_ST.count, col, on ? C.fg : C.bg), x + (marks ? dp(20) : dp(9)), ty);
        hits.add(hitId, x, y, widths[i], hh, v);
        x += widths[i];
    });
    box(gr, xr - total, y, total, hh, C["line-faint"]);
    return left;
}

// ------------------------------------------------------------------------------------------------------- input
function gridAt(x, y) {
    const G = gridGeom();
    if (x >= G.aw || y < G.top) return null;
    const cy = y - G.top + GRID.scroll.x;
    for (const s of G.secs) {
        if (cy < s.y0 || cy >= s.y0 + s.rows * G.rowH) continue;
        const col = Math.floor((x - G.padX) / (G.cell + G.gap)), row = Math.floor((cy - s.y0) / G.rowH);
        const lx = x - G.padX - col * (G.cell + G.gap), ly = cy - s.y0 - row * G.rowH, i = row * G.cols + col;
        if (col < 0 || col >= G.cols || lx > G.cell || ly > G.cell + G.lab || i >= LIB.groups[s.gi].albums.length) return null;
        return { gi: s.gi, i };
    }
    return null;
}
function gridSelect(gi, i, reveal = true) {
    const g = LIB.groups[gi];
    if (!g) return;
    i = clamp(i, 0, g.albums.length - 1);
    if (gi !== AR.group) { AR.group = gi; AR.ticks.clear(); }
    const r = rowState(gi);
    r.sel = i;
    r.scroll.to = scrollTarget(i, g);
    selectionChanged();
    if (reveal) gridReveal(); else GRID.reveal = false;   // a click: the cover is already in view
    clock.wake();
}
function gridMouseMove(x, y, a) {
    const bar = !!(a && a.id === "grid-bar");
    if (bar !== !!GRID.barHover) { GRID.barHover = bar; window.RepaintRect(0, 0, arrayW(), H); }
    const h = a ? null : gridAt(x, y), old = GRID.hover;
    if ((h && (!old || old.gi !== h.gi || old.i !== h.i)) || (!h && old)) { GRID.hover = h; window.RepaintRect(0, 0, arrayW(), H); }
    return !!h;
}
function gridClick(x, y, a) {
    if (a) return false;   // the toggle and the file's buttons are handled by archiveClick
    const h = gridAt(x, y);
    if (h) gridSelect(h.gi, h.i, false);
    return true;
}
function gridDblClick(x, y) {
    const h = gridAt(x, y);
    if (h) { gridSelect(h.gi, h.i, false); playAlbum(); }
}
function gridWheel(step) {
    const G = gridGeom();
    GRID.scroll.to = clamp(GRID.scroll.to - step * G.rowH * .75, 0, gridMaxScroll(G));
    gridThumbs();
    clock.wake();
}
// arrows move across sections: down from a section's last row goes to the next section in the same column
function gridMove(dx, dy) {
    const G = gridGeom(), r = AR.rows.get(AR.group), n = LIB.groups.length;
    if (!r) return;
    let gi = AR.group, i = r.sel + dx + dy * G.cols;
    const len = k => LIB.groups[k].albums.length;
    if (dx) {
        if (i < 0 && gi > 0) { gi--; i = len(gi) - 1; }
        else if (i >= len(gi) && gi < n - 1) { gi++; i = 0; }
    } else if (dy) {
        const col = r.sel % G.cols;
        if (i < 0 && gi > 0) { gi--; i = Math.min(len(gi) - 1, Math.floor((len(gi) - 1) / G.cols) * G.cols + col); }
        else if (i >= len(gi)) {
            if (Math.floor(r.sel / G.cols) < Math.floor((len(gi) - 1) / G.cols)) i = len(gi) - 1;   // a shorter last row
            else if (gi < n - 1) { gi++; i = Math.min(len(gi) - 1, col); }
        }
    }
    gridSelect(gi, i);
}
function gridKey(vk) {
    const G = gridGeom(), page = Math.max(1, Math.floor(G.viewH / G.rowH));
    switch (vk) {
        case 0x25: gridMove(-1, 0); return true;        // ←
        case 0x27: gridMove(1, 0); return true;         // →
        case 0x26: gridMove(0, -1); return true;        // ↑
        case 0x28: gridMove(0, 1); return true;         // ↓
        case 0x21: gridMove(0, -page); return true;     // Page Up
        case 0x22: gridMove(0, page); return true;      // Page Down
        case 0x24: gridSelect(0, 0); return true;       // Home
        case 0x23: gridSelect(LIB.groups.length - 1, 1e6); return true;   // End
        case 0x0D: openAlbum(); return true;
    }
    return false;
}
TOKEN_LISTENERS.push(() => { GRID.geo = null; });
