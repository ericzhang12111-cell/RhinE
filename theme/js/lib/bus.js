"use strict";
// Messages between the theme's panels. window.NotifyOthers is synchronous and reaches every other JSplitter panel;
// messages are JSON strings so no object is shared between panels.
//
// The root panel (frame.js) owns the shared state — view, playlist preset, reduce motion, boot, case skin, grain —
// and broadcasts it as
// "state"; other panels ask for it with "hello" when they load, and send requests ("view", "mode", "preset", ...).

const BUS = "audio-archive";
const BUS_HANDLERS = {};
const STATE = { view: "playlists", preset: "album", reduce: false, boot: true, skin: "white", grain: true, lyricsOnline: true };

function send(type, data = null) { window.NotifyOthers(BUS, JSON.stringify({ type, data })); }
function onMessage(type, fn) { (BUS_HANDLERS[type] = BUS_HANDLERS[type] || []).push(fn); }

function on_notify_data(name, info) {
    if (name !== BUS) return;
    let m;
    try { m = JSON.parse(info); } catch (e) { return; }
    if (m.type === "state") { Object.assign(STATE, m.data); REDUCE_MOTION = !!STATE.reduce; }
    (BUS_HANDLERS[m.type] || []).forEach(fn => fn(m.data));
}

// Keys shared by every scripted panel (the focused panel receives them): 1 – 5 views, T light/dark, P playlist preset,
// B intro film, S shuffle the library, / search. A panel calls globalKey(vk) for keys it does not use itself.
function globalKey(vk) {
    if (vk === 0xBF) { startSearchFwd(); return true; }   // "/"
    if (vk >= 0x31 && vk <= 0x35) send("view", ["archive", "playlists", "lyrics", "signal", "style"][vk - 0x31]);
    else if (vk === 0x54) send("mode");
    else if (vk === 0x50) send("preset");
    else if (vk === 0x42) send("boot-play");   // B
    else if (vk === 0x53) shuffleLibrary();    // S
    else return false;
    return true;
}

// Shuffle the whole library (not just one playlist): the "Library · Shuffle" playlist is refilled with every track of
// the media library (or, with no media library configured, every track in the playlists), its order randomised once,
// and it plays from the top with Repeat (playlist), so what comes next is visible and every track plays once a lap.
// (foobar2000's own orders only reorder the active playlist: Random picks any track of it each time, repeats
// allowed; Shuffle tracks / albums / folders play all of it once in a random order.)
const SHUFFLE_NAME = "Library · Shuffle";
// the theme's own playlists: never a source of the archive or of the shuffle
const OWN_PLAYLISTS = new Set(["Search", "Archive · Album", SHUFFLE_NAME]);
function shuffleLibrary() {
    let items = fb.GetLibraryItems();
    if (!items || !items.Count) {
        items = new FbMetadbHandleList();
        for (let i = 0; i < plman.PlaylistCount; i++) if (!OWN_PLAYLISTS.has(plman.GetPlaylistName(i))) items.AddRange(plman.GetPlaylistItems(i));
    }
    if (!items.Count) return false;
    const pl = plman.FindOrCreatePlaylist(SHUFFLE_NAME, true);
    plman.UndoBackup(pl);
    plman.ClearPlaylist(pl);
    plman.InsertPlaylistItemsFilter(pl, 0, items);
    plman.SortByFormat(pl, "");
    plman.ActivePlaylist = pl;
    plman.PlaybackOrder = 1;
    plman.ExecutePlaylistDefaultAction(pl, 0);
    return true;
}

// "/" in any panel starts typing into the header's search field. JSplitter cannot move the keyboard focus, so the
// panel keeps it and forwards what is typed until the search ends (Esc, or a click elsewhere in the header): it calls
// searchKey(vk) first in on_key_down and searchChar(code) from on_char. (A library file must not define a callback
// such as on_char itself: it would replace the panel's own, which is declared before the include runs.)
let SEARCH_FWD = false, SEARCH_DLG = 0, SEARCH_SKIP = 0;
function startSearchFwd() {
    if (!SEARCH_FWD) { SEARCH_DLG = window.DlgCode; window.DlgCode = SEARCH_DLG | 0x0004 | 0x0080; }   // all keys + characters
    SEARCH_FWD = true;
    SEARCH_SKIP = 0x2F;   // the "/" that started it arrives as a character next
    send("search");
}
onMessage("search-end", () => { if (SEARCH_FWD) { SEARCH_FWD = false; window.DlgCode = SEARCH_DLG; } });
function searchChar(code) {
    if (!SEARCH_FWD) return;
    if (code === SEARCH_SKIP) { SEARCH_SKIP = 0; return; }
    SEARCH_SKIP = 0;
    send("search-char", code);
}
function searchKey(vk) {
    if (!SEARCH_FWD) return false;
    if (vk === 0x08 || vk === 0x0D || vk === 0x1B) send("search-key", vk);   // Backspace, Enter, Esc
    return true;   // everything else arrives as characters
}
