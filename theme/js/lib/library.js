"use strict";
// Media library index for the Archive view.
//
// Source: the media library; when it has no folders (or is empty) the contents of all playlists, so the view is useful
// without a configured library.
// Albums come from the SQLite cache at once (<profile>\audio-archive-cache\library.db, so the view can paint before
// the library has loaded) and then from the library worker (js/workers/library.js), which runs one batched
// title-format pass on its own thread; library changes re-run it after a short pause and only changed rows are
// written. Albums are grouped by genre, decade, artist initial or not at all, and sorted within each group by artist,
// title, year or date added. SHOW TRACKS lists every track as its own item instead (LIB.unit), with its album's cover.
// Covers: 256 px thumbnails with a blurred 48 px copy, made by the worker and cached on disk; at most THUMB_MAX are
// kept in memory (least recently drawn go first).

const LIB = { albums: [], groups: [], live: false, gen: 0, tracks: 0, ms: null, source: "library",
              groupBy: getSetting("archiveGroup", "genre"), sortBy: getSetting("archiveSort", "artist"),
              unit: getSetting("archiveUnit", "albums"), items: [], albumMap: new Map() };
const LIB_LISTENERS = [];   // fn(kind): "catalog" when the albums or groups changed, "cover" when a thumbnail arrived
const LIB_DB = fb.ProfilePath + "audio-archive-cache\\library.db";
let libHandles = null, libWorker = null, libTimer = 0;
const libNotify = kind => LIB_LISTENERS.forEach(f => f(kind));

function libStart() {
    if (utils.IsFile(LIB_DB)) {
        const db = utils.OpenDatabase(LIB_DB);
        if (db) {
            try { setAlbums(db.Query("SELECT data FROM albums").map(r => JSON.parse(r.data))); }
            catch (e) { console.log("audio-archive library cache: " + e); }
            finally { db.Close(); }
        }
    }
    libWorker = new Worker({ file: THEME_ROOT + "js\\workers\\library.js" }, "audio-archive-library");
    libWorker.onmessage = e => libMessage(e.data);
    libWorker.onerror = e => console.log("audio-archive library worker: " + e.message);
    libIndex();
}

// the theme's own playlists (lib/bus.js) are not part of the archive
function playlistItems() {
    const list = fb.CreateHandleList();
    for (let i = 0; i < plman.PlaylistCount; i++) if (!OWN_PLAYLISTS.has(plman.GetPlaylistName(i))) list.AddRange(plman.GetPlaylistItems(i));
    list.Sort();   // also removes duplicates
    return list;
}

// (re)index once the media library has loaded; fresh: look again for covers of albums known to have none
function libIndex(fresh = false) {
    window.ClearTimeout(libTimer);
    let list = null;
    if (fb.IsLibraryEnabled()) {
        if (!fb.IsLibraryInitialised()) { libTimer = window.SetTimeout(() => libIndex(fresh), 500); return; }
        list = fb.GetLibraryItems();
    }
    LIB.source = list && list.Count ? "library" : "playlists";
    libHandles = LIB.source === "library" ? list : playlistItems();
    libWorker.postMessage({ type: "index", gen: ++LIB.gen, handles: libHandles, fresh: fresh === true });
}
const libChanged = () => { window.ClearTimeout(libTimer); libTimer = window.SetTimeout(() => libIndex(), 1500); };
function on_library_items_added() { libChanged(); }
function on_library_items_removed() { libChanged(); }
function on_library_items_changed() { libChanged(); }
const playlistsChanged = () => { if (LIB.source === "playlists") libChanged(); };
function on_playlist_items_added(i) { plDirty(i); if (!OWN_PLAYLISTS.has(plman.GetPlaylistName(i))) playlistsChanged(); }
function on_playlist_items_removed(i) { plDirty(i); if (!OWN_PLAYLISTS.has(plman.GetPlaylistName(i))) playlistsChanged(); }
function on_playlists_changed() { plDirty(); playlistsChanged(); }

function libMessage(m) {
    if (m.gen !== LIB.gen) return;
    if (m.type === "catalog") {
        LIB.live = true; LIB.tracks = m.tracks; LIB.ms = m.ms;
        thumbPending.clear(); thumbAsked = "";
        setAlbums(m.albums, m.items);
        send("library", { files: m.tracks, albums: m.albums.length });
        console.log(`audio-archive library: ${m.tracks} tracks, ${m.albums.length} albums, index ${m.ms.index.toFixed(0)} ms, cache ${m.ms.cache.toFixed(0)} ms (${m.written} rows)`);
    } else if (m.type === "cover") {
        thumbPending.delete(m.key);
        if (m.img || LIB.live) THUMBS.set(m.key, m.img ? { img: m.img, blur: m.blur } : null);
        trimThumbs();
        libNotify("cover");
    }
}

