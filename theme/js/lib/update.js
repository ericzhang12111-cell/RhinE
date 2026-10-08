"use strict";
// Updates. The latest release's version is read from the repository (theme/update/latest.json: from GitHub, else
// through jsDelivr), at most once a day unless asked (MENU › Audio Archive › Check for updates), and an UPDATE chip in
// the bottom bar (transport.js) appears when it is newer than the installed theme (THEME_ROOT\VERSION). Its menu
// starts tools\update.ps1, which downloads what changed, checks it, closes foobar2000, installs and starts it again.

const UPD_REPO = "ericzhang12111-cell/RhinE";
const UPD_DAY = 20 * 3600 * 1000;   // a check a day at most, a little under, so the same start time each day checks
const UPD = { latest: null, available: false };   // latest: { version, tag, date, notes: { en: [], zh: [] } }

function themeVersion() {
    try { return String(utils.ReadTextFile(THEME_ROOT + "VERSION", 65001)).trim(); } catch (e) { return ""; }
}
// 1 when a is newer than b, -1 when older, 0 when the same
function cmpVersion(a, b) {
    const pa = String(a).split(".").map(n => +n || 0), pb = String(b).split(".").map(n => +n || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
    return 0;
}
// a test can point the theme and the updater at another server (RHINE_RAW, RHINE_CDN)
function updEnv(name, def) {
    try { const v = new ActiveXObject("WScript.Shell").ExpandEnvironmentStrings(`%${name}%`); return v && v !== `%${name}%` ? v : def; } catch (e) { return def; }
}
function updGet(url, onDone) {
    let x;
    try { x = new ActiveXObject("MSXML2.XMLHTTP.6.0"); x.open("GET", url, true); x.send(); } catch (e) { onDone(0, ""); return; }
    const t0 = Date.now();
    const poll = () => {
        let rs = 0;
        try { rs = x.readyState; } catch (e) { rs = 4; }
        if (rs === 4) { let st = 0, txt = ""; try { st = x.status; txt = x.responseText; } catch (e) { /* none */ } onDone(st, txt); return; }
        if (Date.now() - t0 > 20000) { try { x.abort(); } catch (e) { /* gone */ } onDone(0, ""); return; }
        window.SetTimeout(poll, 100);
    };
    window.SetTimeout(poll, 100);
}
// done(latest or null when neither source answered)
function checkUpdate(done) {
    const raw = updEnv("RHINE_RAW", "https://raw.githubusercontent.com"), cdn = updEnv("RHINE_CDN", "https://cdn.jsdelivr.net/gh");
    const urls = [`${raw}/${UPD_REPO}/main/theme/update/latest.json`, `${cdn}/${UPD_REPO}@main/theme/update/latest.json`];
    const next = i => {
        if (i >= urls.length) { done(null); return; }
        updGet(urls[i], (st, txt) => {
            let j = null;
            if (st === 200) try { j = JSON.parse(txt); } catch (e) { j = null; }
            if (j && j.version && j.tag) {
                UPD.latest = j;
                setSetting("updateLatest", JSON.stringify(j), true);
                setSetting("updateChecked", Date.now(), true);
                refreshUpdate();
                done(j);
            } else next(i + 1);
        });
    };
    next(0);
}
try { UPD.latest = JSON.parse(getSetting("updateLatest", "null")); } catch (e) { UPD.latest = null; }
refreshUpdate();
const updateDue = () => getSetting("updateCheck", true) !== false && Date.now() - (+getSetting("updateChecked", 0) || 0) > UPD_DAY;
// whether the chip shows: worked out when something changes, not on every paint (settings are read from a file)
function refreshUpdate() {
    UPD.available = !!(UPD.latest && cmpVersion(UPD.latest.version, themeVersion()) > 0 && getSetting("updateSkip", "") !== UPD.latest.version);
    return UPD.available;
}
const releasePage = tag => `https://github.com/${UPD_REPO}/releases${tag ? "/tag/" + tag : ""}`;
function openUrl(url) { try { new ActiveXObject("WScript.Shell").Run(url); } catch (e) { /* no browser */ } }

// the updater runs in a console window of its own (it shows what it does, and foobar2000 closes during it)
function runUpdater() {
    const ps1 = THEME_ROOT + "tools\\update.ps1";
    if (!utils.IsFile(ps1)) { openUrl(releasePage(UPD.latest && UPD.latest.tag)); return; }
    const fbDir = fb.FoobarPath.replace(/\\+$/, "");
    try {
        new ActiveXObject("WScript.Shell").Run(`cmd /c set "PSModulePath=" && powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}" -Foobar "${fbDir}" -Yes`, 1, false);
    } catch (e) { openUrl(releasePage(UPD.latest && UPD.latest.tag)); }
}

// the chip's menu: what is new (the release's own lines), update now, the release page, skip, daily checks
function updateMenu(x, y) {
    const L = UPD.latest;
    if (!L) return;
    const m = window.CreatePopupMenu();
    const notes = (UI_LANG.startsWith("zh") && L.notes && L.notes.zh) || (L.notes && L.notes.en) || [];
    m.AppendMenuItem(0x1, 90, `RhinE ${themeVersion()}  →  ${L.version}`);
    notes.slice(0, 8).forEach((n, i) => m.AppendMenuItem(0x1, 91 + i, "·  " + String(n).replace(/&/g, "&&")));
    m.AppendMenuSeparator();
    m.AppendMenuItem(0, 1, tr("Update to {0} now (foobar2000 restarts)", L.version));
    m.AppendMenuItem(0, 2, tr("What's new in {0}…", L.version));
    m.AppendMenuItem(0, 3, tr("Skip this version"));
    m.AppendMenuSeparator();
    m.AppendMenuItem(getSetting("updateCheck", true) !== false ? 0x8 : 0, 4, tr("Check for updates daily"));
    const id = m.TrackPopupMenu(x, y, 0);
    if (id === 1) runUpdater();
    else if (id === 2) openUrl(releasePage(L.tag));
    else if (id === 3) { setSetting("updateSkip", L.version, true); send("update-state"); refreshUpdate(); window.Repaint(); }
    else if (id === 4) setSetting("updateCheck", getSetting("updateCheck", true) === false, true);
}
