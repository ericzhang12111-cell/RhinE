"use strict";
// Header (all views, 73 dp): inverse plate with the live Möbius emblem, identity block, numbered navigation with a
// sliding inverse plate, search field (→ a "Search" autoplaylist), clock and MENU (the main menu, which the theme's
// layout has no menu bar for). Registration crosses in the corners, hairline at the bottom.

include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\core.js");
include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\emblem.js");

const VIEWS = ["archive", "playlists", "lyrics", "signal", "style"];
const NAV = { archive: ["01", "ARCHIVE"], playlists: ["02", "PLAYLISTS"], lyrics: ["03", "LYRICS"], signal: ["04", "SIGNAL"], style: ["05", "STYLE"] };
const ST = {
    ident: { size: 18.5, weight: 700, track: -.02 },
    spread: { size: 7.5, weight: 500, track: .04 },
    term: { size: 13.4, weight: 400, track: -.01 },
    termB: { size: 13.4, weight: 700, track: 0 },
    navNo: { size: 9, weight: 400, track: .08 },
    nav: { size: 11, weight: 400, track: .08 },
    search: { size: 9.5, weight: 500, track: .14 },
    time: { size: 15, weight: 500, track: .04 },
    date: { size: 8, weight: 500, track: .14 },
    menu: { size: 10, weight: 500, track: .14 },
};
const st = (s, colour, bg = C.bg) => Object.assign({ colour, bg }, s);

let W = 0, H = 0;
const hits = Hits();
let hover = null;
const plate = { x: Spring(0, 14), w: Spring(0, 14), placed: false };
let navRects = {};                         // view -> [x, w]
const search = { on: false, text: "", timer: 0, caret: true };
let emblemT = 0;

// ------------------------------------------------------------------------------------------------ animation clock
// the nav plate's springs repaint the navigation strip; the emblem has its own 30 fps timer while music plays and
// repaints only the plate
const clock = Clock(dt => {
    const more = stepSpring(plate.x, dt) | stepSpring(plate.w, dt);
    window.RepaintRect(dp(340), 0, W - dp(340), dp(60));
    return more;
});
let emblemTimer = 0, emblemLast = 0;
function emblemRun() {
    const on = fb.IsPlaying && !fb.IsPaused && !REDUCE_MOTION;
    if (on && !emblemTimer) {
        emblemLast = performance.now();
        emblemTimer = window.SetInterval(() => {
            const now = performance.now();
            emblemT += (now - emblemLast) / 1000;
            emblemLast = now;
            window.RepaintRect(dp(24), dp(14), dp(92), dp(44));
        }, 33);
    } else if (!on && emblemTimer) { window.ClearInterval(emblemTimer); emblemTimer = 0; }
}
function on_playback_starting() { emblemRun(); }
function on_playback_pause() { emblemRun(); }
function on_playback_stop() { window.SetTimeout(emblemRun, 50); }
emblemRun();
onMessage("state", emblemRun);

// clock: repaint once a second, on the second
function tickClock() {
    const a = hits.get("clock");
    if (a) window.RepaintRect(a.x, a.y, a.w, a.h);
    window.SetTimeout(tickClock, 1000 - (Date.now() % 1000) + 5);
}
tickClock();

// -------------------------------------------------------------------------------------------------------- state
onMessage("state", () => { movePlate(plate.placed); window.Repaint(); });
send("hello");

function movePlate(animate) {
    const r = navRects[STATE.view];
    if (!r) return;
    plate.x.to = r[0]; plate.w.to = r[1];
    if (!animate || !plate.placed) { plate.x.x = r[0]; plate.w.x = r[1]; plate.placed = true; window.Repaint(); return; }
    clock.wake();
}

// ------------------------------------------------------------------------------------------------------- layout
function on_size(w, h) { W = w; H = h; navRects = {}; plate.placed = false; }