// albums (and, once the worker has run, one item per track: they carry their album's number)
function setAlbums(albums, items = []) {
    albums.forEach(a => { a.no = 1 + parseInt(fnv(a.key), 16) % 9999; });
    LIB.albums = albums;
    LIB.albumMap = new Map(albums.map(a => [a.key, a]));
    items.forEach(t => { const a = LIB.albumMap.get(t.album); t.no = a ? a.no : 0; });
    LIB.items = items;
    groupAlbums();
}

const GROUP_BY = [["genre", "GENRE"], ["decade", "DECADE"], ["artist", "A–Z"], ["none", "NONE"]];
const SORT_BY = [["artist", "ARTIST"], ["title", "TITLE"], ["year", "YEAR"], ["added", "ADDED"]];
const GROUP_LABEL = { genre: "GENRE", decade: "DECADE", artist: "ARTIST", none: "ALL" };
// a group's name as shown: the fixed ones and decades translated, genres as they are tagged
const groupName = g => /^\d{3}0S$/.test(g) ? tr("{0}S", g.slice(0, 4)) : tr(g);
function setGroupBy(by) {
    if (by === LIB.groupBy || !GROUP_LABEL[by]) return;
    LIB.groupBy = by;
    setSetting("archiveGroup", by);
    groupAlbums();
}
// ALBUMS or TRACKS: what the archive's cases and tiles stand for
function setUnit(u) {
    if (u === LIB.unit || (u !== "albums" && u !== "tracks")) return;
    LIB.unit = u;
    setSetting("archiveUnit", u);
    groupAlbums();
}
const showTracks = () => LIB.unit === "tracks" && LIB.items.length > 0;
const unitWord = n => tr(showTracks() ? (n === 1 ? "{0} TRACK" : "{0} TRACKS") : n === 1 ? "{0} ALBUM" : "{0} ALBUMS", fmtCount(n));
// the album a track item belongs to (an album is its own)
const albumOf = a => a && a.album ? LIB.albumMap.get(a.album) || null : a;
function setSortBy(by) {
    if (by === LIB.sortBy || !SORT_BY.some(([k]) => k === by)) return;
    LIB.sortBy = by;
    setSetting("archiveSort", by);
    groupAlbums();
}
// album order within a group; ties fall back to artist, then title
const lcs = s => String(s || "").toLowerCase();
const strCmp = (x, y) => x < y ? -1 : x > y ? 1 : 0;
function albumOrder(by) {
    const art = (p, q) => strCmp(lcs(p.artist), lcs(q.artist)), tit = (p, q) => strCmp(lcs(p.title), lcs(q.title));
    const yr = (p, q) => (!p.year - !q.year) || strCmp(p.year, q.year);   // undated last
    // tracks of one album stay in disc / track order where the order does not separate them
    const alb = (p, q) => p.album ? strCmp(p.album, q.album) || (p.ord - q.ord) : 0;
    if (by === "title") return (p, q) => tit(p, q) || art(p, q);
    if (by === "year") return (p, q) => yr(p, q) || art(p, q) || alb(p, q) || tit(p, q);
    if (by === "added") return (p, q) => (!p.added - !q.added) || strCmp(q.added, p.added) || art(p, q) || alb(p, q) || tit(p, q);   // newest first
    return (p, q) => art(p, q) || yr(p, q) || alb(p, q) || tit(p, q);
}

// The archive's search filter (the header's search field while the Archive is shown): every word must appear in the
// album's title, artist, genre or year, or in one of its tracks' titles and artists. The library worker sends that
// text, lower-cased, with each album; albums from the cache (before the worker has run) have their own fields only.
LIB.filter = "";
const searchText = a => a.text || (a.text = `${a.title} ${a.artist} ${a.genre || ""} ${a.year || ""}`.toLowerCase());
function setArchiveFilter(q) {
    q = String(q || "").trim().toLowerCase();
    if (q === LIB.filter) return;
    LIB.filter = q;
    groupAlbums();
}
onMessage("archive-filter", setArchiveFilter);
const filteredCount = () => LIB.groups.reduce((n, g) => n + g.albums.length, 0);

