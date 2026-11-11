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
                lyricsSource: "auto", lyricsTrans: "off", lyricsNeteaseAuto: false, lyricsRoma: false,
                textScale: 1, arrayScale: 1, inspectScale: 1.3, wallpaper: null, halftone: "bottom", halftoneLevel: "mid",
                emblem: "ring", tag: "plastic", tagShape: "tab", tagColours: "scheme", tagCustom: null, tagOpacity: 50, tagBody: "solid", tagFactory: null, font: "geist",
                sides: null, modeSystem: false, borderless: false, roomMat: "cream", roomLight: {},
                mini: false, miniCorner: "br", miniShow: "lrc", miniSkin: "dark" };   // the mini player (mini.js): on, its screen corner, LRC | TRK

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
// the header's emblem (05 STYLE, lib/emblem.js): the Möbius ring or nested triangles
const EMBLEMS = [["ring", "RING"], ["delta", "DELTA"]];
const pickEmblem = v => EMBLEMS.some(f => f[0] === v) ? v : "ring";
// the Archive room's cases (05 STYLE › ARCHIVE › ROOM; room.js): cream polymer, jade glass, white or blackout, or the
// RhinE Lab original's own case (with the camera and light of its own room)
const ROOM_MATS = [["cream", "FROST"], ["glass", "GLASS"], ["white", "WHITE"], ["blackout", "BLACKOUT"], ["rhine", "RHINE LAB"]];
const pickRoomMat = v => ROOM_MATS.some(f => f[0] === v) ? v : "cream";
// the opaque ones are lit by lights of their own (cream and jade glow from the floor below), one of these each
// (STATE.roomLight: material -> its light; the first when none was picked); their assets are room/<material>-<light>/
const ROOM_LIGHTS = { white: [["l2", "TOP LIGHT"], ["l3", "BACKLIGHT"], ["l5", "TWO-TONE"]],
                      blackout: [["l1", "WARM KEY"], ["l5", "TWO-TONE"], ["l6", "SOFTBOX"]] };
const roomLightOf = (mat = STATE.roomMat) => { const L = ROOM_LIGHTS[mat]; if (!L) return ""; const v = STATE.roomLight && STATE.roomLight[mat]; return L.some(f => f[0] === v) ? v : L[0][0]; };
const roomSet = (mat = STATE.roomMat) => roomLightOf(mat) ? `${mat}-${roomLightOf(mat)}` : mat;
// A track's front cover, as utils.GetAlbumArtAsyncV2 gives it ({ image }); for a song of 06 ONLINE (the bridge's
// address, lib/online.js) the cover the bridge saved beside its tag: foobar2000 reads no pictures from a stream
const ONLINE_ART = fb.ProfilePath + "audio-archive-online\\data\\art\\";
function albumArtAsync(handle) {
    // (the bridge's art\<id>.jpg; a QQ Music song's: qq-<mid>.jpg)
    const m = handle && /^http:\/\/127\.0\.0\.1:\d+\/(ne|qq)\/play\/(\w+)/.exec(handle.RawPath), file = m ? ONLINE_ART + (m[1] === "qq" ? "qq-" : "") + m[2] + ".jpg" : "";
    if (file && utils.IsFile(file)) return d2d.LoadImageAsyncV2(0, file).then(image => ({ image }));
    return utils.GetAlbumArtAsyncV2(window.ID, handle, 0);
}
// the title tag on the signal profile card and the album file (05 STYLE, lib/tag.js): its finish, or off (plain text),
// its shape and where its colours come from (TAG_SHAPES, TAG_COLOUR_SOURCES in lib/tag.js); FACTORY: one of the tags
// rendered in their own materials and colours (TAG_FACTORY in lib/tag.js, the one in use: tagFactory)
const TAGS = [["off", "OFF"], ["plastic", "PLASTIC"], ["paper", "PAPER"], ["metal", "BRUSHED METAL"], ["frosted", "TRANSLUCENT"], ["clear", "TRANSPARENT"], ["tide", "TIDE GLASS"], ["aurora", "AURORA GLASS"],
              ["factory", "FACTORY"]];
