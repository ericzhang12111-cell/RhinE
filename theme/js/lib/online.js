"use strict";
// 05 ONLINE's link to the music services (stage.js includes this file; online.js draws the view): the bridge
// (theme/online/bridge.js, installed by tools/online.ps1 beside the profile) runs on 127.0.0.1 and does the talking to
// NetEase and QQ Music; this file starts it, asks it, keeps what it answered, fetches the covers, and turns a list of
// songs into a foobar2000 playlist. One service is shown at a time (ONL.src, the SOURCE cards); each keeps its own
// account, home, lists and search (ONL.by), and ONL.me / qr / home / lists / search are the shown one's.
//   <profile>\audio-archive-online\   install.json (written by online.ps1), app\ (the bridge), data\ (its key, the
//                                     login, covers\, playlists\)
// A song in a foobar2000 playlist is the bridge's address for it (…/ne/play/<id>, …/qq/play/<mid>), which asks the
// service for the stream when it plays: the services' own addresses last minutes, a playlist stays. The playlists are written as .m3u8 with
// each song's title and length, so foobar2000 adds them at once without opening every stream.

const ONL = {
    root: fb.ProfilePath + "audio-archive-online\\",
    port: 38517,
    key: "",
    state: "",      // "" (not looked at yet) | absent | installing | starting | ready | error
    detail: "",     // what went wrong, or what the installer is doing
    src: "ne",      // the service shown: ne | qq
    by: {},         // per service (onlBlank): me, qr, home, lists, search, channel
    songs: new Map(),    // "<src>:<id>" -> the song as last seen (what a playing bridge address is)
    covers: new Map(),   // picture address -> image | null (on its way)
    gen: 0,         // bumped on log out: answers to an older one are dropped
    lost: 0,        // when the bridge last went away (it is started again, at most every 10 s)
    playGen: 0,     // bumped by every onlinePlay: one still waiting for its songs to be added is dropped
};
const ONL_DATA = ONL.root + "data\\";
const onlRepaint = () => window.Repaint();
// the services: their name in the view, their foobar2000 playlists' prefix
const ONL_SOURCES = { ne: { name: "NETEASE", list: "NetEase" }, qq: { name: "QQ MUSIC", list: "QQ Music" } };
const onlBlank = () => ({
    me: null,            // the account { uid, name, avatar, vip } (null: not logged in)
    qr: null,            // a login code being shown { key, img, state: loading | wait | scanned | expired | error, channel }
    home: null,          // { daily, playlists, picks } as the bridge gave them
    lists: new Map(),    // playlist id -> the playlist with its tracks (or "loading" / "failed")
    search: null,        // { q, songs, lists } found for the header's search box
    channel: "qqmusic",  // QQ Music: whose scanner the code is for (qqmusic | qq | wechat)
    qrGen: 0,            // a new code: the old one's checks stop
});
ONL.by = { ne: onlBlank(), qq: onlBlank() };
ONL.src = ONL_SOURCES[getSetting("onlineSource", "ne")] ? getSetting("onlineSource", "ne") : "ne";
for (const k of ["me", "qr", "home", "lists", "search"])
    Object.defineProperty(ONL, k, { get: () => ONL.by[ONL.src][k], set: v => { ONL.by[ONL.src][k] = v; } });
const onlSrcName = (src = ONL.src) => ONL_SOURCES[src].name;
// the account a song is played with: VIP or not
const onlVip = s => { const me = ONL.by[(s && s.src) || ONL.src].me; return !!(me && me.vip > 0); };

function onlReadJson(file) {
    try { return JSON.parse(utils.ReadTextFile(file, 65001).replace(/^﻿/, "")); } catch (e) { return null; }
}
const onlInstalled = () => { const s = onlReadJson(ONL.root + "install.json"); return s && s.state === "ready" && utils.IsFile(ONL.root + "app\\bridge.js") ? s : null; };

// the key every request carries (made once, kept in data\key.txt; the bridge answers nothing without it)
function onlKey() {
    if (ONL.key) return ONL.key;
    const f = ONL_DATA + "key.txt";
    try { ONL.key = utils.IsFile(f) ? utils.ReadTextFile(f, 65001).trim() : ""; } catch (e) { ONL.key = ""; }
    if (!ONL.key) {
        ONL.key = Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
        if (!utils.IsDirectory(ONL_DATA)) utils.CreateFolder(ONL_DATA);
        utils.WriteTextFile(f, ONL.key, false);
    }
    return ONL.key;
}

// GET a bridge route; done(json | null, status, text: a failure's body says why, e.g. the bridge's 502 { error, code,
// throttled }); a large list may take a minute (timeout ms)
function onlGet(route, done, timeout = 20000) {
    const gen = ONL.gen;
    trHttp("GET", `http://127.0.0.1:${ONL.port}${route}${route.includes("?") ? "&" : "?"}k=${onlKey()}`, "", {}, (st, txt) => {
        if (gen !== ONL.gen) return;
        let d = null;
        if (st === 200) try { d = JSON.parse(txt); } catch (e) { d = null; }
        // the bridge gone (it ends with the foobar2000 that started it: one started again may have found the old one
        // still answering): started anew
        // (no answer: 0 for a timeout, 12xxx for a WinINet error, 12029 when nothing listens)
        if ((st === 0 || st >= 12000) && ONL.state === "ready" && Date.now() - ONL.lost > 10000) { ONL.lost = Date.now(); ONL.state = ""; window.SetTimeout(onlineStart, 500); }
        done(d, st, txt);
    }, timeout);
}

