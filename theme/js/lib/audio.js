"use strict";
// Live audio analysis from foobar2000's visualisation stream (fb.GetAudioChunkTo): 48 log-spaced bands, bass energy
// and its slow average (an onset is a surge of energy above the average), peak and RMS level in dBFS and the stereo
// correlation. Call analyseAudio(dt) once per animation frame while it is needed; it costs ≈ 0.3 ms (Phase 0).

const AUDIO = {
    bands: new Float32Array(48), energy: 0, avg: 0, surge: 0,
    peakDb: -Infinity, rmsDb: -Infinity, corr: 0, live: false,
};

const FFT_N = 2048;
const _pcm = new Float32Array(FFT_N * 8), _re = new Float32Array(FFT_N), _im = new Float32Array(FFT_N), _info = {};
const _win = new Float32Array(FFT_N).map((_, i) => 0.5 - 0.5 * Math.cos(TAU * i / (FFT_N - 1)));
const _rev = new Uint16Array(FFT_N);
for (let i = 0, b = Math.log2(FFT_N); i < FFT_N; i++) { let r = 0; for (let k = 0; k < b; k++) r |= ((i >> k) & 1) << (b - 1 - k); _rev[i] = r; }
const _edges = Array.from({ length: 49 }, (_, i) => Math.round(Math.pow(2, 1 + (Math.log2(FFT_N / 2) - 1) * i / 48)));
const _tw = new Float32Array(FFT_N), _twi = new Float32Array(FFT_N);   // twiddle factors per butterfly size
for (let i = 0; i < FFT_N / 2; i++) { _tw[i] = Math.cos(-TAU * i / FFT_N); _twi[i] = Math.sin(-TAU * i / FFT_N); }
// level meters hold their value for a moment so the read-outs are readable
const _meter = { peak: 0, rms: 0, corr: 0, t: 0 };

function analyseAudio(dt) {
    const playing = fb.IsPlaying && !fb.IsPaused;
    const got = playing ? fb.GetAudioChunkTo(_pcm, FFT_N / (_info.SampleRate || 44100), 0, _info) : 0;
    AUDIO.live = got > 0;
    const B = AUDIO.bands;
    if (!got) {
        for (let b = 0; b < 48; b++) B[b] *= Math.pow(0.02, dt);   // fall away
        AUDIO.energy *= Math.pow(0.05, dt);
        AUDIO.surge = 0;
        return;
    }
    const ch = Math.max(1, _info.ChannelCount || 2), n = Math.min(FFT_N, Math.floor(got / ch));
    // mono mix into the FFT input; level and correlation from the first two channels
    let peak = 0, sum = 0, lr = 0, ll = 0, rr = 0;
    for (let i = 0; i < FFT_N; i++) {
        let v = 0;
        if (i < n) {
            for (let c = 0; c < ch; c++) { const s = _pcm[i * ch + c]; v += s; const a = Math.abs(s); if (a > peak) peak = a; sum += s * s; }
            if (ch >= 2) { const l = _pcm[i * ch], r = _pcm[i * ch + 1]; lr += l * r; ll += l * l; rr += r * r; }
            v /= ch;
        }
        _re[_rev[i]] = v * _win[i]; _im[_rev[i]] = 0;
    }
    for (let size = 2; size <= FFT_N; size <<= 1) {
        const half = size >> 1, step = FFT_N / size;
        for (let i = 0; i < FFT_N; i += size)
            for (let j = 0; j < half; j++) {
                const wr = _tw[j * step], wi = _twi[j * step], k = i + j, l = k + half;
                const tr = wr * _re[l] - wi * _im[l], ti = wr * _im[l] + wi * _re[l];
                _re[l] = _re[k] - tr; _im[l] = _im[k] - ti; _re[k] += tr; _im[k] += ti;
            }
    }
    const fall = Math.pow(0.05, dt);
    for (let b = 0; b < 48; b++) {
        let m = 0;
        for (let k = _edges[b]; k < Math.max(_edges[b] + 1, _edges[b + 1]); k++) m = Math.max(m, Math.hypot(_re[k], _im[k]));
        const v = clamp((20 * Math.log10(m / FFT_N + 1e-9) + 66) / 60, 0, 1);
        B[b] = v > B[b] ? v : Math.max(v, B[b] * fall);
    }
    let e = 0;
    for (let b = 0; b < 8; b++) e += B[b];
    AUDIO.energy = e / 8;
    AUDIO.avg += (AUDIO.energy - AUDIO.avg) * clamp(dt * 1.5, 0, 1);
    AUDIO.surge = AUDIO.energy - AUDIO.avg;
    // meters: peak holds for 1 s, RMS and correlation are smoothed
    const rms = Math.sqrt(sum / Math.max(1, n * ch));
    _meter.t += dt;
    if (peak > _meter.peak || _meter.t > 1) { _meter.peak = peak; _meter.t = 0; }
    _meter.rms += (rms - _meter.rms) * clamp(dt * 3, 0, 1);
    if (ch >= 2 && ll > 0 && rr > 0) _meter.corr += (lr / Math.sqrt(ll * rr) - _meter.corr) * clamp(dt * 2, 0, 1);
    AUDIO.peakDb = 20 * Math.log10(_meter.peak + 1e-9);
    AUDIO.rmsDb = 20 * Math.log10(_meter.rms + 1e-9);
    AUDIO.corr = ch >= 2 ? _meter.corr : 1;
}

const fmtDb = db => !isFinite(db) || db < -96 ? "−∞ DB" : `${db < 0 ? "−" : ""}${Math.abs(db).toFixed(1)} DB`;
