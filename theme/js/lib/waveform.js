"use strict";
// Whole-track waveform ("signal trace"): decoded once per track with utils.GetWaveformAsync (in the background, values
// arrive progressively) and cached on disk under <profile>\audio-archive-cache\waveform\, keyed by path, size and length.

const WAVE_POINTS = 1024;
const WAVE_DIR = fb.ProfilePath + "audio-archive-cache\\waveform\\";
const Wave = { key: "", peaks: null, loaded: 0, request: 0 };

// FNV-1a 32-bit, as hex: short stable keys for cache files and album numbers
function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0");
}

function waveKey(handle) { return fnv(`${handle.Path}|${handle.SubSong}|${handle.FileSize}|${handle.Length.toFixed(2)}`); }

// starts loading the waveform of `handle`; onUpdate() is called as values arrive
function waveLoad(handle, onUpdate) {
    if (!handle) { Wave.key = ""; Wave.peaks = null; return; }
    const key = waveKey(handle);
    if (key === Wave.key) return;
    Wave.key = key; Wave.peaks = null; Wave.loaded = 0;
    const id = ++Wave.request, file = WAVE_DIR + key + ".json";
    if (utils.IsFile(file)) {
        try {
            const arr = JSON.parse(utils.ReadTextFile(file, 65001));
            if (Array.isArray(arr) && arr.length === WAVE_POINTS) { Wave.peaks = Float32Array.from(arr, v => v / 1000); Wave.loaded = WAVE_POINTS; onUpdate(); return; }
        } catch (e) { /* decode again */ }
    }
    if (!handle.Length || handle.Length <= 0) return;   // streams have no whole-track waveform
    Wave.peaks = new Float32Array(WAVE_POINTS);
    utils.GetWaveformAsync(handle, WAVE_POINTS, 0, 0, (values, start) => {
        if (id !== Wave.request) return false;   // another track started: cancel this decode
        Wave.peaks.set(values, start);
        Wave.loaded = Math.max(Wave.loaded, start + values.length);
        onUpdate();
        return true;
    }).then(full => {
        if (id !== Wave.request) return;
        Wave.peaks = full; Wave.loaded = WAVE_POINTS;
        // normalise to the loudest point so quiet masters still read
        let m = 0; for (const v of full) m = Math.max(m, v);
        if (m > 0) for (let i = 0; i < full.length; i++) full[i] = Math.min(1, full[i] / m);
        if (!utils.IsDirectory(WAVE_DIR)) utils.CreateFolder(WAVE_DIR);
        utils.WriteTextFile(file, JSON.stringify(Array.from(full, v => Math.round(v * 1000))), false);
        onUpdate();
    }).catch(e => console.log("audio-archive waveform: " + e));
}