const pickTag = v => TAGS.some(f => f[0] === v) ? v : "plastic";
const pickTagShape = v => ["tab", "notch", "round", "ticket"].includes(v) ? v : "tab";
const pickTagColours = v => ["scheme", "case", "custom"].includes(v) ? v : "scheme";
const pickTagOpacity = v => [25, 50, 75].includes(+v) ? +v : 50;
const pickTagBody = v => ["solid", "frosted", "clear"].includes(v) ? v : "solid";
// the interface font (05 STYLE › FONT, lib/tokens.js FONT_FAMILIES)
const FONTS = [["geist", "GEIST MONO"], ["oxanium", "OXANIUM"], ["chakra", "CHAKRA PETCH"]];
const pickFont = v => FONTS.some(f => f[0] === v) ? v : "geist";
const pickScale = (v, list) => list.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, 1);
// a text size: the menu's steps (TEXT_SCALES) or any typed in 05 STYLE (SIZE), from 80 to 150 %, to the per cent
const textScaleOf = v => Math.round(clamp(+v || 1, .8, 1.5) * 100) / 100;

// The side columns' widths, which the user sets by dragging their edges (double-click: back to these), in dp at 100 %:
//   list  Playlists' list of playlists (it also widens with the text size, as before)
//   card  the card column of Playlists and Lyrics          left  Lyrics' left column          file  the Archive's album file
// frame.js keeps them (setting "sides") and sends them with the state; a panel drags its own edges (SIDE_EDGES).
const SIDES_START = { list: 232, card: 328, left: 376, file: 456 };
const SIDES_RANGE = { list: [170, 440], card: [264, 520], left: [264, 600], file: [380, 760] };
function pickSides(s) {
    s = s && typeof s === "object" ? s : {};
    const o = {};
    for (const k in SIDES_START) { const v = +s[k]; o[k] = isFinite(v) && v > 0 ? clamp(Math.round(v), SIDES_RANGE[k][0], SIDES_RANGE[k][1]) : SIDES_START[k]; }
    return o;
}
const side = k => (STATE.sides && STATE.sides[k]) || SIDES_START[k];
// Dragging an edge: the panel lists its edges as it paints (SIDE_EDGES: { key, x, dir: +1 when the column is left of
// the edge, -1 when right of it, k: how many dp the column grows per dp of drag }); the cursor turns to ↔ near one.
// sideDragTo(x) gives the dragged column's width in dp for the mouse at x (the panel must not move as it is dragged).
let SIDE_EDGES = [], SIDE_DRAG = null;
const sideEdgeAt = x => SIDE_EDGES.find(e => Math.abs(x - e.x) <= dp(5)) || null;
function sideDragStart(x) {
    const e = sideEdgeAt(x);
    if (!e) return false;
    SIDE_DRAG = { key: e.key, dir: e.dir, k: e.k || 1, x0: x, w0: side(e.key) };
    return true;
}
const sideDragTo = x => { const d = SIDE_DRAG; return clamp(Math.round(d.w0 + d.dir * (x - d.x0) / SCALE / d.k), SIDES_RANGE[d.key][0], SIDES_RANGE[d.key][1]); };
// a width for the frame to keep (save: at the end of a drag, or a reset)
const sendSide = (key, w, save) => send("sides", { w: { [key]: w }, save });