// The bridge running: asked first (it may be up from before), else started, then waited for (20 s at most). Its
// process ends with foobar2000's.
function onlineStart() {
    if (ONL.state === "starting" || ONL.state === "ready" || ONL.state === "installing") return;
    const inst = onlInstalled();
    if (!inst) { ONL.state = "absent"; onlRepaint(); return; }
    const fresh = onlRefreshApp();
    if (fresh === "install") { onlineInstall(inst.node); return; }
    ONL.state = "starting"; ONL.detail = "";
    onlGet("/status", (d) => {
        if (d) {
            if (fresh === "copied") console.log("audio-archive online: the bridge's files were updated; the bridge already running keeps the old ones until foobar2000 is restarted");
            onlReady(d);
            return;
        }
        const node = inst.node || ONL.root + "node\\node.exe", data = ONL_DATA.replace(/\\$/, "");   // (a trailing \ would escape the quote)
        try { new ActiveXObject("WScript.Shell").Run(`"${node}" "${ONL.root}app\\bridge.js" --data "${data}" --key ${onlKey()} --port ${ONL.port}`, 0, false); }
        catch (e) { ONL.state = "error"; ONL.detail = "could not start Node.js"; onlRepaint(); return; }
        const t0 = Date.now(), poll = () => onlGet("/status", d2 => {
            if (d2) onlReady(d2);
            else if (Date.now() - t0 > 20000) { ONL.state = "error"; ONL.detail = "the bridge did not start"; onlRepaint(); }
            else window.SetTimeout(poll, 500);
        });
        window.SetTimeout(poll, 400);
    });
    onlRepaint();
}
function onlReady(status) {
    ONL.state = "ready";
    ONL.by.ne.me = status.netease && status.netease.login ? status.netease.user : null;
    ONL.by.qq.me = status.qq && status.qq.login ? status.qq.user : null;
    onlEnter(true);
    onlSpotifyStatus();
    onlRepaint();
}
// the shown service: its home (again, unless it is there: a bridge started again after losing one), else a login code
function onlEnter(again = false) {
    if (ONL.state !== "ready") return;
    if (ONL.me) { if (!ONL.home || !ONL.home.playlists || !ONL.home.playlists.length) { ONL.home = null; onlineHome(); } }
    else if (again || !ONL.qr || ONL.qr.state === "error") onlineQr();
}
// the SOURCE cards: another service shown (kept in the settings; the header's search box names it)
function onlineSetSource(src) {
    if (!ONL_SOURCES[src] || src === ONL.src) return;
    ONL.src = src;
    setSetting("onlineSource", src);
    send("online-source", src);
    OV.open = null; OV.section = "home"; OV.scroll = 0;
    onlEnter();
    onlRepaint();
}

// The bridge as this version of the theme has it (theme\online\): online.ps1 copies it into app\ only when it installs,
// so without this a theme update would never reach a bridge installed before. Looked at once a session, before the
// bridge is started: scripts that differ are copied over (byte for byte, as online.ps1 does), and a package.json or
// lockfile that differs means other libraries, so the installer runs again (npm ci). A bridge already running from
// before keeps its old code until foobar2000 restarts (it ends with foobar2000). Anything going wrong leaves app\ as it
// is. "" (nothing to do) | "copied" | "install".
let onlAppChecked = false;
function onlRefreshApp() {
    if (onlAppChecked) return "";
    onlAppChecked = true;
    const src = fb.ProfilePath + "themes\\audio-archive\\online\\", app = ONL.root + "app\\";
    try {
        const text = f => utils.IsFile(f) ? utils.ReadTextFile(f, 65001) : null;
        // (a file the theme does not have is left alone)
        const differs = f => { const t = text(src + f); return t !== null && t !== text(app + f); };
        if (["package.json", "package-lock.json"].some(differs)) return "install";
        const js = ["bridge.js", "qq.js", "importer.js", "spotify.js"].filter(differs);
        if (!js.length) return "";
        const fso = new ActiveXObject("Scripting.FileSystemObject");
        for (const f of js) fso.CopyFile(src + f, app + f, true);
        return "copied";
    } catch (e) { console.log("audio-archive online: could not update the bridge's files: " + e); return ""; }
}

// Installing: tools/online.ps1, hidden, its progress read from install.json. node: a Node.js installed elsewhere that
// the bridge was installed with (install.json's), used again rather than downloading one
function onlineInstall(node) {
    if (ONL.state === "installing") return;
    ONL.state = "installing"; ONL.detail = "";
    const ps1 = fb.ProfilePath + "themes\\audio-archive\\tools\\online.ps1", prof = fb.ProfilePath.replace(/\\$/, "");
    // (the one online.ps1 downloads, under audio-archive-online\node\, is left to it: it keeps it at its pinned version)
    const own = node && !String(node).toLowerCase().startsWith(ONL.root.toLowerCase()) && utils.IsFile(node) ? ` -Node "${node}"` : "";
    try { new ActiveXObject("WScript.Shell").Run(`cmd /c set "PSModulePath=" && powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}" -Profile "${prof}"${own}`, 0, false); }
    catch (e) { ONL.state = "error"; ONL.detail = "could not run the installer"; onlRepaint(); return; }
    const t0 = Date.now(), poll = () => {
        const s = onlReadJson(ONL.root + "install.json");
        if (s && s.state === "ready" && Date.parse(s.at) >= t0 - 60000) { ONL.state = ""; onlineStart(); return; }
        if (s && s.state === "error") { ONL.state = "error"; ONL.detail = s.detail || "install failed"; onlRepaint(); return; }
        if (s) ONL.detail = s.detail || "";
        onlRepaint();
        window.SetTimeout(poll, 1000);
    };
    window.SetTimeout(poll, 1500);
    onlRepaint();
}