function on_paint(gr) {
    hits.clear();
    gr.FillSolidRect(0, 0, W, H, C.bg);
    regCross(gr, dp(8), dp(8));
    regCross(gr, W - dp(8 + 11), dp(8));
    drawPlate(gr);
    drawIdentity(gr);
    const navEnd = drawNav(gr);
    drawRight(gr, navEnd);
    hline(gr, dp(24), H - HAIR, W - dp(48));
    drawGrain(gr, 0, 0, W, H);
}

function drawPlate(gr) {
    const x = dp(24), y = dp(14), w = dp(92), h = dp(44);
    gr.FillSolidRect(x, y, w, h, C.fg);
    gr.PushClip(x, y, w, h);
    drawEmblem(gr, emblemT, x, y, w, h, dp(12.5), C.bg);
    gr.PopClip();
}

function drawIdentity(gr) {
    const x = dp(128), w = dp(152), top = dp(14);
    label(gr, "AUDIO ARCHIVE", st(ST.ident, C.fg), x, top - dp(3));
    // SIGNAL · LIBRARY · PLAYBACK spread across the measure
    const parts = ["SIGNAL", "·", "LIBRARY", "·", "PLAYBACK"], sp = st(ST.spread, C["fg-soft"]);
    const widths = parts.map(p => labelWidth(p, sp)), gap = (w - widths.reduce((a, b) => a + b, 0)) / (parts.length - 1);
    let cx = x;
    parts.forEach((p, i) => { label(gr, p, sp, cx, dp(33)); cx += widths[i] + gap; });
    label(gr, "LISTENING", st(ST.term, C.fg), x, dp(42));
    label(gr, "TERMINAL", st(ST.termB, C.fg), x + w, dp(42), 2);
}

function drawNav(gr) {
    const y = dp(22), h = dp(28);
    let x = dp(352);
    const fresh = !navRects.archive;
    for (const v of VIEWS) {
        const [n, name] = NAV[v];
        const w = dp(14) + labelWidth(n, st(ST.navNo, 0)) + dp(9) + labelWidth(name, st(ST.nav, 0)) + dp(14);
        if (fresh) navRects[v] = [x, w];
        hits.add("nav", x, y, w, h, v);
        x += w + dp(6);
    }
    if (fresh) movePlate(false);
    // labels on the page, then the sliding inverse plate, then the same labels inverted and clipped to the plate:
    // the text inverts exactly where the plate passes
    const px = Math.round(plate.x.x), pw = Math.round(plate.w.x);
    const ty = y + Math.round((h - labelHeight(ST.nav)) / 2);
    const drawLabels = inverse => {
        for (const v of VIEWS) {
            const [n, name] = NAV[v], [nx] = navRects[v], isHover = !inverse && hover && hover.id === "nav" && hover.data === v;
            const back = inverse ? C.fg : C.bg;
            const noCol = inverse ? mix(C.bg, C.fg, .3) : C["text-muted"], nameCol = inverse ? C.bg : isHover ? C.fg : C["fg-soft"];
            const nwid = label(gr, n, st(ST.navNo, noCol, back), nx + dp(14), ty + dp(1));
            label(gr, name, st(ST.nav, nameCol, back), nx + dp(14) + nwid + dp(9), ty);
        }
    };
    drawLabels(false);
    gr.FillSolidRect(px, y, pw, h, C.fg);
    gr.PushClip(px, y, pw, h);
    drawLabels(true);
    gr.PopClip();
    gr.FillSolidRect(px + pw - dp(3), y - dp(3), dp(6), dp(6), C.accent);
    return x;
}

