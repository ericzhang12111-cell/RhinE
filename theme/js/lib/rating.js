"use strict";
// Track ratings: 0 (none) or 1–5, shown as five diamonds. Where they are kept is "ratingStore" in the settings
// (Archive context menu › Ratings saved in):
//   auto       foo_playcount's statistics when it is installed, else JSplitter's database (the default)
//   jsplitter  JSplitter's own statistics database, %jsplitter_rating%: nothing to install, no file is written
//   playcount  foo_playcount's Playback Statistics, %rating%: the rating other components and columns show
//   tag        a RATING tag in the files themselves (a 0–100 or 0–255 value written by another player reads as 1–5)
// Giving a track the rating it already has clears it; Ctrl+1–5 rates the playing (else focused) track from any view,
// Ctrl+0 clears it (globalKey in lib/bus.js). Every store tells foobar2000 the track changed, so the panels
// hear of it through on_metadb_changed.

const RATING_STORES = [["auto", "Automatic"], ["jsplitter", "JSplitter database (no files written)"],
                       ["playcount", "Playback Statistics (foo_playcount)"], ["tag", "File tags (RATING)"]];
const HAS_PLAYCOUNT = (() => { try { return !!utils.CheckComponent("foo_playcount", true); } catch (e) { return false; } })();
const RATING_TF = {
    jsplitter: fb.TitleFormat("$if2(%jsplitter_rating%,0)"),
    playcount: fb.TitleFormat("$if2(%rating%,0)"),
    tag: fb.TitleFormat("$if2($meta(rating),0)"),
};
function ratingStore() {
    const s = getSetting("ratingStore", "auto");
    if (s === "jsplitter" || s === "tag" || (s === "playcount" && HAS_PLAYCOUNT)) return s;
    return HAS_PLAYCOUNT ? "playcount" : "jsplitter";
}
// 1–5 as they are; a multiple of 10 up to 100 a percentage (20 a mark); anything else the 0–255 of an ID3 POPM frame
// (Windows Media Player writes 1, 64, 128, 196, 255; MediaMonkey 54 for two): up to 31 is 1, up to 95 is 2, up to 159 is 3,
// up to 223 is 4, then 5. (64 could be a percentage too, but the players that write percentages keep to whole tens.)
const popmRating = v => v < 32 ? 1 : v < 96 ? 2 : v < 160 ? 3 : v < 224 ? 4 : 5;
const normRating = v => { v = parseFloat(v) || 0; if (v > 100 || (v > 5 && v % 10)) v = popmRating(v); else if (v > 5) v /= 20; return clamp(Math.round(v), 0, 5); };
const getRating = h => h ? normRating(RATING_TF[ratingStore()].EvalWithMetadb(h)) : 0;
const getRatings = list => list && list.Count ? RATING_TF[ratingStore()].EvalWithMetadbs(list).map(normRating) : [];
// toggle: giving a track the rating it already has clears it (the marks); off for the keys (Ctrl+1–5, Ctrl+0 clears)
function setRating(h, n, toggle = true) {
    if (!h) return;
    const v = toggle && getRating(h) === n ? 0 : clamp(n, 0, 5), store = ratingStore();
    try {
        if (store === "playcount") fb.RunContextCommandWithMetadb("Playback Statistics/Rating/" + (v || "<not set>"), h, 8);
        else if (store === "tag") { const l = fb.CreateHandleList(); l.Add(h); l.UpdateFileInfoFromJSON(JSON.stringify({ RATING: v ? String(v) : "" })); }
        else { h.SetRating(v); h.RefreshStats(); }
    } catch (e) { console.log("audio-archive rating: " + e); }
}
function ratingMenu(m, base) {
    const sub = window.CreatePopupMenu(), cur = getSetting("ratingStore", "auto");
    RATING_STORES.forEach(([k, t], i) => sub.AppendMenuItem(k === "playcount" && !HAS_PLAYCOUNT ? 1 : 0, base + i, tr(t)));
    sub.CheckMenuRadioItem(base, base + RATING_STORES.length - 1, base + Math.max(0, RATING_STORES.findIndex(s => s[0] === cur)));
    sub.AppendTo(m, 0, tr("Ratings saved in"));
}
function ratingMenuPick(id, base) {
    const s = RATING_STORES[id - base];
    if (!s) return false;
    setSetting("ratingStore", s[0]);
    send("rating-store");   // the other panels read the ratings again
    return true;
}

// the five marks from (x, y), each `size` px; value: the rating, preview: the rating under the mouse (0: none).
// Returns the width. Filled marks are the accent (the preview's are the text colour), empty ones outlined.
const RATING_GAP = .45;
function drawRating(gr, x, y, size, value, preview = 0) {
    const step = size * (1 + RATING_GAP), lw = Math.max(HAIR, size * .1), pack = packGlyph("rate");   // a pack's marks (lib/draw.js ICON_SETS)
    for (let i = 0; i < 5; i++) {
        const cx = x + i * step + size / 2, cy = y + size / 2, r = size / 2, pts = [cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy];
        const on = preview ? i < preview : i < value;
        if (pack) pack(gr, cx, cy, size, on, on ? (preview ? C.fg : C.accent) : C["line-dim"], lw);
        else if (on) gr.FillPolygon(preview ? C.fg : C.accent, 0, pts);
        else gr.DrawPolygon(C["line-dim"], lw, [cx, cy - r + lw / 2, cx + r - lw / 2, cy, cx, cy + r - lw / 2, cx - r + lw / 2, cy]);
    }
    return 5 * step - size * RATING_GAP;
}
// which mark (1–5) is at x for marks drawn from x0 with drawRating(…, size)
const ratingAt = (x, x0, size) => clamp(Math.floor((x - x0 + size * RATING_GAP / 2) / (size * (1 + RATING_GAP))) + 1, 1, 5);
const ratingWidth = size => 5 * size * (1 + RATING_GAP) - size * RATING_GAP;

// WAFFLE (lib/draw.js): each mark a small square waffle of four pockets in the diamond's place, outlined when empty
if (ICON_SETS.waffle) ICON_SETS.waffle.rate = (gr, cx, cy, size, on, colour, lw) => {
    const h = size * .42, sq = roundPoly([[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]], size * .16, 3);
    if (on) for (const p of cellCut(sq, [cx], [cy], Math.max(1, size * .12))) gr.FillPolygon(colour, 0, p);
    else {
        const k = h - lw / 2;
        gr.DrawPolygon(colour, lw, roundPoly([[cx - k, cy - k], [cx + k, cy - k], [cx + k, cy + k], [cx - k, cy + k]], size * .14, 3));
    }
};
