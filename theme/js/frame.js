"use strict";
// Root panel: places the child panels for the active view and owns the shared state (view, playlist preset, reduce
// motion), which it broadcasts to the other panels (lib/bus.js). It runs the view and light/dark transitions by moving
// the fx overlay panel. The children are created by the layout (columns/audio-archive.fcl) in CHILDREN order.
//
// Commands (also under File › JSplitter › Script commands, so they can get keyboard shortcuts): views 1 – 5,
// T = light/dark, P = playlist preset Album/Index; B plays the intro film.

include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\core.js");

const M = TOKENS.metrics;
const VIEWS = ["archive", "playlists", "lyrics", "signal", "style"];
// z-order: index 0 is the bottom window; fx (the transition overlay) must stay on top
const CHILDREN = ["header", "transport", "stage", "manager", "head", "playlist", "card", "tip", "fx"];
const PRESETS = ["album", "index"];

let W = 0, H = 0;
STATE.view = getSetting("view", "playlists");
STATE.preset = getSetting("preset", "album");
STATE.reduce = getSetting("reduceMotion", false);
STATE.boot = getSetting("bootSelfTest", true);
STATE.skin = getSetting("caseSkin", SKIN_DEFAULT);
STATE.grain = getSetting("grain", true);
migrateLyricsSettings();   // a settings file from before the lyrics source / translation split (see below)
STATE.lyricsSource = pickLyricsSource(getSetting("lyricsSource", "auto"));
STATE.lyricsTrans = pickLyricsTrans(getSetting("lyricsTrans", defaultLyricsTrans()));
// the permission the AUTO fallback needs; migrateLyricsSettings() above carries it over from lyricsNetease
STATE.lyricsNeteaseAuto = !!getSetting("lyricsNeteaseAuto", SYSTEM_LANG.startsWith("zh"));
STATE.lyricsRoma = getSetting("lyricsRoma", false) === true;   // romanized lyrics (lib/roman.js)
STATE.textScale = textScaleOf(getSetting("textScale", 1));
STATE.arrayScale = pickScale(+getSetting("arrayScale", 1), ARRAY_SCALES);
setTextScale(STATE.textScale);   // the root panel's own copy: the Playlists view's column widths follow it
STATE.inspectScale = pickScale(+getSetting("inspectScale", 1.3), INSPECT_SCALES);
STATE.floor = pickFloor(getSetting("floor", "plain"));
STATE.wallpaper = pickWallpaper(getSetting("wallpaper", null));
STATE.halftone = pickHalftone(getSetting("halftone", "bottom"));
STATE.halftoneLevel = pickHalftoneLevel(getSetting("halftoneLevel", "mid"));
STATE.emblem = pickEmblem(getSetting("emblem", "ring"));
STATE.tag = pickTag(getSetting("tag", "plastic"));
STATE.tagShape = pickTagShape(getSetting("tagShape", "tab"));
STATE.tagColours = pickTagColours(getSetting("tagColours", "scheme"));
STATE.tagCustom = getSetting("tagCustom", null);
STATE.tagOpacity = pickTagOpacity(getSetting("tagOpacity", 50));
STATE.tagBody = pickTagBody(getSetting("tagBody", "solid"));
STATE.tagFactory = pickTagFactory(getSetting("tagFactory", null));
STATE.font = pickFont(getSetting("font", "geist"));
STATE.sides = pickSides(getSetting("sides", null));
STATE.borderless = getSetting("borderless", false) === true;
REDUCE_MOTION = STATE.reduce;
RELOAD_ON_LANG = false;   // see lib/bus.js
const P = {};          // child name -> PanelObject
let ready = false;

const broadcast = () => send("state", { view: STATE.view, preset: STATE.preset, reduce: STATE.reduce, boot: STATE.boot, skin: STATE.skin, grain: STATE.grain,
                                   lyricsSource: STATE.lyricsSource, lyricsTrans: STATE.lyricsTrans, lyricsNeteaseAuto: STATE.lyricsNeteaseAuto, lyricsRoma: STATE.lyricsRoma,
                                   textScale: STATE.textScale, arrayScale: STATE.arrayScale, inspectScale: STATE.inspectScale, floor: STATE.floor, wallpaper: STATE.wallpaper,
                                   halftone: STATE.halftone, halftoneLevel: STATE.halftoneLevel, emblem: STATE.emblem, tag: STATE.tag,
                                   tagShape: STATE.tagShape, tagColours: STATE.tagColours, tagCustom: STATE.tagCustom, tagOpacity: STATE.tagOpacity, tagBody: STATE.tagBody, tagFactory: STATE.tagFactory, font: STATE.font,
                                   sides: STATE.sides, modeSystem: STATE.modeSystem, borderless: STATE.borderless });

