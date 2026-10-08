"use strict";
// Interface language. Visible text goes through tr(): the English text is the key, the language's table (lib/lang/
// <code>.js, which fills I18N[<code>]) gives the translation, and anything missing stays English. {0}, {1} … in a
// string are filled from tr()'s other arguments. The language is "uiLang" in the settings (default: Windows' display
// language when there is a table for it); changing it reloads every panel (message "ui-lang", lib/bus.js).

const UI_LANGS = [["en", "English"], ["zh-CN", "简体中文"], ["ja", "日本語"]];
const I18N = {};

// Windows' display language: "zh-CN", "zh-TW", "ja", "ko", "de", "fr" or "en"
function systemLang() {
    let tag = "";
    try {
        const sh = new ActiveXObject("WScript.Shell");
        try { const v = sh.RegRead("HKCU\\Control Panel\\Desktop\\PreferredUILanguages"); tag = String(typeof v === "object" && v.toArray ? v.toArray()[0] : v).split(/[,\s]/)[0]; } catch (e) { /* not set */ }
        if (!tag) tag = String(sh.RegRead("HKCU\\Control Panel\\International\\LocaleName"));
    } catch (e) { /* no registry access */ }
    tag = tag.toLowerCase();
    if (/^zh-(tw|hk|mo|hant)/.test(tag)) return "zh-TW";
    if (tag.startsWith("zh")) return "zh-CN";
    const base = tag.split("-")[0];
    return ["ja", "ko", "de", "fr"].includes(base) ? base : "en";
}
const SYSTEM_LANG = systemLang();

const UI_LANG = (() => {
    const set = String(getSetting("uiLang", ""));
    if (UI_LANGS.some(l => l[0] === set)) return set;
    const sys = SYSTEM_LANG === "zh-TW" ? "zh-CN" : SYSTEM_LANG;   // no Traditional table yet: Simplified reads better than English
    return UI_LANGS.some(l => l[0] === sys) ? sys : "en";
})();
if (UI_LANG !== "en") {
    const f = fb.ProfilePath + `themes\\audio-archive\\js\\lib\\lang\\${UI_LANG}.js`;
    if (utils.IsFile(f)) include(f);
}

function tr(s, ...args) {
    const table = I18N[UI_LANG];
    let t = table && Object.prototype.hasOwnProperty.call(table, s) ? table[s] : s;
    if (args.length) t = t.replace(/\{(\d+)\}/g, (m, i) => args[i] === undefined ? m : String(args[i]));
    return t;
}