// ---- logging in: a QR code for the service's app (QQ Music: the QQ Music app's, QQ's or WeChat's scanner), its state
// asked every 2 s ----
function onlineQr(channel) {
    const P = ONL.src, S = ONL.by[P], gen = ++S.qrGen;
    if (channel) S.channel = channel;
    S.qr = { key: "", img: null, state: "loading", channel: S.channel };
    onlGet(P === "qq" ? `/qq/qr?channel=${S.channel}` : "/ne/qr", d => {
        if (gen !== S.qrGen) return;
        if (!d || !d.file) { S.qr = { state: "error", channel: S.channel }; onlRepaint(); return; }
        S.qr = { key: d.key, img: null, state: "wait", channel: S.channel };
        d2d.LoadImageAsyncV2(0, d.file).then(img => { if (S.qr && S.qr.key === d.key) { S.qr.img = img; onlRepaint(); } }, () => {});
        const poll = () => onlGet(`/${P}/qr/check?id=${encodeURIComponent(d.key)}`, r => {
            if (gen !== S.qrGen || !S.qr || S.qr.key !== d.key) return;
            const s = r ? r.state : "wait";
            if (s === "ok") { S.qr = null; onlGet("/status", st => st && onlReady(st)); return; }
            S.qr.state = s === "scanned" ? "scanned" : s === "expired" ? "expired" : s === "error" ? "error" : "wait";
            onlRepaint();
            if (s !== "expired" && s !== "error") window.SetTimeout(poll, 2000);
        });
        window.SetTimeout(poll, 2000);
        onlRepaint();
    });
    onlRepaint();
}
function onlineLogout() {
    const P = ONL.src, S = ONL.by[P];
    onlGet(`/${P}/logout`, () => {});
    S.me = null; S.home = null; S.lists.clear(); S.search = null;
    // (the Archive's NetEase shelves, lib/onlarchive.js: kept, shown as the copy from before; the next account that
    // logs in gets its own)
    if (P === "ne" && typeof onlaInvalidate === "function") onlaInvalidate();
    onlineQr();
}

// ---- what the account has ----
// (each song keeps which service it is from)
const onlKeep = (list, P = ONL.src) => { for (const s of list || []) { s.src = P; ONL.songs.set(`${P}:${s.id}`, s); } return list; };
function onlineHome() {
    const P = ONL.src, S = ONL.by[P], H0 = S.home = S.home || { daily: null, playlists: null, picks: null };
    onlGet(`/${P}/daily`, d => { H0.daily = onlKeep(d, P) || []; onlRepaint(); });
    onlGet(`/${P}/playlists`, d => { H0.playlists = d || []; if (d) S.synced = Date.now(); onlRepaint(); });
    onlGet(`/${P}/picks`, d => { H0.picks = d || []; onlRepaint(); });
}
// a playlist with its songs (null while on its way; "failed": asked again by onlineList(id, true))
function onlineList(id, again = false, P = ONL.src) {
    // (the day's songs: already here with the home)
    if (id === "daily") { const h = ONL.by[P].home; return h && h.daily ? { tracks: h.daily } : null; }
    const L = ONL.by[P].lists, have = L.get(id);
    if (have && !(again && have === "failed")) return have === "loading" ? null : have;
    L.set(id, "loading");
    const eg = onlEditGen(id, P);
    onlGet(`/${P}/playlist/${encodeURIComponent(id)}`, d => {
        // (the list edited here while it was being read: what came may be from before the edit; read again)
        if (d && onlEditGen(id, P) !== eg) { L.delete(id); onlineList(id, false, P); return; }
        if (d) { onlKeep(d.tracks, P); L.set(id, d); } else L.set(id, "failed");
        // (a tile's play key, or a list to resume, asked before the list was here)
        const want = ONL.want;
        if (want && want.id === id && want.src === P) { ONL.want = null; want.run(d || null); }
        onlRepaint();
    }, 120000);
    return null;
}
// the day's songs, as a list one can open (its own page) and play
const ONL_DAILY = () => ({ id: "daily", title: tr("Daily"), cover: ONL.home && ONL.home.daily && ONL.home.daily[0] ? ONL.home.daily[0].cover : "" });
// a playlist the view shows, by its id (the account's, recommended, found)
function onlPlaylistMeta(id) {
    const all = [...((ONL.home && ONL.home.playlists) || []), ...((ONL.home && ONL.home.picks) || []), ...((ONL.search && ONL.search.lists) || [])];
    return all.find(p => p.id === id) || { id, title: "" };
}
// play a playlist without opening it (its songs fetched first when they are not here yet)
function onlinePlayList(meta) { onlPlayWhenHere({ key: meta.id, id: meta.id, src: ONL.src, name: meta.title, meta }); }
// An online list played once its songs are here (asked for again if they failed before), with word of it in the view's
// message bar: reading (the card or tile marked busy: ONL.busy = key), playing, nothing playable, did not load.
//   o: { key, id, src, name, meta (for onlinePlay), at(tracks) -> the song to start at, ok(), none() }
function onlPlayWhenHere(o) {
    const done = d => {
        if (ONL.busy === o.key) ONL.busy = null;
        if (!d) { onlNotice(tr("“{0}” did not load. Try again.", o.name)); return; }
        if (onlinePlay(o.name, d.tracks, o.at ? o.at(d.tracks) : 0, o.meta)) { if (o.ok) o.ok(); onlNotice(tr("Playing “{0}”", o.name), "ok"); }
        else { if (o.none) o.none(); onlNotice(tr("Nothing in “{0}” can be played here now.", o.name)); }
    };
    const pl = onlineList(o.id, true, o.src);
    if (pl && pl !== "failed") { done(pl); return; }
    ONL.busy = o.key;
    ONL.want = { id: o.id, src: o.src, run: done };
    onlNotice(tr("Reading “{0}”…", o.name), "busy");
}
// The view's message bar (online.js, at the foot of the middle column): kind busy (stays until the answer, 3 min at
// most), fail (6 s) or ok (3 s)
function onlNotice(text, kind = "fail") {
    ONL.notice = { text, kind, at: Date.now() };
    onlRepaint();
    if (kind !== "busy") window.SetTimeout(onlRepaint, kind === "ok" ? 3100 : 6100);
}
const onlNoticeOn = () => { const n = ONL.notice; return n && Date.now() - n.at < (n.kind === "busy" ? 180000 : n.kind === "ok" ? 3000 : 6000) ? n : null; };

