"use strict";
// 02 · PLAYLISTS, left: the playlist manager and the track rail, one panel for both.
//   manager  PLAYLISTS ……… 06, then one 26 dp row per playlist: a rail line whose length is log(item count), number,
//            name, count. The active playlist is inverted with an orange square; the playing one has an orange tab.
//            Click activates, drag reorders, double-click renames, right-click: new / rename / duplicate / remove.
//   rail     INDEX and the track count, then one 2 dp line per track of the active playlist (13 dp apart; a long playlist is spread
//            over the lines, each standing for an equal share). Hover raises a bell-shaped wave and shows the hover
//            card (tip.js, placed by frame.js over the playlist); click selects and scrolls to the track, double-click
//            plays it. The playing track's line and the selected (focused) track's line are orange, at rest length.
//            Nothing moves while the mouse holds still.
// Keys while focused: ↑ ↓ switch playlists, F2 rename, Delete remove, Ctrl+N new; the shared keys otherwise.

include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\core.js");
include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\playlists.js");

const MST = {
    head: { size: 9, weight: 600, track: .16 },
    count: { size: 9, weight: 500, track: .1 },
    action: { size: 8.5, weight: 600, track: .14 },
    index: { size: 8.5, weight: 500, track: .12 },
};
const mst = (s, colour, bg = C.bg) => Object.assign({ colour, bg }, s);
const M = TOKENS.metrics;
const ROW = () => dp(M["manager-row"]), TOP = () => dp(52), PITCH = () => dp(13);
const MW = () => dp(side("list") * Math.min(TEXT_SCALE, 1.3));   // the rail starts here (as wide as the user dragged it, wider with larger text)

let W = 0, H = 0;
const hits = Hits();
let hover = null;            // hit under the mouse
let scroll = 0;              // first visible manager row
let drag = null;             // { from, y0, active, to }
let railHover = -1;          // rail line under the mouse
const lens = [];             // a spring per rail line: its length in dp

// ---------------------------------------------------------------------------------------------- rail model
// lines: one per track, or (for long playlists) one per equal share of the playlist
function railModel() {
    const pl = plman.ActivePlaylist, count = pl >= 0 ? plman.PlaylistItemCount(pl) : 0;
    const n = Math.max(0, Math.min(count, Math.floor((H - TOP() - dp(24)) / PITCH())));
    const loc = plman.GetPlayingItemLocation();
    const playing = loc.IsValid && loc.PlaylistIndex === pl ? loc.PlaylistItemIndex : -1;
    const lineOf = i => count ? Math.min(n - 1, Math.floor(i * n / count)) : -1;
    const focus = pl >= 0 && count ? plman.GetPlaylistFocusItemIndex(pl) : -1;
    return { pl, count, n, first: k => Math.floor(k * count / n), playLine: playing >= 0 ? lineOf(playing) : -1, playing,
             focusLine: focus >= 0 ? lineOf(focus) : -1 };
}
let RM = null;
const railDirty = () => { RM = null; };

const clock = Clock(dt => {
    const m = RM || (RM = railModel());
    while (lens.length < m.n) lens.push(Spring(15, 16));
    let more = false;
    for (let k = 0; k < m.n; k++) {
        const d = railHover >= 0 ? k - railHover : 99;
        const to = k === railHover ? 44 : railHover >= 0 ? 15 + 18 * Math.exp(-d * d / 4) : 15;
        lens[k].to = to;
        if (stepSpring(lens[k], dt)) more = true;
    }
    window.RepaintRect(MW(), 0, W - MW(), H);
    return more;
});

// --------------------------------------------------------------------------------------------------- paint
function on_size(w, h) { W = w; H = h; railDirty(); }

function on_paint(gr) {
    hits.clear();
    gr.FillSolidRect(0, 0, W, H, C.bg);
    // the wallpaper (lib/wallpaper.js) under the column, its labels then drawn live
    LABEL_LIVE = wallpaperOn("playlists") && drawWallpaper(gr, "manager", 0, 0, W, H);
    try { drawManager(gr); drawRail(gr); } finally { LABEL_LIVE = false; }
    drawGrain(gr, 0, 0, W, H);
    // the panel's right edge (next to the playlist) widens or narrows the list: marked while under the mouse or dragged
    SIDE_EDGES = [{ key: "list", x: W, dir: 1, k: Math.min(TEXT_SCALE, 1.3) }];
    if (edgeHot || SIDE_DRAG) gr.FillSolidRect(W - dp(2), 0, dp(2), H, C.accent);
}

