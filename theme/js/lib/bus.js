"use strict";
// Messages between the theme's panels. window.NotifyOthers is synchronous and reaches every other JSplitter panel;
// messages are JSON strings so no object is shared between panels.
//
// The root panel (frame.js) owns the shared state — view, playlist preset, reduce motion, boot, case skin, grain —
// and broadcasts it as
// "state"; other panels ask for it with "hello" when they load, and send requests ("view", "mode", "preset", ...).

const BUS = "audio-archive";
const BUS_HANDLERS = {};
const STATE = { view: "playlists", preset: "album", reduce: false, boot: true, skin: "white", grain: true,
                lyricsSource: "auto", lyricsTrans: "off", lyricsNeteaseAuto: false,
                textScale: 1, arrayScale: 1, inspectScale: 1.3, wallpaper: null, halftone: "bottom", halftoneLevel: "mid" };

// text size, Array scale and inspection size: the choices offered in MENU › Audio Archive and the Style view (frame.js keeps the value)
const TEXT_SCALES = [.9, 1, 1.1, 1.2, 1.35, 1.5], ARRAY_SCALES = [.8, .9, 1, 1.15, 1.3], INSPECT_SCALES = [1, 1.15, 1.3, 1.5];
// the floor under the Archive array: "plain" (the page colour) or a rendered one in assets/render/floor/<id>-<mode>/
const FLOORS = [["plain", "PLAIN"], ["deck", "LAB DECK"], ["real", "REAL STYLE"]], FLOOR_NAMES = ["Plain", "Lab deck", "Real style"];
// REAL STYLE is one scene: a walnut desk lit like the cases on it, with the one case skin it was rendered for, which
// the Archive (and the stage's other views) use while it is on, whatever the chosen skin
const FLOOR_SKIN = { real: "frost" };
const stageSkin = () => FLOOR_SKIN[STATE.floor] || STATE.skin;
const pickFloor = v => FLOORS.some(f => f[0] === v) ? v : "plain";
// the halftone of dots on the album file and the signal profile card (05 STYLE): where (off, along the bottom, the
// lower right corner) and how strong (lib/draw.js halftoneDecor)
const HALFTONES = [["off", "OFF"], ["bottom", "BOTTOM"], ["corner", "CORNER"]], HALFTONE_LEVELS = [["low", "FAINT"], ["mid", "MEDIUM"], ["high", "STRONG"]];
const pickHalftone = v => HALFTONES.some(f => f[0] === v) ? v : "bottom";
const pickHalftoneLevel = v => HALFTONE_LEVELS.some(f => f[0] === v) ? v : "mid";
// Where the lyrics come from — the switch at the right of the Lyrics view's LYRICS MONITOR row, and the same four in the
// MENU. AUTO keeps the original priority: what the file has wins (a synced .lrc or tag), the online lookup filling in
// only a track with none, or with plain (unsynced) text, LRCLIB first and NetEase when it has nothing. The others are
// fixed sources: LOCAL never goes online, LRCLIB and NETEASE are the only source used while they are on (the file is not
// read at all, so a miss is a miss)
const LYR_SOURCES = [["auto", "AUTO"], ["local", "LOCAL"], ["lrclib", "LRCLIB"], ["netease", "NETEASE"]];
const pickLyricsSource = v => LYR_SOURCES.some(s => s[0] === v) ? v : "auto";
// Where the translation under each line comes from (MENU › Translate lyrics). Independent of the lyrics source, so the
// file's or LRCLIB's words can carry the NetEase community translation: OFF, that community translation (Chinese), the
// machine services, or AUTO (community first, machine when it has none).
const LYR_TRANS = [["off", "Off"], ["netease", "NetEase community"], ["machine", "Machine translation"], ["auto", "Automatic"]];
const pickLyricsTrans = v => LYR_TRANS.some(s => s[0] === v) ? v : "off";
// the translation a settings file with no lyricsTrans gets: the community translation on a Chinese Windows (where NetEase
// is useful), nothing elsewhere (machine translation was off by default)
const defaultLyricsTrans = () => SYSTEM_LANG.startsWith("zh") ? "netease" : "off";
// which online sources the chosen lyrics source allows: AUTO is LRCLIB first and NetEase when it has nothing, the fixed
// ones are themselves, LOCAL is neither
const lyrOnline = () => STATE.lyricsSource !== "local";
const lyrLrclib = () => STATE.lyricsSource === "auto" || STATE.lyricsSource === "lrclib";
// a fixed source is the one that supplies the lyrics, so the file's are not used at all with it: a switch labelled
// LRCLIB that quietly showed the local .lrc read as the switch not having taken effect (stage.js)
const lyrFixed = () => STATE.lyricsSource === "lrclib" || STATE.lyricsSource === "netease";
// NetEase also needs the reader to have allowed it: the fixed NETEASE source is an explicit choice, but the AUTO
// fallback is not, and it sends the track's artist, title and length to music.163.com. lyricsNeteaseAuto carries that
// permission, with the old lyricsNetease default (on for a Chinese Windows, off elsewhere), so AUTO does not start
// contacting NetEase for everyone.
const lyrNetease = () => STATE.lyricsSource === "netease" || (STATE.lyricsSource === "auto" && !!STATE.lyricsNeteaseAuto);
const pickScale = (v, list) => list.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, 1);

