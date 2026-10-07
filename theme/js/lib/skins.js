"use strict";
// Case skins: the specimen case's look. Each skin is one folder with its renders and case.json: built-in skins in
// the theme's assets\render\case\, hand-installed ones in
// <profile>\audio-archive-skins\. The folder name is the skin's id; case.json may give a display name (skin.name).
// The root panel keeps the chosen id in STATE.skin; panels that draw cases load it with lib/album.js (loadSkin).

const SKIN_ROOTS = [THEME_ROOT + "assets\\render\\case\\", fb.ProfilePath + "audio-archive-skins\\"];
const SKIN_DEFAULT = "white";

// [{ id, dir, name }] in folder order, built-in first; an id found twice is taken from the theme. Cached: `fresh`
// looks at the folders again (a skin installed by hand appears when the Style view opens or a skin menu is shown).
let SKIN_LIST = null;
function listSkins(fresh = false) {
    if (SKIN_LIST && !fresh) return SKIN_LIST;
    const out = [];
    for (const root of SKIN_ROOTS) {
        if (!utils.IsDirectory(root)) continue;
        for (const f of utils.Glob(root + "*\\case.json")) {
            const dir = f.slice(0, -"case.json".length), id = dir.slice(root.length, -1);
            if (!id || out.some(s => s.id === id)) continue;
            let name = id.toUpperCase();
            try { const m = JSON.parse(utils.ReadTextFile(f, 65001)); if (m.skin && m.skin.name) name = String(m.skin.name); } catch (e) { continue; }
            out.push({ id, dir, name });
        }
    }
    SKIN_LIST = out;
    return out;
}

// the skin to use for `id`: that one if it exists, else the default, else any
function findSkin(id) {
    let all = listSkins();
    if (!all.some(s => s.id === id)) all = listSkins(true);   // installed since the list was read
    return all.find(s => s.id === id) || all.find(s => s.id === SKIN_DEFAULT) || all[0] || null;
}

// appends a "Case skin" submenu to `menu` with item ids base, base + 1, …; returns the skins in that order
function appendSkinMenu(menu, base) {
    const all = listSkins(true), sub = window.CreatePopupMenu();
    all.forEach((s, i) => sub.AppendMenuItem(0, base + i, s.name));
    const cur = all.findIndex(s => s.id === STATE.skin);
    if (all.length) sub.CheckMenuRadioItem(base, base + all.length - 1, base + Math.max(0, cur));
    sub.AppendTo(menu, all.length ? 0 : 1, "Case skin");
    return all;
}