function drawRight(gr, navEnd) {
    // MENU (right edge): three-line icon + label; hover inverts
    const mw = dp(14) + dp(8) + labelWidth("MENU", st(ST.menu, 0)), mx = W - dp(24) - mw, my = dp(22), mh = dp(28);
    const mHover = hover && hover.id === "menu";
    if (mHover) gr.FillSolidRect(mx - dp(8), my, mw + dp(16), mh, C.fg);
    const mc = mHover ? C.bg : C.fg, iy = my + Math.round(mh / 2) - dp(4.5);
    for (const k of [0, 4, 8]) gr.FillSolidRect(mx, iy + dp(k), dp(14), HAIR, mc);
    label(gr, "MENU", st(ST.menu, mc, mHover ? C.fg : C.bg), mx + dp(22), my + Math.round((mh - labelHeight(ST.menu)) / 2));
    hits.add("menu", mx - dp(8), my, mw + dp(16), mh);

    // clock: time over date
    const cx = W - dp(284), now = new Date();
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const tw = label(gr, `${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}:${pad(now.getSeconds(), 2)}`, st(ST.time, C.fg), cx, dp(18));
    const dw = label(gr, `${days[now.getDay()]} · ${pad(now.getDate(), 2)} ${months[now.getMonth()]} ${now.getFullYear()}`, st(ST.date, C["text-muted"]), cx, dp(39));
    hits.add("clock", cx, dp(16), Math.max(tw, dw) + dp(4), dp(36));

    // search field between the navigation and the clock; it shrinks, then hides, on narrow windows
    const sx = Math.max(navEnd + dp(24), W - dp(540)), sw = Math.min(dp(230), cx - dp(26) - sx);
    if (sw < dp(110)) return;
    const sy = dp(24), sh = dp(24), focus = search.on;
    hline(gr, sx, sy + sh - HAIR, sw, focus ? C.fg : C["line-faint"]);
    const ly = sy + Math.round((sh - labelHeight(ST.search)) / 2);
    if (focus || search.text) {
        const tx = sx, avail = sw - dp(22);
        gr.PushClip(tx, sy, avail, sh);
        // the query itself is plain text (no tracking), so long queries stay readable
        const shown = search.text, f = fontFor(shown || "x", 11, 400), width = shown ? gr.CalcTextWidth(shown, f) : 0;
        const off = Math.min(0, avail - dp(6) - width);
        gr.DrawText(shown, f, C.fg, tx + off, sy, Math.max(avail, width + dp(4)), sh, DT_SINGLE);
        if (focus && search.caret) gr.FillSolidRect(tx + off + width + dp(1), sy + dp(5), HAIR, sh - dp(10), C.accent);
        gr.PopClip();
    } else {
        label(gr, "SEARCH ARCHIVE", st(ST.search, C["text-muted"]), sx, ly);
    }
    // magnifier: ring + handle
    const gx = sx + sw - dp(10), gy = sy + sh / 2 - dp(1), r = dp(3.5), ic = focus ? C.fg : C["text-muted"];
    gr.DrawEllipse(gx - r, gy - r, 2 * r, 2 * r, HAIR, ic);
    gr.DrawLine(gx + r * .7, gy + r * .7, gx + r * 1.8, gy + r * 1.8, HAIR, ic);
    hits.add("search", sx, sy - dp(4), sw, sh + dp(8));
}

// -------------------------------------------------------------------------------------------------------- mouse
function on_mouse_move(x, y) {
    const a = hits.at(x, y);
    window.SetCursor(a && a.id !== "clock" ? (a.id === "search" ? 32513 : 32649) : 32512);   // IDC_IBEAM / IDC_HAND / IDC_ARROW
    const key = a ? a.id + ":" + a.data : "", old = hover ? hover.id + ":" + hover.data : "";
    if (key !== old) { hover = a; window.Repaint(); }
}
function on_mouse_leave() { if (hover) { hover = null; window.Repaint(); } }

function on_mouse_lbtn_up(x, y) {
    const a = hits.at(x, y);
    if (!a) { if (search.on) blurSearch(); return; }
    if (a.id === "nav") send("view", a.data);
    else if (a.id === "menu") showMenu(a);
    else if (a.id === "search") focusSearch();
    if (a.id !== "search" && search.on) blurSearch();
}