// One-off: settings written before this change kept three switches for the lyrics (lyricsOnline, lyricsNetease,
// lyricsTranslate). They map onto lyricsSource and lyricsTrans, and lyricsNeteaseAuto keeps the permission the old
// lyricsNetease carried for the AUTO fallback. The old keys stay in the file, where an older version still reads them.
// Runs once: with lyricsSource already present there is nothing to do.
function migrateLyricsSettings() {
    if (String(getSetting("lyricsSource", "") || "")) return;
    const online = getSetting("lyricsOnline", true) !== false, machine = !!getSetting("lyricsTranslate", false);
    const community = !!getSetting("lyricsNetease", SYSTEM_LANG.startsWith("zh"));
    const target = String(getSetting("lyricsTarget", SYSTEM_LANG) || SYSTEM_LANG);
    const trans = target === "off" ? "off" : community ? (machine ? "auto" : "netease") : machine ? "machine" : "off";
    setSetting("lyricsSource", online ? "auto" : "local");
    setSetting("lyricsTrans", trans);
    setSetting("lyricsNeteaseAuto", community);   // what the old lyricsNetease allowed, for the AUTO fallback
    if (target === "off") setSetting("lyricsTarget", SYSTEM_LANG);   // the target language no longer carries the "off"
    console.log(`audio-archive lyrics: migrated to source=${online ? "auto" : "local"}, trans=${trans}, neteaseAuto=${community}`);
}

// The layout creates the children in CHILDREN order and that is their z-order, so GetPanelByIndex(i) is CHILDREN[i].
// They may not exist yet on the root's first on_size, so look again (briefly) until they are all there.
function findPanels(attempt = 0) {
    if (window.GetPanelCount() < CHILDREN.length) {
        if (attempt < 40) window.SetTimeout(() => findPanels(attempt + 1), 50);
        return;
    }
    CHILDREN.forEach((name, i) => {
        const p = window.GetPanelByIndex(i);
        if (p.Text !== name) p.Text = name;
        p.ShowCaption = false;
        p.Locked = true;
        P[name] = p;
    });
    P.fx.TopMost = true;
    P.tip.Show(false);
    ready = true;
    restoreLook();
    readModeSystem();
    if (STATE.borderless) applyWindow();
    // the boot covers the window before anything else is laid out (the panels have already drawn once by now: foobar2000
    // shows its window before any script runs, and JSplitter does not keep a child panel's visibility across restarts)
    if (STATE.boot && !REDUCE_MOTION && !rebuilt()) startBoot(); else P.fx.Show(false);
    layout();
    broadcast();
}


// the intro film (fx.js): the fx panel covers the whole window while it plays, then flickers out (on, off, on, off)
function startBoot() {
    fx = { kind: "boot", tw: null };
    send("fx", "boot");
    P.fx.Move(0, 0, W, H);
    P.fx.Show(true);
}
// the fx panel's script came up after the intro was asked for (see fx.js): ask again
onMessage("fx-hello", () => { if (fx && fx.kind === "boot") send("fx", "boot"); });
onMessage("boot-end", () => {
    if (!fx || fx.kind !== "boot") return;
    [0, 70, 140, 210].forEach((d, i) => window.SetTimeout(() => P.fx.Show(i % 2 === 1 && i < 3), d));
    window.SetTimeout(() => { P.fx.Show(false); fx = null; }, 230);
});

// rectangles of the frame and of the active view's children, in px
function regions() {
    const top = dp(M.header), bottom = H - dp(M.transport + M.status), vh = bottom - top;
    const r = { header: [0, 0, W, top], transport: [0, bottom, W, H - bottom] };
    // Archive, Lyrics and Signal are all drawn by the stage panel
    if (STATE.view !== "playlists") return Object.assign(r, { stage: [0, top, W, vh] });
    // the manager panel also draws the track rail along the playlist's left edge
    // the list (as wide as the user set it) widens with the text size; the native playlist keeps at least 320 dp,
    // both sides giving way to it
    let rail = dp(side("list") * Math.min(TEXT_SCALE, 1.3) + M["rail-width"]), card = W - dp(side("card") + 2 * M.gutter);
    const head = dp(M["playlist-head"]), short = dp(320) - (card - rail);
    if (short > 0) { rail = Math.max(dp(170 + M["rail-width"]), rail - short / 2); card = Math.min(W - dp(264 + 2 * M.gutter), card + short / 2); }
    return Object.assign(r, {
        manager: [0, top, rail, vh],
        head: [rail, top, card - rail, head], playlist: [rail, top + head, card - rail, vh - head],
        card: [card, top, W - card, vh],
    });
}

