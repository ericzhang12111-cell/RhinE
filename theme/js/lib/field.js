"use strict";
// One-line text fields (the header's search, 06 STYLE's text size), which behave like text boxes elsewhere in
// Windows: a caret and a selection set with the mouse (click, drag, Shift+click, double-click a word) and the keys
// (arrows, Home / End, Ctrl to move by words, Shift to select, Delete / Backspace, Ctrl+A / C / X / V / Z / Y), and a
// right-click menu. The panel keeps a field (makeField), draws it (fieldDraw) and hands it its mouse and keys
// (fieldDown, fieldDrag, fieldDblClick, fieldKey, fieldChar, fieldMenu). While a field has the keyboard, foobar2000's
// own shortcuts are held back for the panel (fieldFocus), so Ctrl+A or Ctrl+V edit the text instead of the playlist.

const FIELD_FLAGS = 0x00000800 | 0x00000020 | 0x00000004;   // DT_NOPREFIX | DT_SINGLELINE | DT_VCENTER
let FIELD_SCRATCH = null;   // a 1 × 1 bitmap whose graphics measure text outside on_paint

// F.onChange(text) runs after every edit; F.accept(text) may refuse one (a number field takes digits only)
function makeField(text = "", opts = {}) {
    return Object.assign({ text: String(text), caret: String(text).length, anchor: String(text).length, scroll: 0,
                           font: null, x: 0, w: 0, undo: [], redo: [], typing: false, drag: false, onChange: null, accept: null }, opts);
}
const fieldSel = F => [Math.min(F.caret, F.anchor), Math.max(F.caret, F.anchor)];
const fieldHasSel = F => F.caret !== F.anchor;
function fieldFocus(on) { try { window.SetShortcutFilter(!!on, false); } catch (e) { /* older JSplitter */ } }

// the width of text in the field's font (trailing spaces included: measured against a bar after them)
function fieldWidth(F, s) {
    if (!s || !F.font) return 0;
    if (!FIELD_SCRATCH) FIELD_SCRATCH = d2d.CreateImage(1, 1);
    const g = FIELD_SCRATCH.GetGraphics();
    try { return g.CalcTextWidth(s + "|", F.font, true) - g.CalcTextWidth("|", F.font, true); }
    finally { FIELD_SCRATCH.ReleaseGraphics(g); }
}
// the gap between characters nearest to x (panel coordinates)
function fieldIndexAt(F, x) {
    const t = F.text, rel = x - F.x + F.scroll;
    if (rel <= 0) return 0;
    let prev = 0;
    for (let i = 1; i <= t.length; i++) {
        if (i < t.length && t.charCodeAt(i) >= 0xDC00 && t.charCodeAt(i) <= 0xDFFF) continue;   // inside a surrogate pair
        const w = fieldWidth(F, t.slice(0, i));
        if (w >= rel) return rel - prev < w - rel ? fieldPrev(t, i) : i;
        prev = w;
    }
    return t.length;
}
const fieldPrev = (t, i) => (i >= 2 && t.charCodeAt(i - 1) >= 0xDC00 && t.charCodeAt(i - 1) <= 0xDFFF ? i - 2 : Math.max(0, i - 1));
const fieldNext = (t, i) => (i < t.length && t.charCodeAt(i) >= 0xD800 && t.charCodeAt(i) <= 0xDBFF ? i + 2 : Math.min(t.length, i + 1));
// words: runs of letters and digits (CJK included); Ctrl+arrows stop at their starts and ends, as in Windows
const fieldWordChar = ch => /[\p{L}\p{N}_]/u.test(ch);
function fieldWordLeft(t, i) {
    while (i > 0 && !fieldWordChar(t[i - 1])) i--;
    while (i > 0 && fieldWordChar(t[i - 1])) i--;
    return i;
}
function fieldWordRight(t, i) {
    while (i < t.length && fieldWordChar(t[i])) i++;
    while (i < t.length && !fieldWordChar(t[i])) i++;
    return i;
}