// groups: [{ name, albums }], sorted by name with the catch-all group last; each album also gets its group's name
// (a.grp), which the archive's shelves (several groups on one shelf) show
function groupAlbums() {
    const by = LIB.groupBy, map = new Map();
    const words = LIB.filter ? LIB.filter.split(/\s+/) : null;
    for (const a of showTracks() ? LIB.items : LIB.albums) {
        if (words) { const t = searchText(a); if (!words.every(w => t.includes(w))) continue; }
        let g;
        if (by === "none") g = "ALL ALBUMS";
        else if (by === "decade") g = /^\d{4}$/.test(a.year) ? a.year.slice(0, 3) + "0S" : "UNDATED";
        else if (by === "artist") { const c = String(a.artist || "").trim().charAt(0).toUpperCase(); g = /[A-Z]/.test(c) ? c : /\d/.test(c) ? "0–9" : "OTHER"; }
        else g = String(a.genre || "").trim().toUpperCase() || "UNKNOWN";
        a.grp = g;
        if (!map.has(g)) map.set(g, []);
        map.get(g).push(a);
    }
    const last = new Set(["UNDATED", "OTHER", "UNKNOWN"]), order = albumOrder(LIB.sortBy);
    LIB.groups = [...map.entries()]
        .sort(([x], [y]) => (last.has(x) - last.has(y)) || strCmp(x, y))
        .map(([name, albums]) => ({ name, albums: albums.sort(order) }));
    libNotify("catalog");
}

// the album's tracks in disc / track order (null until the worker has indexed the library); a track item gives its
// album's
const TF_TRACK_ORDER = fb.TitleFormat("$num(%discnumber%,2)$num(%tracknumber%,4)%path%");
function albumHandles(a) {
    a = albumOf(a);
    if (!LIB.live || !a || !a.idx || !libHandles) return null;
    const list = fb.CreateHandleList();
    for (const i of a.idx) list.Add(libHandles[i]);
    list.OrderByFormat(TF_TRACK_ORDER, 1);
    return list;
}
const albumFirst = a => LIB.live && a && a.idx && libHandles ? libHandles[a.idx[0]] : null;
// a track item's own track (null for an album)
const itemTrack = a => a && a.album && LIB.live && libHandles ? libHandles[a.idx[0]] : null;

// ------------------------------------------------------------------------------------------------------ covers
// Thumbnails are keyed by album (a track item uses its album's: a.cover). THUMB_MAX grows with what the cover grid
// asks for (its screen and the screens around it), so covers fetched ahead of the scroll are not evicted again.
const THUMBS = new Map();   // album key -> { img, blur } or null (no artwork); insertion order = least recently used first
let THUMB_MAX = 160;
const thumbPending = new Set();
const THUMB_KEEP = new Set();   // keys drawn in the current frame are never evicted
const coverKey = a => a.cover || a.key;
const setThumbBudget = n => { THUMB_MAX = clamp(n, 160, 720); };

// the thumbnail of `a` if loaded (marks it as recently used); undefined while unknown
function thumbOf(a) {
    const k = coverKey(a), t = THUMBS.get(k);
    if (t !== undefined) { THUMBS.delete(k); THUMBS.set(k, t); THUMB_KEEP.add(k); }
    return t;
}
function trimThumbs() {
    for (const k of THUMBS.keys()) {
        if (THUMBS.size <= THUMB_MAX) break;
        if (!THUMB_KEEP.has(k)) THUMBS.delete(k);
    }
}
// asks the worker for the thumbnails of `albums` (nearest first, at most `max`) that are neither loaded nor on their way
let thumbAsked = "";
function requestThumbs(albums, max = 48) {
    const list = [], seen = new Set();
    for (const a of albums) {
        const k = coverKey(a);
        if (seen.has(k) || THUMBS.has(k) || thumbPending.has(k)) continue;
        seen.add(k);
        list.push({ key: k, i: a.idx ? a.idx[0] : -1 });
        if (list.length >= max) break;
    }
    const sig = list.map(j => j.key).join("");
    if (!list.length || sig === thumbAsked || !libWorker) return;
    thumbAsked = sig;
    // the worker replaces its queue, so whatever was pending and not asked again will not arrive
    thumbPending.clear();
    list.forEach(j => thumbPending.add(j.key));
    libWorker.postMessage({ type: "covers", gen: LIB.gen, list });
}
