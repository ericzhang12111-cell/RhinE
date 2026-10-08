"use strict";
// 02 · PLAYLISTS, above the native playlist: the playlist head.
//   row 1  bracketed PLAYLIST NO. 003 (the number rolls on a switch), the name (scrambles in; double-click renames),
//          041 TRACKS · 3:02:11 · 1.9 GB on the right
//   row 2  state chips (PLAYING, AUTOPLAYLIST, LOCKED) and the selection count; LAYOUT [ALBUM | INDEX] on the right
//   a heavy rule, then the playlist's column titles: the native header is off (Windows draws it white on paper), so
//   they are drawn here, placed the way Columns UI sizes the preset's columns (columns/preset-*.json). Clicking a
//   title sorts the playlist by it (again: the other way round; Edit › Undo restores the order).

include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\core.js");
include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\playlists.js");

const HST = {
    head: { size: 12, weight: 500, track: .12 },
    stat: { size: 9.5, weight: 500, track: .1 },
    statN: { size: 9.5, weight: 700, track: .1 },
    tog: { size: 9, weight: 500, track: .14 },
    sel: { size: 9, weight: 500, track: .12 },
    col: { size: 8.5, weight: 500, track: .12 },
};
const hst = (s, colour, bg = C.bg) => Object.assign({ colour, bg }, s);

let W = 0, H = 0;
const hits = Hits();
let hover = null;
const P = { pl: -1, name: null, no: Roll("000"), sel: 0 };

const clock = Clock(() => {
    const more = (P.name && !scrambleDone(P.name)) || !rollDone(P.no);
    window.Repaint();
    return more;
});

function load(animate) {
    const pl = plman.ActivePlaylist;
    const name = pl >= 0 ? plman.GetPlaylistName(pl) : tr("NO PLAYLIST");
    if (pl !== P.pl || !P.name || P.name.text !== name) {
        P.name = animate ? Scramble(name) : { text: name, tw: Tween(0), seed: 0 };
        if (animate) setRoll(P.no, pad(pl + 1, 3)); else P.no = Roll(pad(pl + 1, 3));
        clock.wake();
    }
    P.pl = pl;
    countSelection();
    window.Repaint();
}
function countSelection() { P.sel = P.pl >= 0 ? plman.GetPlaylistSelectedIndexes(P.pl).length : 0; }

function on_size(w, h) { W = w; H = h; }

function on_paint(gr) {
    hits.clear();
    gr.FillSolidRect(0, 0, W, H, C.bg);
    const x0 = dp(20), x1 = W - dp(20), pl = P.pl;
    // row 1: bracketed head
    const y = dp(18), bh = dp(34), f = font(12, 700), cell = Math.ceil(gr.CalcTextWidth("0", f));
    const lw = labelWidth(tr("PLAYLIST NO."), hst(HST.head, 0)), bw = dp(14) + lw + dp(10) + cell * 3 + dp(14);
    for (const [sx, sy] of [[x0, y], [x0 + bw - dp(6), y], [x0, y + bh - dp(6)], [x0 + bw - dp(6), y + bh - dp(6)]]) gr.FillSolidRect(sx, sy, dp(6), dp(6), C.fg);
    label(gr, tr("PLAYLIST NO."), hst(HST.head, C.fg), x0 + dp(14), y + Math.round((bh - labelHeight(HST.head)) / 2));
    drawRoll(gr, P.no, f, C.fg, x0 + dp(14) + lw + dp(10), y, cell, bh);
    // stats, right-aligned: 041 TRACKS · 3:02:11 · 1.9 GB
    let sx = x1;
    if (pl >= 0) {
        const s = plStats(pl), parts = [[pad(s.count, s.count > 999 ? 4 : 3), " " + tr("TRACKS")], [fmtTime(s.length), ""], [fmtSize(s.size), ""]];
        const sy = y + Math.round((bh - labelHeight(HST.stat)) / 2);
        for (let i = parts.length - 1; i >= 0; i--) {
            const [n, word] = parts[i];
            if (word) sx -= label(gr, word, hst(HST.stat, C["text-muted"]), sx, sy, 2);
            sx -= label(gr, n, hst(HST.statN, C.fg), sx, sy, 2);
            if (i) sx -= label(gr, "  ·  ", hst(HST.stat, C["text-muted"]), sx, sy, 2);
        }
    }
    // the name between the bracket and the stats
    const nx = x0 + bw + dp(22), nw = sx - dp(24) - nx, name = P.name ? scrambleText(P.name) : "";
    if (nw > dp(40)) {
        gr.DrawText(name, fontFor(name, 17, 700), C.fg, nx, y, nw, bh, DT_SINGLE | DT_ELLIPSIS);
        hits.add("name", nx, y, Math.min(nw, gr.CalcTextWidth(name, fontFor(name, 17, 700))), bh);
    }
    // row 2: chips and the selection on the left, LAYOUT toggle on the right
    const cy = dp(62), ch = dp(18);
    let cx = x0;
    if (pl >= 0) {
        const loc = plman.GetPlayingItemLocation();
        if (loc.IsValid && loc.PlaylistIndex === pl) cx += chip(gr, tr(fb.IsPaused ? "PAUSED" : "PLAYING"), cx, cy, ch, "acc", 9, C.bg) + dp(6);
        if (plman.IsAutoPlaylist(pl)) cx += chip(gr, tr("AUTOPLAYLIST"), cx, cy, ch, "", 9, C.bg) + dp(6);
        else if (plman.IsPlaylistLocked(pl)) cx += chip(gr, tr("LOCKED"), cx, cy, ch, "", 9, C.bg) + dp(6);
        if (P.sel > 1) label(gr, tr("{0} SELECTED", pad(P.sel, 2)), hst(HST.sel, C["text-muted"]), cx + dp(6), cy + Math.round((ch - labelHeight(HST.sel)) / 2));
    }
    drawLayoutToggle(gr, x1, cy, ch);
    // heavy rule, column titles, hairline
    const ry = H - dp(34);
    gr.FillSolidRect(0, ry, W, HEAVY, C.fg);
    drawColumns(gr, ry + HEAVY, H - HAIR - ry - HEAVY);
    hline(gr, 0, H - HAIR, W, C.hair);
    drawGrain(gr, 0, 0, W, H);
}

