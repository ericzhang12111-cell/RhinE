"use strict";
// Design tokens for the scripted panels (tokens/tokens.json): colours of the active scheme and mode as ARGB numbers, dp
// scaling, fonts and small shared helpers. Scheme and mode follow Columns UI's active colour set (a scheme is imported
// as Columns UI colours, View › Mode picks light or dark): every scheme's sets have their own background colour, so the
// panels find both from it and native and scripted parts always match. Include once per panel (lib/core.js does); call
// refreshTokens() from on_colours_changed.

const THEME_ROOT = fb.ProfilePath + "themes\\audio-archive\\";
const TOKENS = JSON.parse(utils.ReadTextFile(THEME_ROOT + "tokens\\tokens.json", 65001));
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

// Geist Mono is installed per user by install.ps1; loading the files privately as well keeps the panels correct if
// it was removed or the theme was copied by hand.
for (const w of ["Light", "Regular", "Medium", "SemiBold", "Bold"]) utils.LoadFont(THEME_ROOT + `assets\\fonts\\GeistMono-${w}.ttf`);

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

// Geist Mono has no CJK; those strings use the system's CJK UI font
const isCJK = s => /[⺀-鿿가-힯豈-﫿＀-￯]/.test(s);
const FONT_CACHE = new Map();
// font(13, 600) -> D2DFont of Geist Mono at 13 dp, weight 600 (static TTFs: the weight picks the family name)
function font(sizeDp, weight = 400, cjk = false) {
    const key = sizeDp + "/" + weight + (cjk ? "/cjk" : "");
    if (!FONT_CACHE.has(key)) {
        const family = cjk ? "Microsoft YaHei UI"
            : { 300: "Geist Mono Light", 400: "Geist Mono", 500: "Geist Mono Medium", 600: "Geist Mono SemiBold", 700: "Geist Mono" }[weight] || "Geist Mono";
        FONT_CACHE.set(key, d2d.Font(family, dp(sizeDp), weight >= 700 || (cjk && weight >= 600) ? 1 : 0));
    }
    return FONT_CACHE.get(key);
}
const fontFor = (str, sizeDp, weight) => font(sizeDp, weight, isCJK(str));

const DT_SINGLE = 0x00000800 | 0x00000020 | 0x00000004;    // DT_NOPREFIX | DT_SINGLELINE | DT_VCENTER
const DT_CENTER_SINGLE = DT_SINGLE | 0x00000001;
const DT_RIGHT_SINGLE = DT_SINGLE | 0x00000002;
const DT_ELLIPSIS = 0x00008000;