// ---- the account's NetEase playlists edited (online.js onlineMenu) ----
// Each edit is one request to the bridge (/ne/pl/…), with word of it in the message bar. What is shown follows at once
// without reading anything again: the songs taken out of (or put at the top of) the list as 05 ONLINE has it, the
// tiles' counts and names, and the Archive's copy (lib/onlarchive.js onlaEdited); NetEase's own word comes with the
// next reading of the lists (the bridge has let go of what it kept of them).
const onlLists = () => (ONL.by.ne.home && ONL.by.ne.home.playlists) || [];
const onlListOf = id => onlLists().find(p => p.id === String(id)) || {};
// the account's own lists, its liked songs first: where a song can be put
const onlOwnLists = () => onlLists().filter(p => p.own).sort((a, b) => !!b.liked - !!a.liked);
const onlIsOwn = id => !!onlListOf(id).own;
const onlInMine = id => onlLists().some(p => p.id === String(id));
const onlListName = p => p.liked ? tr("Liked songs") : p.title || "";
// how many times a list's songs were edited here: a reading of it that began before an edit (05 ONLINE's, the
// Archive's) brings the list as it was, and is not taken (onlineList, lib/onlarchive.js onlaNext)
const ONL_EDITS = new Map();   // "<src>:<list id>" -> n
const onlEditGen = (id, P = "ne") => ONL_EDITS.get(`${P}:${id}`) || 0;
function onlEdit(route, ok) {
    onlNotice(tr("Working…"), "busy");
    onlGet(route, (d, st, txt) => {
        if (d && d.ok) { ok(d); return; }
        let e = null;
        try { e = JSON.parse(txt); } catch (x) { e = null; }
        // (a bridge started before this version of the theme: it has none of these routes until foobar2000 restarts)
        if (st === 404) onlNotice(tr("Restart foobar2000 to edit NetEase playlists (the bridge running is from before this update)."));
        else onlNotice(tr("NetEase did not do it: {0}", (e && e.error) || (st ? String(st) : tr("the bridge did not answer"))));
    }, 60000);
}
// the account's lists as NetEase has them now (the tiles' counts), a moment after an edit
function onlListsAgain() {
    const H0 = ONL.by.ne.home;
    window.SetTimeout(() => onlGet("/ne/playlists", d => { if (Array.isArray(d) && d.length && H0 === ONL.by.ne.home && H0) { H0.playlists = d; onlRepaint(); } }), 1500);
}
// songs put into / taken out of a list, as 05 ONLINE and the Archive show it (added: songs; removed: a Set of ids)
function onlSongsEdited(pid, added, removed) {
    ONL_EDITS.set(`ne:${pid}`, onlEditGen(pid) + 1);
    const L = ONL.by.ne.lists, have = L.get(pid), meta = onlListOf(pid), whole = !!have && typeof have === "object" && Array.isArray(have.tracks);
    if (whole) {
        let t = have.tracks;
        if (removed) t = t.filter(s => !removed.has(String(s.id)));
        if (added) { const ids = new Set(t.map(s => String(s.id))); t = added.filter(s => !ids.has(String(s.id))).concat(t); }
        have.tracks = t; have.count = t.length;
        if (meta.id) meta.count = t.length;
    } else {
        // ("failed": read anew when opened; "loading" is let be: its answer, from before the edit, is read again)
        if (have === "failed") L.delete(pid);
        if (meta.id) meta.count = Math.max(0, (meta.count || 0) + (added ? added.length : 0) - (removed ? removed.size : 0));
    }
    if (typeof onlaEdited === "function") onlaEdited("songs", pid, { added, removed });
    onlRepaint();
}
function onlAddSongs(p, songs) {
    const ids = songs.filter(Boolean).map(s => String(s.id));
    if (!p || !ids.length) return;
    onlEdit(`/ne/pl/add?pid=${encodeURIComponent(p.id)}&ids=${ids.join(",")}`, d => {
        if (!d.already) onlSongsEdited(p.id, songs.map(s => Object.assign({}, s, { added: Date.now() })), null);
        onlNotice(tr(d.already ? "Already in “{0}”" : "Added to “{0}”", onlListName(p)), "ok");
        onlListsAgain();
    });
}
function onlRemoveSongs(p, songs) {
    const ids = songs.filter(Boolean).map(s => String(s.id));
    if (!p || !ids.length) return;
    onlEdit(`/ne/pl/del?pid=${encodeURIComponent(p.id)}&ids=${ids.join(",")}`, () => {
        OV.hover = null;   // (the rows below move up)
        onlSongsEdited(p.id, null, new Set(ids));
        onlNotice(tr("Removed from “{0}”", onlListName(p)), "ok");
        onlListsAgain();
    });
}
// a name asked for (null: none given)
function onlAskName(title, now = "") {
    let name = "";
    try { name = String(utils.InputBox(window.ID, tr("NetEase playlist name"), title, now, true) || "").trim(); } catch (e) { return null; }
    return name || null;
}
// then(playlist): with the new list (e.g. a song put into it)
function onlNewPlaylist(then) {
    const name = onlAskName(tr("New NetEase playlist"));
    if (!name) return;
    onlEdit(`/ne/pl/create?name=${encodeURIComponent(name)}`, d => {
        const p = d.playlist, all = ONL.by.ne.home && ONL.by.ne.home.playlists;
        // (after the liked songs, as NetEase lists a new one)
        if (p && Array.isArray(all) && !all.some(q => q.id === p.id)) all.splice(all.some(q => q.liked) ? 1 : 0, 0, p);
        onlNotice(tr("Created “{0}”", name), "ok");
        if (p && then) then(p); else onlListsAgain();
    });
}
function onlRenamePlaylist(p) {
    const name = onlAskName(tr("Rename NetEase playlist"), p.title);
    if (!name || name === p.title) return;
    onlEdit(`/ne/pl/rename?id=${encodeURIComponent(p.id)}&name=${encodeURIComponent(name)}`, () => {
        const meta = onlListOf(p.id);
        if (meta.id) meta.title = name;
        if (OV.open && OV.open.id === p.id) OV.open.title = name;
        const have = ONL.by.ne.lists.get(p.id);
        if (have && typeof have === "object") have.title = name;
        if (typeof onlaEdited === "function") onlaEdited("rename", p.id, { title: name });
        onlNotice(tr("Renamed to “{0}”", name), "ok");
    });
}
function onlDeletePlaylist(p) {
    onlEdit(`/ne/pl/delete?id=${encodeURIComponent(p.id)}`, () => {
        const all = ONL.by.ne.home && ONL.by.ne.home.playlists;
        if (Array.isArray(all)) { const i = all.findIndex(q => q.id === p.id); if (i >= 0) all.splice(i, 1); }
        ONL.by.ne.lists.delete(p.id);
        if (OV.open && OV.open.id === p.id) { OV.open = null; OV.scroll = 0; }
        if (typeof onlaEdited === "function") onlaEdited("delete", p.id, null);
        onlNotice(tr("Deleted “{0}”", p.title), "ok");
    });
}
// someone else's list collected into the account's playlists, or let go
function onlCollectPlaylist(p, on) {
    onlEdit(`/ne/pl/collect?id=${encodeURIComponent(p.id)}&on=${on ? 1 : 0}`, () => {
        onlNotice(tr(on ? "Collected “{0}”" : "Removed “{0}” from your playlists", p.title), "ok");
        onlListsAgain();
    });
}