function layout() {
    if (!ready) return;
    const r = regions();
    for (const name of CHILDREN) {
        if (name === "fx" || name === "tip") continue;
        const p = P[name], rect = r[name];
        if (rect) { p.Move(rect[0], rect[1], Math.max(1, rect[2]), Math.max(1, rect[3])); p.Show(true); } else p.Show(false);
    }
    // the intro covers the whole window: at start-up it begins before the root knows its size (W = H = 0, so it was
    // shown at no size at all and played unseen), so it is sized here once the window has one, and again on a resize
    if (fx && fx.kind === "boot") P.fx.Move(0, 0, W, H);
    sendPlaylistSize(r);
    sendGeom(r);
}
// where each panel sits in the window, for the wallpaper's parts to line up (lib/wallpaper.js)
function sendGeom(r = regions()) { send("geom", { w: W, h: H, r }); }
// the playlist head lays out the column titles for the native playlist's size
function sendPlaylistSize(r = regions()) { if (r.playlist) send("playlist-size", { w: r.playlist[2], h: r.playlist[3] }); }

// ----------------------------------------------------------------------------------------------- transitions
// The fx panel is only moved during a transition, never resized (a resize rebuilds its Direct2D surface every frame).
// view: a panel the size of the view area starts on top of it and slides right off the window; its left edge is the
//       scan head, so the new view is uncovered left to right
// mode: the colours swap first (every panel repaints and the native playlist redraws, ≈ 0.1 s) and the band only
//       starts once that is done — Windows runs timers after pending paints — so the sweep itself never stalls
let fx = null;   // { kind, tw }
const fxGeom = kind => kind === "view"
    ? { y: dp(M.header), w: W, h: H - dp(M.transport + M.status + M.header) }
    : { y: 0, w: dp(222), h: H };
const fxClock = Clock(() => {
    if (!fx || fx.kind === "boot") return false;
    if (!fx.tw) fx.tw = Tween(fx.kind === "view" ? 600 : 560);   // first frame after the swap's repaint
    const k = tweenK(fx.tw), g = fxGeom(fx.kind);
    const x = fx.kind === "view" ? Math.round(easeOutCubic(k) * W) : Math.round(easeInOut(k) * (W + g.w)) - g.w;
    if (k < 1) P.fx.Move(x, g.y, g.w, g.h);
    else { P.fx.Show(false); fx = null; return false; }
    return true;
});

// swap: what changes under a "mode" sweep (the light / dark switch, or a colour scheme's import)
function startFx(kind, swap = switchMode) {
    if (!ready || REDUCE_MOTION || (fx && fx.kind === "boot")) return false;
    fx = { kind, tw: kind === "view" ? Tween(600) : null };
    send("fx", kind);
    const g = fxGeom(kind);
    P.fx.Move(kind === "view" ? 0 : -g.w, g.y, g.w, g.h);
    P.fx.Show(true);
    if (kind === "mode") swap();
    fxClock.wake();
    return true;
}

// --------------------------------------------------------------------------------------------------- commands
function setView(v) {
    if (!VIEWS.includes(v) || v === STATE.view) return;
    STATE.view = v;
    setSetting("view", v);
    P.tip.Show(false);
    layout();
    startFx("view");
    broadcast();
}

// light / dark is Columns UI's mode (View › Mode, lib/bus.js). When nothing changed a moment later (the command was not
// found, or the mode is managed elsewhere), say where it is set instead of failing silently.
let modeCheck = 0;
const MODE_HELP = "Light / dark did not switch.\n\nThe theme follows Columns UI's mode. Switch it in MENU › View › Mode, or in " +
    "Preferences › Display › Columns UI › Colours and fonts. When it is set to “Use system setting”, Windows' own light / dark setting decides.";