// ------------------------------------------------------------------------------------------------------- edits
function fieldPush(F, typing) {
    // a run of typed characters is one step to undo
    if (!(typing && F.typing)) { F.undo.push({ text: F.text, caret: F.caret, anchor: F.anchor }); if (F.undo.length > 100) F.undo.shift(); F.redo = []; }
    F.typing = typing;
}
function fieldReplace(F, s, typing = false) {
    const [a, b] = fieldSel(F), text = F.text.slice(0, a) + s + F.text.slice(b);
    if (F.accept && !F.accept(text)) return false;
    fieldPush(F, typing);
    F.text = text; F.caret = F.anchor = a + s.length;
    if (F.onChange) F.onChange(F.text);
    return true;
}
function fieldSetText(F, text) {
    text = String(text);
    if (text === F.text) return;
    fieldPush(F, false);
    F.text = text; F.caret = F.anchor = text.length;
    if (F.onChange) F.onChange(F.text);
}
function fieldUndo(F, redo) {
    const from = redo ? F.redo : F.undo, to = redo ? F.undo : F.redo, s = from.pop();
    if (!s) return;
    to.push({ text: F.text, caret: F.caret, anchor: F.anchor });
    Object.assign(F, s, { typing: false });
    if (F.onChange) F.onChange(F.text);
}
function fieldCopy(F) { const [a, b] = fieldSel(F); if (a < b) utils.SetClipboardText(F.text.slice(a, b)); }
function fieldPaste(F) {
    let s = "";
    try { s = String(utils.GetClipboardText() || ""); } catch (e) { return; }
    s = s.replace(/[\r\n\t]+/g, " ");
    if (s) fieldReplace(F, s);
}
function fieldDelete(F, dir, word) {
    if (!fieldHasSel(F)) {
        const t = F.text;
        F.anchor = dir < 0 ? (word ? fieldWordLeft(t, F.caret) : fieldPrev(t, F.caret)) : (word ? fieldWordRight(t, F.caret) : fieldNext(t, F.caret));
        if (F.anchor === F.caret) return;
    }
    fieldReplace(F, "");
}
function fieldMove(F, to, extend) { F.caret = clamp(to, 0, F.text.length); if (!extend) F.anchor = F.caret; F.typing = false; }

// a key (on_key_down): true when the field took it. Enter and Esc are left to the panel.
function fieldKey(F, vk) {
    const ctrl = utils.IsKeyPressed(0x11), shift = utils.IsKeyPressed(0x10), t = F.text, [a, b] = fieldSel(F);
    switch (vk) {
        case 0x25: fieldMove(F, ctrl ? fieldWordLeft(t, F.caret) : !shift && a < b ? a : fieldPrev(t, F.caret), shift); return true;   // ←
        case 0x27: fieldMove(F, ctrl ? fieldWordRight(t, F.caret) : !shift && a < b ? b : fieldNext(t, F.caret), shift); return true;  // →
        case 0x24: case 0x26: fieldMove(F, 0, shift); return true;          // Home, ↑
        case 0x23: case 0x28: fieldMove(F, t.length, shift); return true;   // End, ↓
        case 0x08: fieldDelete(F, -1, ctrl); return true;                   // Backspace
        case 0x2E: fieldDelete(F, 1, ctrl); return true;                    // Delete
    }
    if (!ctrl) return false;
    if (vk === 0x41) { F.anchor = 0; F.caret = t.length; return true; }                  // Ctrl+A
    if (vk === 0x43 || vk === 0x2D) { fieldCopy(F); return true; }                      // Ctrl+C, Ctrl+Insert
    if (vk === 0x58) { if (a < b) { fieldCopy(F); fieldReplace(F, ""); } return true; }  // Ctrl+X
    if (vk === 0x56) { fieldPaste(F); return true; }                                     // Ctrl+V
    if (vk === 0x5A) { fieldUndo(F, shift); return true; }                               // Ctrl+Z, Ctrl+Shift+Z
    if (vk === 0x59) { fieldUndo(F, true); return true; }                                // Ctrl+Y
    return false;
}
// a character (on_char): true when it went into the text
function fieldChar(F, code) {
    if (code < 32 || code === 127 || utils.IsKeyPressed(0x11) && !utils.IsKeyPressed(0x12)) return false;   // control characters, Ctrl+letter (AltGr types)
    return fieldReplace(F, String.fromCharCode(code), true);
}

