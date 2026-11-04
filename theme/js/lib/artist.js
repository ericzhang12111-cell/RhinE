"use strict";
// Artist files (#25): who an artist is, from open sources, cached in the profile.
//   MusicBrainz   the artist (by the file's MUSICBRAINZ_ARTISTID tag, else by name), type, area, dates, genres,
//                 members and the Wikidata link
//   Wikidata      the Wikipedia article in each language (and a free Commons picture, the last resort)
//   Wikipedia     the biography, in the interface language when there is one (else English, else any)
//   ListenBrainz  related artists (listened to by the same people)
//   Deezer, NetEase Cloud Music   the artist's picture (searched at once, beside everything else), and NetEase's
//                 introduction when Wikipedia has nothing in Chinese or nothing at all
//   artist.txt / artist.jpg (or .png) beside the album's files replace the biography / the picture
// No keys or sign-ins. MusicBrainz asks for one request a second and a named client, so its requests go out one by
// one (the shown artist's first); the other services are asked at the same time.
// Needs lib/translate.js (trHttp) and lib/waveform.js (fnv).

const ART_DIR = fb.ProfilePath + "audio-archive-cache\\artists\\";
const ART_DAYS = 30, ART_MISS_DAYS = 7;   // a file is looked up again after 30 days; a failed lookup after 7
const ART_VER = 2;   // files from an older way of looking up (1: no Deezer / NetEase pictures) are looked up again
const ART_UA = { "User-Agent": "RhinE-AudioArchive/1.10 ( https://github.com/ericzhang12111-cell/RhinE )", Accept: "application/json" };
// the interface language's Wikipedia first (Chinese in the interface's own characters), then English, then the artist's own
const ART_WIKI = { "zh-CN": "zh", "zh-TW": "zh", ja: "ja", ko: "ko", fr: "fr", de: "de", en: "en" };
const ART_LANGS = [...new Set([ART_WIKI[UI_LANG] || "en", "en", "ja", "ko", "zh", "fr", "de"])];
// zh.wikipedia.org keeps one article per artist and renders it in either script, so the interface decides which
const ART_VARIANT = UI_LANG === "zh-TW" ? "zh-hant" : "zh-hans";
const ART = { mem: new Map(), mb: [], mbBusy: false, last: 0, listeners: [], pics: new Map(), asked: new Map() };   // asked: "key|lang(|script)" -> an article fetch
const TF_MBID = fb.TitleFormat("[%musicbrainz_artistid%]|[%musicbrainz artist id%]");

