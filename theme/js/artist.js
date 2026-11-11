"use strict";
// Artist files (#25), in the Archive view (lib/artist.js fetches and caches them):
//   ARTIST   the album file's third page: the artist's picture, profile, biography, genres and related artists, with
//            PLAY ARTIST and OPEN FILE
//   the file I (or OPEN FILE) opens the artist's file over the shelves: the archive room behind (a render: cream cases
//            lit from below), the picture and name card in the middle, the biography and related artists on the right;
//            its MAP tab (M) shows the related artists as nodes around the artist, the line as strong as the likeness.
//            Esc goes back. The keys that move through the archive still work, so the file follows the selection.

const ART_ST = {
    head: { size: 13, weight: 600, track: .12 },
    name: { size: 22, weight: 700, track: .04 },
    sub: { size: 9.5, weight: 500, track: .1 },
    key: { size: 8.5, weight: 500, track: .12 },
    sect: { size: 9, weight: 600, track: .14 },
    ph: { size: 9, weight: 600, track: .14 },
    btn: { size: 11, weight: 600, track: .1 },
    tag: { size: 8, weight: 600, track: .16 },
    big: { size: 40, weight: 700, track: .05 },
    badge: { size: 64, weight: 700, track: .02 },
    fileno: { size: 18, weight: 700, track: .04 },
    node: { size: 13, weight: 600, track: .03 },
};
const ART_ROOT = THEME_ROOT + "assets\\render\\artist\\";
const AF = { open: false, tab: "file", layer: null, dirty: true, hover: null, rel: -1, libHover: -1, img: {},
             scroll: 0, max: 0, pageKey: "", drag: null, barHover: false };   // the ARTIST page, when it is too short: its scroll
ART.listeners.push(rec => {
    const a = curAlbum(), al = a && (albumOf(a) || a), k = artKey(rec.name);   // the album's artist, or the first one named
    if (!al || (artKey(al.artist || "") !== k && artKey(firstArtist(al.artist || "")) !== k)) return;
    AR.dirtyInfo = true; AF.dirty = true;
    window.Repaint();
});

