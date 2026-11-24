"use strict";
// NetEase in the Archive (GROUP › ONLINE): the account's chosen playlists, read through the bridge (lib/online.js) and
// kept on disk, made into cases the Archive draws like its own: a case per album a list holds, a case per song (SHOW
// TRACKS) or one per list (SHOW FOLDERS). None of them goes into LIB.albums, the library worker or library.db: ONLA is a
// store of its own, which library.js lists only while GROUP is ONLINE, so the local archive, its favourites, ratings
// and artist pages never see an online case.
//   <profile>\audio-archive-online\data\archive\   ne-index.json             each account's playlists, and when they
//                                                                             were last read
//                                                  ne-<uid>-<list id>.json   a list's songs, as last read whole, and
//                                                                             the account's VIP level then
// The copy on disk is shown at once (read only once GROUP › ONLINE asks for it: a liked-songs list is megabytes). The
// bridge is asked again at most every 30 minutes, one list at a time and slowly (?gentle=1), and only for the lists
// whose songs changed since (the playlist's upd), or that were read while the account had another VIP level (which songs
// it can play, each song's ok, goes by it): NetEase refuses an account that asks too much. Whatever goes wrong
// (the bridge not answering, NetEase saying too often, a list that no longer opens) leaves the copy on disk as it is.
//
// The cases' keys start with ONL_KEY, which no local key does (FOLDER_KEY is "\u0001f|", a track's "t|…"), and never
// carry the bridge's ?k= key, since the Archive keeps keys in its settings (archiveSel):
//   album   ONL_KEY + "a|ne|<list id>|<album id>"   (an album id of 0: "n" + fnv of its name and first artist)
//   track   ONL_KEY + "t|ne|<list id>|<song id>"
//   list    ONL_KEY + "p|ne|<list id>"
//   cover   ONL_KEY + "c|ne|<album id>" (or "p<fnv of the picture>", a list's "pl<list id>"): an album in two lists
//           shares one thumbnail
// Each case has the fields the Archive reads of a local album (title, artist, year, tracks, length, discs, added …;
// codec "NETEASE") and no idx: the code that takes a case's foobar2000 tracks gets none. What it holds instead is
// a.online = { src, pl (its list), songs (album: disc / track order; list: the list's order), ids (a Set), locked
// (how many this account cannot play whole) }; a track case also has song, and album (its album case's key).
// Covers: only those of the cases on screen, downloaded from NetEase at the thumbnail's size into data\thumbs\ (four at
// a time at most), then made thumbnails by the library worker like a local album's, into the same disk cache
// (<profile>\audio-archive-cache\covers\, covers-512\); the download is let go once the thumbnail is made. A cover that
// does not come (offline) leaves the case blank for now, and is asked for again ten minutes later.

const ONL_KEY = "\u0001o|";
const ONLA_DIR = ONL_DATA + "archive\\";
const ONLA_EVERY = 30 * 60 * 1000;        // the lists asked for again at most this often
const ONLA_RETRY = 5 * 60 * 1000;         // after the bridge did not answer (or is not installed, or not logged in)
const ONLA_PAUSE = 3000;                  // between two lists
const ONLA_BACKOFF = [60000, 180000];     // NetEase saying too often: the list asked again after these, then the round stops
const ONLA_STALE = 10 * 60 * 1000;        // a round with no word from the bridge for this long is taken as lost

const ONLA = {
    uid: "",              // the account the copy is of
    lists: [],            // its playlists [{ id, title, cover, count, owner, own, liked, upd, order }], as last read
    chosen: new Set(),    // the ids shown (archiveOnline, else the liked songs and the account's own lists)
    data: new Map(),      // list id -> { id, upd, count, at, tracks: [song] } (the chosen ones only)
    albums: [], items: [], playlists: [],   // the cases, per unit (ALBUMS / TRACKS / FOLDERS)
    map: new Map(),       // key -> case, all three units
    bySong: new Map(),    // "ne:<song id>" -> the first album case holding it
    byTrack: new Map(),   // "ne:<song id>" -> the first track case of it
    byList: new Map(),    // "ne:<song id>" -> the first list case holding it
    inList: new Map(),    // "<list id>|<song id>" -> { a, t, p }: its album case's, track case's and list case's keys there
    playPl: "",           // the list the Archive last played from (onlaPlay): its cases are the playing song's
    // "" (not read yet) | cached (the copy on disk, not asked again yet) | syncing | ready | offline (the bridge or
    // NetEase did not answer: why says which) | nologin | absent (no bridge installed)
    state: "",
    why: "",              // offline: "bridge" | "throttled"
    loaded: false,        // the copy on disk read
    syncedAt: 0,          // when the account's lists were last asked for whole (kept in ne-index.json)
    nextAt: 0,            // no round of its own before this
    cycle: 0,             // the round under way (a newer one, or onlaInvalidate, drops the older one's answers)
    busyAt: 0,            // the round's last step (one quiet for ONLA_STALE is taken as lost)
    queue: [],            // the list ids still to read this round
    due: false,           // this round asked for the account's lists (not only for the chosen ones missing)
    again: false,         // a refresh asked for while a round ran: every chosen list read again once it is done
    current: "",          // the list being read
    ver: 0,               // bumped with every rebuild
};

