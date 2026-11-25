"use strict";
// Favourites: a heart on tracks and on albums, apart from the 1–5 rating (lib/rating.js).
//   tracks  where "favStore" in the settings says (Archive context menu › Favourites saved in):
//             jsplitter  JSplitter's own statistics database, %jsplitter_loved%: no file is written (the default)
//             tag        a LOVED tag (1) in the files themselves, which other players and taggers can read
//   albums  their keys (lib/album.js albumKey; a folder case's, folderKeyOf, likewise) in the settings file,
//           "favAlbums" (a list, so not a panel property): nothing is written to the music files
// A track is among the favourites when it has the heart or its album (or folder) does; the FAVOURITES group in the Archive and the
// "Archive · Favourites" playlist both follow that. H gives (or takes) the playing, else focused, track's heart from any view
// (globalKey in lib/bus.js). A change is sent as "fav" so every panel reads the hearts again.

const FAV_STORES = [["jsplitter", "JSplitter database (no files written)"], ["tag", "File tags (LOVED)"]];
const FAV_TF = { jsplitter: fb.TitleFormat("$if2(%jsplitter_loved%,0)"), tag: fb.TitleFormat("$if2($meta(loved),0)") };
const FAV_PLAYLIST = "Archive · Favourites";   // the theme's own (lib/bus.js OWN_PLAYLISTS): never a user's playlist
const favStore = () => getSetting("favStore", "jsplitter") === "tag" ? "tag" : "jsplitter";
const favOn = v => v !== "" && v !== "0" && !/^(false|no)$/i.test(v);
const isFav = h => !!h && favOn(FAV_TF[favStore()].EvalWithMetadb(h));
const favFlags = list => list && list.Count ? FAV_TF[favStore()].EvalWithMetadbs(list).map(favOn) : [];
// on: true / false, or undefined to toggle
function setFav(h, on) {
    if (!h) return;
    const v = on === undefined ? !isFav(h) : !!on;
    try {
        if (favStore() === "tag") { const l = fb.CreateHandleList(); l.Add(h); l.UpdateFileInfoFromJSON(JSON.stringify({ LOVED: v ? "1" : "" })); }
        else { h.SetLoved(v ? 1 : 0); h.RefreshStats(); }
    } catch (e) { console.log("audio-archive favourite: " + e); }
    favChanged();
}

let FAV_ALBUMS = null;
const favAlbums = () => { if (!FAV_ALBUMS) { const v = getSetting("favAlbums", ""); FAV_ALBUMS = new Set(Array.isArray(v) ? v.map(String) : []); } return FAV_ALBUMS; };
const isFavAlbum = key => !!key && favAlbums().has(key);
function setFavAlbum(key, on) {
    if (!key) return;
    const s = favAlbums(), v = on === undefined ? !s.has(key) : !!on;
    if (v) s.add(key); else s.delete(key);
    setSetting("favAlbums", [...s], true);
    favChanged();
}
// A change runs this panel's FAV_LISTENERS and reaches the other panels as "fav" (their listeners run too). The stage
// panel, which knows the albums (lib/album.js), keeps the Favourites playlist up to date (favPlaylist).
const FAV_LISTENERS = [];
onMessage("fav", () => { FAV_ALBUMS = null; FAV_LISTENERS.forEach(f => f()); });
function favChanged() {
    send("fav");
    FAV_LISTENERS.forEach(f => f());
}

