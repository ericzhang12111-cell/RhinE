"use strict";
// The custom case (06 STYLE › CUSTOM): a base colour, an accent and a pattern, chosen from curated matte plastics. It is
// made from the WHITE skin's renders, recoloured region by region with Direct2D effects (the regions are masks rendered
// from the same model: assets\render\case-custom\, two RGB images per sprite), and saved as a skin of its own in
// <profile>\audio-archive-skins\custom\, which the theme then lists and loads like any skin. stage.js includes this file.
//   <sprite>-m1.png   R body · G accent (handle tab, spine well, lip) · B what keeps its colour (print, label, metal)
//   <sprite>-m2.png   R stripes · G blocks · B edge band; the pattern takes the accent colour

const CC_DIR = fb.ProfilePath + "audio-archive-skins\\custom\\";
const CC_MASKS = THEME_ROOT + "assets\\render\\case-custom\\";
const CC_WHITE = THEME_ROOT + "assets\\render\\case\\white\\";
// matte and satin plastics (glass and metal cannot be recoloured convincingly)
const CC_PALETTE = ["#f1efe8", "#d9cfbb", "#b9b2a5", "#8a8d84", "#5f6570", "#2b3240", "#1d1d1f",
                    "#b7372b", "#e2722b", "#e6c44a", "#7fa37a", "#84aecb", "#a596c8", "#e3a2ae"];
const CC_PATTERNS = [["none", "NONE"], ["stripes", "/// STRIPES"], ["blocks", "BLOCKS"], ["band", "EDGE BAND"]];
const CC_START = { base: "#2b3240", accent: "#e2722b", pattern: "stripes" };
const CC_REF = .92;   // the white body's brightness in its renders: a colour is reached by multiplying with c / CC_REF
const FX_MATRIX = "{921F03D6-641C-47DF-852D-B4BB6153AE11}", FX_ALPHA_MASK = "{C80ECFF0-3FD5-4F05-8328-C5D1724B4F0A}";

function customCase() {
    const s = getSetting("customCase", null) || {}, ok = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
    return { base: ok(s.base) ? s.base : CC_START.base, accent: ok(s.accent) ? s.accent : CC_START.accent,
             pattern: CC_PATTERNS.some(p => p[0] === s.pattern) ? s.pattern : CC_START.pattern };
}
const customCaseMade = () => utils.IsFile(CC_DIR + "case.json");

// the sprite multiplied by a colour (alpha kept)
function ccTint(src, hex) {
    const fx = d2d.Effect(FX_MATRIX), c = hex ? hexRgb(hex).map(v => v / 255 / CC_REF) : [1, 1, 1];
    fx.SetInput(0, src);
    fx.SetValue(0, new Float32Array([c[0], 0, 0, 0, 0, c[1], 0, 0, 0, 0, c[2], 0, 0, 0, 0, 1, 0, 0, 0, 0]));
    return fx;
}
// a layer cut by one channel of a mask image (that channel becomes the alpha)
function ccMasked(layer, mask, ch) {
    const sel = d2d.Effect(FX_MATRIX), m = new Float32Array(20);
    m[ch * 4 + 3] = 1;                 // alpha from the channel
    m[16] = m[17] = m[18] = 1;         // colour: white
    sel.SetInput(0, mask);
    sel.SetValue(0, m);
    const am = d2d.Effect(FX_ALPHA_MASK);
    am.SetInputEffect(0, layer);
    am.SetInputEffect(1, sel);
    return am;
}
function ccSprite(name, cc) {
    const src = d2d.Image(CC_WHITE + name + ".png"), m1 = d2d.Image(CC_MASKS + name + "-m1.png"), w = src.Width, h = src.Height;
    const out = d2d.CreateImage(w, h), g = out.GetGraphics(), draw = fx => g.DrawEffect(fx, 0, 0, 0, 0, w, h);
    g.DrawImage(src, 0, 0, w, h, 0, 0, w, h);
    draw(ccMasked(ccTint(src, cc.base), m1, 0));
    draw(ccMasked(ccTint(src, cc.accent), m1, 1));
    const pi = ["stripes", "blocks", "band"].indexOf(cc.pattern);
    if (pi >= 0) draw(ccMasked(ccTint(src, cc.accent), d2d.Image(CC_MASKS + name + "-m2.png"), pi));
    draw(ccMasked(ccTint(src, null), m1, 2));   // print, label and metal as they are
    out.ReleaseGraphics(g);
    out.SaveAs(CC_DIR + name + ".png");
}

// Makes the skin in steps (a few sprites at a time, so the window stays responsive); onStep(done, total), onDone(ok).
let CC_JOB = null;
function makeCustomCase(cc, onStep, onDone) {
    if (CC_JOB) return false;
    const meta = JSON.parse(utils.ReadTextFile(CC_WHITE + "case.json", 65001));
    const names = ["array-clear", "array-frost", "hero-clear", "hero-frost"].concat(meta.inspect.map((_, i) => `inspect-${pad(i, 2)}`));
    try { if (!utils.IsDirectory(CC_DIR)) utils.CreateFolder(CC_DIR); } catch (e) { onDone(false); return false; }
    CC_JOB = { i: 0 };
    const step = () => {
        try {
            for (let k = 0; k < 4 && CC_JOB.i < names.length; k++, CC_JOB.i++) ccSprite(names[CC_JOB.i], cc);
        } catch (e) {
            console.log("audio-archive custom case: " + e);
            CC_JOB = null;
            onDone(false);
            return;
        }
        onStep(CC_JOB.i, names.length);
        if (CC_JOB.i < names.length) { window.SetTimeout(step, 0); return; }
        meta.skin = { name: "CUSTOM", made: cc };
        utils.WriteTextFile(CC_DIR + "case.json", JSON.stringify(meta), false);
        CC_JOB = null;
        onDone(true);
    };
    window.SetTimeout(step, 0);
    return true;
}

// A custom case made from older WHITE renders (other sizes: 1.8.0 renders the array sprites and the inspection frames
// at twice the pixels) is made again from the current ones, in the colours it was made in, a few seconds after the start
function refreshCustomCase() {
    if (!customCaseMade()) return;
    let made, white;
    try { made = JSON.parse(utils.ReadTextFile(CC_DIR + "case.json", 65001)); white = JSON.parse(utils.ReadTextFile(CC_WHITE + "case.json", 65001)); }
    catch (e) { return; }
    const sizes = m => `${m.inspect_res}|${m.array_pixels || 1}`;
    if (sizes(made) === sizes(white)) return;
    makeCustomCase((made.skin && made.skin.made) || customCase(), () => {}, ok => {
        if (ok && STATE.skin === "custom") { reloadSkin("custom"); send("skin-reload", "custom"); }
    });
}
window.SetTimeout(refreshCustomCase, 3000);