function send(type, data = null) { window.NotifyOthers(BUS, JSON.stringify({ type, data })); }
function onMessage(type, fn) { (BUS_HANDLERS[type] = BUS_HANDLERS[type] || []).push(fn); }
// a new interface language (lib/i18n.js): each panel reloads its script, which reads the language again. The root
// panel (frame.js) has no text of its own on screen and stays, so the layout and the intro are not restarted.
let RELOAD_ON_LANG = true;
onMessage("ui-lang", () => { if (RELOAD_ON_LANG) window.Reload(); });
// the custom colour scheme was edited (05 STYLE): work it out again; frame.js imports it when it is in use. The scheme in
// use is not looked up again here: Columns UI still has the old colours, which no longer match (on_colours_changed does
// it once the import has landed).
onMessage("custom-scheme", () => { TOKENS.schemes.custom = customScheme(TOKENS); window.Repaint(); });

function on_notify_data(name, info) {
    if (name !== BUS) return;
    let m;
    try { m = JSON.parse(info); } catch (e) { return; }
    if (m.type === "state") {
        Object.assign(STATE, m.data);
        REDUCE_MOTION = !!STATE.reduce;
        // a new text size: caches that hold drawn text are dropped like after a colour change
        if (setTextScale(STATE.textScale)) { TOKEN_LISTENERS.forEach(f => f()); window.Repaint(); }
    }
    (BUS_HANDLERS[m.type] || []).forEach(fn => fn(m.data));
}

// Explorer at the folder of `h`'s file, with the file selected (local files only: nothing for a stream)
function openFolder(h) {
    const p = h && h.Path;
    if (!p || !/^([a-z]:\\|\\\\)/i.test(p) || !utils.IsFile(p)) return false;
    utils.Run("explorer.exe", `/select,"${p}"`, "", "", 1, false);
    return true;
}