// ---- what is chosen: archiveOnline = { "<uid>": ["<list id>", …] } (no entry: the default) ----
// (kept in the settings file only: a layout someone exports and shares should not carry an account id)
function onlaChoices() {
    const v = getSetting("archiveOnline", "");
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
    try { const o = JSON.parse(v || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
}
// the default: the liked songs and the lists the account made itself, not the ones it collected
const onlaDefault = lists => lists.filter(p => p.liked || p.own).map(p => p.id);
function onlaChosenIds() {
    const c = onlaChoices()[ONLA.uid];
    return Array.isArray(c) ? c.map(String) : onlaDefault(ONLA.lists);
}
const onlaIsDefault = () => !Array.isArray(onlaChoices()[ONLA.uid]);
// a list shown or not (from then on the account's choice is its own, in the account's list order)
function onlaChoose(id, on) {
    if (!ONLA.uid) return;
    id = String(id);
    const now = new Set(onlaChosenIds());
    if (on) now.add(id); else now.delete(id);
    const o = onlaChoices();
    o[ONLA.uid] = ONLA.lists.map(p => p.id).filter(i => now.has(i));
    setSetting("archiveOnline", JSON.stringify(o), true);
    onlaPick();
    if (on && !ONLA.data.has(id)) onlaWant([id]);   // (one not on disk yet is read now, whatever the time)
}
// back to the default (the lists the account makes later join it)
function onlaChooseDefault() {
    if (!ONLA.uid) return;
    const o = onlaChoices();
    delete o[ONLA.uid];
    setSetting("archiveOnline", JSON.stringify(o), true);
    onlaPick();
    onlaWant(onlaMissing());
}
// lists just chosen that are not on disk: read in the round under way (at the end of its queue: a round that has not
// made its queue yet makes it from what is chosen now anyway), else in a round of their own. Without this a list
// ticked while a round runs would wait for the next round, half an hour later.
function onlaWant(ids) {
    if (!ids.length) return;
    if (ONLA.state === "syncing" && Date.now() - ONLA.busyAt < ONLA_STALE) { for (const id of ids) if (!ONLA.queue.includes(id)) ONLA.queue.push(id); }
    else onlaSync(false, true);
}

// ---- the copy on disk ----
const onlaSafe = s => String(s).replace(/[^\w-]+/g, "_");
const onlaListFile = (uid, id) => `${ONLA_DIR}ne-${onlaSafe(uid)}-${onlaSafe(id)}.json`;
const ONLA_INDEX = ONLA_DIR + "ne-index.json";
// a song as the Archive keeps it. A bridge from before 2.3 (one still running from before a theme update: it keeps its
// code until foobar2000 restarts) gives no alId, no, cd, year, pic or added: its songs go by album name, with no year
// and no date. cover is 05 ONLINE's (300 px), for the songs it is handed (onlKeep).
function onlaSong(s) {
    const pic = String(s.pic || String(s.cover || "").replace(/\?.*$/, ""));
    return { id: String(s.id), title: String(s.title || ""), artists: Array.isArray(s.artists) ? s.artists.map(String) : [],
             album: String(s.album || ""), alId: String(s.alId || "0"), no: +s.no || 0, cd: +s.cd || 1, year: +s.year || 0,
             ms: +s.ms || 0, pic, ok: s.ok !== false, vip: !!s.vip, added: +s.added || 0, src: "ne", cover: pic ? pic + "?param=300y300" : "" };
}
// what a list's file holds (JSON.stringify's key list: the same names at every level)
const ONLA_STORED = ["id", "upd", "count", "at", "level", "tracks", "title", "artists", "album", "alId", "no", "cd", "year", "ms", "pic", "ok", "vip", "added"];
function onlaWrite(file, text) {
    try {
        for (const dir of [ONL.root, ONL_DATA, ONLA_DIR]) if (!utils.IsDirectory(dir)) utils.CreateFolder(dir);
        utils.WriteTextFile(file, text, false);
        return true;
    } catch (e) { console.log("audio-archive online archive: not written: " + e); return false; }
}
function onlaReadIndex() {
    const o = onlReadJson(ONLA_INDEX);
    return o && typeof o === "object" && o.accounts && typeof o.accounts === "object" ? o : { uid: "", accounts: {} };
}
// the account's lists and when they were read, beside the other accounts' (one logged in again finds its copy)
function onlaWriteIndex() {
    if (!ONLA.uid) return;
    const ix = onlaReadIndex();
    ix.uid = ONLA.uid;
    ix.accounts[ONLA.uid] = { syncedAt: ONLA.syncedAt, lists: ONLA.lists };
    onlaWrite(ONLA_INDEX, JSON.stringify(ix));
}
function onlaReadList(id) {
    const d = onlReadJson(onlaListFile(ONLA.uid, id));
    if (!d || !Array.isArray(d.tracks)) return null;
    // (level: a file from before it was kept is taken as read under another one, so it is read again once)
    return { id: String(id), upd: +d.upd || 0, count: +d.count || d.tracks.length, at: +d.at || 0, level: d.level == null ? -1 : +d.level,
             tracks: onlKeep(d.tracks.map(onlaSong), "ne") };
}
// the account's VIP level now (0: none), as the bridge read it at the login
const onlaLevel = () => { const me = ONL.by.ne.me; return (me && +me.vip) || 0; };

// The copy on disk, read once (GROUP › ONLINE shown): the account last seen, its lists, the chosen ones' songs
function onlaLoad() {
    if (ONLA.loaded) return;
    ONLA.loaded = true;
    const ix = onlaReadIndex();
    if (ix.uid && ix.accounts[ix.uid]) onlaUse(ix.uid, ix.accounts[ix.uid]);
}
// an account's copy shown (acc: its entry in the index, or null: nothing kept for it yet)
function onlaUse(uid, acc) {
    ONLA.uid = String(uid);
    ONLA.lists = acc && Array.isArray(acc.lists) ? acc.lists : [];
    ONLA.syncedAt = (acc && +acc.syncedAt) || 0;
    ONLA.nextAt = ONLA.syncedAt + ONLA_EVERY;
    ONLA.data.clear();
    onlaPick();
}
// the chosen lists' songs in memory: the ones not there yet read from disk, the ones no longer chosen let go; then the
// cases built again
function onlaPick() {
    const have = new Set(ONLA.lists.map(p => p.id));
    ONLA.chosen = new Set(onlaChosenIds().filter(id => have.has(id)));
    for (const id of [...ONLA.data.keys()]) if (!ONLA.chosen.has(id)) ONLA.data.delete(id);
    for (const id of ONLA.chosen) if (!ONLA.data.has(id)) { const d = onlaReadList(id); if (d) ONLA.data.set(id, d); }
    if (!ONLA.state && ONLA.data.size) ONLA.state = "cached";
    onlaRebuild();
}
// the chosen lists, as the shelves and the reading go: the liked songs first, then the account's order
const onlaShown = () => ONLA.lists.filter(p => ONLA.chosen.has(p.id)).sort((p, q) => (!p.liked - !q.liked) || (p.order - q.order));
// the chosen lists with no songs here (never read, or read only in part)
const onlaMissing = () => onlaShown().map(p => p.id).filter(id => { const d = ONLA.data.get(id); return !d || d.partial; });

// ---- the cases ----
const onlaLc = s => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
const onlaNo = key => 1 + parseInt(fnv(key), 16) % 9999;   // (as library.js setAlbums numbers the local ones)
// a time in ms as the library gives %added% (local time), so SORT › ADDED puts what was liked last first
function onlaDate(ms) {
    if (!(ms > 0)) return "";
    const d = new Date(ms), p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// the value most of them have (the first one seen on a tie; empty ones do not count)
function onlaTop(vals) {
    const n = new Map();
    let top = "", c = 0;
    for (const v of vals) if (v) { const k = n.get(v) + 1 || 1; n.set(v, k); if (k > c) { top = v; c = k; } }
    return top;
}
const onlaLocked = songs => typeof onlPlayable === "function" ? songs.filter(s => !onlPlayable(s)).length : 0;
// the fields every case has, from its songs
function onlaCase(key, cover, coverUrl, plId, songs, o) {
    const artist = o.artist !== undefined ? o.artist : onlaTop(songs.map(s => s.artists[0]));
    return Object.assign({
        key, no: onlaNo(key), title: "", artist, aname: artist, akey: onlaLc(artist), asort: "",
        genre: "", year: onlaTop(songs.map(s => s.year > 0 ? String(s.year) : "")), codec: "NETEASE", bits: 0, rate: 0, kbps: 0, lossless: false,
        tracks: songs.length, length: Math.round(songs.reduce((t, s) => t + s.ms, 0) / 1000), discs: songs.reduce((n, s) => Math.max(n, s.cd), 1),
        added: onlaDate(songs.reduce((n, s) => Math.max(n, s.added), 0)), plays: 0, shelf: plId, cover, coverUrl,
        online: { src: "ne", pl: plId, songs, ids: new Set(songs.map(s => s.id)), locked: onlaLocked(songs) },
    }, o);
}
// every case again, from the chosen lists in the account's order (its liked songs first)
function onlaRebuild() {
    const albums = [], items = [], playlists = [], map = new Map(), bySong = new Map(), byTrack = new Map(), byList = new Map(), inList = new Map();
    const lists = onlaShown().filter(p => ONLA.data.has(p.id));
    const first = (m, id, key) => { if (!m.has("ne:" + id)) m.set("ne:" + id, key); };
    for (const pl of lists) {
        const songs = [], seen = new Set();
        for (const s of ONLA.data.get(pl.id).tracks) if (!seen.has(s.id)) { seen.add(s.id); songs.push(s); }
        // the albums, in the order the list first has them; an album's songs in disc / track order (a bridge that gives
        // no track numbers: the list's order)
        const byAlbum = new Map();
        songs.forEach((s, i) => {
            const ak = s.alId !== "0" ? s.alId : "n" + fnv(onlaLc(s.album) + "|" + onlaLc(s.artists[0]));
            let g = byAlbum.get(ak);
            if (!g) byAlbum.set(ak, g = { ak, songs: [], at: [] });
            g.songs.push(s); g.at.push(i);
        });
        for (const g of byAlbum.values()) {
            const order = g.songs.map((s, j) => [s, g.at[j]]).sort((x, y) => ((x[0].cd * 1000 + x[0].no) - (y[0].cd * 1000 + y[0].no)) || (x[1] - y[1])).map(x => x[0]);
            const s0 = order[0], pic = (order.find(s => s.pic) || s0).pic;
            const cover = ONL_KEY + "c|ne|" + (s0.alId !== "0" ? s0.alId : "p" + fnv(pic || g.ak));
            const title = (order.find(s => s.album) || s0).album || tr("UNKNOWN ALBUM");
            const a = onlaCase(`${ONL_KEY}a|ne|${pl.id}|${g.ak}`, cover, pic, pl.id, order, { title });
            a.text = [title, a.artist, ...order.map(s => `${s.title} ${s.artists.join(" ")}`)].join(" ").toLowerCase();
            albums.push(a); map.set(a.key, a);
            for (const s of order) {
                first(bySong, s.id, a.key);
                const t = onlaCase(`${ONL_KEY}t|ne|${pl.id}|${s.id}`, cover, pic, pl.id, [s], { title: s.title, artist: s.artists.join(", "),
                    album: a.key, albumTitle: title, ord: s.cd * 1000 + s.no, song: s });
                if (!t.year) t.year = a.year;
                t.discs = 1;
                t.text = `${s.title} ${s.artists.join(" ")} ${title}`.toLowerCase();
                items.push(t); map.set(t.key, t);
                first(byTrack, s.id, t.key);
                inList.set(pl.id + "|" + s.id, { a: a.key, t: t.key, p: `${ONL_KEY}p|ne|${pl.id}` });
            }
        }
        // the list as one case (SHOW FOLDERS), on the one NETEASE shelf, by the account that made it
        const p = onlaCase(`${ONL_KEY}p|ne|${pl.id}`, `${ONL_KEY}c|ne|pl${pl.id}`, String(pl.cover || "").replace(/\?.*$/, ""), "NETEASE", songs,
            { title: pl.title, name: pl.title, artist: pl.owner || "", list: pl.id, year: "" });
        p.online.pl = pl.id;
        p.discs = 1;
        p.text = `${pl.title} ${pl.owner || ""}`.toLowerCase();
        playlists.push(p); map.set(p.key, p);
        for (const s of songs) first(byList, s.id, p.key);
    }
    Object.assign(ONLA, { albums, items, playlists, map, bySong, byTrack, byList, inList });
    ONLA.ver++;
    onlaRebuilt();
}
// the Archive told (it lists ONLA only while GROUP is ONLINE: groupAlbums, whose "catalog" news places the selection
// again, so one kept from before finds its case once the copy is read)
function onlaRebuilt() {
    if (typeof LIB === "object" && LIB.groupBy === "online" && typeof groupAlbums === "function") groupAlbums();
    else onlRepaint();
}

// ---- what the Archive asks of it ----
// a list's name (a shelf's name under GROUP › ONLINE)
const onlaListTitle = id => { const p = ONLA.lists.find(q => q.id === String(id)); return p ? p.title : ""; };
// the cases for a unit
const onlaCases = unit => unit === "tracks" ? ONLA.items : unit === "folders" ? ONLA.playlists : ONLA.albums;
// the key of the case a song is in, for a unit ("" for none: a song not on a shown list). A song on several lists is
// the case's on the list the Archive played it from (so the playing mark, the inspection following the playing song
// and the transport's inspect stay on the shelf it was played from), else the first list's.
function onlaSongKey(id, unit) {
    const own = ONLA.playPl ? ONLA.inList.get(ONLA.playPl + "|" + id) : null;
    if (own) return unit === "tracks" ? own.t : unit === "folders" ? own.p : own.a;
    return (unit === "tracks" ? ONLA.byTrack : unit === "folders" ? ONLA.byList : ONLA.bySong).get("ne:" + id) || "";
}
// the case of another unit on the same list that holds this case's (first) song: a selection kept across ALBUMS /
// TRACKS / FOLDERS (archive.js placeSelection), as a local one moves to what holds its first track
function onlaKeyIn(a, unit) {
    const s = a && a.online ? a.song || a.online.songs[0] : null, k = s ? ONLA.inList.get(a.online.pl + "|" + s.id) : null;
    return !k ? "" : unit === "tracks" ? k.t : unit === "folders" ? k.p : k.a;
}
// the case holds this song (a track case: is this song); s: the playing item's song (lib/online.js onlineSongOf)
const onlaHolds = (a, s) => !!(a && a.online && s && s.src === "ne") && (a.song ? a.song.id === String(s.id) : a.online.ids.has(String(s.id)));
// what an empty GROUP › ONLINE says (nothing to show: no copy on disk, or no list chosen)
function onlaEmptyText() {
    if (ONLA.state === "absent") return "ONLINE · INSTALL THE BRIDGE IN 05 ONLINE";
    if (ONLA.state === "nologin") return "ONLINE · LOG IN TO NETEASE IN 05 ONLINE";
    if (ONLA.state === "offline") return ONLA.why === "throttled" ? "ONLINE · NETEASE IS BUSY · TRYING AGAIN LATER" : "ONLINE · THE BRIDGE IS NOT ANSWERING";
    if (!ONLA.state || ONLA.state === "syncing") return "ONLINE · READING PLAYLISTS …";
    if (!ONLA.chosen.size) return "ONLINE · NO PLAYLISTS CHOSEN (RIGHT-CLICK)";
    return "ONLINE · THE PLAYLISTS CHOSEN ARE EMPTY";
}

// ---- choosing the lists (archive.js archiveMenu, while GROUP is ONLINE) ----
// "Online playlists in the Archive": each of the account's lists, ticked when shown; the liked songs and the lists it
// made first, then the ones it collected (thirty to a page when there are more, as the shelf list pages its shelves: an
// account can collect hundreds); last, back to the default. Greyed until the account's lists have been read once.
// ids: base for the default, base + 1 + the list's place in ONLA.lists. Returns the lists it was made from, for
// onlaMenuPick: a round can read the account's lists again while the menu is open (timers still run under it), and
// the place picked is a place in the lists the menu showed.
const ONLA_MENU_PAGE = 30;
function onlaMenu(m, base) {
    const sub = window.CreatePopupMenu(), L = ONLA.lists, at = L.map((p, i) => i);
    const item = (menu, i) => menu.AppendMenuItem(ONLA.chosen.has(L[i].id) ? 0x8 : 0, base + 1 + i, `${L[i].title.replace(/&/g, "&&")}\t${L[i].count}`);
    const mine = at.filter(i => L[i].liked).concat(at.filter(i => !L[i].liked && L[i].own)), other = at.filter(i => !L[i].liked && !L[i].own);
    mine.forEach(i => item(sub, i));
    if (mine.length && other.length) sub.AppendMenuSeparator();
    if (other.length <= ONLA_MENU_PAGE) other.forEach(i => item(sub, i));
    else for (let p = 0; p < other.length; p += ONLA_MENU_PAGE) {
        const pg = window.CreatePopupMenu(), end = Math.min(other.length, p + ONLA_MENU_PAGE), page = other.slice(p, end);
        page.forEach(i => item(pg, i));
        const cut = t => { const c = [...t.replace(/&/g, "&&")]; return c.length > 18 ? c.slice(0, 17).join("") + "…" : c.join(""); };
        const n = page.filter(i => ONLA.chosen.has(L[i].id)).length;   // (how many are ticked on the page, so they can be found again)
        pg.AppendTo(sub, 0, `${pad(p + 1, 2)} – ${pad(end, 2)}   ${cut(L[page[0]].title)} … ${cut(L[page[page.length - 1]].title)}${n ? "\t" + n : ""}`);
    }
    if (L.length) sub.AppendMenuSeparator();
    sub.AppendMenuItem(onlaIsDefault() ? 0x8 : 0, base, tr("Use my created playlists and liked songs"));
    sub.AppendTo(m, ONLA.uid && L.length ? 0 : 1, tr("Online playlists in the Archive"));
    return L;
}
// true when id was one of onlaMenu's (L: what onlaMenu returned)
function onlaMenuPick(id, base, L = ONLA.lists) {
    if (id === base) { onlaChooseDefault(); return true; }
    const p = L[id - base - 1];
    if (!p) return false;
    onlaChoose(p.id, !ONLA.chosen.has(p.id));
    return true;
}

// ---- covers ----
const ONLA_THUMB_DIR = ONL_DATA + "thumbs\\";
// the library worker's disk cache of thumbnails (workers/library.js coverFile: the same folder, the same name)
const ONLA_THUMB_CACHE = fb.ProfilePath + "audio-archive-cache\\" + (THUMB_PX === 256 ? "covers\\" : "covers-" + THUMB_PX + "\\");
const ONLA_THUMB_MAX = 4;                 // downloads at once
const ONLA_THUMB_GAP = 150;               // ms between two downloads started
const ONLA_THUMB_FAIL = 10 * 60 * 1000;   // a cover that did not come: asked for again after this
const ONLA_THUMB_LOST = 60000;            // a download foobar2000 has not reported back after this: taken as failed
const OT = { queue: [], busy: new Map(), keys: new Set(), failed: new Map(), last: 0, timer: 0 };   // busy: file (lower case) -> { key, file, t }
const onlaThumbTemp = key => ONLA_THUMB_DIR + fnv(key) + ".jpg";
// to the worker, which makes the thumbnail (from the file downloaded; none: the one in its cache) and answers as for a
// local album (library.js libMessage); pending until then
function onlaThumbPost(key, file = "") {
    thumbPending.add(key);
    libWorker.postMessage({ type: "cover-file", gen: LIB.gen, key, file });
}
// The covers of these cases wanted (from requestThumbs: the ones on screen, nearest first, neither loaded nor on their
// way). The ones in the disk cache, or downloaded already, go to the worker at once; the others are downloaded in this
// order, which replaces the one asked for before (what has scrolled away is not fetched).
function onlaThumbs(cases) {
    const now = Date.now();
    OT.queue = [];
    for (const a of cases) {
        const key = coverKey(a), f = OT.failed.get(key);
        if (OT.keys.has(key)) { thumbPending.add(key); continue; }   // (downloading; the library's new catalog cleared pending)
        if (f && now - f < ONLA_THUMB_FAIL) continue;
        if (!a.coverUrl) { THUMBS.set(key, null); continue; }        // no picture at all: the blank case, as a local album with none
        if (utils.IsFile(ONLA_THUMB_CACHE + fnv(key) + ".jpg")) onlaThumbPost(key);
        else if (utils.IsFile(onlaThumbTemp(key))) onlaThumbPost(key, onlaThumbTemp(key));
        else OT.queue.push({ key, url: a.coverUrl });
    }
    onlaThumbPump();
}
// the next downloads: ONLA_THUMB_MAX at once at most, ONLA_THUMB_GAP apart. NetEase gives a picture at any size
// (?param=<w>y<h>): asked for at the thumbnail's.
function onlaThumbPump() {
    const now = Date.now();
    for (const [f, d] of OT.busy) if (now - d.t > ONLA_THUMB_LOST) { OT.busy.delete(f); OT.keys.delete(d.key); thumbPending.delete(d.key); OT.failed.set(d.key, now); }
    while (OT.queue.length && OT.busy.size < ONLA_THUMB_MAX) {
        const wait = OT.last + ONLA_THUMB_GAP - Date.now();
        if (wait > 0) {
            if (!OT.timer) OT.timer = window.SetTimeout(() => { OT.timer = 0; onlaThumbPump(); }, wait);
            return;
        }
        const j = OT.queue.shift();
        if (OT.keys.has(j.key) || THUMBS.has(j.key)) continue;
        const file = onlaThumbTemp(j.key);
        try { for (const dir of [ONL.root, ONL_DATA, ONLA_THUMB_DIR]) if (!utils.IsDirectory(dir)) utils.CreateFolder(dir); }
        catch (e) { console.log("audio-archive online archive: no folder for covers: " + e); OT.queue = []; return; }
        OT.busy.set(file.toLowerCase(), { key: j.key, file, t: Date.now() });
        OT.keys.add(j.key);
        thumbPending.add(j.key);
        OT.last = Date.now();
        utils.DownloadFileAsync(`${j.url}?param=${THUMB_PX}y${THUMB_PX}`, file);
    }
}
// foobar2000's on_download_file_done (through lib/online.js onlineDownloaded); true when it was a cover of ours
function onlaDownloaded(path, ok) {
    const f = String(path).toLowerCase(), d = OT.busy.get(f);
    if (!d) return false;
    OT.busy.delete(f);
    OT.keys.delete(d.key);
    if (ok && utils.IsFile(d.file)) onlaThumbPost(d.key, d.file);
    else { thumbPending.delete(d.key); OT.failed.set(d.key, Date.now()); }
    onlaThumbPump();
    return true;
}
// the worker's answer (library.js libMessage): the download let go (the thumbnail is in the cache now; or it was no
// picture: an error page, a file cut short), a failure remembered so it is asked for again later, not at once
let onlaFso = null;
function onlaThumbDone(key, ok) {
    if (!ok) OT.failed.set(key, Date.now());
    const file = onlaThumbTemp(key);
    if (!utils.IsFile(file)) return;
    try { (onlaFso || (onlaFso = new ActiveXObject("Scripting.FileSystemObject"))).DeleteFile(file); } catch (e) { /* let go next time */ }
}

// ---- playing ----
// The online cases play in one playlist of their own, "NetEase · Archive" (lib/online.js onlinePlay), filled anew each
// time as the local albums' "Archive · Album" is. It is not kept with 05 ONLINE's lists played lately (recent: false):
// it has no list of NetEase's to read again and resume. The bridge has to be running first, since the songs'
// addresses are its own and the account it has (VIP or not) decides which songs can be played; it is started here when
// it is not (05 ONLINE starts it only when shown) and waited for, 30 s at most. A newer play drops one still waiting.
//   songs: in the order they play; want: the song to start at (one this account cannot play: the next one it can);
//   pl: the list they are from (ONLA.playPl, see onlaSongKey); noplay: the playlist filled and made the active one,
//   not played (OPEN IN PLAYLIST); tell(what): "wait" (the bridge being started), then "ok", "none" (nothing here this
//   account can play), "absent" (no bridge installed) or "bridge" (it did not start)
const ONLA_PLAY = { gen: 0 };
function onlaPlay(songs, want, pl, noplay, tell) {
    const gen = ++ONLA_PLAY.gen, t0 = Date.now();
    const go = () => {
        let at = Math.max(0, songs.indexOf(want));
        for (let i = at; i < songs.length; i++) if (onlPlayable(songs[i])) { at = i; break; }
        // (none from there on: onlinePlay starts at the first that can be played)
        if (!onlinePlay("Archive", songs, at, null, { recent: false, noplay })) { tell("none"); return; }
        ONLA.playPl = String(pl || "");
        tell("ok");
    };
    if (ONL.state === "ready") { go(); return; }
    if (ONL.state === "" || ONL.state === "error") onlineStart();
    const wait = () => {
        if (gen !== ONLA_PLAY.gen) return;
        if (ONL.state === "ready") { go(); return; }
        if (ONL.state === "absent") { tell("absent"); return; }
        if (ONL.state === "error" || Date.now() - t0 > 30000) { tell("bridge"); return; }
        window.SetTimeout(wait, 300);
    };
    if (ONL.state === "absent") { tell("absent"); return; }
    tell("wait");
    window.SetTimeout(wait, 300);
}

// ---- asking the bridge ----
// GROUP › ONLINE shown: the copy on disk read (once), the lists asked again when it is time
function onlaEnsure() {
    onlaLoad();
    onlaSync();
}
// One round: the bridge started if it is not running, the account's playlists asked for (when it is time: every 30
// minutes at most, and not before a backoff's nextAt), then each chosen list whose songs changed since, one at a time.
// force (Refresh online playlists): now, and every chosen list read again. Between those times only want (a list just
// ticked in the menu, or the default chosen again) starts a round early, for the chosen lists not on disk yet or read
// only in part; the Archive shown again does not (those wait for the round that is due, as every list does after
// NetEase said too often).
function onlaSync(force = false, want = false) {
    onlaLoad();
    const now = Date.now();
    if (ONLA.state === "syncing" && now - ONLA.busyAt < ONLA_STALE) { if (force) ONLA.again = true; return; }
    // (another account logged in since: its copy at once, not after the 30 minutes)
    const me = ONL.by.ne.me, due = force || now >= ONLA.nextAt || !!(me && String(me.uid) !== ONLA.uid);
    if (!due && !(want && onlaMissing().length)) return;
    const cycle = ++ONLA.cycle;
    ONLA.state = "syncing"; ONLA.why = ""; ONLA.busyAt = now; ONLA.queue = []; ONLA.current = ""; ONLA.again = false;
    onlRepaint();
    onlaWhenReady(cycle, () => onlaReadLists(cycle, due, force));
}
// the round given up for now (the copy shown as it is), the next one not before `wait`
function onlaStop(cycle, state, wait, why = "") {
    if (cycle !== ONLA.cycle) return;
    ONLA.state = state; ONLA.why = why;
    ONLA.nextAt = Date.now() + wait;
    ONLA.queue = []; ONLA.current = "";
    onlRepaint();
}
// the bridge running (started here when it is not: 05 ONLINE starts it only when shown), then go(); 30 s at most
function onlaWhenReady(cycle, go) {
    if (ONL.state === "ready") { go(); return; }
    if (ONL.state === "" || ONL.state === "error") onlineStart();
    const t0 = Date.now(), wait = () => {
        if (cycle !== ONLA.cycle) return;
        if (ONL.state === "ready") { go(); return; }
        if (ONL.state === "absent") { onlaStop(cycle, "absent", ONLA_RETRY); return; }
        if (ONL.state === "error" || Date.now() - t0 > 30000) { onlaStop(cycle, "offline", ONLA_RETRY, "bridge"); return; }
        ONLA.busyAt = Date.now();
        window.SetTimeout(wait, 500);
    };
    wait();
}
// another account logged in: its own copy (the other one's stays on disk, for when it logs in again)
function onlaSwitch(uid) {
    if (ONLA.uid) console.log("audio-archive online archive: another NetEase account, its own copy");
    onlaUse(uid, onlaReadIndex().accounts[uid] || null);
}
// (all: every chosen list read again, changed or not)
function onlaReadLists(cycle, due, all = false) {
    if (cycle !== ONLA.cycle) return;
    const me = ONL.by.ne.me;
    // (not logged in: the copy of the account last seen stays shown)
    if (!me) { onlaStop(cycle, "nologin", ONLA_RETRY); return; }
    if (String(me.uid) !== ONLA.uid) { onlaSwitch(String(me.uid)); due = true; }
    if (!due) { onlaQueue(cycle, onlaMissing(), false); return; }
    ONLA.busyAt = Date.now();
    onlGet("/ne/playlists", (d, st, txt) => {
        if (cycle !== ONLA.cycle) return;
        const me2 = ONL.by.ne.me;
        if (!Array.isArray(d)) {
            // (the bridge answering that NetEase said too often: waited out as a list's refusal is, not taken for the
            // bridge gone)
            let e = null;
            if (st === 502) try { e = JSON.parse(txt); } catch (x) { e = null; }
            if (e && e.throttled) { console.log("audio-archive online archive: NetEase says too often; the playlists are asked for again in the next round"); onlaStop(cycle, "offline", ONLA_EVERY, "throttled"); }
            else onlaStop(cycle, "offline", ONLA_RETRY, "bridge");
            return;
        }
        // (logged out, or another account, while it was asked: the next round sorts it out)
        if (!me2 || String(me2.uid) !== ONLA.uid) { onlaStop(cycle, me2 ? "offline" : "nologin", 0); return; }
        // no lists at all: the bridge has lost the account (it answers [] without one), not one with no lists (every
        // account has its liked songs)
        if (!d.length) { onlaStop(cycle, "nologin", ONLA_RETRY); return; }
        ONLA.lists = d.map((p, order) => ({ id: String(p.id), title: String(p.title || ""), cover: String(p.cover || ""), count: +p.count || 0,
                                            owner: String(p.owner || ""), own: !!p.own, liked: !!p.liked, upd: +p.upd || 0, order }));
        onlaWriteIndex();
        onlaPick();
        // a list read again when its songs changed: a later upd (a bridge from before 2.3 gives none: its count moved);
        // or when it was read under another VIP level (each song's ok was the account's then)
        const level = onlaLevel(), changed = id => {
            const p = ONLA.lists.find(q => q.id === id), have = ONLA.data.get(id);
            return all || !have || have.partial || have.level !== level || (p.upd ? p.upd > have.upd : p.count !== have.count);
        };
        onlaQueue(cycle, onlaShown().map(p => p.id).filter(changed), true);
    }, 30000);
}
function onlaQueue(cycle, ids, due) {
    ONLA.queue = ids.slice();
    ONLA.due = due;
    onlaNext(cycle, 0);
}
// The next list in the queue. NetEase's "too often" (the bridge has already asked again three times over a minute):
// the list asked again after 1 minute, then 3, then the round stops until the next one is due. A list read only in
// part because NetEase said too often is the same: what came is kept (onlaGot), then the list is asked again as after
// a refusal. Another failure (a list made private or deleted) leaves that list's copy as it is and goes on with the
// others; the bridge not answering at all stops the round.
function onlaNext(cycle, tries) {
    if (cycle !== ONLA.cycle) return;
    ONLA.busyAt = Date.now();
    if (!ONLA.queue.length) { onlaDone(cycle); return; }
    // (05 ONLINE reading a list of its own: after it, not beside it)
    if ([...ONL.by.ne.lists.values()].includes("loading")) { window.SetTimeout(() => onlaNext(cycle, tries), 5000); return; }
    const id = ONLA.queue[0], eg = onlEditGen(id);
    ONLA.current = id;
    onlRepaint();
    onlGet(`/ne/playlist/${encodeURIComponent(id)}?gentle=1&fresh=1`, (d, st, txt) => {
        if (cycle !== ONLA.cycle) return;
        ONLA.current = "";
        let e = null;
        // (its songs edited in 05 ONLINE while it was read: what came may be from before; read again at the end)
        if (d && Array.isArray(d.tracks) && onlEditGen(id) !== eg) {
            ONLA.queue.shift(); ONLA.queue.push(id);
            window.SetTimeout(() => onlaNext(cycle, 0), ONLA_PAUSE);
            return;
        }
        if (d && Array.isArray(d.tracks)) {
            onlaGot(id, d);
            if (!(d.partial && d.throttled)) {
                ONLA.queue.shift();
                window.SetTimeout(() => onlaNext(cycle, 0), ONLA_PAUSE);
                return;
            }
            e = { throttled: true };   // (cut short by NetEase's refusals: the rest asked for as after one)
        } else {
            if (st === 0 || st >= 12000) { console.log(`audio-archive online archive: the bridge did not answer (${st}); the copy on disk stays`); onlaStop(cycle, "offline", ONLA_RETRY, "bridge"); return; }
            try { e = JSON.parse(txt); } catch (x) { e = null; }
        }
        if (e && e.throttled) {
            if (tries < ONLA_BACKOFF.length) {
                console.log(`audio-archive online archive: NetEase says too often; list ${id} again in ${ONLA_BACKOFF[tries] / 1000} s`);
                ONLA.busyAt = Date.now() + ONLA_BACKOFF[tries];
                window.SetTimeout(() => onlaNext(cycle, tries + 1), ONLA_BACKOFF[tries]);
                return;
            }
            console.log("audio-archive online archive: NetEase still says too often; the copy on disk stays until the next round");
            onlaStop(cycle, "offline", ONLA_EVERY, "throttled");
            return;
        }
        console.log(`audio-archive online archive: list ${id} not read (${st}${e && e.error ? ": " + e.error : ""}); its copy on disk stays`);
        ONLA.queue.shift();
        window.SetTimeout(() => onlaNext(cycle, 0), ONLA_PAUSE);
    }, 300000);
}
// A list read: kept on disk and shown. One read only in part (a thousand of its songs refused) leaves the copy on disk
// as it was; with none there, what came is shown (not kept) and asked for again in the next round.
function onlaGot(id, d) {
    const tracks = onlKeep(d.tracks.map(onlaSong), "ne"), meta = ONLA.lists.find(p => p.id === id);
    // (upd: the later of the two answers': NetEase's list of lists can lag behind the list itself, and a list is read
    // again only when the list of lists gives a later one, so a lagging answer does not read it again round after round)
    const L = { id, upd: Math.max(+d.upd || 0, (meta && meta.upd) || 0), count: +d.count || tracks.length, at: Date.now(), level: onlaLevel(), tracks };
    if (d.partial) {
        if (ONLA.data.has(id) && !ONLA.data.get(id).partial) return;
        L.partial = true;
    } else {
        onlaWrite(onlaListFile(ONLA.uid, id), JSON.stringify(L, ONLA_STORED));
        // (05 ONLINE's copy of it too: opened there, it is here already)
        if (ONL.by.ne.lists.get(id) !== "loading") ONL.by.ne.lists.set(id, Object.assign({}, d, { tracks }));
    }
    if (!ONLA.chosen.has(id)) return;
    ONLA.data.set(id, L);
    onlaRebuild();
}
// One of the account's lists edited in 05 ONLINE (lib/online.js): the shelves follow at once, without asking NetEase.
//   songs   o: { added (songs, put first, as NetEase puts them), removed (a Set of ids) }; the copy on disk is
//           written with its old upd, so the next round still reads the list whole from NetEase (its upd has moved)
//   rename  o: { title }      delete   the list let go here too
// A copy not read into memory (GROUP › ONLINE not shown since foobar2000 started, a list not chosen) is edited on
// disk, so it does not come back as it was when it is shown.
function onlaEdited(kind, id, o) {
    const me = ONL.by.ne.me;
    if (!me) return;
    const uid = String(me.uid), live = ONLA.loaded && ONLA.uid === uid;
    id = String(id);
    if (kind === "rename" || kind === "delete") {
        const ix = live ? null : onlaReadIndex(), acc = ix && ix.accounts[uid], L = live ? ONLA.lists : acc && Array.isArray(acc.lists) ? acc.lists : null;
        const p = L && L.find(q => String(q.id) === id);
        if (!p) return;
        if (kind === "rename") p.title = String(o.title || "");
        else if (live) ONLA.lists = ONLA.lists.filter(q => q !== p);
        else acc.lists = acc.lists.filter(q => q !== p);
        if (!live) { onlaWrite(ONLA_INDEX, JSON.stringify(ix)); return; }
        onlaWriteIndex();
        if (kind === "rename") onlaRebuild(); else onlaPick();
        return;
    }
    const edit = t => {
        if (o.removed) t = t.filter(s => !o.removed.has(s.id));
        if (o.added) { const ids = new Set(t.map(s => s.id)); t = onlKeep(o.added.map(onlaSong).filter(s => !ids.has(s.id)), "ne").concat(t); }
        return t;
    };
    const d = live ? ONLA.data.get(id) : null;
    if (d) {
        d.tracks = edit(d.tracks); d.count = d.tracks.length;
        if (!d.partial) onlaWrite(onlaListFile(uid, id), JSON.stringify(d, ONLA_STORED));
        onlaRebuild();
        return;
    }
    const f = onlaListFile(uid, id), raw = utils.IsFile(f) ? onlReadJson(f) : null;
    if (!raw || !Array.isArray(raw.tracks)) return;   // (never read: the next round reads it whole)
    raw.tracks = edit(raw.tracks.map(onlaSong)); raw.count = raw.tracks.length;
    onlaWrite(f, JSON.stringify(raw, ONLA_STORED));
}
function onlaDone(cycle) {
    if (ONLA.due) { ONLA.syncedAt = Date.now(); onlaWriteIndex(); }
    onlaStop(cycle, "ready", ONLA.due ? ONLA_EVERY : Math.max(0, ONLA.nextAt - Date.now()));
    const n = ONLA.items.length;
    console.log(`audio-archive online archive: ${ONLA.chosen.size} lists, ${ONLA.albums.length} albums, ${n} songs`);
    // (a refresh asked for while this round ran: now, every list)
    if (ONLA.again) { ONLA.again = false; window.SetTimeout(() => onlaSync(true), ONLA_PAUSE); }
}
// logged out (05 ONLINE): the round under way dropped; the copy stays shown, as the account's last
function onlaInvalidate() {
    ONLA.cycle++;
    ONLA.again = false;
    if (ONLA.loaded) { ONLA.state = "nologin"; ONLA.queue = []; ONLA.current = ""; ONLA.nextAt = 0; }
}
