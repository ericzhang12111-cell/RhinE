"use strict";
// Now playing: the track the panels describe (the playing one, else the focused one), its read-outs, and the signal
// profile card shared by 03 · LYRICS (stage.js) and 02 · PLAYLISTS (card.js). Needs lib/album.js
// and lib/playlists.js.
//
// The including panel defines npChanged(same, handle, what) and a `hits` object: loadTrack() calls npChanged after it
// has read a track (same = it is still the same track; handle null = nothing to show; what = "cover" when only the
// cover arrived).

const NP_ST = {
    key: { size: 8.5, weight: 500, track: .12 },
    lbl: { size: 9, weight: 500, track: .14 },
    ph: { size: 9, weight: 600, track: .14 },
    loaded: { size: 8.5, weight: 500, track: .12 },
    qh: { size: 8.5, weight: 600, track: .14 },
};
const npSt = (s, colour, bg = C.panel) => Object.assign({ colour, bg }, s);

const TF_INFO = fb.TitleFormat([
    "%title%", "[%artist%]", "[%album%]", "[$left(%date%,4)]", "[%codec%]", "[%bitrate%]", "[%samplerate%]",
    "[%__bitspersample%]", "[%__channels%]", "[$num(%tracknumber%,2)]", "[$num(%totaltracks%,2)]",
    "[%replaygain_track_gain%]", "[%play_count%]", "[%codec_profile%]", "$if($stricmp(%__encoding%,lossless),1,)",
].join("\u0001"));
const TF_QUEUE = fb.TitleFormat("%title%\u0001[%length%]"), TF_TITLE = fb.TitleFormat("%title%");
const T = { handle: null, info: null, lyrics: null, no: 0, title: null, file: 0, next: "", missing: false, session0: Date.now() };
const heroClear = Spring(1, 6);      // 0 frosted → 1 clear, ≈ 0.8 s

function loadTrack() {
    const h = fb.GetNowPlaying() || fb.GetFocusItem();
    const same = !!(h && T.handle && h.RawPath === T.handle.RawPath && h.SubSong === T.handle.SubSong);
    T.handle = h;
    if (!h) { T.info = null; T.file = 0; T.next = "—"; npChanged(false, null); return; }
    const v = TF_INFO.EvalWithMetadb(h).split("\u0001");
    T.info = { title: v[0], artist: v[1], album: v[2], year: v[3], codec: v[4] || "—", bitrate: v[5], rate: +v[6] || 0, bits: +v[7] || 0,
               ch: v[8], track: v[9], total: v[10], gain: v[11], plays: v[12], profile: v[13], lossless: v[14] === "1" };
    T.no = albumNo(h);
    const loc = plman.GetPlayingItemLocation();
    T.file = loc.IsValid ? loc.PlaylistItemIndex + 1 : 0;
    T.next = nextTitle();
    T.missing = /^[a-z]:\\/i.test(h.Path) && !utils.IsFile(h.Path);
    if (!same) { T.title = Scramble(T.info.title); heroClear.x = 0; heroClear.to = 1; }
    cover(h, () => npChanged(true, h, "cover"));
    npChanged(same, h);
}

// what plays next: the playback queue first, then the items after the playing one (or after the focused one while
// stopped) in its playlist. [{ handle, pl, index (-1 if not in a playlist), queued }]
function upNext(max) {
    const out = [];
    for (const q of plman.GetPlaybackQueueContents()) {
        if (out.length >= max) break;
        out.push({ handle: q.Handle, pl: q.PlaylistIndex, index: q.PlaylistItemIndex, queued: true });
    }
    if (out.length) return out;
    const loc = plman.GetPlayingItemLocation();
    const pl = loc.IsValid ? loc.PlaylistIndex : plman.ActivePlaylist;
    if (pl < 0) return out;
    const items = plItems(pl);
    let i = loc.IsValid ? loc.PlaylistItemIndex + 1 : plman.GetPlaylistFocusItemIndex(pl) + 1;
    for (; i < items.Count && out.length < max; i++) out.push({ handle: items[i], pl, index: i, queued: false });
    return out;
}