const artKey = name => fnv(String(name).trim().toLowerCase());
const artFile = name => ART_DIR + artKey(name) + ".json";
const artNameKey = s => String(s || "").toLowerCase().replace(/[\s.·・'’"“”!?,()（）\[\]【】「」\-_]/g, "");
// what belongs to this session only (artist.txt / artist.jpg beside the files are read again each time) is not saved
const ART_TRANSIENT = ["localDir", "localText", "localPic", "wikiAsked"];
function artSave(rec) {
    if (!utils.IsDirectory(ART_DIR)) utils.CreateFolder(ART_DIR);
    utils.WriteTextFile(artFile(rec.name), JSON.stringify(rec, (k, v) => ART_TRANSIENT.includes(k) ? undefined : v), false);
}
function artChanged(rec) { ART.mem.set(artKey(rec.name), rec); for (const f of ART.listeners) f(rec); }

// the artist's file, or a waiting one ({ state: "loading" }) while it is looked up; `handle` (any of the artist's
// tracks) gives the MusicBrainz id tag and the folder for artist.txt / artist.jpg. `prefetch`: looked up behind the
// shown artist (the neighbouring albums', so that browsing finds them ready)
function artistGet(name, handle, prefetch = false) {
    name = String(name || "").trim();
    if (!name || /^(various artists|unknown artist|va)$/i.test(name)) return null;
    const k = artKey(name);
    let rec = ART.mem.get(k);
    if (!rec && utils.IsFile(artFile(name))) {
        try { rec = JSON.parse(utils.ReadTextFile(artFile(name), 65001)); } catch (e) { rec = null; }
        if (rec) { for (const f of ART_TRANSIENT) delete rec[f]; ART.mem.set(k, rec); }   // (files from 1.10.0 kept them)
    }
    const age = rec ? Date.now() - (rec.t || 0) : Infinity;
    const stale = !rec || (rec.v || 1) < ART_VER || (rec.state === "none" ? age > ART_MISS_DAYS * 864e5 : age > ART_DAYS * 864e5);
    if (stale && !(rec && rec.state === "loading")) {
        const keep = rec && rec.state === "ok" ? rec : null;   // an old file stays on show while it is refreshed
        rec = keep || { name, state: "loading", log: [] };
        ART.mem.set(k, rec);
        artLookup(name, handle, keep, !prefetch);
    } else if (!prefetch && rec.state === "loading") artPromote(name);
    if (handle) artLocal(rec, handle);
    return rec;
}

// artist.txt / artist.jpg beside the files win over what was fetched (read each time: they may be edited)
function artLocal(rec, handle) {
    const dir = handle.Path.replace(/[^\\]*$/, "");
    if (rec.localDir === dir) return;
    rec.localDir = dir;
    rec.localText = utils.IsFile(dir + "artist.txt") ? utils.ReadTextFile(dir + "artist.txt", 65001).trim() : "";
    rec.localPic = ["artist.jpg", "artist.png", "artist.jpeg"].map(f => dir + f).find(f => utils.IsFile(f)) || "";
}

// a JSON request: done(data or null, status)
function artGet(url, done, headers = ART_UA) {
    trHttp("GET", url, "", headers, (st, txt) => {
        let d = null;
        if (st === 200) try { d = JSON.parse(txt); } catch (e) { d = null; }
        done(d, st);
    });
}
// MusicBrainz: at most one request a second, the shown artist's first; a throttled (503) or lost request is tried
// once more
function artMb(url, done, name, first) {
    const job = { url, done, name, tries: 0 };
    if (first) ART.mb.unshift(job); else ART.mb.push(job);
    artMbPump();
}
function artPromote(name) {
    const i = ART.mb.findIndex(j => j.name === name);
    if (i > 0) ART.mb.unshift(...ART.mb.splice(i, 1));
}
function artMbPump() {
    if (ART.mbBusy || !ART.mb.length) return;
    ART.mbBusy = true;
    window.SetTimeout(() => {
        const job = ART.mb.shift();
        ART.last = Date.now();
        artGet(job.url, (d, st) => {
            ART.mbBusy = false;
            if (!d && (st === 503 || st === 0) && job.tries++ < 1) { ART.mb.unshift(job); ART.last = Date.now() + 1000; artMbPump(); return; }
            try { job.done(d, st); } finally { artMbPump(); }
        });
    }, Math.max(0, ART.last + 1100 - Date.now()));
}

function artLookup(name, handle, keep, first) {
    const rec = { name, state: "loading", log: [], t: Date.now(), v: ART_VER };
    const show = keep || rec;
    const log = (what, how) => { show.log = (show.log || []).filter(l => l[0] !== what).concat([[what, how]]); artChanged(show); };
    // the lookups run side by side; the file is saved when the last one is back
    let pending = 0;
    const begin = () => { pending++; };
    const end = () => { if (--pending) return; artCommons(rec, log, () => finish()); };
    const finish = () => {
        rec.log = show.log; rec.t = Date.now();
        rec.state = rec.mbid || rec.pic || rec.neBio ? "ok" : "none";
        if (rec.state === "none" && keep) { keep.t = Date.now(); artSave(keep); artChanged(keep); return; }   // offline: keep the old file
        artSave(rec); artChanged(rec);
    };
    begin(); artFast(rec, name, log, end);
    begin();
    const tag = handle ? (TF_MBID.EvalWithMetadb(handle).split("|").find(v => v) || "").split(/[;/,\s]+/)[0] : "";
    const byId = (mbid, how) => artMb(`https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels+genres+artist-rels+aliases&fmt=json`, (d, st) => {
        if (!d) { log("MUSICBRAINZ", st ? "NOT FOUND" : "OFFLINE"); end(); return; }
        artFromMb(rec, d);
        log("MUSICBRAINZ", how);
        begin(); artRelated(rec, log, end);
        begin(); artWiki(rec, log, end);
        end();
    }, name, first);
    if (/^[0-9a-f-]{36}$/i.test(tag)) { byId(tag, "MATCHED · TAG"); return; }
    log("MUSICBRAINZ", "SEARCHING");
    // a sure match only: the same name or alias with a high score; by name first, then anywhere (aliases, sort names)
    const pick = d => ((d && d.artists) || []).find(a => a.score >= 90 && (artNameKey(a.name) === artNameKey(name) || (a.aliases || []).some(x => artNameKey(x.name) === artNameKey(name))));
    const search = (q, then) => artMb(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(q)}&limit=5&fmt=json`, then, name, first);
    search(`artist:"${name.replace(/"/g, "")}"`, (d, st) => {
        const hit = pick(d);
        if (hit) { byId(hit.id, "MATCHED · NAME"); return; }
        if (!d && !st) { log("MUSICBRAINZ", "OFFLINE"); end(); return; }
        search(name.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, " "), d2 => {
            const hit2 = pick(d2);
            if (hit2) byId(hit2.id, "MATCHED · ALIAS"); else { log("MUSICBRAINZ", "NO MATCH"); end(); }
        });
    });
}