// ---- what was played lately and searched for, kept in data\recent.json ----
// lists: the online (and imported) lists played, newest first { src, id, name, cover, count, pl (the foobar2000
// playlist), pos (the song it was left at, from 1) }; searches: per service, the texts whose results were used
ONL.recent = (() => { const r = onlReadJson(ONL_DATA + "recent.json") || {}; return { lists: Array.isArray(r.lists) ? r.lists : [], searches: r.searches || {} }; })();
const onlSaveRecent = () => { try { if (!utils.IsDirectory(ONL_DATA)) utils.CreateFolder(ONL_DATA); utils.WriteTextFile(ONL_DATA + "recent.json", JSON.stringify(ONL.recent, (k, v) => k === "_h" ? undefined : v), false); } catch (e) { /* kept for this session */ } };
// a list with no cover of its own (the day's songs, an import): the art of the song it was left at (its item kept in _h)
function onlRecentArt(r) {
    if (r._h === undefined) {
        const pl = plman.FindPlaylist(r.pl), it = pl >= 0 ? plman.GetPlaylistItems(pl) : null;
        r._h = it && it.Count ? it[clamp((r.pos || 1) - 1, 0, it.Count - 1)] : null;
    }
    return r._h ? cover(r._h, onlRepaint) : null;
}
function onlRemember(r) {
    ONL.recent.lists = [{ ...r, _h: undefined, at: Date.now() }, ...ONL.recent.lists.filter(o => o.pl !== r.pl)].slice(0, 12);
    onlSaveRecent();
}
// those whose foobar2000 playlist is still there, four at most
const onlRecentShown = () => ONL.recent.lists.filter(r => plman.FindPlaylist(r.pl) >= 0).slice(0, 4);
// a new song: where its list was left
function onlineTrack() {
    const loc = plman.GetPlayingItemLocation();
    if (!loc.IsValid) return;
    const name = plman.GetPlaylistName(loc.PlaylistIndex), r = ONL.recent.lists.find(o => o.pl === name);
    if (!r) return;
    r.pos = loc.PlaylistItemIndex + 1;
    r._h = undefined;
    const s = onlineSongOf(fb.GetNowPlaying());
    if (s) r.sid = String(s.id);
    r.count = plman.PlaylistItemCount(loc.PlaylistIndex);
    onlRemember(r);
}
// play a list from where it was left: an online one asked for again (what can be played changes: a song the service took
// away would stop foobar2000 at every one of its addresses), from the song it was left at; an import (or a search's
// songs, which have no list to ask for) from its foobar2000 playlist
function onlineResume(r) {
    if (!r) return;
    if ((r.src === "ne" || r.src === "qq") && r.id && ONL.state === "ready") {
        onlPlayWhenHere({ key: r.pl, id: r.id, src: r.src, name: r.name, meta: { id: r.id, cover: r.cover },
            at: t => { const i = r.sid ? t.findIndex(s => String(s.id) === r.sid) : -1; return i >= 0 ? i : clamp((r.pos || 1) - 1, 0, Math.max(0, t.length - 1)); },
            ok: () => { r.none = false; }, none: () => { r.none = true; } });
        return;
    }
    // (an online list without the bridge: its addresses would all fail)
    if (r.src === "ne" || r.src === "qq") { onlNotice(tr("Waiting for the bridge…")); return; }
    const pl = plman.FindPlaylist(r.pl);
    if (pl < 0) return;
    onlNotice(tr("Playing “{0}”", r.name), "ok");
    plman.ActivePlaylist = pl;
    plman.ExecutePlaylistDefaultAction(pl, clamp((r.pos || 1) - 1, 0, Math.max(0, plman.PlaylistItemCount(pl) - 1)));
}
const onlRecentSearches = (src = ONL.src) => ONL.recent.searches[src] || [];
function onlRememberSearch(q) {
    if (!q) return;
    ONL.recent.searches[ONL.src] = [q, ...onlRecentSearches().filter(o => o !== q)].slice(0, 5);
    onlSaveRecent();
}

