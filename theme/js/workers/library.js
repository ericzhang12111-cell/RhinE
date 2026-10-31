"use strict";
// Library worker for the Archive view. Runs on its own thread, so the panel never waits for it.
//
//   { type: "index", gen, handles }  one batched title-format pass over the media library, grouped into albums,
//                                    written to the SQLite cache (only rows that changed) → { type: "catalog", albums,
//                                    items (one per track), folders (one per folder), ... }
//   { type: "covers", gen, list }    cover thumbnails for these albums, nearest first; the list replaces any earlier
//                                    one (the panel asks only for albums it has no thumbnail for). Each thumbnail is cut square, scaled to 256 px (512 px
//                                    when the index message asks: a high-DPI screen) and cached on disk as JPEG;
//                                    a small blurred copy goes with it → { type: "cover", key, img, blur } (transferred)
// While nothing is asked for, the worker warms the disk cache: one album at a time it extracts the covers not cached
// yet, so browsing a large library (the grid above all) finds them at once. An album without artwork gets a small
// marker file holding its first track's modification time, so it is not looked for again until that file changes
// (or "Re-index library" asks for a fresh look).

const CACHE_DIR = fb.ProfilePath + "audio-archive-cache\\";
const BARE_DIR = CACHE_DIR + "covers\\";   // the 256 px thumbnails, and the markers of albums without artwork
let COVER_DIR = BARE_DIR, THUMB = 256;      // the 512 px ones have a folder of their own (covers-512)
const DB_FILE = CACHE_DIR + "library.db";
const BLUR = 48;

const TF = fb.TitleFormat([
    "[%album%]", "%path%", "[$meta(album artist,0)]", "[%artist%]", "[$meta(genre,0)]", "[$left(%date%,4)]", "[%codec%]",
    "[%__bitspersample%]", "[%samplerate%]", "[%bitrate%]", "$if($stricmp(%__encoding%,lossless),1,)",
    "[%length_seconds_fp%]", "[%discnumber%]", "[%added%]", "[%play_count%]", "[%title%]", "[%tracknumber%]", "%subsong%",
].join("\u0001"));

// An album is the tracks with the same album tag in the same folder, a disc folder counting as its parent (the same
// rule as albumKeyOf in lib/album.js, so album numbers agree across the views)
const DISC_DIR = /^(cd|disc|disk)[\s._-]*\d+\b/i;
function albumDir(path) {
    const parts = String(path).split("\\");
    parts.pop();
    if (parts.length > 1 && DISC_DIR.test(parts[parts.length - 1])) parts.pop();
    return parts;
}
const albumKeyOf = (album, path) => album.trim().toLowerCase() + "|" + albumDir(path).join("\\").toLowerCase();
// A folder case (SHOW FOLDERS) is the tracks right in one folder, a disc folder counting as its parent as for albums: a
// subfolder is a case of its own and never part of its parent's, so no track is in two (lib/album.js folderKeyOf).
const FOLDER_KEY = "\u0001f|";
// The shelf (GROUP › FOLDER) of an album or folder case is the folder it lies in, of a track its own folder, named by
// the path from its media library folder ("Music › A"; a case right in that folder is on its shelf). root: the
// library folder's path parts (the drive when the track is not in the library: the playlists' contents).
function shelfName(dir, root, own) {
    const n = Math.min(root.length, dir.length), rest = dir.slice(n, own ? dir.length : Math.max(n, dir.length - 1));
    return [root[root.length - 1] || "", ...rest].join(" › ");
}

// what the archive's search filter looks in: album fields plus every track's title and artists
const TF_SEARCH = fb.TitleFormat("%title% %artist% %album artist%");

function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0");
}

let handles = null, gen = 0;