// the picture from Deezer, else NetEase (both asked at once), and NetEase's introduction; `done` when all are back
function artFast(rec, name, log, done) {
    let n = 2, dz = "", ne = null;
    const back = () => {
        if (--n) return;
        const url = dz || (ne && ne.pic) || "";
        if (url) artDownloadPic(rec, url, dz ? "DEEZER" : "NETEASE");
        log("PICTURE", dz ? "DEEZER" : ne && ne.pic ? "NETEASE" : "NONE YET");
        if (!ne || !ne.id) { done(); return; }
        artGet(`https://music.163.com/api/v1/artist/${ne.id}`, d => {
            const t = d && d.artist && d.artist.briefDesc ? String(d.artist.briefDesc).replace(/\n{2,}/g, "\n").trim() : "";
            if (t) rec.neBio = { text: t, url: `https://music.163.com/#/artist?id=${ne.id}` };
            done();
        }, {});
    };
    artGet(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`, d => {
        const a = ((d && d.data) || []).find(x => artNameKey(x.name) === artNameKey(name));
        if (a && a.picture_xl && !/\/artist\/\//.test(a.picture_xl)) dz = a.picture_xl;   // an artist without a picture has an empty id in the path
        back();
    }, {});
    artGet(`https://music.163.com/api/cloudsearch/pc?type=100&limit=5&s=${encodeURIComponent(name)}`, d => {
        const a = (((d && d.result) || {}).artists || []).find(x => artNameKey(x.name) === artNameKey(name) || (x.alias || []).some(y => artNameKey(y) === artNameKey(name)));
        if (a) ne = { id: a.id, pic: a.img1v1Url && !/5639395138885805/.test(a.img1v1Url) ? a.img1v1Url + "?param=640y640" : "" };
        back();
    }, {});
}
function artDownloadPic(rec, url, source, extra = {}) {
    const out = ART_DIR + artKey(rec.name) + (/\.png(\?|$)/i.test(url) ? ".png" : ".jpg");
    rec.pic = Object.assign({ file: out, source, credit: "", licence: "" }, extra);
    if (!utils.IsDirectory(ART_DIR)) utils.CreateFolder(ART_DIR);
    ART.pics.delete(out);
    utils.DownloadFileAsync(url, out);   // arrives through artistDownloaded()
}

