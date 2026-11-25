"use strict";
// Character packs: a whole look built around one character, more than a preset can carry. A pack is one folder with
// pack.json; built-in packs live in the theme's assets\packs\, hand-installed ones in <profile>\audio-archive-packs\
// (outside the theme folder, which an update replaces). The folder name is the pack's id. The root panel keeps the
// pack in use in STATE.pack (null: none); applying any preset sets it (a preset without one turns it off).
//
// pack.json (every part optional; paths are relative to the pack's folder):
//   name       the card's name                      about   one line under it
//   preview    a picture for the preset card and its preview
//   preset     the look the pack applies, as a preset (lib: style.js PRESETS): skin, scheme, mode, emblem, font, ...
//              a skin of the pack's own lives in its case\<skin id>\ (listed with the others, lib/skins.js)
//   icons      the button glyph set (lib/draw.js ICON_SETS)            halftone  the halftone's pattern (dots | grid)
//   ring       the Signal view's 3D ring, a turntable of frames (lib/ring.js): { dir, frames, fps, ... }
//   ring2d     the 2D ring's shape (lib/ring.js)                        strip     the spectrum strip's look (signal.js)
//   intro      the boot film's folder (fx.js): frame-NNN.jpg + intro.json
//   (preset.wallpaper: the pack's pictures, one per view: { path: "pack:ID/REL", byView: { archive, playlists, lyrics,
//              signal }, views, look, veil, card } (lib/wallpaper.js); NAME-light.jpg beside a picture is used in light mode)
//   operator   the character at the edge of a view (lib/operator.js)    mini      the mini player's colours (mini.js)
//   counter    the status line's little count (transport.js)

const PACK_ROOTS = [THEME_ROOT + "assets\\packs\\", fb.ProfilePath + "audio-archive-packs\\"];

