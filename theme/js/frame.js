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
STATE.lyricsOnline = getSetting("lyricsOnline", true);
STATE.textScale = pickScale(+getSetting("textScale", 1), TEXT_SCALES);
STATE.arrayScale = pickScale(+getSetting("arrayScale", 1), ARRAY_SCALES);
setTextScale(STATE.textScale);   // the root panel's own copy: the Playlists view's column widths follow it
STATE.inspectScale = pickScale(+getSetting("inspectScale", 1.3), INSPECT_SCALES);
REDUCE_MOTION = STATE.reduce;
RELOAD_ON_LANG = false;   // see lib/bus.js
const P = {};          // child name -> PanelObject
let ready = false;

const broadcast = () => send("state", { view: STATE.view, preset: STATE.preset, reduce: STATE.reduce, boot: STATE.boot, skin: STATE.skin, grain: STATE.grain, lyricsOnline: STATE.lyricsOnline,
                                   textScale: STATE.textScale, arrayScale: STATE.arrayScale, inspectScale: STATE.inspectScale });

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
    // the boot covers the window before anything else is laid out (the panels have already drawn once by now: foobar2000
    // shows its window before any script runs, and JSplitter does not keep a child panel's visibility across restarts)
    if (STATE.boot && !REDUCE_MOTION) startBoot(); else P.fx.Show(false);
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
    const rail = dp(M["manager-width"] * Math.min(TEXT_SCALE, 1.3) + M["rail-width"]);   // the list widens with the text size
    const card = W - dp(M["card-width"] + 2 * M.gutter), head = dp(M["playlist-head"]);
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
    sendPlaylistSize(r);
}
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

// presets are partial layout files (columns, groups, style script) imported into Columns UI, one per colour scheme and
// mode: each also carries the scheme's light and dark colour sets with the mode in use (so an import never changes the
// mode), and has its accent in the style scripts
const importLayout = (preset, scheme) =>
    utils.Run(fb.FoobarPath + "foobar2000.exe", `/columnsui:import-quiet "${THEME_ROOT}columns\\preset-${preset}-${scheme}-${MODE}.fcl"`, "", "", 0, false);
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

onMessage("hello", () => { if (ready) { broadcast(); sendPlaylistSize(); } });
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
onMessage("scheme", setScheme);
onMessage("preset", togglePreset);
onMessage("reduce", setReduce);
onMessage("boot-play", () => { if (ready && !fx) startBoot(); });
onMessage("skin", id => { if (id && id !== STATE.skin) { STATE.skin = String(id); setSetting("caseSkin", STATE.skin); broadcast(); } });
onMessage("boot", on => { STATE.boot = !!on; setSetting("bootSelfTest", STATE.boot); broadcast(); });
onMessage("lyrics-online", on => { STATE.lyricsOnline = !!on; setSetting("lyricsOnline", STATE.lyricsOnline); broadcast(); });
onMessage("text-scale", v => { STATE.textScale = pickScale(+v, TEXT_SCALES); setSetting("textScale", STATE.textScale); setTextScale(STATE.textScale); broadcast(); layout(); });
onMessage("inspect-scale", v => { STATE.inspectScale = pickScale(+v, INSPECT_SCALES); setSetting("inspectScale", STATE.inspectScale); broadcast(); });
onMessage("array-scale", v => { STATE.arrayScale = pickScale(+v, ARRAY_SCALES); setSetting("arrayScale", STATE.arrayScale); broadcast(); });
onMessage("grain", on => { STATE.grain = !!on; setSetting("grain", STATE.grain); broadcast(); window.Repaint(); });

const COMMANDS = [["Archive view", () => setView("archive")], ["Playlists view", () => setView("playlists")],
                  ["Lyrics view", () => setView("lyrics")], ["Signal view", () => setView("signal")], ["Toggle light / dark", toggleMode],
                  ["Playlist preset: Album / Index", togglePreset], ["Style view", () => setView("style")]];
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
function on_colours_changed() { refreshTokens(); saveLook(); window.Repaint(); }

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
    if (window.GetProperty("layoutSeen", false)) { saveLook(); return; }
    window.SetProperty("layoutSeen", true);
    const s = readSettings();
    const scheme = TOKENS.schemes[s.scheme] ? s.scheme : SCHEME, mode = s.mode === "light" || s.mode === "dark" ? s.mode : MODE;
    if (!s.scheme || (scheme === SCHEME && mode === MODE && STATE.preset === "album")) { saveLook(); return; }   // nothing to put back
    restoring = true;
    if (mode !== MODE) switchMode();
    // the preset file name follows MODE, which on_colours_changed updates once the mode switch has gone through
    window.SetTimeout(() => {
        if (scheme !== SCHEME || STATE.preset !== "album" || mode !== MODE) importLayout(STATE.preset, scheme);
        window.SetTimeout(() => { restoring = false; saveLook(); }, 1500);
    }, 700);
}
