"use strict";
// Problem reports and the error log (MENU › Audio Archive › Report a problem, and the header's ERROR · REPORT plate).
//   errors   every scripted panel's callbacks (on_paint, on_mouse_*, …) and its timers are wrapped: an error is thrown
//            on as before (foobar2000's console shows it) and also written to <profile>\audio-archive-cache\errors.log
//            (one JSON line each, the last 40), with the user's own folders taken out. The header then shows a green
//            ERROR · REPORT plate (header.js) until its menu is opened.
//   report   what a bug report needs: the versions of the theme, foobar2000, Columns UI, JSplitter and Windows, the look
//            and view in use, the library's size and the recent errors. No file names, folders, tracks or accounts.
//   sending  nothing is sent by the theme: the report opens as a new GitHub issue in the browser (prefilled, the user
//            reads and submits it there) or is copied to the clipboard (for a comment or a message elsewhere).

const ERR_DIR = fb.ProfilePath + "audio-archive-cache\\";
const ERR_LOG = ERR_DIR + "errors.log";
const ERR_KEEP = 40;
const ERR_SEEN = new Set();             // this panel's errors this session: each is logged once
const REPORT_REPO = "ericzhang12111-cell/RhinE";

// the user's folders out of a message or a stack: the theme's own files keep their path inside the theme, any other
// path becomes <path>
function scrubPaths(s) {
    return String(s).replace(/(?:[A-Za-z]:|\\\\[^\\\s]+)\\[^\s"'<>|*?\r\n()]*/g, p => {
        const i = p.toLowerCase().indexOf("\\themes\\audio-archive\\");
        return i >= 0 ? p.slice(i + 1) : "<path>";
    });
}

function readErrors() {
    try {
        if (!utils.IsFile(ERR_LOG)) return [];
        return String(utils.ReadTextFile(ERR_LOG, 65001)).split(/\r?\n/).filter(Boolean)
            .map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    } catch (e) { return []; }
}

function logError(where, e) {
    const msg = scrubPaths((e && e.message) || e).slice(0, 300);
    const key = where + "|" + msg;
    if (ERR_SEEN.has(key)) return;
    ERR_SEEN.add(key);
    // the stack's own frames ("name@file:line:col"; files a panel includes have no name there), not the wrapper's
    const stack = scrubPaths((e && e.stack) || "").split(/\r?\n/).map(s => s.trim()).filter(s => s && !/^guard\b/.test(s)).slice(0, 5).join(" · ");
    let ver = "";
    try { ver = String(utils.ReadTextFile(fb.ProfilePath + "themes\\audio-archive\\VERSION", 65001)).trim(); } catch (x) { /* no file */ }
    const line = JSON.stringify({ t: new Date().toISOString(), v: ver, at: where, msg, stack });
    try {
        if (!utils.IsDirectory(ERR_DIR)) utils.CreateFolder(ERR_DIR);
        const old = utils.IsFile(ERR_LOG) ? String(utils.ReadTextFile(ERR_LOG, 65001)).split(/\r?\n/).filter(Boolean) : [];
        utils.WriteTextFile(ERR_LOG, old.concat(line).slice(-ERR_KEEP).join("\r\n") + "\r\n", false);
        setSetting("errorLast", Date.now(), true);
    } catch (x) { /* the log is a help, never a second error */ }
    try { send("error-logged"); if (typeof onErrorLogged === "function") onErrorLogged(); } catch (x) { /* (as above) */ }
}

function clearErrors() {
    try { if (utils.IsFile(ERR_LOG)) utils.WriteTextFile(ERR_LOG, "", false); } catch (e) { /* (as above) */ }
    setSetting("errorSeen", Date.now(), true);
    send("error-logged");
}
// whether the chip shows: an error logged after the report menu was last opened (read on a change, not on paint)
function errorPending() { return (+getSetting("errorLast", 0) || 0) > (+getSetting("errorSeen", 0) || 0); }

// the wrapping: timers now (before the panel's own script makes any), callbacks once the whole script has loaded
const guard = (where, f) => function () {
    try { return f.apply(this, arguments); } catch (e) { logError(where, e); throw e; }
};
for (const k of ["SetTimeout", "SetInterval"]) {
    const orig = window[k];
    try { window[k] = function (f, ms) { return orig.call(window, typeof f === "function" ? guard(k, f) : f, ms); }; } catch (e) { /* left as it is */ }
}
window.SetTimeout(() => {
    for (const k of Object.getOwnPropertyNames(globalThis)) {
        const f = globalThis[k];
        if (!k.startsWith("on_") || typeof f !== "function" || f.guarded) continue;
        const g = guard(k, f);
        g.guarded = true;
        try { globalThis[k] = g; } catch (e) { /* left as it is */ }
    }
}, 0);