// The header's search box, in 05 ONLINE: songs and playlists on the shown service (an empty text: the search goes)
function onlineSearch(text) {
    const q = String(text || "").trim();
    if (!q) { ONL.search = null; if (OV.section === "search") OV.section = "home"; onlRepaint(); return; }
    const P = ONL.src, B = ONL.by[P], S = B.search = { q, songs: null, lists: null };
    OV.open = null; OV.section = "search"; OV.scroll = 0;
    const enc = encodeURIComponent(q);
    onlGet(`/${P}/search?type=song&q=${enc}`, d => { if (B.search === S) { S.songs = onlKeep(d, P) || []; onlRepaint(); } });
    onlGet(`/${P}/search?type=playlist&q=${enc}`, d => { if (B.search === S) { S.lists = d || []; onlRepaint(); } });
    onlRepaint();
}
onMessage("online-search", t => onlineSearch(t));

// A song this account may play whole: playable here, and not one only a VIP gets (the others get a trial of it)
const onlPlayable = s => s.ok !== false && (!s.vip || onlVip(s));

// ---- covers: fetched once into data\covers\, then loaded ----
function onlineCover(url) {
    if (!url) return null;
    if (ONL.covers.has(url)) return ONL.covers.get(url);
    ONL.covers.set(url, null);
    const dir = ONL_DATA + "covers\\", file = dir + fnv(url) + ".jpg";
    if (utils.IsFile(file)) onlLoadCover(url, file);
    else {
        if (!utils.IsDirectory(dir)) utils.CreateFolder(dir);
        ONL_DOWNLOADS.set(file.toLowerCase(), url);
        utils.DownloadFileAsync(url, file);
    }
    return null;
}
const ONL_DOWNLOADS = new Map();   // file (lower case) -> its address
function onlLoadCover(url, file) {
    d2d.LoadImageAsyncV2(0, file).then(img => { ONL.covers.set(url, img); onlRepaint(); }, () => {});
}
// foobar2000's on_download_file_done, forwarded by the panel; true when it was one of ours (the Archive's online covers
// too, lib/onlarchive.js)
function onlineDownloaded(path, ok) {
    if (typeof onlaDownloaded === "function" && onlaDownloaded(path, ok)) return true;
    const url = ONL_DOWNLOADS.get(String(path).toLowerCase());
    if (!url) return false;
    ONL_DOWNLOADS.delete(String(path).toLowerCase());
    if (ok) onlLoadCover(url, path);
    return true;
}