function switchMode() {
    const was = MODE;
    runSwitchMode();
    window.ClearTimeout(modeCheck);
    modeCheck = window.SetTimeout(() => {
        if (MODE !== was || restoring) return;
        fb.ShowPopupMessage(tr(MODE_HELP), "Audio Archive");
    }, 2500);
}
function toggleMode() {
    if (fx && fx.kind === "mode") return;
    if (!startFx("mode")) switchMode();
}
// LIGHT, DARK or SYSTEM (05 STYLE › MODE, or MENU › Audio Archive): Columns UI's Light, Dark or Use system setting.
// With SYSTEM, Windows' light / dark decides, and each of its switches reaches the theme as a change of colours (#46).
// The sweep runs only when the colours change now.
function setModeTo(v) {
    if ((fx && fx.kind === "mode") || !["light", "dark", "system"].includes(v)) return;
    const want = v === "system" ? windowsMode() : v, run = () => { runModeCommand(v); window.SetTimeout(readModeSystem, 300); };
    if (!want || want === MODE || !startFx("mode", run)) run();
}
// whether the mode follows Windows (Columns UI's own setting, which can also be changed in its menu)
function readModeSystem() {
    const on = modeFollowsSystem();
    if (on === STATE.modeSystem) return;
    STATE.modeSystem = on;
    setSetting("modeSystem", on);
    broadcast();
}

// BORDERLESS (05 STYLE › DISPLAY › WINDOW, or F11): foobar2000's main window without its title bar and frame, over the
// whole monitor it is on. A script cannot restyle a window, so tools\window.ps1 does it, given this panel's window; it
// keeps the window's place for the way back. Applied again at every start while it is on.
function applyWindow() {
    const ps1 = THEME_ROOT + "tools\\window.ps1", state = fb.ProfilePath + "audio-archive-cache\\window.json";
    if (!utils.IsFile(ps1)) return;
    try {
        new ActiveXObject("WScript.Shell").Run(`cmd /c set "PSModulePath=" && powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}" -Panel ${window.ID} -Mode ${STATE.borderless ? "borderless" : "window"} -State "${state}"`, 0, false);
    } catch (e) { console.log("audio-archive window: " + e); }
}
// on: true / false, or none (a message without data comes as null) to switch
function toggleBorderless(on) {
    STATE.borderless = on == null ? !STATE.borderless : !!on;
    setSetting("borderless", STATE.borderless);
    broadcast();
    applyWindow();
}

// foobar2000 can take the panels down and build them again while it runs (reported when Windows switches light / dark,
// #46): the intro film is for a start, so it does not play when this panel's script went down a moment ago (a rebuild
// takes a fraction of a second; closing foobar2000 and starting it again takes longer)
const UNLOAD_MARK = fb.ProfilePath + "audio-archive-cache\\frame-unload.txt";
function rebuilt() {
    try { return utils.IsFile(UNLOAD_MARK) && Date.now() - +utils.ReadTextFile(UNLOAD_MARK, 65001) < 1500; } catch (e) { return false; }
}
function on_script_unload() { try { utils.WriteTextFile(UNLOAD_MARK, String(Date.now()), false); } catch (e) { /* no cache folder yet */ } }

// presets are partial layout files (columns, groups, style script) imported into Columns UI, one per colour scheme and
// mode: each also carries the scheme's light and dark colour sets with the mode in use (so an import never changes the
// mode), and has its accent in the style scripts
// The custom scheme's presets are written into the profile from templates first (lib/custom.js).
function importLayout(preset, scheme) {
    let dir = THEME_ROOT + "columns\\";
    if (scheme === "custom") {
        if (!writeCustomPresets(TOKENS.schemes.custom)) return;
        dir = CUSTOM_DIR;
    }
    utils.Run(fb.FoobarPath + "foobar2000.exe", `/columnsui:import-quiet "${dir}preset-${preset}-${scheme}-${MODE}.fcl"`, "", "", 0, false);
}
// an edit of the custom scheme in use: its colours go to Columns UI straight away (lib/bus.js has re-derived it)
onMessage("custom-scheme", () => { if (SCHEME === "custom") importLayout(STATE.preset, "custom"); });
function setPreset(name) {
    STATE.preset = name;
    setSetting("preset", name);
    importLayout(name, SCHEME);
    broadcast();
}
// colour schemes (tokens.json "schemes"): the panels follow the imported colours by themselves (lib/tokens.js)
function setScheme(id) {
    if (!TOKENS.schemes[id] || id === SCHEME || (fx && fx.kind === "mode")) return;
    const swap = () => importLayout(STATE.preset, id);
    if (!startFx("mode", swap)) swap();
}
const togglePreset = () => setPreset(STATE.preset === "album" ? "index" : "album");