function drawManager(gr) {
    const w = MW(), n = plman.PlaylistCount, active = plman.ActivePlaylist, x = dp(24);
    const loc = plman.GetPlayingItemLocation(), playingPl = loc.IsValid ? loc.PlaylistIndex : -1;
    label(gr, tr("PLAYLISTS"), mst(MST.head, C["text-muted"]), x, dp(24));
    label(gr, pad(n, 2), mst(MST.head, C.fg), w - dp(24), dp(24), 2);
    const counts = [];
    for (let i = 0; i < n; i++) counts.push(plman.PlaylistItemCount(i));
    const maxLog = Math.log10(Math.max(10, ...counts) + 1);
    const rows = visibleRows();
    scroll = clamp(scroll, 0, Math.max(0, n - rows));
    gr.PushClip(0, TOP(), w, rows * ROW());
    for (let r = 0; r < rows && scroll + r < n; r++) {
        const i = scroll + r, y = TOP() + r * ROW(), on = i === active, hov = hover && hover.id === "pl" && hover.data === i && !drag;
        if (on) gr.FillSolidRect(0, y, w, ROW(), C.fg);
        else if (hov || dropRow === i) gr.FillSolidRect(0, y, w, ROW(), C.panel);
        if (dropRow === i) box(gr, 0, y, w - HAIR, ROW(), C.accent, dp(2));   // tracks dragged over it land here
        const fg = on ? C.bg : C.fg, cy = y + ROW() / 2;
        // rail line: log(count)
        const L = Math.round(dp(6 + 18 * Math.log10(counts[i] + 1) / maxLog));
        gr.FillSolidRect(dp(14), Math.round(cy - dp(1)), L, dp(2), on ? C.bg : C["line-dim"]);
        if (on) gr.FillSolidRect(dp(14) + L, Math.round(cy - dp(3)), dp(6), dp(6), C.accent);
        if (i === playingPl) gr.FillSolidRect(0, y, dp(4), ROW(), C.accent);   // the playing playlist: an orange tab
        gr.DrawText(pad(i + 1, 2), font(11, 500), on ? C.bg : C["text-muted"], dp(50), y, dp(24), ROW(), DT_SINGLE);
        const name = plman.GetPlaylistName(i), cnt = fmtCount(counts[i]), cf = font(10.5, 400), cw = Math.ceil(gr.CalcTextWidth(cnt, cf));
        text(gr, name, 12, on ? 600 : 400, fg, dp(76), y, w - dp(76) - dp(18) - cw - dp(10), ROW());
        gr.DrawText(cnt, cf, on ? C.bg : C["text-muted"], w - dp(18) - cw, y, cw + dp(2), ROW(), DT_SINGLE);
        hits.add("pl", 0, y, w, ROW(), i);
    }
    // drop position while dragging: an orange rule between rows
    if (drag && drag.active) gr.FillSolidRect(0, TOP() + (drag.to - scroll) * ROW() - dp(1), w, dp(2), C.accent);
    gr.PopClip();
    // rows hidden above and below (the wheel scrolls)
    const hidden = n - Math.min(rows, n - scroll);
    if (hidden > 0) label(gr, tr("+ {0} MORE", hidden), mst(MST.count, C["text-muted"]), w - dp(24), TOP() + rows * ROW() + dp(4), 2);
    // + NEW PLAYLIST
    const ay = H - dp(38), nh = hover && hover.id === "new";
    const aw = label(gr, tr("+ NEW PLAYLIST"), mst(MST.action, dropRow === -1 ? C.accent : nh ? C.fg : C["text-muted"]), x, ay);
    hits.add("new", x - dp(6), ay - dp(6), aw + dp(12), labelHeight(MST.action) + dp(12));
    vline(gr, w - HAIR, 0, H, C.hair);
}
const visibleRows = () => Math.max(1, Math.floor((H - TOP() - dp(64)) / ROW()));