// ------------------------------------------------------------------------------------------------------- search
// Typing updates a "Search" autoplaylist 300 ms after the last key; Enter applies at once; Esc clears and leaves.
let caretTimer = 0;
function focusSearch() {
    search.on = true;
    window.DlgCode = 0x0004 | 0x0080;   // DLGC_WANTALLKEYS | DLGC_WANTCHARS
    window.ClearInterval(caretTimer);
    caretTimer = window.SetInterval(() => { search.caret = !search.caret; const a = hits.get("search"); if (a) window.RepaintRect(a.x, a.y, a.w, a.h); }, 530);
    window.Repaint();
}
function blurSearch() {
    search.on = false;
    remote = false;
    send("search-end");
    window.DlgCode = 0;
    window.ClearInterval(caretTimer);
    window.Repaint();
}
function on_focus(focused) { if (!focused && search.on && !remote) blurSearch(); }
// typing forwarded by another panel ("/" there; lib/bus.js)
let remote = false;
onMessage("search", () => { remote = true; focusSearch(); });
onMessage("search-char", code => on_char(code));
onMessage("search-key", vk => { on_key_down(vk); if (!search.on) remote = false; });

let skipChar = 0;   // the "/" that opened the search arrives as a character next
function on_char(code) {
    if (code === skipChar) { skipChar = 0; return; }
    skipChar = 0;
    if (!search.on || code < 32 || code === 127) return;
    search.text += String.fromCharCode(code);
    queueSearch();
}

function on_key_down(vk) {
    if (search.on) {
        if (vk === 0x08) { search.text = search.text.slice(0, -1); queueSearch(); }                 // Backspace
        else if (vk === 0x0D) { window.ClearTimeout(search.timer); applySearch(); }                  // Enter
        else if (vk === 0x1B) { search.text = ""; window.ClearTimeout(search.timer); if (archiveFiltered) filterArchive(""); else leaveSearch(); blurSearch(); }   // Esc
        return;
    }
    if (vk === 0xBF) { skipChar = 0x2F; focusSearch(); return; }   // "/"
    globalKey(vk);
}

function queueSearch() {
    search.caret = true;
    window.Repaint();
    window.ClearTimeout(search.timer);
    search.timer = window.SetTimeout(applySearch, STATE.view === "archive" ? 150 : 300);
}
// in the Archive the search filters the albums in place (lib/library.js) instead of filling the "Search" playlist
let archiveFiltered = false;
function filterArchive(text) { archiveFiltered = !!text; send("archive-filter", text); }
onMessage("search-clear", () => { search.text = ""; filterArchive(""); window.Repaint(); });