// The album's artist: its album artist tag, else the artist of most of its tracks, else "Various Artists"; its genre
// the first one given (blank or whitespace-only genres count as none); its title the folder's name when untagged.
// Also returns one item per track (the archive's TRACKS view): the album's fields where the track has none, its own
// title, artist, length, date added and play count, and its album's key for the cover (cover) and the album (album).
function buildAlbums(list) {
    const rows = TF.EvalWithMetadbs(list), words = TF_SEARCH.EvalWithMetadbs(list), map = new Map(), albums = [], vals = [];
    let rel = null;
    try { rel = typeof list.GetLibraryRelativePaths === "function" ? list.GetLibraryRelativePaths() : null; } catch (e) { rel = null; }
    // the media library folder of track i (its path less the path relative to it)
    const rootOf = i => {
        const path = vals[i][1], r = rel && rel[i] ? String(rel[i]) : "";
        if (r && r.length < path.length && path.toLowerCase().endsWith(r.toLowerCase())) return path.slice(0, path.length - r.length).replace(/\\+$/, "").split("\\");
        return path.split("\\").slice(0, 1);
    };
    for (let i = 0; i < rows.length; i++) {
        const v = rows[i].split("\u0001"), key = albumKeyOf(v[0], v[1]);
        vals.push(v);
        let a = map.get(key);
        if (!a) {
            const dir = albumDir(v[1]);
            a = { key, artist: "", title: v[0].trim() || dir[dir.length - 1] || "", genre: "", year: "", codec: v[6], bits: +v[7] || 0,
                  rate: +v[8] || 0, kbps: +v[9] || 0, lossless: v[10] === "1", tracks: 0, length: 0, discs: 1, added: "", plays: 0,
                  idx: [], text: "", aa: "", artists: new Map(), shelf: shelfName(dir, rootOf(i), false) };
            map.set(key, a);
            albums.push(a);
        }
        a.tracks++;
        if (!a.aa && v[2].trim()) a.aa = v[2].trim();
        const ar = v[3].trim();
        if (ar) a.artists.set(ar, (a.artists.get(ar) || 0) + 1);
        if (!a.genre && v[4].trim()) a.genre = v[4].trim();
        if (v[5] && (!a.year || v[5] < a.year)) a.year = v[5];
        a.length += +v[11] || 0;
        a.discs = Math.max(a.discs, parseInt(v[12]) || 1);
        if (v[13] && (!a.added || v[13] < a.added)) a.added = v[13];
        a.plays += +v[14] || 0;
        a.idx.push(i);
        a.text += " " + words[i];
    }
    for (const a of albums) {
        let top = "", n = 0;
        for (const [ar, c] of a.artists) if (c > n) { top = ar; n = c; }
        a.artist = a.aa || (a.artists.size <= 1 || n * 2 >= a.tracks ? top : "Various Artists");
        delete a.aa; delete a.artists;
        a.length = Math.round(a.length);
        a.text = `${a.title} ${a.artist} ${a.genre} ${a.year}${a.text}`.toLowerCase();
    }
    const cmp = (x, y) => x < y ? -1 : x > y ? 1 : 0;
    albums.sort((x, y) => cmp(x.artist.toLowerCase(), y.artist.toLowerCase()) || cmp(x.year, y.year) || cmp(x.title.toLowerCase(), y.title.toLowerCase()));
    const tracks = [];
    for (const a of albums) for (const i of a.idx) {
        const v = vals[i], title = v[15].trim() || v[1].split("\\").pop().replace(/\.[^.]+$/, "");
        tracks.push({ key: "t|" + v[1].toLowerCase() + "|" + v[17], cover: a.key, album: a.key, albumTitle: a.title, title,
                      artist: v[3].trim() || a.artist, genre: a.genre, year: v[5] || a.year, codec: v[6], bits: +v[7] || 0, rate: +v[8] || 0,
                      kbps: +v[9] || 0, lossless: v[10] === "1", tracks: 1, length: Math.round(+v[11] || 0), discs: 1, added: v[13],
                      plays: +v[14] || 0, ord: (parseInt(v[12]) || 1) * 1000 + (parseInt(v[16]) || 0), idx: [i], shelf: shelfName(albumDir(v[1]), rootOf(i), true),
                      text: `${title} ${v[3]} ${a.title} ${a.artist} ${a.genre} ${v[5] || a.year} ${words[i]}`.toLowerCase() });
    }
    // the folder cases, put together from the albums (an album lies in one folder): one artist when all its albums have
    // the same, else Various Artists; the cover its first album's
    const fmap = new Map(), folders = [];
    for (const a of albums) {
        const dir = albumDir(vals[a.idx[0]][1]), key = FOLDER_KEY + dir.join("\\").toLowerCase();
        let f = fmap.get(key);
        if (!f) {
            f = { key, folder: true, name: dir[dir.length - 1] || "", title: dir[dir.length - 1] || "", cover: a.key, artist: a.artist, genre: "",
                  year: "", codec: a.codec, bits: a.bits, rate: a.rate, kbps: a.kbps, lossless: a.lossless, tracks: 0, length: 0, discs: 1,
                  added: "", plays: 0, idx: [], text: "", shelf: a.shelf };
            fmap.set(key, f);
            folders.push(f);
        }
        if (f.artist !== a.artist) f.artist = "Various Artists";
        if (!f.genre) f.genre = a.genre;
        if (a.year && (!f.year || a.year < f.year)) f.year = a.year;
        if (a.added && (!f.added || a.added < f.added)) f.added = a.added;
        f.tracks += a.tracks; f.length += a.length; f.plays += a.plays;
        for (const i of a.idx) f.idx.push(i);
        f.text += " " + a.text;
    }
    // a folder with a case further down holds the tracks left loose in it (the panel names its case so)
    for (const k of fmap.keys()) {
        for (let j = k.lastIndexOf("\\"); j > FOLDER_KEY.length; j = k.lastIndexOf("\\", j - 1)) { const up = fmap.get(k.slice(0, j)); if (up) up.loose = true; }
    }
    return { albums, tracks, folders };
}