// every favourite track of `all` (the archive's tracks; its own heart, or its album's), by album and track; needs
// lib/album.js
const TF_FAV_ORDER = fb.TitleFormat("%album artist%|%album%|$num(%discnumber%,2)$num(%tracknumber%,4)|%path%");
function favTracks(all) {
    const out = fb.CreateHandleList();
    if (!all || !all.Count) return out;
    const f = favFlags(all), albums = favAlbums();
    const keys = albums.size ? TF_ALBUM_KEY.EvalWithMetadbs(all).map(v => { const [al, p] = v.split("\u0001"); return [albumKeyOf(al, p), folderKeyOf(p)]; }) : [];
    for (let i = 0; i < all.Count; i++) if (f[i] || (albums.size && (albums.has(keys[i][0]) || albums.has(keys[i][1])))) out.Add(all[i]);
    out.OrderByFormat(TF_FAV_ORDER, 1);
    return out;
}
// the Favourites playlist brought up to date from `all` (show: make it the active playlist). While it plays, only what
// changed is taken out or added at the end, so the playing track and what follows it stay put.
function favPlaylist(all, show = true) {
    const items = favTracks(all), pl = plman.FindOrCreatePlaylist(FAV_PLAYLIST, true);
    const loc = plman.GetPlayingItemLocation();
    if (loc.IsValid && loc.PlaylistIndex === pl) {
        const now = plman.GetPlaylistItems(pl), want = new Set(), have = new Set(), gone = [], add = fb.CreateHandleList();
        const id = h => h.RawPath + "|" + h.SubSong;
        for (let i = 0; i < items.Count; i++) want.add(id(items[i]));
        for (let i = 0; i < now.Count; i++) { have.add(id(now[i])); if (!want.has(id(now[i]))) gone.push(i); }
        for (let i = 0; i < items.Count; i++) if (!have.has(id(items[i]))) add.Add(items[i]);
        if (gone.length) { plman.ClearPlaylistSelection(pl); plman.SetPlaylistSelection(pl, gone, true); plman.RemovePlaylistSelection(pl, false); }
        if (add.Count) plman.InsertPlaylistItems(pl, plman.PlaylistItemCount(pl), add);
    } else {
        plman.ClearPlaylist(pl);
        plman.InsertPlaylistItems(pl, 0, items);
    }
    if (show) plman.ActivePlaylist = pl;
    return pl;
}

function favMenu(m, base) {
    const sub = window.CreatePopupMenu(), cur = favStore();
    FAV_STORES.forEach(([, t], i) => sub.AppendMenuItem(0, base + i, tr(t)));
    sub.CheckMenuRadioItem(base, base + FAV_STORES.length - 1, base + Math.max(0, FAV_STORES.findIndex(s => s[0] === cur)));
    sub.AppendTo(m, 0, tr("Favourites saved in"));
}
function favMenuPick(id, base) {
    const s = FAV_STORES[id - base];
    if (!s) return false;
    setSetting("favStore", s[0]);
    favChanged();
    return true;
}

// a heart `size` px wide, its top left at (x, y): filled in the accent when on, else outlined
function drawHeart(gr, x, y, size, on, colour = on ? C.accent : C["line-dim"]) {
    const pts = [], r = size / 34, cx = x + size / 2, cy = y + size * .42;
    for (let k = 0; k < 32; k++) {
        const t = k / 32 * 2 * Math.PI, s = Math.sin(t);
        pts.push(cx + 16 * s * s * s * r, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * r);
    }
    const pack = packGlyph("heart");   // a character pack's icon set may have its own (lib/draw.js ICON_SETS)
    if (pack) { pack(gr, pts, cx, cy, r, size, on, colour); return; }
    if (on) { gr.FillPolygon(colour, 0, pts); return; }
    heartOutline(gr, pts, size, colour);
}
// outlined segment by segment: a polygon's mitred joins would spike at the dip and the point
function heartOutline(gr, pts, size, colour) {
    const lw = Math.max(HAIR, size * .09);
    for (let k = 0; k < pts.length; k += 2) { const j = (k + 2) % pts.length; gr.DrawLine(pts[k], pts[k + 1], pts[j], pts[j + 1], lw, colour); }
}
// WAFFLE (lib/draw.js): a heart-shaped waffle, the same heart cut into four pockets by a ridge down its middle (from
// the dip to the point) and one across; outlined, the two ridges are drawn inside the outline.
if (ICON_SETS.waffle) ICON_SETS.waffle.heart = (gr, pts, cx, cy, r, size, on, colour) => {
    const yc = cy + 2 * r;   // a little under the lobes' centres: the pockets above and below look alike
    if (on) { for (const p of cellCut(pts, [cx], [yc], Math.max(1.1, size * .1))) gr.FillPolygon(colour, 0, p); return; }
    heartOutline(gr, pts, size, colour);
    // where the ridge across meets the outline: the outermost crossings of y = yc
    let x0 = cx, x1 = cx;
    for (let k = 0; k < pts.length; k += 2) {
        const j = (k + 2) % pts.length, ay = pts[k + 1], by = pts[j + 1];
        if ((ay - yc) * (by - yc) > 0 || ay === by) continue;
        const xx = pts[k] + (pts[j] - pts[k]) * (yc - ay) / (by - ay);
        x0 = Math.min(x0, xx); x1 = Math.max(x1, xx);
    }
    const lw = Math.max(HAIR, size * .07);
    gr.DrawLine(x0, yc, x1, yc, lw, colour);
    gr.DrawLine(cx, cy - 5 * r, cx, cy + 17 * r, lw, colour);   // from the dip to the point
};
