"use strict";
// Settings that outlive the layout. Columns UI keeps each scripted panel's properties inside the layout, so importing
// the layout again (install.ps1 does on every update) would reset them. Every setting is therefore also written to
// <profile>\audio-archive-settings.json and read from there first; the panel property stays as the fallback.
// The colour scheme, light / dark mode and playlist preset live in Columns UI's colours and foobar2000's mode, not in a
// panel: frame.js records them here and restores them after a layout import.

const SETTINGS_FILE = fb.ProfilePath + "audio-archive-settings.json";

function readSettings() {
    try {
        if (utils.IsFile(SETTINGS_FILE)) {
            const o = JSON.parse(utils.ReadTextFile(SETTINGS_FILE, 65001));
            if (o && typeof o === "object" && !Array.isArray(o)) return o;
        }
    } catch (e) { /* unreadable: the panel properties stand in until the next change rewrites it */ }
    return {};
}

function getSetting(key, def) {
    const s = readSettings();
    return Object.prototype.hasOwnProperty.call(s, key) ? s[key] : window.GetProperty(key, def);
}

// fileOnly: not also a panel property (those are part of the layout, which a user may export and share): for API keys
function setSetting(key, value, fileOnly = false) {
    if (!fileOnly) window.SetProperty(key, value);
    const s = readSettings();
    if (s[key] === value) return;
    s[key] = value;
    try { utils.WriteTextFile(SETTINGS_FILE, JSON.stringify(s, null, 1), false); }
    catch (e) { console.log("audio-archive settings: " + e); }
}