function setReduce(on) {
    STATE.reduce = REDUCE_MOTION = !!on;
    setSetting("reduceMotion", STATE.reduce);
    broadcast();
}

onMessage("hello", () => { if (ready) { broadcast(); sendPlaylistSize(); sendGeom(); } });
// the rail's hover card: { x, y, w, h } in the manager panel's coordinates, or null to hide it
onMessage("tip", t => {
    if (!ready) return;
    if (!t || STATE.view !== "playlists" || fx) { P.tip.Show(false); return; }
    const m = regions().manager, x = m[0] + t.x, y = m[1] + t.y;
    if (P.tip.X !== x || P.tip.Y !== y || P.tip.Width !== t.w || P.tip.Height !== t.h) P.tip.Move(x, y, t.w, t.h);
    if (P.tip.Hidden) P.tip.Show(true);
});
onMessage("view", v => setView(v));
onMessage("mode", toggleMode);
onMessage("mode-to", setModeTo);
onMessage("borderless", toggleBorderless);
onMessage("scheme", setScheme);
onMessage("preset", togglePreset);
onMessage("reduce", setReduce);
onMessage("boot-play", () => { if (ready && !fx) startBoot(); });
onMessage("skin", id => { if (id && id !== STATE.skin) { STATE.skin = String(id); setSetting("caseSkin", STATE.skin); broadcast(); } });
onMessage("boot", on => { STATE.boot = !!on; setSetting("bootSelfTest", STATE.boot); broadcast(); });
onMessage("lyrics-source", v => { STATE.lyricsSource = pickLyricsSource(v); setSetting("lyricsSource", STATE.lyricsSource); broadcast(); });
onMessage("lyrics-trans", v => { STATE.lyricsTrans = pickLyricsTrans(v); setSetting("lyricsTrans", STATE.lyricsTrans); broadcast(); });
onMessage("lyrics-netease-auto", on => { STATE.lyricsNeteaseAuto = !!on; setSetting("lyricsNeteaseAuto", STATE.lyricsNeteaseAuto); broadcast(); });
onMessage("lyrics-roma", on => { STATE.lyricsRoma = !!on; setSetting("lyricsRoma", STATE.lyricsRoma); broadcast(); });
onMessage("text-scale", v => { STATE.textScale = textScaleOf(v); setSetting("textScale", STATE.textScale); setTextScale(STATE.textScale); broadcast(); layout(); });
onMessage("inspect-scale", v => { STATE.inspectScale = pickScale(+v, INSPECT_SCALES); setSetting("inspectScale", STATE.inspectScale); broadcast(); });
onMessage("array-scale", v => { STATE.arrayScale = pickScale(+v, ARRAY_SCALES); setSetting("arrayScale", STATE.arrayScale); broadcast(); });
onMessage("floor", v => { STATE.floor = pickFloor(v); setSetting("floor", STATE.floor); broadcast(); });
onMessage("halftone", v => { STATE.halftone = pickHalftone(v); setSetting("halftone", STATE.halftone); broadcast(); });
onMessage("halftone-level", v => { STATE.halftoneLevel = pickHalftoneLevel(v); setSetting("halftoneLevel", STATE.halftoneLevel); broadcast(); });
onMessage("emblem", v => { STATE.emblem = pickEmblem(v); setSetting("emblem", STATE.emblem); broadcast(); });
onMessage("tag", v => { STATE.tag = pickTag(v); setSetting("tag", STATE.tag); broadcast(); });
onMessage("tag-shape", v => { STATE.tagShape = pickTagShape(v); setSetting("tagShape", STATE.tagShape); broadcast(); });
onMessage("tag-colours", v => { STATE.tagColours = pickTagColours(v); setSetting("tagColours", STATE.tagColours); broadcast(); });
onMessage("tag-body", v => { STATE.tagBody = pickTagBody(v); setSetting("tagBody", STATE.tagBody); broadcast(); });
onMessage("tag-opacity", v => { STATE.tagOpacity = pickTagOpacity(v); setSetting("tagOpacity", STATE.tagOpacity); broadcast(); });
// a factory tag picked in 05 STYLE: it is put in use
onMessage("tag-factory", v => { STATE.tagFactory = pickTagFactory(v); STATE.tag = "factory"; setSetting("tagFactory", STATE.tagFactory); setSetting("tag", STATE.tag); broadcast(); });
onMessage("tag-custom", v => { STATE.tagCustom = Array.isArray(v) ? v : null; setSetting("tagCustom", STATE.tagCustom, true); broadcast(); });
onMessage("font", v => { STATE.font = pickFont(v); setSetting("font", STATE.font); setFontFamily(STATE.font); broadcast(); layout(); });
// a side column's new width (lib/bus.js SIDES_START): laid out at once, kept at the end of a drag
onMessage("sides", d => {
    STATE.sides = pickSides(Object.assign({}, STATE.sides, d && d.w));
    if (d && d.save) setSetting("sides", STATE.sides, true);
    broadcast();
    layout();
});
// the wallpaper's settings, changed in part (05 STYLE)
onMessage("wallpaper", w => { STATE.wallpaper = pickWallpaper(Object.assign({}, STATE.wallpaper, w)); setSetting("wallpaper", STATE.wallpaper, true); broadcast(); });
onMessage("grain", on => { STATE.grain = !!on; setSetting("grain", STATE.grain); broadcast(); window.Repaint(); });