function nextTitle() {
    const n = upNext(1)[0];
    return n ? `${n.index >= 0 ? pad(n.index + 1, 3) + " " : ""}${TF_TITLE.EvalWithMetadb(n.handle).toUpperCase()}` : "—";
}

// ------------------------------------------------------------------------------------------------------ the card
// kind "pager": ends in the previous / current / next pager (Lyrics view, fixed height cardHeight());
// kind "queue": ends in QUEUE / NEXT, as many rows as fit in h (Playlists view)
const CARD_TOP = 14 + 16 + 6 + 250 + 18 + 10 + 54 + 10 + 32 + 12 + 18 + 70;
function cardHeight() { return dp(CARD_TOP + 14 + 10 + 16); }
const CARD_HITS = { pager: [], queue: [] };
function hitsCard(ox, oy) {
    for (const [i, x, y, w, h] of CARD_HITS.pager) hits.add("pager", ox + x, oy + y, w, h, i);
    for (const [q, x, y, w, h] of CARD_HITS.queue) hits.add("queue", ox + x, oy + y, w, h, q);
}

function drawCard(gr, w, h, kind = "pager", ghost = "INFO") {
    gr.FillSolidRect(0, 0, w, h, C.panel);
    box(gr, 0, 0, w, h, C.hair);
    const I = T.info, px = dp(16), iw = w - 2 * px;
    // ghost type behind the content, low on the right
    const gf = font(140, 700), gw = gr.CalcTextWidth(ghost, gf);
    gr.DrawStrokedText(ghost, gf, withAlpha(C["line-faint"], .45), HAIR, 0, w - gw + dp(30), Math.min(h, cardHeight()) - dp(205), gw + dp(10), dp(170));
    let y = dp(14);
    // top row: ■ SIGNAL PROFILE ——— [FILE 003]
    gr.FillSolidRect(px, y + dp(5.5), dp(5), dp(5), C.fg);
    const lw = label(gr, "SIGNAL PROFILE", npSt(NP_ST.lbl, C["text-muted"]), px + dp(15), y + dp(2));
    const chipText = T.file ? `FILE ${pad(T.file, 3)}` : "FILE —";
    const cw = labelWidth(chipText, { size: 8, weight: 600, track: .1, colour: 0, bg: 0 }) + dp(16);
    chip(gr, chipText, w - px - cw, y, dp(16), "inv", 8);
    hline(gr, px + dp(15) + lw + dp(10), y + dp(8), w - px - cw - dp(10) - (px + dp(15) + lw + dp(10)));
    y += dp(16 + 6);
    // hero case
    drawHeroCase(gr, 0, y, w, dp(250), T.handle ? cover(T.handle, () => npChanged(true, T.handle, "cover")) : null, clamp(heroClear.x, 0, 1), T.no);
    y += dp(250);
    // tags
    const state = !fb.IsPlaying ? "STANDBY" : fb.IsPaused ? "PAUSED" : "NOW PLAYING";
    let tx = px;
    tx += chip(gr, state, tx, y, dp(18), "inv", 9) + dp(6);
    if (I) {
        const hires = I.lossless && (I.bits > 16 || I.rate > 48000);
        tx += chip(gr, hires ? "HI-RES" : I.lossless ? "LOSSLESS" : "LOSSY", tx, y, dp(18), "acc", 9) + dp(6);
        if (I.track) chip(gr, `${I.track}${I.total ? " / " + I.total : ""}`, tx, y, dp(18), "", 9);
    }
    y += dp(18 + 10);
    // title (plain, up to two lines)
    const title = I ? (T.title ? scrambleText(T.title) : I.title) : "NO SIGNAL";
    gr.DrawText(title, fontFor(title, 19, 600), C.fg, px, y, iw, dp(54), 0x00000800 | 0x00000010 | 0x00008000 | 0x00040000);   // NOPREFIX | WORDBREAK | END_ELLIPSIS | EDITCONTROL
    y += dp(54 + 10);
    // track information loaded
    label(gr, I ? "TRACK INFORMATION LOADED" : "AWAITING SIGNAL", npSt(NP_ST.loaded, C["fg-soft"]), px, y);
    if (I) {
        gr.FillSolidRect(px, y + dp(17), dp(5), dp(5), C.accent);
        const line = [I.artist, I.album, I.year].filter(Boolean).join(" · ").toUpperCase();
        label(gr, fitLabel(line, npSt(NP_ST.loaded, 0), iw - dp(12)), npSt(NP_ST.loaded, C["fg-soft"]), px + dp(12), y + dp(15));
    }
    y += dp(32 + 12);
    // profile table
    gr.FillSolidRect(px, y, iw, dp(18), C.fg);
    const phy = y + Math.round((dp(18) - labelHeight(NP_ST.ph)) / 2);
    label(gr, "PROFILE", npSt(NP_ST.ph, C.bg, C.fg), px + dp(8), phy);
    label(gr, T.no ? `ARC-${pad(T.no, 4)}` : "ARC-—", npSt(NP_ST.ph, C.bg, C.fg), px + iw - dp(8), phy, 2);
    y += dp(18 + 11);
    const cells = I ? [["FORMAT", I.codec], ["BITRATE", I.bitrate ? fmtCount(I.bitrate) : "—"], ["PLAYS", I.plays || "—"], ["GAIN", I.gain ? I.gain.replace("-", "−") : "—"]]
                    : [["FORMAT", "—"], ["BITRATE", "—"], ["PLAYS", "—"], ["GAIN", "—"]];
    const colW = (iw - dp(16)) / 2;
    cells.forEach(([k, v], i) => {
        const cx = px + dp(8) + (i % 2) * colW, cy = y + Math.floor(i / 2) * dp(20);
        label(gr, k, npSt(NP_ST.key, C["text-muted"]), cx, cy + dp(2));
        gr.DrawText(String(v), font(11, 400), C.fg, cx + dp(64), cy - dp(2), colW - dp(70), dp(18), DT_SINGLE | DT_ELLIPSIS);
    });
    y += dp(40) + dp(10);
    hline(gr, px, y, iw);
    y += dp(14);
    CARD_HITS.pager = [];
    CARD_HITS.queue = [];
    if (kind === "queue") { drawQueue(gr, px, y, iw, h - y - dp(12)); return; }
    // pager: previous · current · next
    const r = dp(8), gap = dp(10), pxs = w / 2 - r * 1.5 - gap;
    for (let i = 0; i < 3; i++) {
        const cx = pxs + i * (r + gap);
        if (i === 1) gr.FillEllipse(cx, y, r, r, C.accent); else gr.DrawEllipse(cx, y, r, r, HAIR, C["line-dim"]);
        CARD_HITS.pager.push([i, cx - dp(4), y - dp(4), r + dp(8), r + dp(8)]);
    }
}

