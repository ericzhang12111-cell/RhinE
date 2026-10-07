"use strict";
// Playlist items without re-reading them on every paint: plman.GetPlaylistItems copies the whole list (a 20 000-item
// playlist costs milliseconds), so the last few lists are kept until the playlist changes. Panels that include this
// call plDirty(pl) from on_playlist_items_added / _removed / _reordered and plDirty() from on_playlists_changed.

const PL_CACHE = new Map();   // playlist index -> FbMetadbHandleList
function plItems(pl) {
    let items = PL_CACHE.get(pl);
    if (!items) {
        items = plman.GetPlaylistItems(pl);
        if (PL_CACHE.size >= 4) PL_CACHE.delete(PL_CACHE.keys().next().value);
        PL_CACHE.set(pl, items);
    }
    return items;
}
// pl undefined: every playlist (playlists were added, removed or reordered, so the indexes moved)
function plDirty(pl) { if (pl === undefined) PL_CACHE.clear(); else PL_CACHE.delete(pl); }

// total length and size of a playlist, cached with its items
const PL_STATS = new Map();
function plStats(pl) {
    const items = plItems(pl);
    let s = PL_STATS.get(items);
    if (!s) {
        s = { count: items.Count, length: items.CalcTotalDuration(), size: items.CalcTotalSize() };
        PL_STATS.clear();
        PL_STATS.set(items, s);
    }
    return s;
}

// 1.9 GB / 312 MB
function fmtSize(b) {
    if (b >= 1e9) return (b / 1073741824).toFixed(1) + " GB";
    if (b >= 1e6) return Math.round(b / 1048576) + " MB";
    return Math.round(b / 1024) + " KB";
}