const COMMANDS = [["Archive view", () => setView("archive")], ["Playlists view", () => setView("playlists")],
                  ["Lyrics view", () => setView("lyrics")], ["Signal view", () => setView("signal")], ["Toggle light / dark", toggleMode],
                  ["Playlist preset: Album / Index", togglePreset], ["Style view", () => setView("style")], ["Borderless full screen", () => toggleBorderless()]];
COMMANDS.forEach(([name], i) => fb.RegisterMainMenuCommand(i, name, name));
function on_main_menu_dynamic(id) { if (COMMANDS[id]) COMMANDS[id][1](); }

function on_key_down(vk) {
    if (vk >= 0x31 && vk <= 0x35) setView(VIEWS[vk - 0x31]);
    else if (vk === 0x54) toggleMode();
    else if (vk === 0x50) togglePreset();
    else if (vk === 0x42 && !fx) startBoot();
}

// ----------------------------------------------------------------------------------------------------- frame
function on_size(w, h) {
    W = w; H = h;
    if (ready) layout(); else findPanels();
}

// only the gaps between panels show the root
function on_paint(gr) { gr.FillSolidRect(0, 0, W, H, C.bg); drawGrain(gr, 0, 0, W, H); }
function on_colours_changed() { refreshTokens(); saveLook(); readModeSystem(); window.Repaint(); }

// The scheme, mode and preset after a layout import. An import (install.ps1 runs one on every update) brings back the
// layout's own colours and resets the panels' properties; "layoutSeen" is such a property, so its absence means the
// layout is new. The look recorded in the settings file (lib/settings.js) is then put back: the mode first, then the
// scheme's preset file, which carries the colours for the mode in use.
let restoring = false;
function saveLook() {
    if (restoring) return;
    setSetting("scheme", SCHEME);
    setSetting("mode", MODE);
}
function restoreLook() {
    if (window.GetProperty("layoutSeen", false)) {
        // the custom scheme was edited but its colours never reached Columns UI (closed in between): import them now
        if (readSettings().scheme === "custom" && SCHEME !== "custom") { importLayout(STATE.preset, "custom"); return; }
        saveLook();
        return;
    }
    window.SetProperty("layoutSeen", true);
    const s = readSettings(), follow = s.modeSystem === true;   // following Windows: its mode stands, not the one saved
    const scheme = TOKENS.schemes[s.scheme] ? s.scheme : SCHEME, mode = !follow && (s.mode === "light" || s.mode === "dark") ? s.mode : MODE;
    if (follow && !modeFollowsSystem()) runModeCommand("system");
    if (!s.scheme || (scheme === SCHEME && mode === MODE && STATE.preset === "album")) { saveLook(); return; }   // nothing to put back
    restoring = true;
    if (mode !== MODE) switchMode();
    // the preset file name follows MODE, which on_colours_changed updates once the mode switch has gone through
    window.SetTimeout(() => {
        if (scheme !== SCHEME || STATE.preset !== "album" || mode !== MODE) importLayout(STATE.preset, scheme);
        window.SetTimeout(() => { restoring = false; saveLook(); }, 1500);
    }, 700);
}