// ------------------------------------------------------------------------------------------------------- mouse
function fieldDown(F, x, shift) { fieldMove(F, fieldIndexAt(F, x), shift); F.drag = true; }
function fieldDrag(F, x) { if (F.drag) F.caret = fieldIndexAt(F, x); }
function fieldUp(F) { F.drag = false; }
function fieldDblClick(F, x) {
    const t = F.text, i = fieldIndexAt(F, x), w = fieldWordChar;
    // the word (or the run of spaces and signs) at the click
    const kind = i < t.length ? w(t[i]) : i > 0 && w(t[i - 1]);
    let a = i, b = i;
    while (a > 0 && w(t[a - 1]) === kind) a--;
    while (b < t.length && w(t[b]) === kind) b++;
    F.anchor = a; F.caret = b; F.drag = false;
}
// Undo, Cut, Copy, Paste, Delete, Select all (translated)
function fieldMenu(F, x, y) {
    const m = window.CreatePopupMenu(), sel = fieldHasSel(F);
    let clip = false;
    try { clip = !!utils.GetClipboardText(); } catch (e) { /* no text */ }
    m.AppendMenuItem(F.undo.length ? 0 : 1, 1, tr("Undo") + "\tCtrl+Z");
    m.AppendMenuSeparator();
    m.AppendMenuItem(sel ? 0 : 1, 2, tr("Cut") + "\tCtrl+X");
    m.AppendMenuItem(sel ? 0 : 1, 3, tr("Copy") + "\tCtrl+C");
    m.AppendMenuItem(clip ? 0 : 1, 4, tr("Paste") + "\tCtrl+V");
    m.AppendMenuItem(sel ? 0 : 1, 5, tr("Delete") + "\tDel");
    m.AppendMenuSeparator();
    m.AppendMenuItem(F.text ? 0 : 1, 6, tr("Select all") + "\tCtrl+A");
    const id = m.TrackPopupMenu(x, y);
    if (id === 1) fieldUndo(F, false);
    else if (id === 2) { fieldCopy(F); fieldReplace(F, ""); }
    else if (id === 3) fieldCopy(F);
    else if (id === 4) fieldPaste(F);
    else if (id === 5) fieldReplace(F, "");
    else if (id === 6) { F.anchor = 0; F.caret = F.text.length; }
    return id > 0;
}

// ------------------------------------------------------------------------------------------------------- drawing
// The text in (x, y, w, h), scrolled so the caret stays in view; the selection in the accent with its text in the
// on-accent colour; the caret (caretOn: its blink phase) while focused.
function fieldDraw(gr, F, x, y, w, h, f, colour, focus, caretOn) {
    F.font = f; F.x = x; F.w = w;
    const cx = fieldWidth(F, F.text.slice(0, F.caret)), tw = fieldWidth(F, F.text), pad = dp(2);
    // keep the caret in view, and no empty room at the end when the text is longer than the field
    if (cx - F.scroll > w - pad) F.scroll = cx - w + pad;
    if (cx - F.scroll < 0) F.scroll = cx;
    F.scroll = clamp(F.scroll, 0, Math.max(0, tw - w + pad));
    const tx = x - F.scroll;
    gr.PushClip(x, y, w, h);
    gr.DrawText(F.text, f, colour, tx, y, Math.max(w, tw + dp(4)), h, FIELD_FLAGS);
    if (focus && fieldHasSel(F)) {
        const [a, b] = fieldSel(F), sx = tx + fieldWidth(F, F.text.slice(0, a)), sw = fieldWidth(F, F.text.slice(a, b));
        const ry = y + dp(4), rh = h - dp(8);
        gr.FillSolidRect(sx, ry, sw, rh, C.accent);
        gr.PushClip(sx, ry, sw, rh);
        gr.DrawText(F.text, f, C["on-accent"], tx, y, Math.max(w, tw + dp(4)), h, FIELD_FLAGS);
        gr.PopClip();
    }
    if (focus && caretOn && !fieldHasSel(F)) gr.FillSolidRect(Math.round(tx + cx), y + dp(5), HAIR, h - dp(10), C.accent);
    gr.PopClip();
}