function artFromMb(rec, d) {
    const rels = d.relations || [];
    Object.assign(rec, {
        mbid: d.id, name: rec.name, mbName: d.name, type: d.type || "", country: d.country || "",
        area: (d["begin-area"] || d.area || {}).name || "", begin: (d["life-span"] || {}).begin || "", end: (d["life-span"] || {}).end || "",
        disambiguation: d.disambiguation || "",
        genres: (d.genres || []).sort((a, b) => b.count - a.count).slice(0, 4).map(g => g.name),
        members: rels.filter(r => r.type === "member of band" && r.direction === "backward" && !r.ended).map(r => ({ name: r.artist.name, role: (r.attributes || [])[0] || "" })).slice(0, 6),
        wikidata: ((rels.find(r => r.type === "wikidata") || {}).url || {}).resource || "",
    });
}

function artRelated(rec, log, next) {
    artGet(`https://labs.api.listenbrainz.org/similar-artists/json?artist_mbids=${rec.mbid}&algorithm=session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30`, d => {
        const list = Array.isArray(d) ? d : [];
        const top = list.length ? list[0].score || 1 : 1;
        rec.related = list.slice(0, 8).map(a => ({ name: a.name, mbid: a.artist_mbid, score: Math.round(100 * (a.score || 0) / top) / 100 }));
        log("LISTENBRAINZ", rec.related.length ? `${pad(rec.related.length, 2)} RELATED` : "NONE");
        next();
    });
}