// ------------------------------------------------------------------------------------------------ column titles
const PRESET_META = {};
function presetMeta() {
    const p = STATE.preset;
    if (!PRESET_META[p]) {
        try { PRESET_META[p] = JSON.parse(utils.ReadTextFile(THEME_ROOT + `columns\\preset-${p}.json`, 65001)); }
        catch (e) { PRESET_META[p] = { groups: false, columns: [] }; }
    }
    return PRESET_META[p];
}
// the playlist view's size (frame.js sends it) and whether its rows overflow, i.e. it shows a vertical scroll bar
const VIEW = { w: 0, h: 0 };
onMessage("playlist-size", s => { VIEW.w = s.w; VIEW.h = s.h; window.Repaint(); });
const TF_GROUP = fb.TitleFormat("$lower(%album artist%|%album%|%discnumber%)");
let groupRows = { items: null, n: 0 };
function scrollBarShown(meta) {
    if (P.pl < 0 || !VIEW.h) return false;
    const items = plItems(P.pl), row = dp(TOKENS.metrics.row);
    if (items.Count * row > VIEW.h) return true;
    if (!meta.groups) return false;
    if (groupRows.items !== items) {
        const keys = TF_GROUP.EvalWithMetadbs(items);
        let n = 0;
        keys.forEach((k, i) => { if (!i || k !== keys[i - 1]) n++; });
        groupRows = { items, n };
    }
    return (items.Count + groupRows.n) * row > VIEW.h;
}
// x and width of each column: the fixed widths, plus the spare width shared out by each column's resize weight
function columnLayout(meta) {
    const cols = meta.columns, client = W - (scrollBarShown(meta) ? utils.GetSystemMetrics(2) : 0);
    const fixed = cols.reduce((a, c) => a + dp(c.width), 0), weights = cols.reduce((a, c) => a + c.resize, 0);
    let x = 0;
    return cols.map(c => {
        const w = dp(c.width) + (weights ? (client - fixed) * c.resize / weights : 0), r = { c, x, w };
        x += w;
        return r;
    });
}
const SORT = { title: "", dir: 1 };
function drawColumns(gr, y, h) {
    const s = hst(HST.col, 0), ty = y + Math.round((h - labelHeight(HST.col)) / 2);
    for (const { c, x, w } of columnLayout(presetMeta())) {
        if (!c.title) continue;
        const hov = c.sort && hover && hover.id === "col" && hover.data === c.title, col = hov ? C.fg : C["text-muted"];
        if (c.align === "right") label(gr, tr(c.title), hst(HST.col, col), Math.round(x + w - dp(6)), ty, 2);
        else label(gr, tr(c.title), hst(HST.col, col), Math.round(x + dp(6)), ty);
        if (x > dp(8)) vline(gr, Math.round(x), y + dp(6), h - dp(12), C.hair);
        if (c.sort && P.pl >= 0) hits.add("col", x, y, w, h, c.title);
    }
}
function sortBy(title) {
    const c = presetMeta().columns.find(k => k.title === title);
    if (!c || !c.sort || P.pl < 0) return;
    SORT.dir = SORT.title === title ? -SORT.dir : 1;
    SORT.title = title;
    plman.UndoBackup(P.pl);
    plman.SortByFormatV2(P.pl, c.sort, SORT.dir);
}