// ---- playing: the songs as a foobar2000 playlist, "NetEase · <name>" / "QQ Music · <name>", started at song `at` ----
const onlSongUrl = s => `http://127.0.0.1:${ONL.port}/${s.src || "ne"}/play/${s.id}?k=${onlKey()}`;
// opt.recent false: not kept with the lists played lately (data\recent.json). The Archive's online cases play this way
// (lib/onlarchive.js onlaPlay): they have no list of the service's to resume, and onlineResume could not start one.
// opt.noplay: the playlist filled and made the active one, not played (the Archive's OPEN IN PLAYLIST).
function onlinePlay(name, songs, at = 0, meta = null, opt = {}) {
    const list = songs.filter(onlPlayable);
    if (!list.length) return false;
    const start = Math.max(0, list.indexOf(songs[at])), src = list[0].src || ONL.src, title = `${ONL_SOURCES[src].list} · ${name}`;
    const dir = ONL_DATA + "playlists\\", file = dir + fnv(title) + ".m3u8";
    if (!utils.IsDirectory(dir)) utils.CreateFolder(dir);
    const clean = t => String(t).replace(/[\r\n]+/g, " ");
    const lines = ["#EXTM3U"];
    for (const s of list) {
        lines.push(`#EXTINF:${Math.round((s.ms || 0) / 1000)},${clean(s.artists.join(" / "))} - ${clean(s.title)}`);
        lines.push(onlSongUrl(s));
    }
    utils.WriteTextFile(file, lines.join("\r\n") + "\r\n", false);
    if (opt.recent !== false) onlRemember({ src, id: meta ? meta.id : null, name, cover: (meta && meta.cover) || list[start].cover || "", count: list.length, pl: title, pos: start + 1, sid: String(list[start].id) });
    const pl = plman.FindOrCreatePlaylist(title, true), gen = ++ONL.playGen;
    plman.ClearPlaylist(pl);
    plman.AddLocations(pl, [file], false);
    if (opt.noplay) { plman.ActivePlaylist = pl; return true; }
    // (added in the background: played once it is there. A list played since, into the same playlist or another, is
    // the one that plays: the Archive plays album after album into one, faster than they are added.)
    const t0 = Date.now(), go = () => {
        if (gen !== ONL.playGen) return;
        if (plman.PlaylistItemCount(pl) >= list.length) { plman.ActivePlaylist = pl; plman.ExecutePlaylistDefaultAction(pl, start); return; }
        if (Date.now() - t0 < 30000) window.SetTimeout(go, 100);
    };
    window.SetTimeout(go, 100);
    return true;
}
// ---- import: a playlist from elsewhere (a NetEase / QQ Music link, Exportify's CSV, Spotify's data export, a list of
// "artist - title" lines), read by the bridge (theme/online/importer.js) and matched here against the foobar2000
// library: what it has becomes the playlist "Import · <name>", the rest is written to data\imports\<name> - missing.txt
ONL.imports = [];       // what was imported this session, newest first { name, source, id, cover, total, found, pl, file }
ONL.importing = null;   // { state: reading | error, detail }
const ONL_IMPORT_ERRORS = {
    "no-link": "No link in that text.", "unknown-link": "Not a NetEase or QQ Music playlist link.",
    "spotify-link": "Connect Spotify first (below), or open a file exported from it: Exportify's CSV or Spotify's own Playlist1.json.",
    "spotify-api": "Spotify did not give the playlist: {0}", "spotify-token": "Spotify did not log in: {0}",
    "spotify-premium": "Spotify answers an app of your own only while its owner has Premium. Without it: export the playlist with Exportify (a CSV) or ask Spotify for your data (Playlist1.json), then OPEN A FILE.",
    "spotify-client": "That is not a Client ID (32 letters and digits, from developer.spotify.com › your app).",
    "not-found": "The playlist was not found (a private one needs that account logged in here).", "no-file": "The file was not found.",
    "too-large": "The file is too large.", "nothing-read": "No songs were found in the file.",
};
function onlineImportLink() {
    let clip = "";
    try { clip = String(utils.GetClipboardText() || ""); } catch (e) { clip = ""; }
    let text = "";
    try { text = utils.InputBox(window.ID, tr("A NetEase or QQ Music playlist link (a share text will do):"), `Audio Archive · ${tr("Import")}`, /https?:\/\//.test(clip) ? clip.trim().slice(0, 600) : "", true); }
    catch (e) { return; }   // cancelled
    text = String(text || "").trim();
    if (text) onlImport(`/import/link?url=${encodeURIComponent(text)}`);
}
// A Windows file dialog: a script cannot show one, so a small PowerShell script (written here, ASCII only) does and
// leaves the chosen file's path in data\import-pick.txt, which is looked for until it is there
function onlineImportFile() {
    const ps1 = ONL_DATA + "import-pick.ps1", out = ONL_DATA + "import-pick.txt", fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!utils.IsDirectory(ONL_DATA)) utils.CreateFolder(ONL_DATA);
    try { if (utils.IsFile(out)) fso.DeleteFile(out); } catch (e) { /* written over */ }
    utils.WriteTextFile(ps1, [
        "param([string]$Out)",
        "Add-Type -AssemblyName System.Windows.Forms",
        "$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }",
        "$d = New-Object System.Windows.Forms.OpenFileDialog",
        "$d.Filter = 'Playlists (*.csv;*.json;*.txt;*.m3u;*.m3u8)|*.csv;*.json;*.txt;*.m3u;*.m3u8|All files (*.*)|*.*'",
        "$p = if ($d.ShowDialog($owner) -eq 'OK') { $d.FileName } else { '' }",
        "[IO.File]::WriteAllText($Out, \"picked`n$p\", (New-Object System.Text.UTF8Encoding $false))",
    ].join("\r\n"), false);
    try { new ActiveXObject("WScript.Shell").Run(`cmd /c set "PSModulePath=" && powershell -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "${ps1}" -Out "${out}"`, 0, false); }
    catch (e) { ONL.importing = { state: "error", detail: "could not open a file dialog" }; onlRepaint(); return; }
    const t0 = Date.now(), poll = () => {
        let s = "";
        try { s = utils.IsFile(out) ? utils.ReadTextFile(out, 65001) : ""; } catch (e) { s = ""; }
        if (s.startsWith("picked")) { const file = s.slice(7).trim(); if (file) onlImport(`/import/file?path=${encodeURIComponent(file)}`); return; }
        if (Date.now() - t0 < 10 * 60 * 1000) window.SetTimeout(poll, 400);
    };
    window.SetTimeout(poll, 600);
}
function onlImport(route) {
    if (ONL.state !== "ready") return;
    ONL.importing = { state: "reading" };
    onlRepaint();
    onlGet(route, d => {
        if (!d || d.error || !d.playlists) {
            ONL.importing = { state: "error", detail: tr(d && ONL_IMPORT_ERRORS[d.error] ? ONL_IMPORT_ERRORS[d.error] : "The bridge did not answer.", d && d.detail || "") };
            onlRepaint();
            return;
        }
        for (const p of d.playlists) onlImportOne(p);
        ONL.importing = null;
        onlRepaint();
    }, 180000);
}
// Spotify: the reader's own app (its Client ID, kept in the settings), logged in to in the browser; the bridge keeps
// the login (theme/online/spotify.js). Only for importing: nothing plays from Spotify.
ONL.spotify = { login: false, user: null, waiting: false };
function onlSpotifyStatus(done) { onlGet("/spotify/status", d => { if (d) ONL.spotify = { ...ONL.spotify, login: !!d.login, user: d.user }; onlRepaint(); if (done) done(d); }); }
function onlineSpotifyConnect() {
    let id = String(getSetting("spotifyClient", "") || "");
    try { id = String(utils.InputBox(window.ID, tr("Your Spotify app's Client ID (developer.spotify.com › Dashboard › your app; its redirect URI: {0})", `http://127.0.0.1:${ONL.port}/spotify/callback`), "Audio Archive · Spotify", id, true) || "").trim(); }
    catch (e) { return; }   // cancelled
    if (!id) return;
    setSetting("spotifyClient", id);
    onlGet(`/spotify/login?client=${encodeURIComponent(id)}`, d => {
        if (!d || !d.url) { ONL.importing = { state: "error", detail: tr(ONL_IMPORT_ERRORS[(d && d.error) || ""] || "The bridge did not answer.", "") }; onlRepaint(); return; }
        try { new ActiveXObject("WScript.Shell").Run(`"${d.url}"`); } catch (e) { ONL.importing = { state: "error", detail: "could not open the browser" }; onlRepaint(); return; }
        // the browser's login, looked for every 2 s (5 minutes at most)
        ONL.spotify.waiting = true; ONL.importing = null; onlRepaint();
        const t0 = Date.now(), poll = () => onlSpotifyStatus(s => {
            if (s && s.login) { ONL.spotify.waiting = false; onlRepaint(); return; }
            if (Date.now() - t0 < 5 * 60 * 1000) window.SetTimeout(poll, 2000); else { ONL.spotify.waiting = false; onlRepaint(); }
        });
        window.SetTimeout(poll, 2000);
    });
}
function onlineSpotifyLogout() { onlGet("/spotify/logout", () => onlSpotifyStatus()); }

function onlImportOne(p) {
    const found = [], missing = [], idx = onlLibIndex(), list = new FbMetadbHandleList();
    for (const t of p.tracks) { const i = onlMatch(t, idx); if (i < 0) missing.push(t); else { found.push(t); list.Add(idx.items[i]); } }
    const name = `Import · ${p.name}`;
    if (list.Count) {
        const pl = plman.FindOrCreatePlaylist(name, true);
        plman.ClearPlaylist(pl);
        plman.InsertPlaylistItems(pl, 0, list);
    }
    let file = "";
    if (missing.length) {
        const dir = ONL_DATA + "imports\\";
        if (!utils.IsDirectory(dir)) utils.CreateFolder(dir);
        file = dir + String(p.name).replace(/[\\/:*?"<>|\r\n\t]+/g, "_").slice(0, 80) + " - missing.txt";
        const line = t => `${t.artists.join(" / ")}${t.artists.length ? " - " : ""}${t.title}${t.album ? `   (${t.album})` : ""}`;
        utils.WriteTextFile(file, "\ufeff" + [`${p.name}: ${missing.length} / ${p.tracks.length} ${tr("not in the library")}`, ""].concat(missing.map(line)).join("\r\n") + "\r\n", false);
    }
    ONL.imports.unshift({ name: p.name, source: p.source, id: p.id || "", cover: p.cover || "", total: p.tracks.length, found: found.length, pl: list.Count ? name : "", file });
}

// The library, indexed by title (built at most every 5 minutes): each title under several keys, from the strictest
// down — as it is (case, width, spaces and punctuation aside), without what is in brackets ("(feat. …)",
// "(Taylor's Version)", "（伴奏）") or after " - " ("- Remastered 2011"), and each half of a title in two scripts
// ("无获的探索 A Fruitless Search": either half)
let ONL_INDEX = null;
const onlSquash = s => String(s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
function onlKeys(title) {
    const t = String(title || "").normalize("NFKC"), keys = [onlSquash(t)];
    const bare = t.replace(/[(\[（【「『〔][^)\]）】」』〕]*[)\]）】」』〕]/g, " ").replace(/\s+[-–—]\s+.*$/, "");
    keys.push(onlSquash(bare));
    const cjk = bare.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}][^a-zA-Z]*/u), latin = bare.match(/[a-zA-Z][a-zA-Z0-9 '’.,!?&:-]*[a-zA-Z0-9!?]/);
    if (cjk && latin) { keys.push(onlSquash(cjk[0])); keys.push(onlSquash(latin[0])); }
    return [...new Set(keys.filter(k => k.length >= 1))];
}
const onlArtists = s => (Array.isArray(s) ? s : String(s || "").split(/\s*(?:;|,|\/|、|&|＆| feat\.? | ft\. |×)\s*/i)).map(onlSquash).filter(Boolean);
function onlLibIndex() {
    if (ONL_INDEX && Date.now() - ONL_INDEX.at < 5 * 60 * 1000) return ONL_INDEX;
    const items = fb.GetLibraryItems(), tf = fb.TitleFormat("%title%\t[$meta_sep(artist,; )]\t[%length_seconds%]"), keys = new Map();
    for (let i = 0; i < items.Count; i++) {
        const [t, a, s] = tf.EvalWithMetadb(items[i]).split("\t"), e = { i, artists: onlArtists(a), sec: +s || 0 };
        for (const k of onlKeys(t)) { let l = keys.get(k); if (!l) keys.set(k, l = []); l.push(e); }
    }
    return (ONL_INDEX = { at: Date.now(), items, keys });
}
// The library item a song is (its index), or -1: under the strictest key that has one, the candidate with an artist in
// common (one name inside the other counts: "HOYO-MiX" in "三Z-STUDIO; HOYO-MiX"); without artists to compare, the
// one as long as the song (3 s either way) or the only one
function onlMatch(t, idx) {
    const want = onlArtists(t.artists), sec = (t.ms || 0) / 1000;
    const same = (a, b) => a === b || (a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a)));
    // (n: the key's rank — the two halves of a title in two scripts (n ≥ 2) count only with an artist or a length to
    // confirm them: a half and nothing else took the wrong songs)
    for (const [n, k] of onlKeys(t.title).entries()) {
        const c = idx.keys.get(k);
        if (!c) continue;
        if (n >= 2 && !want.length && !sec) continue;
        const byArtist = c.filter(e => e.artists.some(a => want.some(w => same(a, w))));
        if (byArtist.length) return (sec ? byArtist.slice().sort((x, y) => Math.abs(x.sec - sec) - Math.abs(y.sec - sec))[0] : byArtist[0]).i;
        if (!want.length || !c.some(e => e.artists.length)) {
            const byLength = sec ? c.filter(e => Math.abs(e.sec - sec) <= 3) : [];
            if (byLength.length) return byLength[0].i;
            if (c.length === 1 && !want.length) return c[0].i;
        }
    }
    return -1;
}

// the online song a playing item is (by its bridge address), as last seen
function onlineSongOf(handle) {
    const m = handle && /^http:\/\/127\.0\.0\.1:\d+\/(ne|qq)\/play\/(\w+)/.exec(handle.Path);
    return m ? ONL.songs.get(`${m[1]}:${m[2]}`) || { id: m[2], src: m[1] } : null;
}