// [{ id, dir, ...pack.json }], built-in first; an id found twice is taken from the theme. Cached like the skins.
let PACK_LIST = null;
const PACK_MISSING = new Set();   // ids looked for and not found since the folders were last read (no re-read per paint)
function listPacks(fresh = false) {
    if (PACK_LIST && !fresh) return PACK_LIST;
    PACK_MISSING.clear();
    const out = [];
    for (const root of PACK_ROOTS) {
        if (!utils.IsDirectory(root)) continue;
        for (const f of utils.Glob(root + "*\\pack.json")) {
            const dir = f.slice(0, -"pack.json".length), id = dir.slice(root.length, -1);
            if (!id || out.some(p => p.id === id)) continue;
            let m;
            try { m = JSON.parse(utils.ReadTextFile(f, 65001)); } catch (e) { continue; }
            if (!m || typeof m !== "object") continue;
            out.push(Object.assign({}, m, { id, dir, name: String(m.name || id.toUpperCase()) }));
        }
    }
    PACK_LIST = out;
    return out;
}
function findPack(id) {
    if (!id) return null;
    const p = listPacks().find(k => k.id === id);
    if (p || PACK_MISSING.has(id)) return p || null;
    const q = listPacks(true).find(k => k.id === id) || null;   // installed since the list was read?
    if (!q) PACK_MISSING.add(id);
    return q;
}
const pickPack = v => typeof v === "string" && findPack(v) ? v : null;
// the pack in use (null: none), and one of its parts (null when it has none)
const packOn = () => findPack(STATE.pack);
const packPart = k => { const p = packOn(); return p && p[k] != null ? p[k] : null; };
// a file of the pack in use (or of `p`): its full path, "" when there is no pack or no such file
function packFile(rel, p = packOn()) {
    if (!p || !rel) return "";
    const f = p.dir + String(rel).replace(/\//g, "\\");
    return utils.IsFile(f) || utils.IsDirectory(f) ? f : "";
}
// the folders that hold the packs' own case skins (lib/skins.js)
const packSkinRoots = () => listPacks().map(p => p.dir + "case\\").filter(d => utils.IsDirectory(d));

// ------------------------------------------------------------------------------------------- downloadable packs
// Packs are not part of the theme's own download: they come one by one, when the user asks (06 STYLE › PRESETS ›
// CHARACTER PACKS). Their list is theme/update/packs.json in the repository (GitHub, else jsDelivr), read when the
// PRESETS page shows, at most every 6 hours (kept in the settings, so the cards show offline too):
//   { "packs": [ { id, name, version, size, sha256, url, preview, about: { en, zh }, credits: { en, zh, links: [[label, url]] } } ] }
// A pack taken off the list is no longer offered (one already installed stays until removed). tools\pack.ps1 does the
// download, hidden: it checks the SHA-256 and puts the pack in place, writing how far it is to a status file that is
// read here twice a second while it runs. Preview pictures are kept in <profile>\audio-archive-cache\packs\.
const PACK_REPO = "ericzhang12111-cell/RhinE";
const PACK_CACHE = fb.ProfilePath + "audio-archive-cache\\packs\\";
const PACK_CAT = { list: null, asked: 0, dl: null, previews: new Map() };
try { const c = JSON.parse(getSetting("packCatalog", "null")); if (c && Array.isArray(c.packs)) PACK_CAT.list = c.packs; } catch (e) { PACK_CAT.list = null; }
function packEnv(name, def) {
    try { const v = new ActiveXObject("WScript.Shell").ExpandEnvironmentStrings(`%${name}%`); return v && v !== `%${name}%` ? v : def; } catch (e) { return def; }
}
const packOpenUrl = url => { if (/^https:\/\//.test(String(url))) try { new ActiveXObject("WScript.Shell").Run(url); } catch (e) { /* no browser */ } };
const packValid = k => k && typeof k === "object" && /^[a-z0-9][a-z0-9_-]{0,40}$/.test(k.id) && /^[0-9a-f]{64}$/i.test(k.sha256) && /^(https|file):\/\//.test(k.url);
// the list, asked for again when it is older than 6 hours (or `force`); done() when it is in
function packCatalog(force, done) {
    const now = Date.now();
    if (!force && now - PACK_CAT.asked < 6 * 3600 * 1000 && now - (+getSetting("packCatalogAt", 0) || 0) < 6 * 3600 * 1000) return;
    PACK_CAT.asked = now;
    const raw = packEnv("RHINE_RAW", "https://raw.githubusercontent.com"), cdn = packEnv("RHINE_CDN", "https://cdn.jsdelivr.net/gh");
    const urls = [`${raw}/${PACK_REPO}/main/theme/update/packs.json`, `${cdn}/${PACK_REPO}@latest/theme/update/packs.json`];
    const next = i => {
        if (i >= urls.length) { if (done) done(false); return; }
        let x;
        try { x = new ActiveXObject("MSXML2.XMLHTTP.6.0"); x.open("GET", urls[i], true); x.send(); } catch (e) { next(i + 1); return; }
        const t0 = Date.now();
        const poll = () => {
            let rs = 0;
            try { rs = x.readyState; } catch (e) { rs = 4; }
            if (rs !== 4) { if (Date.now() - t0 > 20000) { try { x.abort(); } catch (e) { /* gone */ } next(i + 1); } else window.SetTimeout(poll, 150); return; }
            let j = null;
            try { if (x.status === 200) j = JSON.parse(x.responseText); } catch (e) { j = null; }
            if (!j || !Array.isArray(j.packs)) { next(i + 1); return; }
            PACK_CAT.list = j.packs.filter(packValid);
            setSetting("packCatalog", JSON.stringify({ packs: PACK_CAT.list }), true);
            setSetting("packCatalogAt", Date.now(), true);
            if (done) done(true);
        };
        window.SetTimeout(poll, 150);
    };
    next(0);
}
// the list's packs, each with what is installed of it: { k: the list's entry, have: the installed pack or null, newer }
function packOffers() {
    return (PACK_CAT.list || []).filter(packValid).map(k => {
        const have = listPacks().find(p => p.id === k.id) || null;
        return { k, have, newer: !!have && cmpPackVersion(k.version, have.version) > 0 };
    });
}
function cmpPackVersion(a, b) {
    const pa = String(a || "0").split(".").map(n => +n || 0), pb = String(b || "0").split(".").map(n => +n || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
    return 0;
}
// a pack's text in the interface's language ({ en, zh } or a plain string)
const packText = v => !v ? "" : typeof v === "string" ? v : String((String(UI_LANG || "").startsWith("zh") && v.zh) || v.en || "");
const runPackPs = args => {
    const ps1 = THEME_ROOT + "tools\\pack.ps1";
    if (!utils.IsFile(ps1)) return false;
    try { new ActiveXObject("WScript.Shell").Run(`cmd /c set "PSModulePath=" && powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}" ${args}`, 0, false); return true; } catch (e) { return false; }
};
// a list entry's preview picture, downloaded once ("" until it is there; calls onReady when it arrives)
function packPreviewFile(k, onReady) {
    if (!k || !/^https?:\/\/|^file:\/\//.test(String(k.preview || ""))) return "";
    const f = `${PACK_CACHE}${k.id}-${String(k.version || "0").replace(/[^0-9a-z.]/gi, "")}.jpg`;
    if (utils.IsFile(f)) return f;
    if ((PACK_CAT.previews.get(f) || 0) <= Date.now()) {
        try { if (!utils.IsDirectory(PACK_CACHE)) utils.CreateFolder(PACK_CACHE); } catch (e) { /* made by the script */ }
        if (!runPackPs(`-Preview -Url "${k.preview}" -Out "${f}"`)) return "";
        PACK_CAT.previews.set(f, Infinity);
        const t0 = Date.now();
        const poll = () => {
            if (utils.IsFile(f)) { PACK_CAT.previews.delete(f); if (onReady) onReady(f); return; }
            if (Date.now() - t0 > 30000) { PACK_CAT.previews.set(f, Date.now() + 5 * 60 * 1000); return; }
            window.SetTimeout(poll, 400);
        };
        window.SetTimeout(poll, 400);
    }
    return "";
}
// download and install one; onChange() is called while it runs and when it ends ({ id, state, done, total, error })
function packDownload(k, onChange) {
    if (!packValid(k) || (PACK_CAT.dl && PACK_CAT.dl.state !== "done" && PACK_CAT.dl.state !== "error")) return false;
    const status = `${fb.ProfilePath}audio-archive-cache\\pack-${k.id}.json`, dest = (fb.ProfilePath + "audio-archive-packs").replace(/\\+$/, "");
    try { utils.WriteTextFile(status, JSON.stringify({ state: "start", done: 0, total: +k.size || 0 }), false); } catch (e) { /* the script writes it */ }
    const D = PACK_CAT.dl = { id: k.id, state: "start", done: 0, total: +k.size || 0, error: "", t0: Date.now() };
    if (!runPackPs(`-Id "${k.id}" -Url "${k.url}" -Sha256 "${k.sha256}" -Dest "${dest}" -Status "${status}"`)) {
        D.state = "error";
        D.error = "could not start the download helper";
        if (onChange) onChange(D);
        return false;
    }
    const poll = () => {
        if (PACK_CAT.dl !== D) return;
        let j = null;
        try { j = JSON.parse(utils.ReadTextFile(status, 65001)); } catch (e) { j = null; }
        if (j && typeof j.state === "string") { D.state = j.state; D.done = +j.done || 0; D.total = +j.total || D.total; D.error = String(j.error || ""); }
        // (the script never started, or died without a word: given up after a quiet minute)
        if (D.state === "start" && Date.now() - D.t0 > 60000) { D.state = "error"; D.error = "the download did not start"; }
        if (D.state === "done") listPacks(true);
        if (onChange) onChange(D);
        if (D.state !== "done" && D.state !== "error") window.SetTimeout(poll, 500);
    };
    window.SetTimeout(poll, 300);
    return true;
}