// LAYOUT [■ ALBUM | □ INDEX]: the playlist preset (the P key and the playlist's context menu switch it too)
function drawLayoutToggle(gr, xRight, y, hh) {
    const items = [["album", tr("ALBUM")], ["index", tr("INDEX")]], s = hst(HST.tog, 0);
    const widths = items.map(([, t]) => dp(9) + dp(5) + dp(6) + labelWidth(t, s) + dp(9)), total = widths[0] + widths[1];
    let ix = xRight - total;
    label(gr, tr("LAYOUT"), hst(HST.tog, C["text-muted"]), ix - dp(12), y + Math.round((hh - labelHeight(HST.tog)) / 2), 2);
    items.forEach(([p, t], i) => {
        const on = STATE.preset === p, hov = !on && hover && hover.id === "preset", col = on ? C.bg : hov ? C.fg : C["text-muted"];
        if (on) gr.FillSolidRect(ix, y, widths[i], hh, C.fg);
        toggleMark(gr, ix + dp(9), y + hh / 2, on, col);
        label(gr, t, hst(HST.tog, col, on ? C.fg : C.bg), ix + dp(20), y + Math.round((hh - labelHeight(HST.tog)) / 2));
        if (!on) hits.add("preset", ix, y, widths[i], hh, p);
        ix += widths[i];
    });
    box(gr, xRight - total, y, total, hh, C["line-faint"]);
}

// --------------------------------------------------------------------------------------------------- mouse
function on_mouse_move(x, y) {
    const a = hits.at(x, y);
    if ((a && a.id) !== (hover && hover.id) || (a && a.data) !== (hover && hover.data)) { hover = a; window.Repaint(); }
    window.SetCursor(a && (a.id === "preset" || a.id === "col") ? 32649 : 32512);
}
function on_mouse_leave() { if (hover) { hover = null; window.Repaint(); } }
function on_mouse_lbtn_up(x, y) {
    const a = hits.at(x, y);
    if (a && a.id === "preset") send("preset");
    else if (a && a.id === "col") sortBy(a.data);
}
function on_mouse_lbtn_dblclk(x, y) {
    const a = hits.at(x, y);
    if (!a || a.id !== "name" || P.pl < 0) return;
    let name;
    try { name = utils.InputBox(window.ID, tr("Playlist name"), tr("Rename playlist"), plman.GetPlaylistName(P.pl), true); } catch (e) { return; }
    if (name && name.trim()) plman.RenamePlaylist(P.pl, name.trim());
}
function on_char(code) { searchChar(code); }
function on_key_down(vk) { if (searchKey(vk)) return; if (vk === 0x20) fb.PlayOrPause(); else globalKey(vk); }

// ----------------------------------------------------------------------------------------------- callbacks
function on_playlist_switch() { load(true); }
function on_playlists_changed() { plDirty(); load(false); }
function on_playlist_items_added(i) { plDirty(i); if (i === P.pl) window.Repaint(); }
function on_playlist_items_removed(i) { plDirty(i); if (i === P.pl) { countSelection(); window.Repaint(); } }
function on_playlist_items_selection_change() { countSelection(); window.Repaint(); }
function on_playlist_items_reordered(i) { plDirty(i); }
function on_playback_new_track() { window.Repaint(); }
function on_playback_pause() { window.Repaint(); }
function on_playback_stop(reason) { if (reason !== 2) window.Repaint(); }
function on_colours_changed() { refreshTokens(); window.Repaint(); }
onMessage("state", () => { SORT.title = ""; window.Repaint(); });
send("hello");
load(false);
