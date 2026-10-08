"use strict";
// Lyrics translation. When a track's lyrics have one language and it is not the reader's, a translation is shown under
// each line, as a bilingual LRC would be (MENU › Audio Archive › Translate lyrics). Two sources, in this order:
//   community  NetEase Cloud Music (music.163.com): translations written and timed by its listeners, Chinese only. On by
//              default when Windows is in Chinese. The track's artist, title and length are sent to find the song; when
//              the track has no lyrics anywhere else, NetEase's own lyrics are used too.
//   machine    off by default: MyMemory (no key, a free daily quota), Baidu Translate (the user's APP ID and key;
//              reachable from mainland China) or DeepL (the user's key). Only the lyric lines are sent.
// Results are kept in <profile>\audio-archive-cache\lyrics\ (ne-*.json, tr-*.json), so a song is looked up once. Keys
// are kept in the theme's settings file only (lib/settings.js), on this computer.

const TR_TARGETS = [["zh-CN", "简体中文"], ["zh-TW", "繁體中文"], ["en", "English"], ["ja", "日本語"], ["ko", "한국어"],
                    ["de", "Deutsch"], ["fr", "Français"]];
const TR_PROVIDERS = [["mymemory", "MyMemory (free, no key)"], ["baidu", "Baidu Translate (your APP ID + key)"], ["deepl", "DeepL (your API key)"]];
const TR_DIR = fb.ProfilePath + "audio-archive-cache\\lyrics\\";
const TR = { state: "", gen: 0 };   // state of the current track's translation: "" | TRANSLATING | QUOTA | KEY | OFFLINE | FAILED
const TR_STATE_TEXT = { TRANSLATING: "TRANSLATING…", QUOTA: "TRANSLATION QUOTA USED UP", KEY: "TRANSLATION KEY MISSING OR WRONG",
                        OFFLINE: "TRANSLATION OFFLINE", FAILED: "TRANSLATION FAILED" };

// Windows' display language as one of TR_TARGETS' codes ("en" when it is none of them)
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

// target: a TR_TARGETS code or "off"; community: NetEase (lyrics and Chinese translations); machine: machine translation
function trSettings() {
    const target = getSetting("lyricsTarget", SYSTEM_LANG), provider = getSetting("trProvider", "mymemory");
    return { target: target === "off" || TR_TARGETS.some(t => t[0] === target) ? target : SYSTEM_LANG,
             community: !!getSetting("lyricsNetease", SYSTEM_LANG.startsWith("zh")),
             machine: !!getSetting("lyricsTranslate", false),
             provider: TR_PROVIDERS.some(p => p[0] === provider) ? provider : "mymemory" };
}