// writes the albums that changed since the last run; returns the number of rows written or removed
function writeCache(albums) {
    if (!utils.IsDirectory(CACHE_DIR)) utils.CreateFolder(CACHE_DIR);
    const db = utils.OpenDatabase(DB_FILE);
    if (!db) return -1;
    let n = 0;
    try {
        db.Exec("CREATE TABLE IF NOT EXISTS albums (key TEXT PRIMARY KEY, data TEXT NOT NULL)");
        const old = new Map(db.Query("SELECT key, data FROM albums").map(r => [r.key, r.data]));
        const put = db.Prepare("INSERT OR REPLACE INTO albums (key, data) VALUES (?, ?)"), del = db.Prepare("DELETE FROM albums WHERE key = ?");
        db.Begin();
        for (const a of albums) {
            const { idx, text, ...rest } = a, data = JSON.stringify(rest);   // the cache keeps neither
            if (old.get(a.key) !== data) { put.Run([a.key, data]); n++; }
            old.delete(a.key);
        }
        for (const k of old.keys()) { del.Run([k]); n++; }
        db.Commit();
    } catch (e) {
        console.log("audio-archive library cache: " + e);
        try { db.Rollback(); } catch (_) { /* no transaction */ }
    } finally { db.Close(); }
    return n;
}

// ------------------------------------------------------------------------------------------------------- covers
let queue = [], busy = 0, warm = [], fresh = false;
const inFlight = new Set();
const TF_MTIME = fb.TitleFormat("[%last_modified%]");
const coverFile = key => COVER_DIR + fnv(key) + ".jpg", noneFile = key => BARE_DIR + fnv(key) + ".none";
// true when the album is known to have no artwork (and its first track has not changed since)
function knownBare(job) {
    if (fresh || !utils.IsFile(noneFile(job.key)) || !handles || job.i < 0 || job.i >= handles.Count) return false;
    try { return utils.ReadTextFile(noneFile(job.key), 65001) === TF_MTIME.EvalWithMetadb(handles[job.i]); } catch (e) { return false; }
}

function square(img, size) {
    const w = img.Width, h = img.Height, s = Math.min(w, h);
    const sq = w === h ? img : img.Clone(Math.floor((w - s) / 2), Math.floor((h - s) / 2), s, s);
    return s === size ? sq : sq.Resize(size, size, 2);
}

// job.warm: only fill the disk cache (nothing is sent)
async function loadCover(job) {
    const file = coverFile(job.key);
    let img = null;
    if (utils.IsFile(file)) {
        if (job.warm) return;
        img = await d2d.LoadImageAsyncV2(0, file).catch(() => null);
    }
    if (!img && handles && job.i >= 0 && job.i < handles.Count && !knownBare(job)) {
        const h = handles[job.i], r = await utils.GetAlbumArtAsyncV2(0, h, 0, false, false, false).catch(() => null);
        for (const d of [BARE_DIR, COVER_DIR]) if (!utils.IsDirectory(d)) utils.CreateFolder(d);
        if (r && r.image) {
            img = square(r.image, THUMB);
            img.SaveAs(file, "image/jpeg");
        } else utils.WriteTextFile(noneFile(job.key), TF_MTIME.EvalWithMetadb(h), false);
    }
    if (job.gen !== gen || job.warm) return;
    if (!img) { postMessage({ type: "cover", gen, key: job.key, img: null, blur: null }); return; }
    const blur = img.Resize(BLUR, BLUR, 2);
    blur.StackBlur(5);
    postMessage({ type: "cover", gen, key: job.key, img, blur }, [img, blur]);
}

function pump() {
    while (busy < 3 && queue.length) start(queue.shift());
    // idle: warm the cache, one album at a time
    while (!busy && !queue.length && warm.length) {
        const job = warm.shift();
        if (job.gen === gen && !utils.IsFile(coverFile(job.key)) && !knownBare(job)) start(job);
    }
}
function start(job) {
    if (inFlight.has(job.key)) return;
    busy++;
    inFlight.add(job.key);
    loadCover(job).catch(e => console.log("audio-archive cover: " + e)).finally(() => { busy--; inFlight.delete(job.key); pump(); });
}

onmessage = function (event) {
    const m = event.data;
    if (m.type === "index") {
        const t0 = performance.now();
        gen = m.gen;
        handles = m.handles;
        if (m.thumb === 512 || m.thumb === 256) { THUMB = m.thumb; COVER_DIR = THUMB === 256 ? BARE_DIR : CACHE_DIR + `covers-${THUMB}\\`; }
        queue = [];
        if (m.fresh) fresh = true;
        const { albums, tracks, folders } = buildAlbums(handles), t1 = performance.now();
        const written = writeCache(albums);
        postMessage({ type: "catalog", gen, albums, items: tracks, folders, tracks: handles.Count, ms: { index: t1 - t0, cache: performance.now() - t1 }, written });
        warm = albums.map(a => ({ key: a.key, i: a.idx[0], gen, warm: true }));
        pump();
    } else if (m.type === "covers") {
        if (m.gen !== gen) return;
        queue = m.list.map(j => ({ key: j.key, i: j.i, gen }));
        pump();
    }
};