function artOpenUrl(url) { if (url) try { new ActiveXObject("WScript.Shell").Run(url); } catch (e) { /* no browser */ } }
const artNorm = s => String(s || "").toLowerCase().replace(/[\s.,·・'’"“”!?()（）\[\]【】「」\-_]/g, "");

// the selected item's artist, and their albums in the library
function curArtist() {
    const a = curAlbum();
    if (!a) return null;
    const al = albumOf(a) || a, name = String(al.artist || a.artist || "").trim();
    artistPrefetch(a);
    let rec = artistGet(name, albumFirst(al)), shown = name;
    // a collaboration ("A / B", "A、B、C", "A feat. B") that no service knows as one artist: the first one named
    const first = firstArtist(name);
    if (first !== name && rec && rec.state !== "loading" && !rec.mbid && !rec.pic) { rec = artistGet(first, albumFirst(al)); shown = first; }
    return { name: shown, rec, lib: artistLib(name), album: al };
}
const firstArtist = s => (String(s).split(/\s*(?:[\/、,;×&＆]|\s(?:x|feat\.?|ft\.?|with|vs\.?)\s)\s*/i).find(p => p.trim()) || String(s)).trim();
// the artists of the albums around the selected one, looked up behind it, so that browsing finds them ready
function artistPrefetch(a) {
    if (AF.prefKey === a.key) return;
    AF.prefKey = a.key;
    const g = curGroup(), i = g ? g.albums.indexOf(a) : -1;
    if (i < 0) return;
    for (const d of [1, -1, 2, -2, 3]) {
        const b = g.albums[i + d], al = b && (albumOf(b) || b);
        if (al && al.artist) artistGet(al.artist, albumFirst(al), true);
    }
}
const ART_LIB = { gen: -1, map: new Map() };
function artistLib(name) {
    if (ART_LIB.gen !== LIB.gen) {   // the library's artists, once per index
        ART_LIB.gen = LIB.gen; ART_LIB.map.clear();
        for (const al of LIB.albums) {
            const k = artNorm(al.artist);
            if (!k) continue;
            const e = ART_LIB.map.get(k) || { name: al.artist, albums: [], tracks: 0, plays: 0 };
            e.albums.push(al); e.tracks += al.tracks || 0; e.plays += al.plays || 0;
            ART_LIB.map.set(k, e);
        }
    }
    return ART_LIB.map.get(artNorm(name)) || null;
}
// "ヨルシカ" is in the library as "ヨルシカ" or "ヨルシカ (Yorushika)"
function inLibrary(name) {
    const k = artNorm(name);
    if (!k) return null;
    artistLib("");
    if (ART_LIB.map.has(k)) return ART_LIB.map.get(k);
    for (const [lk, e] of ART_LIB.map) if (lk.startsWith(k) && /^\s*[(（\[]/.test(e.name.slice(name.length))) return e;
    return null;
}

// the artist's albums in the library, newest first (then by title)
const artistAlbums = lib => lib ? [...lib.albums].sort((p, q) => String(q.year || "").localeCompare(String(p.year || "")) || strCmp(lcs(p.title), lcs(q.title))) : [];
// their tracks in that order, each { h, title, len, album } (worked out once per artist and library)
const ART_TRACKS = { key: "", rows: [], scroll: 0 }, TF_ART_ROW = fb.TitleFormat("%title%\t%length%");
function artistTracks(lib) {
    const key = lib ? `${lib.name}|${LIB.gen}` : "";
    if (ART_TRACKS.key === key) return ART_TRACKS.rows;
    ART_TRACKS.key = key; ART_TRACKS.rows = []; ART_TRACKS.scroll = 0;
    for (const album of artistAlbums(lib)) {
        const h = albumHandles(album);
        if (!h) continue;
        for (let i = 0; i < h.Count; i++) { const [title, len] = TF_ART_ROW.EvalWithMetadb(h[i]).split("\t"); ART_TRACKS.rows.push({ h: h[i], title, len, album }); }
    }
    return ART_TRACKS.rows;
}
// every track of the artist in the library, album by album (newest first), in the Archive's playlist; from: the track
// to start with (else the first)
function playArtist(lib, from = null) {
    if (!lib || !libHandles) return;
    const list = fb.CreateHandleList();
    for (const al of artistAlbums(lib)) {
        const h = albumHandles(al);
        if (h) list.AddRange(AR.skipInst ? dropInstrumentals(h, from) : h);
    }
    if (!list.Count) return;
    const pl = archivePlaylist();
    plman.ClearPlaylist(pl);
    plman.InsertPlaylistItems(pl, 0, list);
    let at = 0;
    if (from) for (let k = 0; k < list.Count; k++) if (sameTrack(list[k], from)) { at = k; break; }
    plman.ActivePlaylist = pl;
    plman.ExecutePlaylistDefaultAction(pl, at);
}
// one of the artist's albums, from its first track
function playAlbumOf(al) {
    const pl = loadAlbum(al);
    if (pl < 0) return;
    plman.ActivePlaylist = pl;
    plman.ExecutePlaylistDefaultAction(pl, 0);
    AR.tracks.key = "";
}
// the covers of the artist's albums: asked for with the shelves' (requestVisibleThumbs) while some are not known yet
// (at most once a second: the page is drawn again as covers arrive)
let ART_THUMBS_T = 0, ART_SHOWN = null;   // the artist whose covers were drawn last, and how many of them were known
const coversKnown = lib => lib.albums.filter(al => THUMBS.get(coverKey(al)) !== undefined).length;
// a cover of theirs has arrived since: the page and the file are drawn again
const artistCoversNew = () => !!ART_SHOWN && coversKnown(ART_SHOWN.lib) !== ART_SHOWN.n;
function artistThumbs(lib) {
    if (lib) ART_SHOWN = { lib, n: coversKnown(lib) };
    if (!lib || Date.now() - ART_THUMBS_T < 1000 || !lib.albums.some(al => THUMBS.get(coverKey(al)) === undefined)) return;
    ART_THUMBS_T = Date.now();
    requestVisibleThumbs();
}
// a cover (or, while it loads or when there is none, a plate with the album's initial) at x, y, s × s
function drawAlbumTile(gr, al, x, y, s, hov, playing) {
    const th = thumbOf(al);
    if (th && th.img) gr.DrawImage(th.img, x, y, s, s, 0, 0, th.img.Width, th.img.Height);
    else {
        gr.FillSolidRect(x, y, s, s, C.panel);
        const t = [...String(al.title || "?")][0].toUpperCase();
        text(gr, t, Math.round(s / SCALE * .3), 700, C["text-muted"], x, y, s, s, 1);
    }
    if (playing) { gr.FillSolidRect(x, y + s - dp(4), s, dp(4), C.accent); }
    box(gr, x, y, s, s, hov ? C.accent : withAlpha(C.fg, .15), hov ? Math.max(HAIR, dp(1.5)) : HAIR);
    if (hov) {   // ▶ on the cover under the mouse
        const r = Math.round(s * .16);
        gr.FillEllipse(x + s / 2 - r, y + s / 2 - r, 2 * r, 2 * r, withAlpha(C.bg, .85));
        icon(gr, "play", x + s / 2 + dp(1), y + s / 2, Math.max(6, Math.round(r / SCALE * .8)), C.fg);
    }
}

// a short genre code for the badge: J-POP → JPOP, alternative rock → ALT
function genreCode(rec, lib) {
    const g = (rec && rec.genres && rec.genres[0]) || (lib && lib.albums[0] && lib.albums[0].genre) || "";
    const c = String(g).toUpperCase().replace(/ALTERNATIVE/, "ALT").replace(/ELECTRONIC/, "ELEC").replace(/[^A-Z0-9]/g, "");
    return c.slice(0, 5) || "—";
}
const artYear = s => String(s || "").slice(0, 4);
function artFacts(rec, lib) {
    const person = rec && rec.type === "Person";
    const span = rec && rec.begin ? artYear(rec.begin) + (rec.end ? " – " + artYear(rec.end) : " —") : "—";
    const members = rec && rec.members && rec.members.length ? rec.members.map(m => m.name).join(" · ") : person ? tr("SOLO") : "—";
    return [
        [tr("ORIGIN"), rec && (rec.area || rec.country) ? String(rec.area || rec.country).toUpperCase() : "—"],
        [tr(person ? "BORN" : "FORMED"), span],
        [tr("MEMBERS"), members],
        [tr("IN LIB"), lib ? tr("{0} ALB · {1} TRK", lib.albums.length, lib.tracks) : "—", "acc"],
        [tr("GENRE"), rec && rec.genres && rec.genres.length ? rec.genres.slice(0, 2).join(" · ").toUpperCase() : lib && lib.albums[0] && lib.albums[0].genre ? String(lib.albums[0].genre).toUpperCase() : "—"],
        [tr("PLAYS"), lib && lib.plays ? String(lib.plays) : "—"],
    ];
}
// BAND · J-POP (MusicBrainz's artist types)
const ART_TYPES = { Group: "BAND", Person: "SOLO ARTIST", Orchestra: "ORCHESTRA", Choir: "CHOIR", Character: "CHARACTER", Other: "OTHER" };
const artTypeLine = rec => [rec && ART_TYPES[rec.type] ? tr(ART_TYPES[rec.type]) : "", rec && rec.genres && rec.genres[0] ? rec.genres[0].toUpperCase() : ""].filter(Boolean).join("  ·  ");

// the picture, square, cropped a little above the middle (faces); until it is found (or when there is none), the
// album's own cover; else a hatched NO IMAGE plate
function drawArtistPic(gr, rec, x, y, s, frame = true, album = null) {
    let img = artistPicture(rec);
    if (!img && album) { const th = thumbOf(album); img = th ? th.img : null; }
    if (img) {
        const w = img.Width, h = img.Height, m = Math.min(w, h), sx = (w - m) / 2, sy = h > w ? (h - m) * .25 : 0;
        gr.DrawImage(img, x, y, s, s, sx, sy, m, m);
    } else {
        gr.FillSolidRect(x, y, s, s, C.panel);
        for (let d = -s; d < s; d += dp(7)) gr.DrawLine(x + Math.max(0, d), y + Math.max(0, -d), x + Math.min(s, s + d), y + Math.min(s, s - d), HAIR, C["line-faint"]);
        label(gr, rec && rec.state === "loading" ? tr("LOADING …") : tr("NO IMAGE"), st(ART_ST.key, C["text-muted"]), x + s / 2, y + s / 2 - dp(5), 1);
    }
    if (!frame) return;
    // the frame a little outside, and the corner squares of the file cards
    box(gr, x - dp(6), y - dp(6), s + dp(12), s + dp(12), withAlpha(C.fg, .3));
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) gr.FillSolidRect(x - dp(9) + cx * (s + dp(13)), y - dp(9) + cy * (s + dp(13)), dp(5), dp(5), C.fg);
}

// where the picture comes from: IMG · DEEZER, IMG · <author> · CC BY-SA 4.0 (Commons), ARTIST.JPG, or ALBUM COVER
function picCredit(rec) {
    if (rec && rec.localPic) return "IMG · ARTIST.JPG";
    const p = rec && rec.pic;
    if (!p || !artistPicture(rec)) return tr("IMG · ALBUM COVER");
    return ["IMG", p.credit || p.source, p.licence].filter(Boolean).join(" · ").toUpperCase();
}

// the biography in `lines` lines at most, wrapped; returns the height used
function bioWrap(gr, rec, w) {
    const bio = artistBio(rec);
    const text = bio ? bio.text : rec && rec.state === "loading" ? tr("Looking the artist up …")
        : !ART.online ? tr("Artist lookups are off (right-click to turn them on). A text file artist.txt beside the album's files is shown here, and artist.jpg as the picture.")
        : tr("No biography found for this artist. A text file artist.txt beside the album's files is shown here instead.");
    const f = fontFor(text, 11.5, 400);
    return { f, L: gr.EstimateLineWrap(text, f, w) };
}
function drawBio(gr, rec, x, y, w, maxLines, colour = C["fg-soft"]) {
    const lh = dp(19), { f, L } = bioWrap(gr, rec, w), n = Math.min(maxLines, L.length / 2);
    for (let i = 0; i < n; i++) {
        let t = L[2 * i];
        if (i === n - 1 && L.length / 2 > n) t = t.replace(/\s*\S{0,3}$/, "") + " …";
        gr.DrawText(t, f, colour, x, y + i * lh, w, lh, DT_SINGLE);
    }
    return Math.max(1, n) * lh;
}

// WIKIPEDIA · CC BY-SA 4.0   READ ↗  (right-aligned at x + w); the hit opens the article
function drawBioSource(gr, rec, x, y, w, hitList) {
    const bio = artistBio(rec);
    if (!bio) return;
    const ks = st(ART_ST.key, C["text-muted"]), rs = st(ART_ST.key, C.fg);
    const rw = bio.url ? labelWidth(tr("READ ↗"), rs) : 0;
    if (bio.url) { label(gr, tr("READ ↗"), rs, x + w, y, 2); hitList.push(["art-url", x + w - rw - dp(4), y - dp(5), rw + dp(8), dp(20), bio.url]); }
    label(gr, [bio.source, bio.lang.toUpperCase(), bio.licence].filter(Boolean).join("  ·  "), ks, x + w - rw - (rw ? dp(14) : 0), y, 2);
}

function drawGenreChips(gr, rec, x, y, w, bg) {
    let cx = x;
    ((rec && rec.genres) || []).slice(0, 4).forEach((g, i) => {
        const t = g.toUpperCase(), cw = labelWidth(t, { size: 9, weight: 600, track: .1, colour: 0, bg: 0 }) + dp(16);
        if (cx + cw > x + w) return;
        cx += chip(gr, t, cx, y, dp(21), i ? "" : "inv", 9, bg) + dp(6);
    });
}

// the related artists, `max` rows; returns the height used. Rows of artists in the library open them in the Archive.
function drawRelated(gr, rec, x, y, w, max, hitList, hover) {
    const R = (rec && rec.related) || [], rowH = dp(23);
    R.slice(0, max).forEach((r, i) => {
        const ry = y + i * rowH, own = inLibrary(r.name), hov = hover === i;
        if (hov) gr.FillSolidRect(x - dp(6), ry, w + dp(12), rowH, withAlpha(C.fg, .06));
        if (own) gr.FillSolidRect(x - dp(6), ry, dp(2), rowH, C.accent);
        gr.DrawText(pad(i + 1, 2), font(10, 400), C["text-muted"], x, ry, dp(28), rowH, DT_SINGLE);
        text(gr, r.name, 11.5, own ? 600 : 400, own ? C.fg : C["fg-soft"], x + dp(28), ry, w - dp(28) - dp(84), rowH);
        label(gr, own ? tr("■ IN LIB") : tr("READ ↗"), st(ART_ST.key, own ? C.accent : C["text-muted"]), x + w, ry + Math.round((rowH - labelHeight(ART_ST.key)) / 2), 2);
        gr.FillSolidRect(x, ry + rowH - HAIR, w, HAIR, C.hair);
        hitList.push(["art-rel", x - dp(6), ry, w + dp(12), rowH, i]);
    });
    return Math.min(max, R.length) * rowH;
}
// a related artist: one in the library is shown in the Archive (filtered), another opens its page
function openRelated(rec, i) {
    const r = rec && rec.related && rec.related[i];
    if (!r) return;
    const own = inLibrary(r.name);
    if (own) { AF.open = false; setArchiveFilter(own.name); send("search-set", own.name); window.Repaint(); }
    else artOpenUrl(`https://musicbrainz.org/artist/${r.mbid}`);
}

// ------------------------------------------------------------------------------------- ARTIST (the third page)
function drawInfoArtist(gr, a, x, y, iw, w, h) {
    const A = curArtist(), rec = A && A.rec, lib = A && A.lib, name = A ? A.name : "";
    // bracketed ARTIST NO. 0412 + the source chip
    const hh = dp(34), hs = st(ART_ST.head, C.fg), t = `${tr("ARTIST NO.")} ${pad(artistNo(name || "?"), 4)}`, bw = dp(20) + labelWidth(t, hs) + dp(16);
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) gr.FillSolidRect(x + cx * (bw - dp(5)), y + cy * (hh - dp(5)), dp(5), dp(5), C.fg);
    label(gr, t, hs, x + dp(20), y + Math.round((hh - labelHeight(ART_ST.head)) / 2));
    const bio = artistBio(rec);
    const ct = !rec ? "" : rec.state === "loading" || (bio && !bio.source) ? tr("LOADING") : bio ? `${{ WIKIPEDIA: "WIKI", NETEASE: "NETEASE" }[bio.source] || "TXT"}${bio.lang ? " · " + bio.lang.toUpperCase() : ""}` : rec.state === "none" ? tr("NO FILE") : "MB";
    if (ct) { const cw = labelWidth(ct, { size: 9.5, weight: 600, track: .1, colour: 0, bg: 0 }) + dp(28); chip(gr, ct, x + iw - cw, y + Math.round((hh - dp(22)) / 2), dp(22), rec.state === "none" ? "" : "acc", 9.5, C.bg); }
    y += hh + dp(14);
    gr.FillSolidRect(x, y, w - x, HEAVY, C.fg);
    y += HEAVY;
    const by = h - dp(22) - dp(20) - dp(40);
    if (!name || !rec) {
        AF.max = 0;
        label(gr, name ? tr("VARIOUS ARTISTS · NO SINGLE FILE") : tr("UNKNOWN ARTIST"), st(AR_ST.meta, C["text-muted"]), x, y + dp(24));
        drawArtistButtons(gr, x, by, lib, false);
        return;
    }
    // Under the rule: picture and name, profile, biography, genres, the artist's albums, related artists. A page with
    // the room for them shares it between the biography and the related rows (the rows give way first); one too short
    // for a few lines of each shows them in full and scrolls (the wheel, or the bar at the right).
    const ps = dp(118), vy = y, vb = by - dp(14), y0 = vy + dp(18) + ps + dp(26) + dp(28) + dp(76);
    const nRel = Math.min(6, ((rec.related) || []).length), strip = lib ? libStripH() : 0, hasG = !!(rec.genres && rec.genres.length);
    const fixed = dp(18) + dp(26) + dp(32) + (nRel ? dp(24) : 0) + dp(18) + strip, room = by - y0 - fixed;
    const fits = room >= dp(19) * 4 + Math.min(nRel, 2) * dp(23);
    const rel = fits ? clamp(Math.floor((room - dp(19) * 3) / dp(23)), 0, nRel) : nRel;
    const bioLines = fits ? clamp(Math.floor((room - rel * dp(23)) / dp(19)), 2, 14) : 8;
    const bioN = Math.max(1, Math.min(bioLines, bioWrap(gr, rec, iw).L.length / 2));
    const total = y0 - vy + dp(18) + bioN * dp(19) + dp(34) + (hasG ? dp(32) : 0) + strip + (rel ? dp(20) + rel * dp(23) : 0) + dp(10);
    AF.max = fits ? 0 : Math.max(0, Math.round(total - (vb - vy)));
    if (AF.pageKey !== name) { AF.pageKey = name; AF.scroll = 0; }
    AF.scroll = clamp(AF.scroll, 0, AF.max);
    const n0 = INFO_HITS.length;
    gr.PushClip(0, vy, w, vb - vy);
    y = vy + dp(18) - AF.scroll;
    // the picture, and the name beside it
    drawArtistPic(gr, rec, x + dp(8), y + dp(8), ps, true, A.album);
    const nx = x + ps + dp(32), nw = iw - (nx - x);
    const nf = fontFor(name, 22, 700);
    const lines = gr.EstimateLineWrap(name, nf, nw), two = lines.length > 2;
    gr.DrawText(two ? lines[0] : name, nf, C.fg, nx, y + dp(4), nw, dp(32), DT_SINGLE | DT_ELLIPSIS);
    if (two) gr.DrawText(lines[2], nf, C.fg, nx, y + dp(34), nw, dp(32), DT_SINGLE | DT_ELLIPSIS);
    let ny = y + (two ? dp(72) : dp(42));
    if (rec.mbName && artNorm(rec.mbName) !== artNorm(name)) { text(gr, rec.mbName, 11, 400, C["fg-soft"], nx, ny, nw, dp(18)); ny += dp(20); }
    const tl = artTypeLine(rec);
    if (tl) { label(gr, fitLabel(tl, st(ART_ST.sub, 0), nw), st(ART_ST.sub, C["text-muted"]), nx, ny); ny += dp(18); }
    label(gr, fitLabel(picCredit(rec), st(ART_ST.key, 0), nw), st(ART_ST.key, C["text-muted"]), nx, y + ps - dp(2));
    y += ps + dp(26);
    // profile
    gr.FillSolidRect(x, y, iw, dp(18), C.fg);
    const phy = y + Math.round((dp(18) - labelHeight(ART_ST.ph)) / 2);
    label(gr, tr("PROFILE"), st(ART_ST.ph, C.bg, C.fg), x + dp(8), phy);
    label(gr, `ART-${pad(artistNo(name), 4)}`, st(ART_ST.ph, C.bg, C.fg), x + iw - dp(8), phy, 2);
    y += dp(18 + 10);
    const colW = iw / 2;
    artFacts(rec, lib).forEach(([k, v, kind], i) => {
        const cx = x + dp(8) + (i % 2) * colW, cy = y + Math.floor(i / 2) * dp(20);
        label(gr, k, st(ART_ST.key, C["text-muted"]), cx, cy + dp(2));
        text(gr, v, 11, 400, kind === "acc" ? C.accent : C.fg, cx + dp(72), cy - dp(2), colW - dp(84), dp(18));
        if (kind === "acc" && lib) INFO_HITS.push(["art-lib", cx, cy - dp(2), colW - dp(12), dp(20)]);   // IN LIB: the full list
    });
    y += dp(60) + dp(16);
    label(gr, tr("■ BIOGRAPHY"), st(ART_ST.sect, C.fg), x, y);
    y += dp(18);
    y += drawBio(gr, rec, x, y, iw, bioLines) + dp(8);
    drawBioSource(gr, rec, x, y, iw, INFO_HITS);
    y += dp(26);
    if (hasG) { drawGenreChips(gr, rec, x, y, iw, C.bg); y += dp(32); }
    if (lib) y += drawLibStrip(gr, lib, x, y, iw);
    if (rel) {
        label(gr, tr("■ RELATED ARTISTS"), st(ART_ST.sect, C.fg), x, y);
        const n = rec.related.length, own = rec.related.filter(r => inLibrary(r.name)).length;
        label(gr, `${pad(n, 2)}  ·  ${tr("{0} IN LIBRARY", own)}`, st(ART_ST.key, own ? C.accent : C["text-muted"]), x + iw, y, 2);
        y += dp(20);
        drawRelated(gr, rec, x, y, iw, rel, INFO_HITS, AF.rel);
    }
    gr.PopClip();
    // what has scrolled out of sight cannot be hit
    for (let i = INFO_HITS.length - 1; i >= n0; i--) {
        const a = INFO_HITS[i], t = Math.max(a[2], vy), b = Math.min(a[2] + a[4], vb);
        if (b <= t) INFO_HITS.splice(i, 1); else { a[2] = t; a[4] = b - t; }
    }
    if (AF.max > 0) {
        const bx = x + iw + dp(10), top = vy + dp(8), th = vb - vy - dp(12), view = vb - vy;
        const bh = Math.max(dp(24), th * view / (view + AF.max)), bt = top + (th - bh) * AF.scroll / AF.max, tw = AF.drag || AF.barHover ? dp(6) : dp(3);
        gr.FillSolidRect(bx, top, HAIR, th, C["line-faint"]);
        gr.FillSolidRect(Math.round(bx + HAIR / 2 - tw / 2), Math.round(bt), tw, Math.round(bh), AF.drag ? C.accent : C.fg);
        INFO_HITS.push(["art-bar", bx - dp(8), top, dp(18), th, { top, th, bh, max: AF.max }]);
    } else AF.drag = null;
    drawArtistButtons(gr, x, by, lib, true);
}
// the ARTIST page's scroll: the wheel over it (archiveWheel), or its bar held and moved (stage.js)
function artPageScroll(s, force) {
    s = clamp(Math.round(s), 0, AF.max);
    if (s === AF.scroll && !force) return;
    AF.scroll = s; AR.dirtyInfo = true;
    window.RepaintRect(infoX() - dp(20), 0, W - infoX() + dp(20), H);
}
function artBarDown(y, a) {
    const b = a.data, bt = b.top + (b.th - b.bh) * AF.scroll / b.max;
    AF.drag = { grab: y >= bt && y < bt + b.bh ? y - bt : b.bh / 2, b };
    artBarMove(y, true);
}
function artBarMove(y, force) {
    const { grab, b } = AF.drag;
    artPageScroll(clamp((y - grab - b.top) / Math.max(1, b.th - b.bh), 0, 1) * b.max, force);
}
function artBarUp() { AF.drag = null; artPageScroll(AF.scroll, true); }

// ■ IN YOUR LIBRARY: the artist's albums as covers in a row, the playing one marked; a click plays one. More than fit:
// the last tile says how many more and opens the artist file's LIBRARY.
const libStripH = () => dp(20) + dp(64) + dp(20) + dp(12);
function drawLibStrip(gr, lib, x, y, iw) {
    const albums = artistAlbums(lib), s = dp(64), gap = dp(10), fit = Math.max(1, Math.floor((iw + gap) / (s + gap)));
    const more = albums.length > fit, shown = albums.slice(0, more ? fit - 1 : fit), np = fb.GetNowPlaying();
    artistThumbs(lib);
    label(gr, tr("■ IN YOUR LIBRARY"), st(ART_ST.sect, C.fg), x, y);
    label(gr, tr("{0} ALB · {1} TRK", lib.albums.length, lib.tracks), st(ART_ST.key, C.accent), x + iw, y, 2);
    const ty = y + dp(20);
    shown.forEach((al, i) => {
        const tx = x + i * (s + gap), hov = AF.libHover === i;
        drawAlbumTile(gr, al, tx, ty, s, hov, itemPlaying(al, np));
        label(gr, fitLabel(al.title || tr("UNTITLED"), st(ART_ST.key, 0), s), st(ART_ST.key, hov ? C.fg : C["text-muted"]), tx, ty + s + dp(5));
        INFO_HITS.push(["art-alb", tx, ty, s, s + dp(18), albums.indexOf(al)]);
    });
    if (more) {
        const tx = x + shown.length * (s + gap), hov = AF.libHover === -2;
        gr.FillSolidRect(tx, ty, s, s, hov ? C.fg : C.panel);
        gr.DrawText(`+${albums.length - shown.length}`, font(16, 600), hov ? C.bg : C.fg, tx, ty, s, s, DT_CENTER_SINGLE);
        box(gr, tx, ty, s, s, hov ? C.accent : withAlpha(C.fg, .15));
        label(gr, tr("ALL"), st(ART_ST.key, C["text-muted"]), tx, ty + s + dp(5));
        INFO_HITS.push(["art-lib", tx, ty, s, s + dp(18)]);
    }
    return libStripH();
}

// ▶ PLAY ARTIST · OPEN FILE ↗ (I)
function drawArtistButtons(gr, x, y, lib, file) {
    const bh = dp(40), bs = st(ART_ST.btn, C.bg, C.fg), pt = tr("PLAY ARTIST"), pw = dp(34) + labelWidth(pt, bs) + dp(16);
    gr.FillSolidRect(x, y, pw, bh, lib ? C.fg : C["line-dim"]);
    icon(gr, "play", x + dp(19), y + bh / 2, 9, C.bg);
    label(gr, pt, bs, x + dp(34), y + Math.round((bh - labelHeight(ART_ST.btn)) / 2));
    if (lib) INFO_HITS.push(["art-play", x, y, pw, bh]);
    if (!file) return;
    const ox = x + pw + dp(10), os = st(ART_ST.btn, C.fg), ot = tr("OPEN FILE"), ks = st(AR_ST.key, C["text-muted"]), kw = labelWidth("I", ks);
    const ow = dp(14) + labelWidth(ot, os) + dp(14) + kw + dp(40);
    if (!LABEL_LIVE) gr.FillSolidRect(ox, y, ow, bh, C.bg);
    box(gr, ox, y, ow, bh, C.fg);
    box(gr, ox - dp(4), y - dp(4), ow + dp(8), bh + dp(8), C.accent);
    label(gr, ot, os, ox + dp(14), y + Math.round((bh - labelHeight(ART_ST.btn)) / 2));
    label(gr, "I", ks, ox + ow - dp(34) - kw, y + Math.round((bh - labelHeight(AR_ST.key)) / 2));
    const ax0 = ox + ow - dp(22), ay0 = y + bh / 2 + dp(5), aL = dp(9), sw = Math.max(HAIR, dp(1.5));
    gr.DrawLine(ax0, ay0, ax0 + aL, ay0 - aL, sw, C.accent);
    gr.DrawLine(ax0 + dp(2.5), ay0 - aL, ax0 + aL, ay0 - aL, sw, C.accent);
    gr.DrawLine(ax0 + aL, ay0 - aL, ax0 + aL, ay0 - dp(2.5), sw, C.accent);
    INFO_HITS.push(["art-open", ox, y, ow, bh]);
}

// ------------------------------------------------------------------------------ the artist file (over the shelves)
function artistFileOpen(on = !AF.open) {
    if (on && !curArtist()) return;
    AF.open = on; AF.dirty = true; AF.hover = null;
    if (on) AR.inspOn = false;
    window.Repaint();
}
const ART_TABS = ["file", "map", "lib"];
function artistTab(t) { AF.tab = t || ART_TABS[(ART_TABS.indexOf(AF.tab) + 1) % ART_TABS.length]; AF.dirty = true; window.Repaint(); }

// the archive room: cream cases lit from below (rendered; its own picture for dark schemes), cover-fitted
function artBackdrop(gr, w, h) {
    const k = MODE;
    if (AF.img.mode !== k) {
        AF.img = { mode: k, room: null, node: null };
        try { AF.img.room = d2d.Image(ART_ROOT + `room-${k}.jpg`); } catch (e) { AF.img.room = null; }
        try { AF.img.node = d2d.Image(ART_ROOT + "node.png"); } catch (e) { AF.img.node = null; }
    }
    const img = AF.img.room;
    if (!img) { gr.FillSolidRect(0, 0, w, h, C.bg); return; }
    const s = Math.max(w / img.Width, h / img.Height), sw = w / s, sh = h / s;
    gr.DrawImage(img, 0, 0, w, h, (img.Width - sw) * .35, (img.Height - sh) * .5, sw, sh);
}

const AF_HITS = [];
function drawArtistFile(gr) {
    const aw = arrayW();
    if (AF.dirty || !AF.layer || AF.layer.w !== aw || AF.layer.h !== H) {
        AF.layer = renderLayer(aw, H, drawArtistLayer, AF.layer);
        AF.dirty = false;
    }
    gr.DrawImage(AF.layer.img, 0, 0, AF.layer.w, AF.layer.h, 0, 0, AF.layer.w, AF.layer.h);
    for (const [id, x, y, w, h, data] of AF_HITS) hits.add(id, x, y, w, h, data);
}

function drawArtistLayer(gr, w, h) {
    AF_HITS.length = 0;
    const A = curArtist();
    artBackdrop(gr, w, h);
    if (!A) return;
    const rec = A.rec, lib = A.lib, name = A.name, no = pad(artistNo(name || "?"), 4);
    const wide = w >= dp(1300), left = wide ? dp(300) : 0;
    // the room shows through on the right; the left column and the card sit on the page colour, a little see-through
    if (wide) {
        gr.FillSolidRect(0, 0, left, h, withAlpha(C.bg, .9));
        gr.FillSolidRect(left, 0, HAIR, h, withAlpha(C.fg, .35));
    }
    // ← ARCHIVE  ESC, and where we are
    const bx = dp(28), by = dp(22), bs = st(ART_ST.key, C.fg, withAlpha(C.bg, .9)), bt = tr("← ARCHIVE"), btw = labelWidth(bt, bs);
    const bw = dp(10) + btw + dp(10) + labelWidth("ESC", bs) + dp(10);
    gr.FillSolidRect(bx, by, bw, dp(22), withAlpha(C.bg, .9));
    box(gr, bx, by, bw, dp(22), withAlpha(C.fg, .4));
    label(gr, bt, bs, bx + dp(10), by + Math.round((dp(22) - labelHeight(ART_ST.key)) / 2));
    label(gr, "ESC", st(ART_ST.key, C["text-muted"], withAlpha(C.bg, .9)), bx + dp(20) + btw, by + Math.round((dp(22) - labelHeight(ART_ST.key)) / 2));
    AF_HITS.push(["art-close", bx, by, bw, dp(22)]);
    if (wide) {
        const crumb = `${tr("ARTIST DATABASE")}  /  ${genreCode(rec, lib)}  /  ${name.toUpperCase()}`;
        label(gr, fitLabel(crumb, st(ART_ST.key, 0), left - bx - dp(20)), st(ART_ST.key, C["text-muted"], withAlpha(C.bg, .9)), bx, by + dp(38));
        // the genre badge
        const gx = dp(40), gy = Math.round(h * .3), gw = left - dp(64), gh = dp(170), code = genreCode(rec, lib);
        gr.FillSolidRect(gx, gy, gw, gh, C.fg);
        const cf = font(code.length > 4 ? 52 : 68, 700);
        gr.DrawText(code, cf, C.bg, gx, gy + dp(26), gw, dp(90), DT_CENTER_SINGLE);
        label(gr, tr("GENRE SECTION"), st(ART_ST.tag, C.bg, C.fg), gx + gw / 2, gy + dp(120), 1);
        gr.FillSolidRect(gx + dp(14), gy + gh - dp(16), gw - dp(28), HAIR, withAlpha(C.bg, .35));
        gr.FillEllipse(gx + gw - dp(19), gy + dp(10), dp(9), dp(9), withAlpha(C.bg, .45));
        // what was looked up, and how it went
        let ly = gy + gh + dp(30);
        const lt = rec && rec.state === "loading" ? tr("ARTIST INFORMATION LOADING") : tr("ARTIST INFORMATION LOADED");
        const lts = st(ART_ST.tag, C.bg, C.fg), ltw = labelWidth(lt, lts) + dp(12);
        gr.FillSolidRect(gx, ly, ltw, dp(16), C.fg);
        label(gr, lt, lts, gx + dp(6), ly + Math.round((dp(16) - labelHeight(ART_ST.tag)) / 2));
        ly += dp(26);
        const rows = [[tr("NAME"), name.toUpperCase()], ...((rec && rec.log) || []), [tr("CACHE"), rec && rec.t ? tr("SAVED · {0} D", ART_DAYS) : "—"]];
        for (const [k, v] of rows) {
            label(gr, k, st(ART_ST.key, C.fg, withAlpha(C.bg, .9)), gx, ly);
            label(gr, fitLabel(String(v), st(ART_ST.key, 0), gw - dp(90)), st(ART_ST.key, C["text-muted"], withAlpha(C.bg, .9)), gx + gw, ly, 2);
            gr.FillSolidRect(gx, ly + dp(17), gw, HAIR, withAlpha(C.fg, .14));
            ly += dp(23);
        }
        gr.FillSolidRect(bx, h - dp(30), dp(18), dp(3), C.fg);
        label(gr, tr("ARTIST SECTION"), st(ART_ST.key, C.fg, withAlpha(C.bg, .9)), bx + dp(28), h - dp(35));
    }
    // the card: picture and name, or the map
    const rx = Math.max(left + dp(30), w - dp(360)), cx0 = left + dp(30), cy0 = dp(86), cw = rx - dp(30) - cx0, ch = Math.min(h - dp(170), dp(640));
    gr.FillSolidRect(cx0, cy0, cw, ch, withAlpha(C["panel-hi"], .86));
    box(gr, cx0, cy0, cw, ch, withAlpha(C.fg, .18));
    // FILE | MAP
    let tx = cx0 + cw - dp(16);
    for (const [k, t] of [["lib", tr("LIBRARY")], ["map", tr("MAP")], ["file", tr("FILE")]]) {
        const on = AF.tab === k, tw = labelWidth(t, st(ART_ST.tag, 0)) + dp(16);
        tx -= tw;
        gr.FillSolidRect(tx, cy0 + dp(14), tw, dp(20), on ? C.fg : withAlpha(C.bg, .7));
        box(gr, tx, cy0 + dp(14), tw, dp(20), on ? C.fg : withAlpha(C.fg, .3));
        label(gr, t, st(ART_ST.tag, on ? C.bg : C["fg-soft"], on ? C.fg : C.bg), tx + dp(8), cy0 + dp(14) + Math.round((dp(20) - labelHeight(ART_ST.tag)) / 2));
        AF_HITS.push(["art-tab", tx, cy0 + dp(14), tw, dp(20), k]);
        tx -= dp(4);
    }
    if (AF.tab === "map") drawArtistMap(gr, rec, cx0, cy0, cw, ch, A.album);
    else if (AF.tab === "lib") drawArtistLibrary(gr, lib, name, cx0, cy0, cw, ch);
    else drawArtistCard(gr, rec, lib, name, no, cx0, cy0, cw, ch, A.album);
    // FILE NUMBER: ART-0412, the long rule, and the biography beside the card
    const fs = st(ART_ST.fileno, C.fg, withAlpha(C.bg, .01)), ft = `${tr("FILE NUMBER:")} ART-${no}`, fw = labelWidth(ft, fs);
    const fy = dp(36);
    for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) gr.FillSolidRect(rx + dp(2) + qx * (fw + dp(22)), fy - dp(14) + qy * dp(44), dp(5), dp(5), C.fg);
    trackedText(gr, ft, fs, rx + dp(14), fy);
    gr.FillSolidRect(rx - dp(12), fy + dp(40), w - rx + dp(12), HAIR, C.fg);
    const px = rx, py = cy0 + dp(14), pw = w - rx - dp(28), ph = ch - dp(14);
    gr.FillSolidRect(px, py, pw, ph, withAlpha(C["panel-hi"], .86));
    box(gr, px, py, pw, ph, withAlpha(C.fg, .18));
    const ix = px + dp(16), iw = pw - dp(32);
    let y = py + dp(16);
    label(gr, tr("■ BIOGRAPHY"), st(ART_ST.sect, C.fg, C["panel-hi"]), ix, y);
    label(gr, tr("REFERENCE AREA"), st(ART_ST.key, C["text-muted"], C["panel-hi"]), ix + iw, y, 2);
    y += dp(18);
    gr.FillSolidRect(ix, y, iw, HEAVY, C.fg);
    y += dp(14);
    const nRel = Math.min(6, ((rec && rec.related) || []).length);
    const bioLines = clamp(Math.floor((py + ph - y - dp(40) - (nRel ? dp(50) + nRel * dp(23) : 0)) / dp(19)), 3, 18);
    y += drawBio(gr, rec, ix, y, iw, bioLines) + dp(10);
    drawBioSource(gr, rec, ix, y, iw, AF_HITS);
    y += dp(34);
    if (nRel) {
        label(gr, tr("■ RELATED"), st(ART_ST.sect, C.fg, C["panel-hi"]), ix, y);
        const own = rec.related.filter(r => inLibrary(r.name)).length;
        label(gr, tr("{0} IN LIBRARY", own), st(ART_ST.key, own ? C.accent : C["text-muted"], C["panel-hi"]), ix + iw, y, 2);
        y += dp(18);
        gr.FillSolidRect(ix, y, iw, HEAVY, C.fg);
        y += dp(6);
        drawRelated(gr, rec, ix, y, iw, nRel, AF_HITS, AF.hover && AF.hover.id === "art-rel" ? AF.hover.data : -1);
    }
    // POWERED BY AUDIO ARCHIVE ▬
    const ps = st(ART_ST.key, C.fg, withAlpha(C.bg, .01)), pt = "POWERED BY  AUDIO ARCHIVE";
    trackedText(gr, pt, ps, w - dp(56), h - dp(34), 2);
    gr.FillSolidRect(w - dp(46), h - dp(29), dp(18), dp(4), C.fg);
}

// FILE: the picture with the access line, the name bar, the loaded plate, the profile and the genres
function drawArtistCard(gr, rec, lib, name, no, x0, y0, cw, ch, album) {
    const ps = Math.round(Math.min(ch - dp(150), cw * .44, dp(380))), px = x0 + dp(46), py = y0 + dp(66);
    drawArtistPic(gr, rec, px, py, ps, true, album);
    // the access line across the picture, corner to corner, with its end squares
    gr.DrawLine(px - dp(10), py + ps + dp(10), px + ps + dp(10), py - dp(10), HAIR * 1.2, C.fg);
    gr.FillSolidRect(px - dp(13), py + ps + dp(7), dp(6), dp(6), C.fg);
    gr.FillSolidRect(px + ps + dp(7), py - dp(13), dp(6), dp(6), C.fg);
    const cs = st(ART_ST.key, C["text-muted"], C["panel-hi"]);
    label(gr, fitLabel(picCredit(rec), cs, ps), cs, px, py + ps + dp(18));
    label(gr, `${tr("ACCESS:")}  ${tr("PUBLIC")}  ·  ${tr(rec && rec.state === "loading" ? "OPENING" : "FILE OPENED")}`, st(ART_ST.key, C.fg, C["panel-hi"]), px, py + ps + dp(40));
    // right of the picture
    const x = px + ps + dp(46), iw = x0 + cw - dp(36) - x;
    if (iw < dp(200)) return;
    let y = py - dp(14);
    const tl = artTypeLine(rec);
    if (tl) {
        const ts = st(ART_ST.tag, C.bg, C.fg), tw = Math.min(iw, labelWidth(tl, ts) + dp(16));
        gr.FillSolidRect(x + dp(8), y, tw, dp(18), C.fg);
        label(gr, fitLabel(tl, ts, tw - dp(16)), ts, x + dp(16), y + Math.round((dp(18) - labelHeight(ART_ST.tag)) / 2));
    }
    y += dp(22);
    // the name bar (two lines when long), the native name under it
    const nf = fontFor(name, 40, 700), L = gr.EstimateLineWrap(name, nf, iw - dp(40)), nl = Math.min(2, L.length / 2);
    const sub = rec && rec.mbName && artNorm(rec.mbName) !== artNorm(name) ? rec.mbName : "";
    const nbW = Math.min(iw, Math.max(...Array.from({ length: nl }, (_, i) => L[2 * i + 1])) + dp(40)), nbH = nl * dp(48) + dp(16) + (sub ? dp(18) : 0);
    gr.FillSolidRect(x, y, nbW, nbH, C.fg);
    for (let i = 0; i < nl; i++) gr.DrawText(L[2 * i], nf, C.bg, x + dp(20), y + dp(8) + i * dp(48), nbW - dp(28), dp(50), DT_SINGLE | DT_ELLIPSIS);
    if (sub) text(gr, sub, 10, 500, mix(C.bg, C.fg, .35), x + dp(20), y + nl * dp(48) + dp(6), nbW - dp(28), dp(18));
    y += nbH + dp(14);
    // the loaded plate: the genre code, and ARTIST INFORMATION LOADED ■
    const lh = dp(54), lw = Math.min(iw, dp(330));
    gr.FillSolidRect(x + dp(8), y, lw, lh, C.bg);
    box(gr, x + dp(8), y, lw, lh, withAlpha(C.fg, .15));
    const code = genreCode(rec, lib);
    gr.DrawText(code, font(22, 700), C.fg, x + dp(18), y + dp(8), dp(90), dp(30), DT_SINGLE);
    label(gr, tr("GENRE SECTION"), st({ size: 5.5, weight: 600, track: .14 }, C.fg), x + dp(19), y + dp(38));
    label(gr, fitLabel(tr(rec && rec.state === "loading" ? "ARTIST INFORMATION LOADING" : "ARTIST INFORMATION LOADED") + " ■", st(ART_ST.tag, 0), lw - dp(110)), st(ART_ST.tag, C.fg), x + dp(104), y + Math.round((lh - labelHeight(ART_ST.tag)) / 2));
    y += lh + dp(20);
    label(gr, `■ ART-${no}`, st(ART_ST.sect, C.fg, C["panel-hi"]), x + dp(10), y);
    y += dp(28);
    // the profile box
    const bw = Math.min(iw, dp(340));
    gr.FillSolidRect(x + dp(8), y, bw, dp(18), C.fg);
    label(gr, tr("PROFILE"), st(ART_ST.ph, C.bg, C.fg), x + dp(16), y + Math.round((dp(18) - labelHeight(ART_ST.ph)) / 2));
    label(gr, `FILE ${no}`, st(ART_ST.ph, C.bg, C.fg), x + dp(8) + bw - dp(8), y + Math.round((dp(18) - labelHeight(ART_ST.ph)) / 2), 2);
    y += dp(18);
    const facts = artFacts(rec, lib), colW = bw / 2, rowsH = Math.ceil(facts.length / 2) * dp(21) + dp(14);
    gr.FillSolidRect(x + dp(8), y, bw, rowsH, withAlpha(C.bg, .7));
    box(gr, x + dp(8), y - dp(18), bw, rowsH + dp(18), withAlpha(C.fg, .15));
    facts.forEach(([k, v, kind], i) => {
        const fx = x + dp(16) + (i % 2) * colW, fy = y + dp(8) + Math.floor(i / 2) * dp(21);
        label(gr, k, st(ART_ST.key, C["text-muted"]), fx, fy + dp(2));
        text(gr, v, 10.5, 400, kind === "acc" ? C.accent : C.fg, fx + dp(62), fy - dp(2), colW - dp(70), dp(18));
        if (kind === "acc" && lib) AF_HITS.push(["art-tab", fx, fy - dp(2), colW - dp(8), dp(20), "lib"]);   // IN LIB: the LIBRARY tab
    });
    y += rowsH + dp(16);
    drawGenreChips(gr, rec, x + dp(8), y, iw - dp(8), C["panel-hi"]);
    // the ghost INFO, low on the right of the card
    const gf = font(118, 700), gt = "INFO", gw = gr.CalcTextWidth(gt, gf);
    if (y + dp(40) < y0 + ch - dp(140)) gr.DrawStrokedText(gt, gf, withAlpha(C.fg, .12), HAIR, 0, x0 + cw - gw * 1.7 - dp(24), y0 + ch - dp(150), gw * 1.7, dp(150));
}

// LIBRARY: the artist's albums in the library as covers on the left (a click plays the album), all their tracks on the
// right (a click plays the artist from that track; the wheel scrolls them), the playing ones marked; ▶ PLAY ARTIST
function drawArtistLibrary(gr, lib, name, x0, y0, cw, ch) {
    const x = x0 + dp(30), w = cw - dp(60), np = fb.GetNowPlaying(), bg = C["panel-hi"];
    let y = y0 + dp(18);
    label(gr, tr("■ IN YOUR LIBRARY"), st(ART_ST.sect, C.fg, bg), x, y + dp(4));
    if (!lib) { label(gr, tr("NOTHING BY {0} IN THE LIBRARY", name.toUpperCase()), st(ART_ST.key, C["text-muted"], bg), x, y + dp(40)); return; }
    artistThumbs(lib);
    const albums = artistAlbums(lib), rows = artistTracks(lib);
    label(gr, tr("{0} ALB · {1} TRK", lib.albums.length, lib.tracks), st(ART_ST.key, C.accent, bg), x + dp(150), y + dp(5));
    y += dp(30);
    gr.FillSolidRect(x, y, w, HEAVY, C.fg);
    y += HEAVY + dp(16);
    const bottom = y0 + ch - dp(64);
    // albums: up to as many as the left part holds
    const lw = Math.round(w * .5), s = dp(104), gap = dp(16), cols = Math.max(1, Math.floor((lw + gap) / (s + gap))), rh = s + dp(44);
    const fitRows = Math.max(1, Math.floor((bottom - y + dp(10)) / rh)), shown = albums.slice(0, cols * fitRows);
    shown.forEach((al, i) => {
        const ax = x + (i % cols) * (s + gap), ay = y + Math.floor(i / cols) * rh, hov = AF.hover && AF.hover.id === "art-alb" && AF.hover.data === i;
        drawAlbumTile(gr, al, ax, ay, s, hov, itemPlaying(al, np));
        text(gr, al.title || tr("UNTITLED"), 10, 600, hov ? C.accent : C.fg, ax, ay + s + dp(6), s, dp(16));
        label(gr, fitLabel([al.year, tr(al.tracks === 1 ? "{0} TRACK" : "{0} TRACKS", al.tracks || 0)].filter(Boolean).join("  ·  "), st(ART_ST.key, 0), s), st(ART_ST.key, C["text-muted"], bg), ax, ay + s + dp(24));
        AF_HITS.push(["art-alb", ax, ay, s, s + dp(40), i]);
    });
    if (albums.length > shown.length) label(gr, tr("+{0} MORE", albums.length - shown.length), st(ART_ST.key, C["text-muted"], bg), x, bottom - dp(4));
    // tracks: the list, scrolled with the wheel
    const tx = x + lw + dp(24), tw = x + w - tx, rowH = dp(26), n = Math.max(1, Math.floor((bottom - y) / rowH));
    ART_TRACKS.view = { n, max: Math.max(0, rows.length - n) };
    ART_TRACKS.scroll = clamp(ART_TRACKS.scroll, 0, ART_TRACKS.view.max);
    const hovT = AF.hover && AF.hover.id === "art-trk" ? AF.hover.data : -1, ks = st(ART_ST.key, C["text-muted"], bg);
    for (let k = 0; k < n && ART_TRACKS.scroll + k < rows.length; k++) {
        const i = ART_TRACKS.scroll + k, r = rows[i], ry = y + k * rowH, on = sameTrack(r.h, np), hov = i === hovT;
        if (hov) gr.FillSolidRect(tx - dp(8), ry, tw + dp(8), rowH, withAlpha(C.fg, .07));
        if (on) gr.FillSolidRect(tx - dp(8), ry + dp(5), dp(3), rowH - dp(10), C.accent);
        label(gr, pad(i + 1, 2), st(ART_ST.key, on ? C.accent : C["text-muted"], hov ? mix(bg, C.fg, .07) : bg), tx, ry + Math.round((rowH - labelHeight(ART_ST.key)) / 2));
        const lenW = dp(44), albW = Math.round(tw * .34);
        text(gr, r.title, 11, on ? 600 : 400, on ? C.accent : C.fg, tx + dp(30), ry, tw - dp(30) - albW - lenW - dp(16), rowH);
        text(gr, r.album.title || "", 10, 400, C["fg-soft"], tx + tw - lenW - albW - dp(8), ry, albW, rowH);
        label(gr, r.len, ks, tx + tw, ry + Math.round((rowH - labelHeight(ART_ST.key)) / 2), 2);
        gr.FillSolidRect(tx, ry + rowH - HAIR, tw, HAIR, withAlpha(C.fg, .08));
        AF_HITS.push(["art-trk", tx - dp(8), ry, tw + dp(8), rowH, i]);
    }
    if (ART_TRACKS.view.max > 0) {   // where the list is
        const sh = n * rowH, bh = Math.max(dp(24), sh * n / rows.length), byy = y + (sh - bh) * ART_TRACKS.scroll / ART_TRACKS.view.max;
        gr.FillSolidRect(x + w + dp(10), y, HAIR, sh, withAlpha(C.fg, .15));
        gr.FillSolidRect(x + w + dp(9), byy, dp(3), bh, C.fg);
    }
    // ▶ PLAY ARTIST
    const bs = st(ART_ST.btn, C.bg, C.fg), pt = tr("PLAY ARTIST"), pw = dp(34) + labelWidth(pt, bs) + dp(16), py = y0 + ch - dp(52), bh = dp(36);
    gr.FillSolidRect(x, py, pw, bh, C.fg);
    icon(gr, "play", x + dp(19), py + bh / 2, 9, C.bg);
    label(gr, pt, bs, x + dp(34), py + Math.round((bh - labelHeight(ART_ST.btn)) / 2));
    AF_HITS.push(["art-play", x, py, pw, bh]);
}
// the wheel over the LIBRARY tab's tracks; true when it moved them
function artistWheel(step) {
    if (!AF.open || AF.tab !== "lib" || !ART_TRACKS.view) return false;
    const s = clamp(ART_TRACKS.scroll - step * 3, 0, ART_TRACKS.view.max);
    if (s === ART_TRACKS.scroll) return true;
    ART_TRACKS.scroll = s; AF.dirty = true; window.RepaintRect(0, 0, arrayW(), H);
    return true;
}

// MAP: the artist in the middle, the related artists around (in the library on the left, to discover on the right);
// a line as thick as the likeness, dashed to an artist not in the library
function drawArtistMap(gr, rec, x0, y0, cw, ch, album) {
    const R = ((rec && rec.related) || []).slice(0, 8);
    const cx = x0 + cw / 2, cy = y0 + ch / 2 + dp(10), ps = Math.round(Math.min(ch * .3, dp(190)));
    const rad = Math.min(cw * .38, ch * .4);
    // distance rings
    for (let i = 1; i <= 3; i++) { const r = rad * i / 3; gr.DrawEllipse(cx - r, cy - r, 2 * r, 2 * r, HAIR, withAlpha(C.fg, .1 - i * .02)); }
    const own = R.map(r => !!inLibrary(r.name)), L = R.map((r, i) => i).filter(i => own[i]), O = R.map((r, i) => i).filter(i => !own[i]);
    // on a wide ellipse, each side fanned out; the closer the likeness, the nearer the middle
    const ex = cw * .37, ey = ch * .33;
    const place = (list, side) => list.map((i, k) => {
        const n = list.length, spread = Math.min(1.1, .38 * (n - 1)), a = n === 1 ? 0 : (k / (n - 1) - .5) * 2 * spread;
        const f = 1.08 - .28 * clamp(R[i].score, 0, 1);
        return [i, cx + side * Math.cos(a) * ex * f, cy + Math.sin(a) * ey * f * 1.25];
    });
    const P = [...place(L, -1), ...place(O, 1)];
    const hov = AF.hover && AF.hover.id === "art-node" ? AF.hover.data : -1;
    for (const [i, nx, ny] of P) {
        const sw = Math.max(HAIR, dp(1 + 4 * clamp(R[i].score - .4, 0, .6))), col = i === hov ? C.accent : own[i] ? withAlpha(C.fg, .7) : withAlpha(C.fg, .4);
        if (own[i]) gr.DrawLine(cx, cy, nx, ny, sw, col);
        else { const len = Math.hypot(nx - cx, ny - cy), n = Math.floor(len / dp(9)); for (let k = 0; k < n; k += 2) gr.DrawLine(cx + (nx - cx) * k / n, cy + (ny - cy) * k / n, cx + (nx - cx) * (k + 1) / n, cy + (ny - cy) * (k + 1) / n, sw, col); }
        // the likeness on the line
        const lt = Math.min(.7, (ps * .62 + dp(30)) / Math.max(1, Math.hypot(nx - cx, ny - cy)));   // just outside the picture
        const mx = cx + (nx - cx) * lt, my = cy + (ny - cy) * lt, t = R[i].score.toFixed(2), ts = st(ART_ST.key, C["text-muted"], C["panel-hi"]), tw = labelWidth(t, ts);
        gr.FillSolidRect(mx - tw / 2 - dp(4), my - dp(8), tw + dp(8), dp(16), C["panel-hi"]);
        label(gr, t, ts, mx, my - Math.round(labelHeight(ART_ST.key) / 2), 1);
    }
    // the artist
    drawArtistPic(gr, rec, cx - ps / 2, cy - ps / 2, ps, true, album);
    const nt = rec ? rec.name : "", nf = fontFor(nt, 18, 700), nw = Math.min(cw * .5, gr.CalcTextWidth(nt, nf) * 1.15 + dp(40));
    gr.FillSolidRect(cx - nw / 2, cy + ps / 2 + dp(16), nw, dp(32), C.fg);
    gr.DrawText(nt, nf, C.bg, cx - nw / 2 + dp(14), cy + ps / 2 + dp(16), nw - dp(28), dp(32), DT_CENTER_SINGLE | DT_ELLIPSIS);
    // the nodes: a clay case, the name beside it
    const node = AF.img.node, nwid = dp(96), nh = node ? Math.round(nwid * node.Height / node.Width) : dp(60);
    for (const [i, nx, ny] of P) {
        const r = R[i], right = nx > cx;
        if (node) gr.DrawImage(node, nx - nwid / 2, ny - nh / 2, nwid, nh, 0, 0, node.Width, node.Height, 0, own[i] ? 255 : 150);
        else { gr.FillSolidRect(nx - dp(30), ny - dp(20), dp(60), dp(40), C["case-hi"]); box(gr, nx - dp(30), ny - dp(20), dp(60), dp(40), C["line-faint"]); }
        if (i === hov) box(gr, nx - nwid / 2 - dp(6), ny - nh / 2 - dp(4), nwid + dp(12), nh + dp(8), C.accent);
        const tx = right ? nx + nwid / 2 + dp(12) : nx - nwid / 2 - dp(12), al = right ? 0 : 2;
        const ks = st(ART_ST.tag, own[i] ? C.bg : C["text-muted"], own[i] ? C.fg : C["panel-hi"]), kt = own[i] ? tr("IN LIBRARY") : tr("NOT IN LIBRARY"), kw = labelWidth(kt, ks) + dp(12);
        const kx = right ? tx : tx - kw;
        if (own[i]) gr.FillSolidRect(kx, ny - dp(26), kw, dp(15), C.fg); else box(gr, kx, ny - dp(26), kw, dp(15), C["line-faint"]);
        label(gr, kt, ks, kx + dp(6), ny - dp(26) + Math.round((dp(15) - labelHeight(ART_ST.tag)) / 2));
        const nf2 = fontFor(r.name, 13, 600), w2 = Math.min(dp(200), gr.CalcTextWidth(r.name, nf2) + dp(4));
        gr.DrawText(r.name, nf2, own[i] ? C.fg : C["fg-soft"], right ? tx : tx - w2, ny - dp(8), w2, dp(20), (right ? DT_SINGLE : DT_RIGHT_SINGLE) | DT_ELLIPSIS);
        AF_HITS.push(["art-node", nx - nwid / 2 - dp(6), ny - nh / 2 - dp(4), nwid + dp(12), nh + dp(8), i]);
        AF_HITS.push(["art-node", Math.min(tx, tx - (right ? 0 : w2)), ny - dp(26), Math.max(w2, kw), dp(40), i]);
    }
    if (!R.length) label(gr, tr(rec && rec.state === "loading" ? "LOOKING FOR RELATED ARTISTS …" : "NO RELATED ARTISTS FOUND"), st(ART_ST.key, C["text-muted"], C["panel-hi"]), cx, cy + ps / 2 + dp(64), 1);
    label(gr, tr("← → ↑ ↓ ARCHIVE  ·  CLICK A NODE  ·  LINE = SHARED LISTENERS"), st(ART_ST.key, C["text-muted"], C["panel-hi"]), cx, y0 + ch - dp(26), 1);
}

// the mouse over the file: hover marks (rows, nodes)
function artistMouseMove(x, y, a) {
    const page = x >= infoX() - dp(20);   // the album file's ARTIST page (else the artist file over the shelves)
    const hv = !page && a && ["art-rel", "art-node", "art-alb", "art-trk"].includes(a.id) ? { id: a.id, data: a.data } : null;
    if (JSON.stringify(hv) !== JSON.stringify(AF.hover)) { AF.hover = hv; AF.dirty = true; window.RepaintRect(0, 0, arrayW(), H); }
    const r = a && a.id === "art-rel" && page ? a.data : -1;
    const lh = page && a ? (a.id === "art-alb" ? a.data : a.id === "art-lib" ? -2 : -1) : -1;
    const bar = !!(a && a.id === "art-bar");
    if (r !== AF.rel || lh !== AF.libHover || bar !== AF.barHover) { AF.rel = r; AF.libHover = lh; AF.barHover = bar; AR.dirtyInfo = true; window.RepaintRect(infoX() - dp(20), 0, W - infoX() + dp(20), H); }
}
// a click on the file or on the ARTIST page; true when it was ours
function artistClick(a) {
    if (!a || !/^art-/.test(a.id)) return false;
    const A = curArtist();
    switch (a.id) {
        case "art-close": artistFileOpen(false); break;
        case "art-open": artistFileOpen(true); break;
        case "art-tab": artistTab(a.data); break;
        case "art-play": playArtist(A && A.lib); break;
        case "art-url": artOpenUrl(a.data); break;
        case "art-rel": case "art-node": openRelated(A && A.rec, a.data); break;
        case "art-alb": { const al = artistAlbums(A && A.lib)[a.data]; if (al) playAlbumOf(al); break; }
        case "art-trk": { const r = artistTracks(A && A.lib)[a.data]; if (r) playArtist(A.lib, r.h); break; }
        case "art-lib": artistFileOpen(true); artistTab("lib"); break;
    }
    return true;
}