// QUEUE / NEXT ……… 03, then one row per item: position, title, length; a click plays the item
function drawQueue(gr, x, y, w, h) {
    const rowH = dp(24), n = Math.max(0, Math.floor((h - dp(22)) / rowH)), items = upNext(n);
    const queued = items.length && items[0].queued;
    label(gr, queued ? "QUEUE" : "QUEUE / NEXT", npSt(NP_ST.qh, C["text-muted"]), x, y);
    label(gr, pad(items.length, 2), npSt(NP_ST.qh, queued ? C.accent : C["text-muted"]), x + w, y, 2);
    y += dp(22);
    if (!items.length) { label(gr, "END OF PLAYLIST", npSt(NP_ST.key, C["text-muted"]), x, y + dp(6)); return; }
    items.forEach(it => {
        const [title, len] = TF_QUEUE.EvalWithMetadb(it.handle).split("\u0001");
        const pos = it.index >= 0 ? pad(it.index + 1, 3) : "—";
        gr.DrawText(pos, font(11, 500), it.queued ? C.accent : C["text-muted"], x, y, dp(36), rowH, DT_SINGLE);
        gr.DrawText(title, fontFor(title, 12, 500), C.fg, x + dp(40), y, w - dp(40) - dp(52), rowH, DT_SINGLE | DT_ELLIPSIS);
        gr.DrawText(len, font(11, 400), C["fg-soft"], x + w - dp(50), y, dp(50), rowH, DT_RIGHT_SINGLE);
        if (it.index >= 0) CARD_HITS.queue.push([{ pl: it.pl, index: it.index }, x - dp(4), y, w + dp(8), rowH]);
        y += rowH;
    });
}