// every word must match one of the main fields
function searchQuery(text) {
    const words = text.replace(/["()]/g, " ").split(/\s+/).filter(Boolean);
    const fields = ["%title%", "%artist%", "%album artist%", "%album%", "%genre%", "%date%"];
    return words.map(w => "(" + fields.map(f => `${f} HAS ${w}`).join(" OR ") + ")").join(" AND ");
}

// Esc returns to the playlist that was active before the search
function leaveSearch() {
    const idx = plman.FindPlaylist("Search");
    if (search.prev !== undefined && idx >= 0 && plman.ActivePlaylist === idx && search.prev < plman.PlaylistCount && search.prev !== idx)
        plman.ActivePlaylist = search.prev;
    search.prev = undefined;
}

function applySearch() {
    if (STATE.view === "archive") { filterArchive(search.text); return; }
    const q = searchQuery(search.text);
    if (!q) return;
    // removing and re-creating "Search" at the same index leaves every other playlist where it was
    if (search.prev === undefined) search.prev = plman.ActivePlaylist;
    // reuse the theme's own "Search" autoplaylist; never touch a normal playlist that happens to have that name
    let idx = plman.FindPlaylist("Search");
    if (idx >= 0 && plman.IsAutoPlaylist(idx)) plman.RemovePlaylist(idx);
    else idx = plman.PlaylistCount;
    plman.CreateAutoPlaylist(idx, "Search", q, "%album artist% | %date% | %album% | %discnumber% | %tracknumber%", 0);
    plman.ActivePlaylist = idx;
    if (STATE.view !== "playlists") send("view", "playlists");
}

// --------------------------------------------------------------------------------------------------------- menu
// foobar2000's own main menu (File … Help) plus the theme's commands
function showMenu(a) {
    const root = window.CreatePopupMenu(), managers = [];
    ["File", "Edit", "View", "Playback", "Library", "Help"].forEach((name, i) => {
        const sub = window.CreatePopupMenu(), mm = fb.CreateMainMenuManager();
        mm.Init(name);
        mm.BuildMenu(sub, 1000 * (i + 1), 999);
        sub.AppendTo(root, 0, name);
        managers.push(mm);
    });
    root.AppendMenuSeparator();
    const theme = window.CreatePopupMenu();
    ["Archive view\t1", "Playlists view\t2", "Lyrics view\t3", "Signal view\t4", "Style view\t5"].forEach((t, i) => theme.AppendMenuItem(0, 21 + i, t));
    theme.CheckMenuRadioItem(21, 25, 21 + VIEWS.indexOf(STATE.view));
    theme.AppendMenuSeparator();
    theme.AppendMenuItem(0, 4, (MODE === "dark" ? "Light mode" : "Dark mode") + "\tT");
    theme.AppendMenuItem(0, 5, `Playlist preset: ${STATE.preset === "album" ? "Index" : "Album"}\tP`);
    theme.AppendMenuItem(STATE.reduce ? 0x8 : 0, 6, "Reduce motion");   // MF_CHECKED
    theme.AppendMenuItem(STATE.grain ? 0x8 : 0, 9, "Grain texture");
    theme.AppendMenuItem(STATE.lyricsOnline ? 0x8 : 0, 11, "Fetch lyrics online (LRCLIB)");
    theme.AppendMenuItem(STATE.boot ? 0x8 : 0, 7, "Intro film at start");
    theme.AppendMenuItem(0, 8, "Play intro film\tB");
    theme.AppendMenuItem(0, 10, "Shuffle entire library\tS");
    theme.AppendMenuSeparator();
    const skins = appendSkinMenu(theme, 100);
    const schemes = Object.keys(TOKENS.schemes), sch = window.CreatePopupMenu();
    schemes.forEach((s, i) => sch.AppendMenuItem(0, 200 + i, TOKENS.schemes[s].name));
    sch.CheckMenuRadioItem(200, 200 + schemes.length - 1, 200 + Math.max(0, schemes.indexOf(SCHEME)));
    sch.AppendTo(theme, 0, "Colour scheme");
    theme.AppendTo(root, 0, "Audio Archive");
    const id = root.TrackPopupMenu(a.x - dp(8), a.y + a.h, 0);
    const k = Math.floor(id / 1000) - 1;
    if (k >= 0 && managers[k]) managers[k].ExecuteByID(id - 1000 * (k + 1));
    else if (id >= 21 && id <= 25) send("view", VIEWS[id - 21]);
    else if (id === 4) send("mode");
    else if (id === 5) send("preset");
    else if (id === 6) send("reduce", !STATE.reduce);
    else if (id === 7) send("boot", !STATE.boot);
    else if (id === 9) send("grain", !STATE.grain);
    else if (id === 11) send("lyrics-online", !STATE.lyricsOnline);
    else if (id === 8) send("boot-play");
    else if (id === 10) shuffleLibrary();
    else if (id >= 200 && schemes[id - 200]) send("scheme", schemes[id - 200]);
    else if (id >= 100 && skins[id - 100]) send("skin", skins[id - 100].id);
}

function on_colours_changed() { refreshTokens(); window.Repaint(); }