function drawRail(gr) {
    const m = RM || (RM = railModel()), x = MW() + dp(10);
    label(gr, tr("INDEX"), mst(MST.index, C["text-muted"]), x, dp(24));
    label(gr, pad(m.count, m.count > 999 ? 4 : 3), mst(MST.index, C.fg), x, dp(24) + labelHeight(MST.index) + dp(1));
    while (lens.length < m.n) lens.push(Spring(15, 16));
    for (let k = 0; k < m.n; k++) {
        const y = Math.round(TOP() + k * PITCH() + PITCH() / 2 - dp(1)), L = Math.round(dp(lens[k].x));
        const hot = k === railHover || k === m.playLine || k === m.focusLine;
        gr.FillSolidRect(x, y, L, dp(2), hot ? C.accent : C["line-dim"]);
    }
    if (m.n) hits.add("rail", MW(), TOP(), W - MW(), m.n * PITCH(), null);
}

// --------------------------------------------------------------------------------------------- hover card
const TF_TIP = fb.TitleFormat("[%album%]\u0001%title%\u0001[%artist%]\u0001[%length%]");
// the card is sent only when its content or place changes: re-sending moves and repaints the tip panel
let tipSent = "";
function sendTip(t) {
    const key = JSON.stringify(t);
    if (key === tipSent) return;
    tipSent = key;
    send("tip", t);
}
function showTip(k) {
    const m = RM || (RM = railModel());
    if (k < 0 || k >= m.n) { sendTip(null); return; }
    const i = m.first(k), items = plItems(m.pl);
    if (i >= items.Count) { sendTip(null); return; }
    const [album, title, artist, len] = TF_TIP.EvalWithMetadb(items[i]).split("\u0001");
    const share = m.n < m.count ? Math.max(1, m.first(k + 1) - i) : 1;
    const w = dp(300), h = dp(78), y = clamp(Math.round(TOP() + k * PITCH() + PITCH() / 2 - dp(30)), dp(8), H - h - dp(8));
    sendTip({
        x: W + dp(6), y, w, h,
        file: `${tr("FILE {0}", pad(i + 1, 3))}${album ? " · " + album.toUpperCase() : ""}`,
        title, meta: [artist.toUpperCase(), len].filter(Boolean).join(" · ") + (share > 1 ? `  ·  ${tr("+ {0} MORE", share - 1)}` : ""),
        playing: i === m.playing,
    });
}

// ------------------------------------------------------------------------------------------------- actions
function activate(i) { if (i >= 0 && i < plman.PlaylistCount) plman.ActivePlaylist = i; }
function newPlaylist() { const i = plman.CreatePlaylist(plman.PlaylistCount, ""); plman.ActivePlaylist = i; }
function renamePlaylist(i) {
    if (i < 0) return;
    let name;
    try { name = utils.InputBox(window.ID, tr("Playlist name"), tr("Rename playlist"), plman.GetPlaylistName(i), true); } catch (e) { return; }
    if (name && name.trim()) plman.RenamePlaylist(i, name.trim());
}
function removePlaylist(i) { if (i >= 0) plman.RemovePlaylistSwitch(i); }
function railJump(k, play) {
    const m = RM || (RM = railModel());
    if (k < 0 || k >= m.n) return;
    const i = m.first(k);
    if (play) { plman.ExecutePlaylistDefaultAction(m.pl, i); return; }
    plman.ClearPlaylistSelection(m.pl);
    plman.SetPlaylistSelectionSingle(m.pl, i, true);
    plman.SetPlaylistFocusItem(m.pl, i);
    plman.EnsurePlaylistItemVisible(m.pl, i);
}

function playlistMenu(x, y, i) {
    const menu = window.CreatePopupMenu();
    menu.AppendMenuItem(0, 1, tr("New playlist"));
    if (i >= 0) {
        menu.AppendMenuItem(0, 2, tr("Rename…"));
        menu.AppendMenuItem(0, 3, tr("Duplicate"));
        if (plman.IsAutoPlaylist(i)) menu.AppendMenuItem(0, 5, tr("Edit autoplaylist…"));
        else { const n = playlistInstrumentals(i).length; menu.AppendMenuItem(n ? 0 : 1, 6, tr("Remove instrumentals ({0})", n)); }
        menu.AppendMenuSeparator();
        menu.AppendMenuItem(0, 4, tr("Remove"));
    }
    const id = menu.TrackPopupMenu(x, y);
    if (id === 1) newPlaylist();
    else if (id === 2) renamePlaylist(i);
    else if (id === 3) plman.ActivePlaylist = plman.DuplicatePlaylist(i, plman.GetPlaylistName(i));
    else if (id === 4) removePlaylist(i);
    else if (id === 5) plman.ShowAutoPlaylistUI(i);
    else if (id === 6) removeInstrumentals(i);
}