// ------------------------------------------------------------------------------------------------- the report
function regRead(key) { try { return String(new ActiveXObject("WScript.Shell").RegRead(key)); } catch (e) { return ""; } }
function fileVersion(paths) {
    try {
        const fso = new ActiveXObject("Scripting.FileSystemObject");
        for (const p of paths) if (fso.FileExists(p)) return fso.GetFileVersion(p) || "?";
    } catch (e) { /* no FSO */ }
    return "";
}
// a component's DLL version: installed for this profile (x64 or x86 folder) or with foobar2000
function componentVersion(name) {
    const P = fb.ProfilePath, F = fb.FoobarPath;
    return fileVersion([`${P}user-components-x64\\${name}\\${name}.dll`, `${P}user-components\\${name}\\${name}.dll`, `${F}components\\${name}.dll`]);
}
function processArch() {
    try { return /64/.test(new ActiveXObject("WScript.Shell").ExpandEnvironmentStrings("%PROCESSOR_ARCHITECTURE%")) ? "x64" : "x86"; } catch (e) { return "?"; }
}
function windowsVersion() {
    const k = "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\";
    const build = +regRead(k + "CurrentBuildNumber") || 0;
    const name = build >= 22000 ? "Windows 11" : build ? "Windows 10" : "Windows";
    return [name, regRead(k + "DisplayVersion"), build ? `build ${build}.${regRead(k + "UBR") || 0}` : ""].filter(Boolean).join(" ");
}

function reportLines() {
    const s = readSettings();
    const v = k => (s[k] === undefined || s[k] === null || s[k] === "") ? "–" : String(s[k]);
    let ver = "", files = "?";
    try { ver = String(utils.ReadTextFile(fb.ProfilePath + "themes\\audio-archive\\VERSION", 65001)).trim(); } catch (e) { /* no file */ }
    try { files = String(fb.GetLibraryItems().Count); } catch (e) { /* no library */ }
    // Columns UI's DLL carries no version resource: then whether it is there at all
    let cui = componentVersion("foo_ui_columns"), jsp = componentVersion("foo_uie_jsplitter");
    if (!cui || cui === "?") { try { cui = utils.CheckComponent("foo_ui_columns", true) ? "(installed)" : "(missing)"; } catch (e) { cui = "?"; } }
    const lines = [
        `RhinE ${ver || "?"}`,
        `foobar2000 ${fb.Version} ${processArch()} · ${utils.IsFile(fb.FoobarPath + "portable_mode_enabled") ? "portable" : "standard"}`,
        `Columns UI ${cui} · JSplitter ${String(utils.Version || jsp || "?")}`,
        `${windowsVersion()} · scale ${Math.round(SCALE * 100)} %`,
        `language ${UI_LANG} · view ${v("view")} · layout ${v("archiveLayout")} · room ${v("roomMat")}`,
        `scheme ${v("scheme")} ${v("mode")} · case ${v("caseSkin")} · tag ${v("tag")} ${v("tagShape")} · text ${Math.round((+s.textScale || 1) * 100)} %`,
        `mini player ${v("miniPlayer")} ${v("miniShape")} ${v("miniSkin")} · borderless ${v("borderless")} · library ${files} files`,
    ];
    return lines;
}
// the log keeps UTC; the report shows the user's own clock
function localStamp(iso) {
    const d = new Date(iso);
    return isNaN(d) ? String(iso) : `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
}
function errorLines(n, withStack) {
    return readErrors().slice(-n).reverse().map(e => `${localStamp(e.t)}  ${e.v ? "v" + e.v + "  " : ""}${e.at}: ${e.msg}` + (withStack && e.stack ? `\n    ${e.stack}` : ""));
}
function reportText(withStack = true) {
    const errs = errorLines(5, withStack);
    return [tr("Diagnostics (RhinE)"), ...reportLines(), "", tr("Recent errors: {0}", readErrors().length), ...(errs.length ? errs : [tr("none")])].join("\n");
}
function githubIssueUrl() {
    const body = st => [
        `### ${tr("What happened?")}`, "", "", `### ${tr("Steps to reproduce")}`, "1. ", "",
        `### ${tr("Diagnostics")}`, "```", reportText(st), "```"].join("\n");
    let b = body(true);
    if (encodeURIComponent(b).length > 6500) b = body(false);
    return `https://github.com/${REPORT_REPO}/issues/new?body=${encodeURIComponent(b)}`;
}
function reportOpenUrl(url) {
    try { new ActiveXObject("Shell.Application").ShellExecute(url); return; } catch (e) { /* try the next */ }
    try { new ActiveXObject("WScript.Shell").Run(`"${url}"`); } catch (e) { /* no browser */ }
}

// the menu (the header's MENU › Audio Archive and its ERROR · REPORT plate): base + 0 … 3
function appendReportMenu(m, base) {
    const n = readErrors().length;
    m.AppendMenuItem(0x1, base + 9, n ? tr("Recent errors: {0}", n) : tr("No errors recorded"));
    m.AppendMenuSeparator();
    m.AppendMenuItem(0, base, tr("Report on GitHub…"));
    m.AppendMenuItem(0, base + 1, tr("Copy the diagnostics (to paste in a comment or message)"));
    m.AppendMenuItem(0, base + 2, tr("Show the diagnostics…"));
    if (n) { m.AppendMenuSeparator(); m.AppendMenuItem(0, base + 3, tr("Clear the error log")); }
}
// opening the menu counts as having seen the errors
function reportMenuSeen() { setSetting("errorSeen", Date.now(), true); send("error-logged"); }
function reportAction(k) {
    if (k === 0) reportOpenUrl(githubIssueUrl());
    else if (k === 1) {
        const t = reportText(true);
        let ok = false;
        try { ok = utils.SetClipboardText(t) !== false; } catch (e) { ok = false; }
        fb.ShowPopupMessage((ok ? tr("Copied to the clipboard:") : tr("Could not copy; select the text below and copy it:")) + "\n\n" + t, "Audio Archive");
    }
    else if (k === 2) fb.ShowPopupMessage(reportText(true), "Audio Archive");
    else if (k === 3) clearErrors();
}