function send(type, data = null) { window.NotifyOthers(BUS, JSON.stringify({ type, data })); }
function onMessage(type, fn) { (BUS_HANDLERS[type] = BUS_HANDLERS[type] || []).push(fn); }
// A panel asks frame.js for the state when it loads ("hello"). Not straight away: frame.js answers at once, and a panel
// that reloads on its own (a new interface language) could lose an answer that arrives while its script is still
// running, and then stay on the defaults (the stage drew an empty view). So it asks a moment later, and again every half
// second until a state has arrived (at start frame.js is not ready yet and sends it itself when it is).
let STATE_SEEN = false;
function helloFrame(tries = 10) {
    window.SetTimeout(() => {
        if (STATE_SEEN) return;
        send("hello");
        if (tries > 1) window.SetTimeout(() => helloFrame(tries - 1), 450);
    }, 50);
}
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
        STATE_SEEN = true;
        Object.assign(STATE, m.data);
        REDUCE_MOTION = !!STATE.reduce;
        // a new text size or font: caches that hold drawn text are dropped like after a colour change
        if (setTextScale(STATE.textScale) | setFontFamily(STATE.font)) { TOKEN_LISTENERS.forEach(f => f()); window.Repaint(); }
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
// B intro film, S shuffle the library, F the playing (else focused) track's folder, H its heart (lib/favourite.js),
// / search, F11 borderless full screen, M the mini player. A panel calls globalKey(vk) for keys it does not use itself.
function globalKey(vk) {
    if (vk === 0xBF) { startSearchFwd(); return true; }   // "/"
    // Ctrl+1–5: rate the playing (else focused) track; Ctrl+0: clear its rating (lib/rating.js)
    if (vk >= 0x30 && vk <= 0x35 && utils.IsKeyPressed(0x11)) { setRating(fb.GetNowPlaying() || fb.GetFocusItem(), vk - 0x30, false); return true; }
    if (vk >= 0x31 && vk <= 0x36) send("view", ["archive", "playlists", "lyrics", "signal", "style", "online"][vk - 0x31]);
    else if (vk === 0x54) send("mode");
    else if (vk === 0x50) send("preset");
    else if (vk === 0x42) send("boot-play");   // B
    else if (vk === 0x53) shuffleLibrary();    // S
    else if (vk === 0x46) openFolder(fb.GetNowPlaying() || fb.GetFocusItem());   // F
    else if (vk === 0x48) setFav(fb.GetNowPlaying() || fb.GetFocusItem());       // H
    else if (vk === 0x7A) send("borderless");   // F11
    else if (vk === 0x4D) send("mini");         // M
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
const OWN_PLAYLISTS = new Set(["Search", "Archive · Album", "Archive · Favourites", SHUFFLE_NAME]);
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
    if (!SEARCH_FWD) { SEARCH_DLG = window.DlgCode; window.DlgCode = SEARCH_DLG | 0x0004 | 0x0080; fieldFocus(true); }   // all keys + characters; no shortcuts
    SEARCH_FWD = true;
    SEARCH_SKIP = 0x2F;   // the "/" that started it arrives as a character next
    send("search");
}
onMessage("search-end", () => { if (SEARCH_FWD) { SEARCH_FWD = false; window.DlgCode = SEARCH_DLG; fieldFocus(false); } });
function searchChar(code) {
    if (!SEARCH_FWD) return;
    if (code === SEARCH_SKIP) { SEARCH_SKIP = 0; return; }
    SEARCH_SKIP = 0;
    send("search-char", code);
}
function searchKey(vk) {
    if (!SEARCH_FWD) return false;
    if (vk < 0x10 || vk > 0x12) send("search-key", vk);   // every key but Shift, Ctrl, Alt themselves (the field edits with them)
    return true;   // characters arrive through searchChar
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
// [Light, Dark, Use system setting] of that menu (by their paths, else by the group's shape: a translated build), or null
function modeCommands() {
    const all = fbCommands().filter(c => c.Type === "Fixed"), en = ["Light", "Dark", "Use system setting"].map(n => all.find(c => c.FullPath === "View/Mode/" + n));
    if (en.every(Boolean)) return en;
    const groups = new Map();
    for (const c of all) { const p = cmdParent(c.FullPath); groups.set(p, (groups.get(p) || []).concat([c])); }
    for (const [p, g] of groups) {
        const shown = g.filter(c => c.Visible);
        if (p.split("/").length === 2 && g.length === 4 && shown.length === 3 && g.some(c => !c.Visible && !c.HiddenByDefault) && shown.some(c => c.Radio)) return shown;
    }
    return null;
}
// whether Columns UI follows Windows' light / dark setting (Use system setting is the radio item)
const modeFollowsSystem = () => { const m = modeCommands(); return !!(m && m[2].Radio); };
// "light", "dark" or "system": that menu's command for it
function runModeCommand(v) { const m = modeCommands(), i = ["light", "dark", "system"].indexOf(v); return !!(m && i >= 0 && fb.RunMainMenuCommand(m[i].FullPath)); }
// Windows' light / dark setting for apps, or "" when it cannot be read
function windowsMode() {
    try { return new ActiveXObject("WScript.Shell").RegRead("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize\\AppsUseLightTheme") === 0 ? "dark" : "light"; }
    catch (e) { return ""; }
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