// --------------------------------------------------------------------------------------------------- mouse
// Windows also sends mouse moves (and JSplitter mouse leaves) when windows around the cursor change, e.g. when the
// hover card appears: a move to the same spot is ignored and a leave only counts if no move follows within 120 ms,
// so the rail and its card stay put while the mouse holds still
let lastMove = "", leaveTimer = 0, edgeHot = false;
function on_mouse_move(x, y, mask) {
    window.ClearTimeout(leaveTimer); leaveTimer = 0;
    if (`${x},${y}` === lastMove && !drag) return;
    lastMove = `${x},${y}`;
    // the list's edge being dragged: the frame lays the panels out again as it goes (lib/bus.js)
    if (SIDE_DRAG) {
        if (!(mask & 1)) { sideDragEnd(x); return; }
        const w = sideDragTo(x);
        if (w !== side("list")) sendSide("list", w, false);
        window.SetCursor(32644);
        return;
    }
    const hot = !drag && !!sideEdgeAt(x);
    if (hot !== edgeHot) { edgeHot = hot; window.Repaint(); }
    if (hot) { window.SetCursor(32644); return; }   // IDC_SIZEWE
    if (drag) {
        if (!drag.active && Math.abs(y - drag.y0) > dp(4)) drag.active = true;
        if (drag.active) {
            drag.to = clamp(scroll + Math.round((y - TOP()) / ROW()), 0, plman.PlaylistCount);
            window.RepaintRect(0, 0, MW(), H);
            return;
        }
    }
    const a = hits.at(x, y), was = hover;
    hover = a;
    window.SetCursor(a && a.id !== "rail" ? 32649 : 32512);
    const k = a && a.id === "rail" ? Math.floor((y - TOP()) / PITCH()) : -1;
    if (k !== railHover) { railHover = k; showTip(k); clock.wake(); }
    if ((was && was.id) !== (a && a.id) || (was && was.data) !== (a && a.data)) window.RepaintRect(0, 0, MW(), H);
}
function on_mouse_leave() {
    if (edgeHot && !SIDE_DRAG) { edgeHot = false; window.Repaint(); }
    window.ClearTimeout(leaveTimer);
    leaveTimer = window.SetTimeout(() => {
        leaveTimer = 0; lastMove = "";
        hover = null;
        if (railHover >= 0) { railHover = -1; sendTip(null); clock.wake(); }
        window.Repaint();
    }, 120);
}
function on_mouse_lbtn_down(x, y) {
    if (sideDragStart(x)) return;
    const a = hits.at(x, y);
    if (a && a.id === "pl") drag = { from: a.data, y0: y, active: false, to: a.data };
}
function sideDragEnd(x) { const w = sideDragTo(x); SIDE_DRAG = null; sendSide("list", w, true); window.Repaint(); }
function on_mouse_lbtn_up(x, y) {
    if (SIDE_DRAG) { sideDragEnd(x); return; }
    const d = drag;
    drag = null;
    if (d && d.active) {
        const to = d.to > d.from ? d.to - 1 : d.to;
        if (to !== d.from) plman.MovePlaylist(d.from, to);
        window.Repaint();
        return;
    }
    const a = hits.at(x, y);
    if (!a) return;
    if (a.id === "pl") activate(a.data);
    else if (a.id === "new") newPlaylist();
    else if (a.id === "rail") railJump(Math.floor((y - TOP()) / PITCH()), false);
}
function on_mouse_lbtn_dblclk(x, y) {
    if (sideEdgeAt(x)) { sendSide("list", SIDES_START.list, true); return; }   // the edge: back to the list's own width
    const a = hits.at(x, y);
    if (a && a.id === "pl") renamePlaylist(a.data);
    else if (a && a.id === "rail") railJump(Math.floor((y - TOP()) / PITCH()), true);
    else if (!a && y > TOP() && x < MW()) newPlaylist();
}
function on_mouse_rbtn_up(x, y, mask) {
    if (mask & 0x0004) return false;   // Shift: JSplitter's own menu
    if (x >= MW()) return true;
    const a = hits.at(x, y);
    playlistMenu(x, y, a && a.id === "pl" ? a.data : -1);
    return true;
}
function on_mouse_wheel(step) {
    if (railHover >= 0) return;
    const n = plman.PlaylistCount, rows = visibleRows();
    const s = clamp(scroll - step * 3, 0, Math.max(0, n - rows));
    if (s !== scroll) { scroll = s; window.Repaint(); }
}