function artWiki(rec, log, next) {
    const q = (/Q\d+$/.exec(rec.wikidata) || [])[0];
    if (!q) { log("WIKIPEDIA", "NO ARTICLE"); next(); return; }
    const sites = ART_LANGS.map(l => l + "wiki").join("|");
    artGet(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${q}&props=sitelinks|claims&sitefilter=${sites}&format=json`, d => {
        const e = d && d.entities && d.entities[q];
        if (!e) { log("WIKIDATA", "OFFLINE"); next(); return; }
        rec.wikiTitles = {};
        for (const l of ART_LANGS) if (e.sitelinks && e.sitelinks[l + "wiki"]) rec.wikiTitles[l] = e.sitelinks[l + "wiki"].title;
        const img = ((((e.claims || {}).P18 || [])[0] || {}).mainsnak || {}).datavalue;
        rec.commons = img ? img.value : "";   // used only when Deezer and NetEase have no picture (artCommons)
        // the biography in the first language that has an article (more are fetched when the language changes)
        const lang = ART_LANGS.find(l => rec.wikiTitles[l]);
        if (!lang) { log("WIKIPEDIA", "NO ARTICLE"); next(); return; }
        artWikiText(rec, lang, ok => { log("WIKIPEDIA", ok ? `${lang.toUpperCase()} · ${(rec.wiki[lang].text.length / 1024).toFixed(1)} KB` : "OFFLINE"); next(); });
    });
}

// a language's article lead (all its paragraphs, up to 2400 characters) into rec.wiki[lang], Chinese in the
// interface's characters; which script an article was kept in is remembered so the other one asks for it again
function artWikiText(rec, lang, done) {
    const title = rec.wikiTitles && rec.wikiTitles[lang];
    if (!title) { done(false); return; }
    artGet(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exsectionformat=plain&exchars=2400&redirects=1&format=json&titles=${encodeURIComponent(title)}${lang === "zh" ? `&variant=${ART_VARIANT}` : ""}`, d => {
        const p = d && d.query && d.query.pages && Object.values(d.query.pages)[0];
        const text = p && p.extract ? p.extract.replace(/\n{2,}/g, "\n").trim() : "";
        if (!text) { done(false); return; }
        rec.wiki = rec.wiki || {};
        rec.wiki[lang] = { title: p.title, text, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`, variant: lang === "zh" ? ART_VARIANT : "" };
        done(true);
    });
}

// the Commons picture, 640 px wide, with its author and licence (shown under it): when nothing else had one
function artCommons(rec, log, next) {
    if (rec.pic || !rec.commons) { next(); return; }
    artGet(`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent("File:" + rec.commons)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640&format=json`, d => {
        const p = d && d.query && d.query.pages, ii = p && (Object.values(p)[0].imageinfo || [])[0];
        if (ii && ii.thumburl) {
            const m = ii.extmetadata || {}, strip = s => String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
            artDownloadPic(rec, ii.thumburl, "COMMONS", { page: ii.descriptionurl || "", credit: strip((m.Artist || {}).value).slice(0, 60), licence: strip((m.LicenseShortName || {}).value) });
            log("PICTURE", "COMMONS");
        }
        next();
    });
}

// foobar2000's on_download_file_done, forwarded by the panel; true when it was one of ours
function artistDownloaded(path, ok) {
    if (!path || path.indexOf(ART_DIR) !== 0) return false;
    ART.pics.delete(path);
    for (const rec of ART.mem.values()) if (rec.pic && rec.pic.file === path) { if (!ok) rec.pic = null; artChanged(rec); }
    return true;
}

// the biography to show: artist.txt, else the interface language's article (fetched on first use, for instance after
// the language was changed: while it comes, the file says so rather than showing another language), else any
function artistBio(rec) {
    if (!rec) return null;
    if (rec.localText) return { text: rec.localText, source: "ARTIST.TXT", lang: "", url: "" };
    const w = rec.wiki || {}, want = ART_LANGS[0], ak = artKey(rec.name) + "|" + want + (want === "zh" ? "|" + ART_VARIANT : ""), asked = ART.asked.get(ak);
    // asked once per language and session; a fetch that failed is tried again two minutes later; an article kept in
    // the other script is not shown and asked for again (a record cached before the variant was remembered has none)
    const ready = w[want] && (want !== "zh" || (w[want].variant || "zh-hans") === ART_VARIANT);
    if (!ready && rec.wikiTitles && rec.wikiTitles[want] && !(asked && (asked.busy || Date.now() - asked.t < 120000))) {
        ART.asked.set(ak, { busy: true, t: Date.now() });
        artWikiText(rec, want, ok => {
            ART.asked.set(ak, { busy: false, t: Date.now() });
            if (ok) {   // the file's log names the article now shown
                rec.log = (rec.log || []).filter(l => l[0] !== "WIKIPEDIA").concat([["WIKIPEDIA", `${want.toUpperCase()} · ${(rec.wiki[want].text.length / 1024).toFixed(1)} KB`]]);
                artSave(rec);
            }
            artChanged(rec);
        });
    }
    // Chinese readers get NetEase's introduction before an article in another language; others get it last
    const ne = rec.neBio ? { text: rec.neBio.text, source: "NETEASE", lang: "zh", url: rec.neBio.url } : null;
    if (ready) return { text: w[want].text, source: "WIKIPEDIA", lang: want, url: w[want].url, licence: "CC BY-SA 4.0" };
    if (ART.asked.get(ak) && ART.asked.get(ak).busy) return { text: tr("Looking the artist up …"), source: "", lang: "", url: "" };
    if (want === "zh" && ne) return ne;
    const lang = ART_LANGS.find(l => w[l]);
    return lang ? { text: w[lang].text, source: "WIKIPEDIA", lang, url: w[lang].url, licence: "CC BY-SA 4.0" } : ne;
}

// the picture as a Direct2D image (artist.jpg first), or null
function artistPicture(rec) {
    const f = rec && (rec.localPic || (rec.pic && rec.pic.file));
    if (!f || !utils.IsFile(f)) return null;
    if (!ART.pics.has(f)) { let img = null; try { img = d2d.Image(f); } catch (e) { img = null; } ART.pics.set(f, img); }
    return ART.pics.get(f);
}

// a short number for the file (ARTIST NO. 0412), stable for the name
const artistNo = name => parseInt(artKey(name).slice(0, 6), 16) % 10000;