// Keys shared by every scripted panel (the focused panel receives them): 1 – 5 views, T light/dark, P playlist preset,
// B intro film, S shuffle the library, F the playing (else focused) track's folder, / search. A panel calls globalKey(vk) for keys it does not use itself.
function globalKey(vk) {
    if (vk === 0xBF) { startSearchFwd(); return true; }   // "/"
    // Ctrl+1–5: rate the playing (else focused) track; Ctrl+0: clear its rating (lib/rating.js)
    if (vk >= 0x30 && vk <= 0x35 && utils.IsKeyPressed(0x11)) { setRating(fb.GetNowPlaying() || fb.GetFocusItem(), vk - 0x30, false); return true; }
    if (vk >= 0x31 && vk <= 0x35) send("view", ["archive", "playlists", "lyrics", "signal", "style"][vk - 0x31]);
    else if (vk === 0x54) send("mode");
    else if (vk === 0x50) send("preset");
    else if (vk === 0x42) send("boot-play");   // B
    else if (vk === 0x53) shuffleLibrary();    // S
    else if (vk === 0x46) openFolder(fb.GetNowPlaying() || fb.GetFocusItem());   // F
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

// foobar2000's main-menu commands are run by their path ("View/Mode/Dark"), and translated builds of foobar2000 and of
// its components rename those paths. The commands below are tried by their English path, then found by their place in
// the menu, which a translation does not change.
function fbCommands() { try { return JSON.parse(fb.EnumerateMainMenuCommands()); } catch (e) { return []; } }
const cmdParent = p => p.slice(0, p.lastIndexOf("/"));
const cmdName = p => p.slice(p.lastIndexOf("/") + 1);

// Columns UI's View › Mode: four commands, "Switch to other mode" (kept out of the menu itself), Light, Dark and Use
// system setting, the one in use a radio item
function runSwitchMode() {
    if (fb.RunMainMenuCommand("View/Mode/Switch to other mode")) return true;
    const groups = new Map();
    for (const c of fbCommands()) {
        if (c.Type !== "Fixed") continue;
        const p = cmdParent(c.FullPath);
        groups.set(p, (groups.get(p) || []).concat([c]));
    }
    for (const [p, g] of groups) {
        const hidden = g.filter(c => !c.Visible && !c.HiddenByDefault);
        if (p.split("/").length === 2 && g.length === 4 && hidden.length === 1 && g.some(c => c.Visible && c.Radio))
            return fb.RunMainMenuCommand(hidden[0].FullPath);
    }
    return false;
}

// View › Visualizations: foobar2000's own (Spectrum, Oscilloscope, …) and those of installed components, each opening
// in a window of its own; [path, name] pairs
const VIS_MENUS = ["Visualizations", "Visualisations", "可视化", "视觉效果", "視覺化", "ビジュアライゼーション", "視覚エフェクト"];
const visualizations = () => fbCommands()
    .filter(c => c.Visible && c.FullPath.split("/").length === 3 && VIS_MENUS.includes(cmdName(cmdParent(c.FullPath))))
    .map(c => [c.FullPath, cmdName(c.FullPath)]);
function visMenu(x, y) {
    const list = visualizations(), m = window.CreatePopupMenu();
    list.forEach(([, name], i) => m.AppendMenuItem(0, 1 + i, name + "…"));
    if (!list.length) m.AppendMenuItem(0x1, 999, tr("No visualizations found"));   // MF_GRAYED
    m.AppendMenuSeparator();
    m.AppendMenuItem(0, 900, tr("foobar2000 Preferences…"));
    const id = m.TrackPopupMenu(x, y, 0);
    if (id === 900) fb.ShowPreferences();
    else if (list[id - 1]) fb.RunMainMenuCommand(list[id - 1][0]);
}

// DSP: foobar2000's DSP presets, the windows under View › DSP (the equalizer) and the DSP Manager page of Preferences
function dspPresets() { try { return JSON.parse(fb.GetDSPPresets()); } catch (e) { return []; } }
function activeDsps() { try { return JSON.parse(fb.GetActiveDSPs()); } catch (e) { return []; } }
function dspMenu(x, y) {
    const presets = dspPresets(), names = new Set(presets.map(p => p.name)), all = fbCommands();
    const windows = all.filter(c => c.Type === "Fixed" && c.Visible && /^[^/]+\/DSP\/[^/]+$/.test(c.FullPath));
    // Playback › DSP settings: the presets plus one more entry, the DSP Manager
    const manager = all.find(c => c.Type === "Dynamic" && /DSP/.test(cmdName(cmdParent(c.FullPath))) && !names.has(cmdName(c.FullPath)));
    const m = window.CreatePopupMenu();
    presets.forEach((p, i) => m.AppendMenuItem(0, 1 + i, p.name.replace(/&/g, "&&")));
    const on = presets.findIndex(p => p.active);
    if (on >= 0) m.CheckMenuRadioItem(1, presets.length, 1 + on);
    if (!presets.length) m.AppendMenuItem(0x1, 999, tr("No DSP presets yet"));
    m.AppendMenuSeparator();
    windows.forEach((c, i) => m.AppendMenuItem(0, 500 + i, cmdName(c.FullPath) + "…"));
    m.AppendMenuItem(0, 900, tr("DSP Manager…"));
    const id = m.TrackPopupMenu(x, y, 0);
    if (id === 900) { if (!(manager && fb.RunMainMenuCommand(manager.FullPath))) fb.ShowPreferences(); }
    else if (id >= 500 && windows[id - 500]) fb.RunMainMenuCommand(windows[id - 500].FullPath);
    else if (id >= 1 && id <= presets.length) fb.SetDSPPreset(id - 1);
}