// --------------------------------------------------------------------------------------------- drag and drop
// Tracks dragged over the list (from the playlist beside it, another window, Explorer) are added to the end of the
// playlist under the mouse; below the rows they make a new playlist. Autoplaylists, locked playlists and the theme's
// own (lib/bus.js OWN_PLAYLISTS) take none. The tracks stay where they came from: always a copy.
let dropRow = -2;            // -2: nothing dragged over the list, -1: a new playlist, else the playlist's index
function dropTarget(x, y) {
    if (x >= MW() || y < TOP()) return -2;
    const a = hits.at(x, y);
    if (!a || a.id !== "pl") return -1;
    const i = a.data;
    return plman.IsAutoPlaylist(i) || plman.IsPlaylistLocked(i) || OWN_PLAYLISTS.has(plman.GetPlaylistName(i)) ? -2 : i;
}
const dropEffect = (action, t) => t === -2 ? 0 : action.Effect & 1 ? 1 : action.Effect & 4;   // copy, else link (some sources allow only that)
function dropMark(t) { if (t !== dropRow) { dropRow = t; window.RepaintRect(0, 0, MW(), H); } }
function on_drag_enter(action, x, y) { const t = dropTarget(x, y); action.Effect = dropEffect(action, t); dropMark(t); }
function on_drag_over(action, x, y) { const t = dropTarget(x, y); action.Effect = dropEffect(action, t); dropMark(t); }
function on_drag_leave() { dropMark(-2); }
function on_drag_drop(action, x, y) {
    const t = dropTarget(x, y), effect = dropEffect(action, t);
    drag = null;             // the mouse-up that would end a reorder does not arrive after a drop
    dropMark(-2);
    if (!effect) { action.Effect = 0; return; }
    const to = t >= 0 ? t : plman.CreatePlaylist(plman.PlaylistCount, "");
    action.Playlist = to;
    action.Base = plman.PlaylistItemCount(to);
    action.ToSelect = false; // the playlist on screen stays
    action.Effect = effect;
}

// ---------------------------------------------------------------------------------------------------- keys
function on_char(code) { searchChar(code); }
function on_key_down(vk) {
    if (searchKey(vk)) return;
    const ctrl = utils.IsKeyPressed(0x11), n = plman.PlaylistCount, active = plman.ActivePlaylist;
    if (vk === 0x26 || vk === 0x28) {   // ↑ ↓
        const i = clamp(active + (vk === 0x28 ? 1 : -1), 0, n - 1);
        activate(i);
        const rows = visibleRows();
        if (i < scroll) scroll = i; else if (i >= scroll + rows) scroll = i - rows + 1;
        return;
    }
    if (vk === 0x71) { renamePlaylist(active); return; }            // F2
    if (vk === 0x2E) { removePlaylist(active); return; }            // Delete
    if (ctrl && vk === 0x4E) { newPlaylist(); return; }             // Ctrl+N
    if (vk === 0x20) { fb.PlayOrPause(); return; }
    globalKey(vk);
}

// ----------------------------------------------------------------------------------------------- callbacks
function refresh() { railDirty(); if (railHover >= 0) showTip(railHover); clock.wake(); window.Repaint(); }
function on_playlists_changed() { plDirty(); refresh(); }
function on_playlist_switch() { lens.length = 0; railHover = -1; sendTip(null); refresh(); }
function on_playlist_items_added(i) { plDirty(i); if (i === plman.ActivePlaylist) lens.length = 0; refresh(); }
function on_playlist_items_removed(i) { plDirty(i); if (i === plman.ActivePlaylist) lens.length = 0; refresh(); }
function on_playlist_items_reordered(i) { plDirty(i); refresh(); }
function on_playback_new_track() { refresh(); }
function on_item_focus_change(pl) { if (pl === plman.ActivePlaylist) { railDirty(); window.RepaintRect(MW(), 0, W - MW(), H); } }
function on_playback_stop(reason) { if (reason !== 2) refresh(); }
function on_colours_changed() { refreshTokens(); window.Repaint(); }
onMessage("state", () => { if (STATE.view !== "playlists" && railHover >= 0) { railHover = -1; sendTip(null); } window.Repaint(); });
window.DlgCode = 0x0004;   // arrows, F2 and Delete reach the panel
helloFrame();   // lib/bus.js
