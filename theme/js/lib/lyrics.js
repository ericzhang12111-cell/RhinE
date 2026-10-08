"use strict";
// Synced lyrics: an .lrc file next to the track (same name) or an embedded LYRICS / SYNCEDLYRICS /
// UNSYNCEDLYRICS tag that contains LRC time stamps; failing both, LRCLIB (lrclib.net, an open database of synced
// lyrics) when "Fetch lyrics online" is on. Two lines with the same time stamp are the original and its translation.
// Result: { lines: [{ t, a, b }], source: "LRC" | "TAG" | "LRCLIB", langs: 1 | 2 } or null.

function parseLrc(text) {
    let offset = 0;
    const byTime = new Map();
    for (const raw of text.split(/\r?\n/)) {
        const off = raw.match(/^\s*\[offset:\s*([+-]?\d+)\s*\]/i);
        if (off) { offset = +off[1] / 1000; continue; }
        const stamps = [];
        let rest = raw.trim(), m;
        while ((m = rest.match(/^\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/))) {
            stamps.push(+m[1] * 60 + parseFloat(m[2].replace(":", ".")));
            rest = rest.slice(m[0].length);
        }
        rest = rest.trim();
        if (!stamps.length) continue;
        for (const t of stamps) {
            const key = Math.round(t * 100);
            if (!byTime.has(key)) byTime.set(key, []);
            byTime.get(key).push(rest);
        }
    }
    const lines = [...byTime.entries()].sort((x, y) => x[0] - y[0])
        .map(([k, texts]) => ({ t: Math.max(0, k / 100 - offset), a: texts[0] || "", b: texts[1] || "" }))
        .filter(l => l.a || l.b);
    return lines.length ? lines : null;
}

function readLrcFile(path) {
    let text = utils.ReadTextFile(path, 65001);
    if (text.includes("�")) text = utils.ReadTextFile(path, 0);   // not UTF-8: let foobar2000 detect the codepage
    return text;
}

function loadLyrics(handle) {
    if (!handle) return null;
    const path = handle.Path || "";
    const finish = (lines, source) => lines ? { lines, source, langs: lines.some(l => l.b) ? 2 : 1 } : null;
    if (/^[a-z]:\\/i.test(path) || path.startsWith("\\\\")) {
        const lrc = path.replace(/\.[^.\\]+$/, "") + ".lrc";
        if (utils.IsFile(lrc)) { const r = finish(parseLrc(readLrcFile(lrc)), "LRC"); if (r) return r; }
    }
    const info = handle.GetFileInfo(true);
    if (info) {
        for (const name of ["SYNCEDLYRICS", "LYRICS", "UNSYNCEDLYRICS"]) {
            const i = info.MetaFind(name);
            if (i >= 0) { const r = finish(parseLrc(info.MetaValue(i, 0)), "TAG"); if (r) return r; }
        }
    }
    return null;
}

// index of the line sung at time `t` (-1 before the first)
function lyricIndex(lines, t) {
    let lo = 0, hi = lines.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (lines[m].t <= t + .05) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
}

// ------------------------------------------------------------------------------------------------------ online
// LRCLIB: the track's artist, title, album and duration are sent to lrclib.net (only when the track has no lyrics of
// its own and the option is on). What comes back is kept in <profile>\audio-archive-cache\lyrics\ — never next to the
// music or in its tags; a miss is remembered for a week. The exact lookup (/api/get) goes first, then a search
// (/api/search) for a synced result whose length is within 3 s. The panel that uses this forwards foobar2000's
// on_download_file_done to lyricsDownloaded() (a library file must not declare the callback itself).
const LYR_DIR = fb.ProfilePath + "audio-archive-cache\\lyrics\\";
const LYR_MISS_DAYS = 7;
const TF_LYR = fb.TitleFormat("[%artist%]\u0001[%title%]\u0001[%album%]");
const LYR = { state: "", key: "", step: "", req: null };   // state: "" | SEARCHING | NOT FOUND | OFFLINE (the current track's)
const lyrQuery = o => Object.entries(o).filter(([, v]) => v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

// starts an online lookup for `handle` (with no lyrics of its own); onFound(lyrics) runs when synced lyrics arrive,
// onMiss() when LRCLIB has none (another source may then be asked)
function lyricsOnline(handle, onFound, onMiss = () => {}) {
    LYR.state = ""; LYR.req = null;
    if (!handle || !STATE.lyricsOnline || !(handle.Length > 0)) return;
    const [artist, title, album] = TF_LYR.EvalWithMetadb(handle).split("\u0001").map(v => v.trim());
    if (!artist || !title) return;
    const key = fnv(`${artist}|${title}|${album}|${Math.round(handle.Length)}`).toLowerCase(), base = LYR_DIR + key;
    if (utils.IsFile(base + ".lrc")) { const r = parseLrc(utils.ReadTextFile(base + ".lrc", 65001)); if (r) { onFound({ lines: r, source: "LRCLIB", langs: r.some(l => l.b) ? 2 : 1 }); return; } }
    if (utils.IsFile(base + ".none")) {
        const t = +utils.ReadTextFile(base + ".none", 65001) || 0;
        if (Date.now() - t < LYR_MISS_DAYS * 864e5) { LYR.state = "NOT FOUND"; onMiss(); return; }
    }
    if (!utils.IsDirectory(LYR_DIR)) utils.CreateFolder(LYR_DIR);
    LYR.req = { key, base, len: handle.Length, onFound, onMiss, step: "get", q: { artist_name: artist, track_name: title, album_name: album } };
    LYR.state = "SEARCHING";
    utils.DownloadFileAsync(`https://lrclib.net/api/get?${lyrQuery({ ...LYR.req.q, duration: Math.round(handle.Length) })}`, base + ".get.json");
}

// foobar2000's on_download_file_done, forwarded by the panel; returns true when the lookup changed state
function lyricsDownloaded(path, ok) {
    const R = LYR.req;
    if (!R || !path.startsWith(R.base)) return false;
    let body = null;
    try { if (ok) body = JSON.parse(utils.ReadTextFile(path, 65001)); } catch (e) { body = null; }
    let synced = "";
    if (R.step === "get") {
        if (body && body.syncedLyrics) synced = body.syncedLyrics;
        else {   // no exact match (or no synced text in it): search
            R.step = "search";
            const q = { track_name: R.q.track_name, artist_name: R.q.artist_name };
            utils.DownloadFileAsync(`https://lrclib.net/api/search?${lyrQuery(q)}`, R.base + ".search.json");
            return false;
        }
    } else if (Array.isArray(body)) {
        const hit = body.filter(r => r.syncedLyrics && Math.abs((r.duration || 0) - R.len) <= 3)
                        .sort((p, q) => Math.abs(p.duration - R.len) - Math.abs(q.duration - R.len))[0];
        if (hit) synced = hit.syncedLyrics;
    } else if (!ok) { LYR.state = "OFFLINE"; LYR.req = null; return true; }
    const lines = synced ? parseLrc(synced) : null;
    if (lines) {
        utils.WriteTextFile(R.base + ".lrc", synced, false);
        LYR.state = ""; LYR.req = null;
        R.onFound({ lines, source: "LRCLIB", langs: lines.some(l => l.b) ? 2 : 1 });
    } else {
        utils.WriteTextFile(R.base + ".none", String(Date.now()), false);
        LYR.state = "NOT FOUND"; LYR.req = null;
        R.onMiss();
    }
    return true;
}
