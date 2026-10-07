"use strict";
// 02 · PLAYLISTS, right: the signal profile card — the same card as the Lyrics view's
// (lib/nowplaying.js), ending in QUEUE / NEXT instead of the pager, and as tall as the view. The ghost number behind
// it is the active playlist's. A click on a queue row plays that track.

include(fb.ProfilePath + "themes\\audio-archive\\js\\lib\\core.js");
for (const f of ["waveform", "album", "playlists", "nowplaying"]) include(fb.ProfilePath + `themes\\audio-archive\\js\\lib\\${f}.js`);

const M = TOKENS.metrics;
let W = 0, H = 0;
const hits = Hits();
let hover = null;

function npChanged() { window.Repaint(); clock.wake(); }

const clock = Clock(dt => {
    let more = stepSpring(heroClear, dt);
    if (T.title && !scrambleDone(T.title)) more = true;
    if (more) window.Repaint();
    return more;
});

function cardRect() { const g = dp(M.gutter); return [g, g, W - 2 * g, H - 2 * g]; }

function on_size(w, h) { W = w; H = h; }
function on_paint(gr) {
    hits.clear();
    gr.FillSolidRect(0, 0, W, H, C.bg);
    if (STATE.view !== "playlists") return;
    const [x, y, w, h] = cardRect();
    if (w < dp(200) || h < dp(200)) return;
    gr.PushTransform();
    gr.Translate(x, y);
    drawCard(gr, w, h, "queue", pad(Math.max(0, plman.ActivePlaylist) + 1, 3));
    gr.PopTransform();
    hitsCard(x, y);
    if (hover && hover.id === "queue") gr.FillSolidRect(hover.x, hover.y + dp(4), dp(2), hover.h - dp(8), C.accent);
    drawGrain(gr, 0, 0, W, H);
}

function on_mouse_move(x, y) {
    const a = hits.at(x, y);
    window.SetCursor(a ? 32649 : 32512);
    if ((a && a.y) !== (hover && hover.y)) { hover = a; window.Repaint(); }
}
function on_mouse_leave() { if (hover) { hover = null; window.Repaint(); } }
function on_mouse_lbtn_up(x, y) {
    const a = hits.at(x, y);
    if (a && a.id === "queue") plman.ExecutePlaylistDefaultAction(a.data.pl, a.data.index);
}
function on_char(code) { searchChar(code); }
function on_key_down(vk) { if (searchKey(vk)) return; if (vk === 0x20) fb.PlayOrPause(); else globalKey(vk); }

function on_playback_new_track() { loadTrack(); }
function on_playback_starting() { window.Repaint(); }
function on_playback_pause() { window.Repaint(); }
function on_playback_stop(reason) { if (reason !== 2) loadTrack(); }
function on_playback_queue_changed() { window.Repaint(); }
function on_item_focus_change() { if (!fb.IsPlaying) loadTrack(); else window.Repaint(); }
function on_metadb_changed() { if (T.handle) loadTrack(); }
function on_playlist_switch() { window.Repaint(); }
function on_playlists_changed() { plDirty(); window.Repaint(); }
function on_playlist_items_added(i) { plDirty(i); window.Repaint(); }
function on_playlist_items_removed(i) { plDirty(i); window.Repaint(); }
function on_playlist_items_reordered(i) { plDirty(i); window.Repaint(); }
function on_colours_changed() { refreshTokens(); window.Repaint(); }
onMessage("state", () => { if (STATE.skin !== CASE_SKIN) loadSkin(STATE.skin); window.Repaint(); });
send("hello");
window.SetTimeout(loadTrack, 0);
