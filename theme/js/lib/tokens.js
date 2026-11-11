"use strict";
// Design tokens for the scripted panels (tokens/tokens.json): colours of the active scheme and mode as ARGB numbers, dp
// scaling, fonts and small shared helpers. Scheme and mode follow Columns UI's active colour set (a scheme is imported
// as Columns UI colours, View › Mode picks light or dark): every scheme's sets have their own background colour, so the
// panels find both from it and native and scripted parts always match. Include once per panel (lib/core.js does); call
// refreshTokens() from on_colours_changed.

const THEME_ROOT = fb.ProfilePath + "themes\\audio-archive\\";
const TOKENS = JSON.parse(utils.ReadTextFile(THEME_ROOT + "tokens\\tokens.json", 65001));
TOKENS.schemes.custom = customScheme(TOKENS);   // the user's own (lib/custom.js)
const SCALE = window.DPI / 96;
const dp = v => Math.round(v * SCALE);
const HAIR = Math.max(1, Math.floor(SCALE));     // 1 dp hairline in whole device pixels
const HEAVY = Math.round(2 * SCALE);             // 2 dp heavy rule
const argb = (hex, alpha = 1) => ((Math.round(alpha * 255) << 24) | parseInt(hex.slice(1), 16)) >>> 0;

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pad = (n, w) => String(n).padStart(w, "0");
// 03:07 (or 1:02:11 past an hour)
function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
    return h ? `${h}:${pad(m, 2)}:${pad(x, 2)}` : `${pad(m, 2)}:${pad(x, 2)}`;
}
const fmtCount = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
// mix two ARGB colours (alpha of a)
function mix(a, b, t) {
    const ch = (c, s) => (c >>> s) & 255, m = s => Math.round(lerp(ch(a, s), ch(b, s), t));
    return ((a & 0xFF000000) | (m(16) << 16) | (m(8) << 8) | m(0)) >>> 0;
}
const withAlpha = (c, alpha) => (((Math.round(alpha * 255) & 255) << 24) | (c & 0xFFFFFF)) >>> 0;

// The interface font (05 STYLE › FONT): Geist Mono, Oxanium or Chakra Petch (all SIL OFL, in assets/fonts). Static
// TTFs, so each weight is its own family name (700 is the regular family with the bold flag). Geist Mono is installed
// per user by install.ps1; loading every file privately as well keeps the panels correct if it was removed or the theme
// was copied by hand. A family whose files are missing falls back to Geist Mono.
const FONT_FAMILIES = {
    geist: { file: "GeistMono", name: "Geist Mono" },
    oxanium: { file: "Oxanium", name: "Oxanium" },
    chakra: { file: "ChakraPetch", name: "Chakra Petch" },
};
for (const [id, F] of Object.entries(FONT_FAMILIES)) {
    F.ok = id === "geist" || utils.IsFile(THEME_ROOT + `assets\\fonts\\${F.file}-Regular.ttf`);
    if (F.ok) for (const w of ["Light", "Regular", "Medium", "SemiBold", "Bold"]) utils.LoadFont(THEME_ROOT + `assets\\fonts\\${F.file}-${w}.ttf`);
}
// each panel reads the setting itself, so it starts in the right font before the root panel's first state message
let FONT_FAMILY = (id => FONT_FAMILIES[id] && FONT_FAMILIES[id].ok ? id : "geist")(getSetting("font", "geist"));

let MODE = "dark", SCHEME = "archive";
const C = {};                 // token name -> ARGB of the active scheme and mode, e.g. C.bg, C["text-muted"]
const TOKEN_LISTENERS = [];   // called after the colours change (caches keyed by colour drop their entries)

function refreshTokens() {
    const bg = window.GetColourCUI(3) & 0xFFFFFF;   // ColourTypeCUI.background of the active colour set
    const r = (bg >>> 16) & 255, g = (bg >>> 8) & 255, b = bg & 255;
    MODE = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? "dark" : "light";
    SCHEME = "archive";
    for (const [id, s] of Object.entries(TOKENS.schemes))
        for (const m of ["light", "dark"]) if (parseInt(s[m].bg.slice(1), 16) === bg) { SCHEME = id; MODE = m; }
    for (const [k, v] of Object.entries(TOKENS.schemes[SCHEME][MODE])) C[k] = argb(v);
    TOKEN_LISTENERS.forEach(f => f());
}
refreshTokens();

// none of the interface fonts has CJK; those strings use the system's CJK UI font (Korean: Malgun Gothic, since the
// Chinese UI font has no Hangul)
const isHangul = s => /[가-힯ᄀ-ᇿ㄰-㆏]/.test(s);
const isCJK = s => /[⺀-鿿가-힯豈-﫿＀-￯]/.test(s);
const FONT_CACHE = new Map();
// CJK beside the interface font: the square glyphs fill their em, so at the same size they read larger than the Latin
// capitals next to them. They are set a little smaller (and tracked half as much, lib/text.js).
const CJK_SCALE = .94;
// Text size (MENU › Audio Archive › Text size, or the Style view): every font of the scripted panels is scaled by it,
// the boxes around the text stay as designed. setTextScale() returns true when it changed (the caller then drops caches
// that hold drawn text and repaints).
let TEXT_SCALE = 1;
function setTextScale(s) {
    s = clamp(+s || 1, .8, 1.5);
    if (s === TEXT_SCALE) return false;
    TEXT_SCALE = s;
    FONT_CACHE.clear();
    return true;
}
// a new interface font: true when it changed (the caller then drops the caches that hold drawn text, as for the text size)
function setFontFamily(id) {
    id = FONT_FAMILIES[id] && FONT_FAMILIES[id].ok ? id : "geist";
    if (id === FONT_FAMILY) return false;
    FONT_FAMILY = id;
    FONT_CACHE.clear();
    if (typeof TEXT_CACHE !== "undefined") { TEXT_CACHE.clear(); GLYPH_RUNS.clear(); RUNS.clear(); }
    return true;
}
// font(13, 600) -> D2DFont of the interface font at 13 dp (× the text size), weight 600 (static TTFs: the weight picks
// the family)
// (cjk: true for the CJK UI font, "ko" for the Korean one)
function font(sizeDp, weight = 400, cjk = false) {
    const key = sizeDp + "/" + weight + (cjk ? "/" + cjk : "");
    if (!FONT_CACHE.has(key)) {
        const n = FONT_FAMILIES[FONT_FAMILY].name;
        const family = cjk === "ko" ? "Malgun Gothic" : cjk ? "Microsoft YaHei UI" : { 300: n + " Light", 400: n, 500: n + " Medium", 600: n + " SemiBold", 700: n }[weight] || n;
        // Direct2D refuses a size under 1 px (a tag or a card squeezed to nothing while the window is resized)
        const px = dp(sizeDp * TEXT_SCALE * (cjk ? CJK_SCALE : 1));
        FONT_CACHE.set(key, d2d.Font(family, px >= 1 ? px : 1, weight >= 700 || (cjk && weight >= 600) ? 1 : 0));
    }
    return FONT_CACHE.get(key);
}
const fontFor = (str, sizeDp, weight) => font(sizeDp, weight, isHangul(str) ? "ko" : isCJK(str));

const DT_SINGLE = 0x00000800 | 0x00000020 | 0x00000004;    // DT_NOPREFIX | DT_SINGLELINE | DT_VCENTER
const DT_CENTER_SINGLE = DT_SINGLE | 0x00000001;
const DT_RIGHT_SINGLE = DT_SINGLE | 0x00000002;
const DT_ELLIPSIS = 0x00008000;