// ---------------------------------------------------------------------------------------------- language of the lines
const TR_WORDS = {
    en: "the and you i to my me is in of it that your we be for on all love me",
    de: "ich und die der nicht du das ist mein ein mich mir zu wir sie es auf",
    fr: "je et le la les tu pas de mon est un une que des moi toi on dans",
    es: "y el la que de no mi tu yo en me te los las es un una por",
};
// "ja" | "ko" | "zh" | "ru" | "en" | "de" | "fr" | "es"
function detectLang(texts) {
    let kana = 0, han = 0, hangul = 0, latin = 0, cyr = 0;
    for (const ch of texts.join(" ")) {
        const c = ch.codePointAt(0);
        if (c >= 0x3040 && c <= 0x30ff) kana++;
        else if (c >= 0x4e00 && c <= 0x9fff) han++;
        else if (c >= 0xac00 && c <= 0xd7af) hangul++;
        else if (c >= 0x400 && c <= 0x4ff) cyr++;
        else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 0xc0 && c <= 0x17f)) latin++;
    }
    const all = kana + han + hangul + cyr + latin || 1;
    if (kana / all > .04) return "ja";
    if (hangul / all > .2) return "ko";
    if (han / all > .3) return "zh";
    if (cyr / all > .3) return "ru";
    const words = texts.join(" ").toLowerCase().split(/[^a-zà-ÿœ']+/), score = {};
    for (const [l, list] of Object.entries(TR_WORDS)) { const set = new Set(list.split(" ")); score[l] = words.filter(w => set.has(w)).length; }
    return Object.keys(score).reduce((a, b) => score[b] > score[a] ? b : a, "en");
}
const sameLang = (src, target) => target.split("-")[0] === src;

// ---------------------------------------------------------------------------------------------------------- http
// asynchronous request through Windows' XMLHTTP, polled on a timer so the panel never waits; onDone(status, text)
function trHttp(method, url, body, headers, onDone) {
    let x;
    try { x = new ActiveXObject("MSXML2.XMLHTTP.6.0"); } catch (e) { onDone(0, ""); return; }
    try {
        x.open(method, url, true);
        for (const [k, v] of Object.entries(headers || {})) x.setRequestHeader(k, v);
        x.send(body || "");
    } catch (e) { onDone(0, ""); return; }
    const t0 = Date.now();
    const poll = () => {
        let rs = 0;
        try { rs = x.readyState; } catch (e) { rs = 4; }
        if (rs === 4) { let st = 0, txt = ""; try { st = x.status; txt = x.responseText; } catch (e) { /* none */ } onDone(st, txt); return; }
        if (Date.now() - t0 > 20000) { try { x.abort(); } catch (e) { /* gone */ } onDone(0, ""); return; }
        window.SetTimeout(poll, 80);
    };
    window.SetTimeout(poll, 80);
}
const formBody = o => Object.entries(o).map(([k, v]) => (Array.isArray(v) ? v : [v]).map(x => `${k}=${encodeURIComponent(x)}`).join("&")).join("&");
const utf8Len = s => unescape(encodeURIComponent(s)).length;

// MD5 of the UTF-8 bytes of a string, as hex (Baidu's request signature)
function md5(str) {
    const s = unescape(encodeURIComponent(str)), n = s.length, words = [];
    for (let i = 0; i < n; i++) words[i >> 2] |= s.charCodeAt(i) << ((i % 4) * 8);
    words[n >> 2] |= 0x80 << ((n % 4) * 8);
    const total = (((n + 8) >> 6) + 1) * 16;
    for (let i = 0; i < total; i++) words[i] = words[i] | 0;
    words[total - 2] = n * 8;
    const K = [], S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
                       4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
    for (let o = 0; o < total; o += 16) {
        let A = a0, B = b0, C = c0, D = d0;
        for (let i = 0; i < 64; i++) {
            let F, g;
            if (i < 16) { F = (B & C) | (~B & D); g = i; }
            else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
            else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
            else { F = C ^ (B | ~D); g = (7 * i) % 16; }
            const t = D; D = C; C = B;
            const x = (A + F + K[i] + words[o + g]) | 0;
            B = (B + ((x << S[i]) | (x >>> (32 - S[i])))) | 0;
            A = t;
        }
        a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    return [a0, b0, c0, d0].map(v => { let h = ""; for (let i = 0; i < 4; i++) h += ((v >>> (i * 8)) & 255).toString(16).padStart(2, "0"); return h; }).join("");
}

// ------------------------------------------------------------------------------------------------------ providers
// each: translate(texts, src, target, done) where done(list | null, error) and list has one translation per text
const TR_API = {
    mymemory: {
        maxBytes: 450,
        lang: l => ({ zh: "zh-CN", "zh-CN": "zh-CN", "zh-TW": "zh-TW" }[l] || l),
        run(texts, src, target, done) {
            const q = texts.join("\n");
            trHttp("GET", `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${this.lang(src)}|${this.lang(target)}`, "", null, (st, txt) => {
                if (!st) { done(null, "OFFLINE"); return; }
                let d = null; try { d = JSON.parse(txt); } catch (e) { /* not JSON */ }
                const out = d && d.responseData && d.responseData.translatedText;
                if (st === 429 || (d && d.quotaFinished) || /MYMEMORY WARNING/i.test(out || "")) { done(null, "QUOTA"); return; }
                if (!out || d.responseStatus !== 200 && d.responseStatus !== "200") { done(null, "FAILED"); return; }
                done(out.split(/\r?\n/), "");
            });
        },
    },
    baidu: {
        maxBytes: 5000,
        lang: l => ({ zh: "zh", "zh-CN": "zh", "zh-TW": "cht", ja: "jp", ko: "kor", fr: "fra", es: "spa", en: "en", de: "de", ru: "ru" }[l] || "auto"),
        run(texts, src, target, done) {
            const id = String(getSetting("trBaiduId", "")), key = String(getSetting("trBaiduKey", ""));
            if (!id || !key) { done(null, "KEY"); return; }
            const q = texts.join("\n"), salt = String(Date.now());
            const body = formBody({ q, from: this.lang(src), to: this.lang(target), appid: id, salt, sign: md5(id + q + salt + key) });
            trHttp("POST", "https://fanyi-api.baidu.com/api/trans/vip/translate", body, { "Content-Type": "application/x-www-form-urlencoded" }, (st, txt) => {
                if (!st) { done(null, "OFFLINE"); return; }
                let d = null; try { d = JSON.parse(txt); } catch (e) { /* not JSON */ }
                if (!d) { done(null, "FAILED"); return; }
                if (d.error_code) { const c = String(d.error_code); done(null, c === "52003" || c === "54001" ? "KEY" : c === "54004" || c === "54003" ? "QUOTA" : "FAILED"); return; }
                done((d.trans_result || []).map(r => r.dst), "");
            });
        },
    },
    deepl: {
        maxBytes: 20000,
        lang: l => ({ "zh-CN": "ZH-HANS", "zh-TW": "ZH-HANT", en: "EN-US" }[l] || l.toUpperCase()),
        run(texts, src, target, done) {
            const key = String(getSetting("trDeeplKey", ""));
            if (!key) { done(null, "KEY"); return; }
            const host = /:fx$/.test(key) ? "api-free.deepl.com" : "api.deepl.com";
            const body = formBody({ text: texts, target_lang: this.lang(target) });
            trHttp("POST", `https://${host}/v2/translate`, body, { "Content-Type": "application/x-www-form-urlencoded", Authorization: `DeepL-Auth-Key ${key}` }, (st, txt) => {
                if (!st) { done(null, "OFFLINE"); return; }
                if (st === 403) { done(null, "KEY"); return; }
                if (st === 456 || st === 429) { done(null, "QUOTA"); return; }
                let d = null; try { d = JSON.parse(txt); } catch (e) { /* not JSON */ }
                if (!d || !Array.isArray(d.translations)) { done(null, "FAILED"); return; }
                done(d.translations.map(t => t.text), "");
            });
        },
    },
};

// translates the texts in chunks one after another; done(list | null, error)
function trBatch(api, texts, src, target, done) {
    const chunks = [];
    let cur = [], bytes = 0;
    for (const t of texts) {
        const b = utf8Len(t) + 1;
        if (cur.length && bytes + b > api.maxBytes) { chunks.push(cur); cur = []; bytes = 0; }
        cur.push(t); bytes += b;
    }
    if (cur.length) chunks.push(cur);
    const out = [];
    const next = i => {
        if (i >= chunks.length) { done(out, ""); return; }
        const chunk = chunks[i];
        api.run(chunk, src, target, (list, err) => {
            if (!list) { done(null, err); return; }
            if (list.length === chunk.length) { out.push(...list); next(i + 1); return; }
            // the provider merged or split lines: translate this chunk one line at a time
            const one = [];
            const single = j => {
                if (j >= chunk.length) { out.push(...one); next(i + 1); return; }
                api.run([chunk[j]], src, target, (l, e) => { if (!l) { done(null, e); return; } one.push(l.join(" ")); single(j + 1); });
            };
            single(0);
        });
    };
    next(0);
}

// ------------------------------------------------------------------------------------------------------ community
// NetEase Cloud Music: search by title and artist, keep the songs whose length is within 4 s of the track's, and take
// the first one (exact title first) that has a translation, or failing that any lyrics. The result is cached as
// ne-<key>.json: { lrc, tlyric } or { none: time } (a miss is remembered for a week).
const NE_MISS_DAYS = 7;
const TF_NE = fb.TitleFormat("[%artist%]\u0001[%title%]");
// lines that are credits, not lyrics ("作词 : …", "Composer: …")
const NE_CREDIT = /^\s*(作词|作曲|编曲|制作人|制作|混音|母带|和声|吉他|贝斯|鼓|录音|监制|出品|词|曲|Lyricist|Lyrics|Composer|Arranger|Producer|Mixing|Mastering|Written by)\s*[:：]/i;

function neteaseFetch(handle, done) {
    const [artist, title] = TF_NE.EvalWithMetadb(handle).split("\u0001").map(v => v.trim());
    const len = handle.Length;
    if (!title || !(len > 0)) { done(null); return; }
    const file = TR_DIR + `ne-${fnv(`${artist}|${title}|${Math.round(len)}`)}.json`;
    if (utils.IsFile(file)) {
        try {
            const c = JSON.parse(utils.ReadTextFile(file, 65001));
            if (!c.none) { done(c); return; }
            if (Date.now() - c.none < NE_MISS_DAYS * 864e5) { done(null); return; }
        } catch (e) { /* look up again */ }
    }
    const save = c => { if (!utils.IsDirectory(TR_DIR)) utils.CreateFolder(TR_DIR); utils.WriteTextFile(file, JSON.stringify(c), false); };
    const norm = s => String(s || "").toLowerCase().replace(/[\s\-–—_'’"“”.,!?()（）\[\]【】「」~·・]/g, "");
    trHttp("GET", `https://music.163.com/api/cloudsearch/pc?type=1&limit=10&s=${encodeURIComponent(`${title} ${artist}`)}`, "", null, (st, txt) => {
        if (!st) { done(null, "OFFLINE"); return; }
        let songs = [];
        try { songs = (JSON.parse(txt).result || {}).songs || []; } catch (e) { songs = []; }
        const cands = songs.filter(s => Math.abs((s.dt || 0) / 1000 - len) <= 4)
            .sort((a, b) => (norm(b.name) === norm(title)) - (norm(a.name) === norm(title)) || Math.abs(a.dt / 1000 - len) - Math.abs(b.dt / 1000 - len))
            .slice(0, 3);
        let fallback = null;
        const next = i => {
            if (i >= cands.length) { const c = fallback || { none: Date.now() }; save(c); done(c.none ? null : c); return; }
            trHttp("GET", `https://music.163.com/api/song/lyric?id=${cands[i].id}&lv=1&tv=-1`, "", null, (st2, txt2) => {
                let d = null;
                try { d = JSON.parse(txt2); } catch (e) { d = null; }
                const lrc = d && d.lrc && d.lrc.lyric || "", tlyric = d && d.tlyric && d.tlyric.lyric || "";
                if (lrc && tlyric) { const c = { lrc, tlyric, id: cands[i].id }; save(c); done(c); return; }
                if (lrc && !fallback) fallback = { lrc, tlyric: "", id: cands[i].id };
                next(i + 1);
            });
        };
        next(0);
    });
}

// NetEase's lyrics as lines: { t, a, b } with b the translation (when `withTr`), credits dropped
function neteaseLines(c, withTr) {
    const orig = (parseLrc(c.lrc) || []).filter(l => !NE_CREDIT.test(l.a));
    if (!withTr || !c.tlyric) return orig.map(l => ({ t: l.t, a: l.a, b: "" }));
    const tr = new Map((parseLrc(c.tlyric) || []).map(l => [Math.round(l.t * 10), l.a]));
    const useful = s => s && !/^[\s/\\\-–—.。…·]*$/.test(s);
    return orig.map(l => { const b = tr.get(Math.round(l.t * 10)); return { t: l.t, a: l.a, b: useful(b) ? b : "" }; });
}

// the community translation laid onto lyrics L from elsewhere (an .lrc, a tag, LRCLIB): lines are matched by their text,
// so a different timing does not matter. Returns the number of lines that got one.
function applyCommunity(L, c) {
    const key = s => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    const map = new Map();
    for (const l of neteaseLines(c, true)) if (l.b && key(l.a)) map.set(key(l.a), l.b);
    let n = 0;
    for (const l of L.lines) { const b = map.get(key(l.a)); if (b && !l.b) { l.b = b; n++; } }
    return n;
}

// lyrics from NetEase for a track that has none elsewhere (with its translation when the reader wants Chinese)
function neteaseLyrics(handle, onFound) {
    const S = trSettings();
    if (!S.community || !STATE.lyricsOnline) return;
    neteaseFetch(handle, c => {
        if (!c) return;
        const zh = S.target !== "off" && S.target.startsWith("zh");
        const lines = neteaseLines(c, zh);
        if (!lines.length) return;
        const two = lines.some(l => l.b);
        onFound({ lines, source: "NETEASE", langs: two ? 2 : 1, translated: two ? "netease" : "" });
    });
}

// ---------------------------------------------------------------------------------------------------------- entry
// Adds translations (line.b) to single-language lyrics L of `handle`: the community translation when the reader wants
// Chinese, else (or when there is none) machine translation if it is on. onUpdate() runs when they arrive or the state
// changes. Lyrics with two languages already, or in the reader's language, are left as they are.
function translateLyrics(handle, L, onUpdate) {
    const gen = ++TR.gen;
    TR.state = "";
    const S = trSettings();
    if (S.target === "off" || !L || L.langs > 1 || !handle) return;
    const texts = [...new Set(L.lines.map(l => l.a).filter(a => a && /\S/.test(a)))];
    if (!texts.length) return;
    const src = detectLang(texts);
    if (sameLang(src, S.target)) return;
    const machine = () => {
        if (!S.machine) { if (TR.state) { TR.state = ""; onUpdate(); } return; }
        machineTranslate(L, texts, src, S, gen, onUpdate);
    };
    if (S.community && S.target.startsWith("zh") && L.source !== "NETEASE") {
        TR.state = "TRANSLATING";
        onUpdate();
        neteaseFetch(handle, c => {
            if (gen !== TR.gen) return;   // another track started
            // at least a third of the lines matched: the same song
            if (c && c.tlyric && applyCommunity(L, c) >= Math.max(1, L.lines.length / 3)) {
                L.langs = 2; L.translated = "netease"; TR.state = ""; onUpdate(); return;
            }
            for (const l of L.lines) l.b = "";   // a partial match is dropped
            machine();
        });
        return;
    }
    machine();
}

function machineTranslate(L, texts, src, S, gen, onUpdate) {
    const apply = map => {
        let n = 0;
        for (const l of L.lines) if (l.a && map[l.a] && map[l.a] !== l.a) { l.b = map[l.a]; n++; }
        if (n) { L.langs = 2; L.translated = S.provider; }
    };
    const file = TR_DIR + `tr-${fnv(texts.join("\n"))}-${S.target}-${S.provider}.json`;
    if (utils.IsFile(file)) {
        try { apply(JSON.parse(utils.ReadTextFile(file, 65001))); TR.state = ""; onUpdate(); return; } catch (e) { /* translate again */ }
    }
    TR.state = "TRANSLATING";
    onUpdate();
    trBatch(TR_API[S.provider], texts, src, S.target, (list, err) => {
        if (gen !== TR.gen) return;   // another track started
        if (!list) { TR.state = err || "FAILED"; onUpdate(); return; }
        const map = {};
        texts.forEach((t, i) => { if (list[i] && list[i].trim()) map[t] = list[i].trim(); });
        if (!utils.IsDirectory(TR_DIR)) utils.CreateFolder(TR_DIR);
        utils.WriteTextFile(file, JSON.stringify(map), false);
        TR.state = "";
        apply(map);
        onUpdate();
    });
}
