"use strict";
// 06 · ONLINE (stage.js includes this file; lib/online.js talks to the bridge): the music services the reader has an
// account with, as a player's home page in the archive's manner.
//   left    SOURCE (NetEase, QQ Music: the one shown; Spotify to come) and the sections (HOME, LIKED SONGS, MY
//           PLAYLISTS, SEARCH once the header's search box has been used here: it searches the shown service)
//   middle  HOME: the day's recommendations as a dated specimen card, the account's playlists and recommended ones on
//           shelves; a playlist: its card and its songs (a click plays from that song); SEARCH: playlists and songs found
//   right   what plays now
// Before the bridge is there: the install; before an account: the QR code to scan with the service's app.

const OV_ST = {
    head: { size: 9, weight: 600, track: .16 },
    sec: { size: 9, weight: 600, track: .16 },
    tiny: { size: 8, weight: 500, track: .14 },
    row: { size: 9.5, weight: 400, track: .04 },
    rowB: { size: 9.5, weight: 600, track: .04 },
    name: { size: 10, weight: 600, track: .06 },
    big: { size: 26, weight: 700, track: .03 },
    huge: { size: 64, weight: 600, track: 0 },
    stat: { size: 18, weight: 600, track: .02 },
    count: { size: 34, weight: 600, track: 0 },
    btn: { size: 9, weight: 600, track: .14 },
};
const OV = { section: "home", open: null, hover: null, scroll: 0, scrollMax: 0, tracks: null, nowRect: null, next: null, rail: 0, railMax: 0, mx: 0 };

function onlineShown(on) {
    if (on && ONL.state === "") onlineStart();
}

function drawOnline(gr) {
    const m = dp(32), lw = dp(220), rw = W > dp(1400) ? dp(300) : 0, x0 = m + lw + dp(32), x1 = W - m - (rw ? rw + dp(32) : 0);
    for (const [x, y] of [[dp(16), dp(16)], [W - dp(27), dp(16)], [dp(16), H - dp(27)], [W - dp(27), H - dp(27)]]) regCross(gr, x, y);
    // ■ ONLINE · 06   [NETEASE · <name>] (the shown service)
    gr.FillSolidRect(m, dp(32), dp(5), dp(5), C.fg);
    const hw = label(gr, tr("ONLINE  ·  06"), st(OV_ST.head, C.fg), m + dp(15), dp(28));
    if (ONL.me) chip(gr, `${onlSrcName()}  ·  ${ONL.me.name}`, m + dp(15) + hw + dp(14), dp(24), dp(18), "acc", 8.5, C.bg);
    const synced = ONL.by[ONL.src].synced;
    if (ONL.state === "ready" && synced) {
        const t = new Date(synced);
        label(gr, `${tr("LAST SYNC {0}", `${pad(t.getHours(), 2)}:${pad(t.getMinutes(), 2)}`)}  ·  ${tr("BRIDGE")} 127.0.0.1`, st(OV_ST.tiny, C["text-muted"]), W - m, dp(30), 2);
    }
    const top = dp(62);
    gr.FillSolidRect(m, top, W - 2 * m, HAIR, withAlpha(C.fg, .55));
    // the rail scrolls by itself when the window is too low for it (the wheel over it)
    OV.rail = clamp(OV.rail, 0, OV.railMax);
    gr.PushClip(m - dp(2), top + HAIR, lw + dp(4), H - top);
    const n0 = hits.size(), end = drawOnlineRail(gr, m, top + dp(24) - OV.rail, lw);
    gr.PopClip();
    hits.clipY(n0, top, H);
    const rmax = Math.max(0, Math.round(end + OV.rail - H));
    if (rmax !== OV.railMax) { OV.railMax = rmax; if (OV.rail > rmax) window.Repaint(); }
    if (OV.rail > 0) gr.FillGradRect(m - dp(2), top + HAIR, lw + dp(4), dp(14), 90, C.bg, withAlpha(C.bg, 0));
    if (OV.rail < OV.railMax) gr.FillGradRect(m - dp(2), H - dp(18), lw + dp(4), dp(18), 90, withAlpha(C.bg, 0), C.bg);
    OV.nowRect = rw ? [W - m - rw, top + HAIR, rw, H - top - HAIR] : null;
    if (rw) drawOnlineNow(gr, W - m - rw, top + dp(24), rw);
    gr.PushClip(x0, top + HAIR, x1 - x0, H - top);
    if (ONL.state !== "ready") drawOnlineState(gr, x0, top + dp(24), x1);
    else if (OV.section === "import" && !OV.open) drawOnlineImport(gr, x0, top + dp(24), x1);
    else if (!ONL.me) drawOnlineLogin(gr, x0, top + dp(24), x1);
    else if (OV.open) drawOnlinePlaylist(gr, x0, top + dp(24), x1);
    else if (OV.section === "playlists") drawOnlineAll(gr, x0, top + dp(24), x1);
    else if (OV.section === "search" && ONL.search) drawOnlineSearch(gr, x0, top + dp(24), x1);
    else drawOnlineHome(gr, x0, top + dp(24), x1);
    gr.PopClip();
    // the message bar: what a click started (reading a list, playing it, nothing playable in it, it did not load)
    const n = onlNoticeOn();
    if (n) {
        const ts = st(OV_ST.rowB, C.bg, C.fg), tw = Math.min(labelWidth(n.text, ts), x1 - x0 - dp(100)), bw = tw + dp(52), bh = dp(40);
        const bx = Math.round(x0 + (x1 - x0 - bw) / 2), by = H - bh - dp(28);
        gr.FillSolidRect(bx, by, bw, bh, C.fg);
        gr.FillSolidRect(bx + dp(16), by + Math.round((bh - dp(7)) / 2), dp(7), dp(7), n.kind === "ok" ? 0xff3fa66a : C.accent);
        label(gr, fitLabel(n.text, ts, tw), ts, bx + dp(34), by + Math.round((bh - labelHeight(OV_ST.rowB)) / 2));
    }
}

// ---- left: the sources and the sections ----
function drawOnlineRail(gr, x, y, w) {
    label(gr, `${tr("SOURCE")}  ·  03`, st(OV_ST.sec, C["text-muted"]), x, y);
    y += dp(22);
    // (on: the one shown; a green dot: logged in)
    const sub = id => { const B = ONL.by[id]; return B.me ? B.me.name + (B.home && B.home.playlists ? "  ·  " + tr("{0} LISTS", B.home.playlists.length) : "") : ONL.state === "ready" ? tr("NOT CONNECTED") : tr("OFFLINE"); };
    const src = [
        { id: "ne", name: "NETEASE", sw: 0xffc3262f, sub: sub("ne"), on: ONL.src === "ne", in: !!ONL.by.ne.me },
        { id: "qq", name: "QQ MUSIC", sw: 0xff2fb36c, sub: sub("qq"), on: ONL.src === "qq", in: !!ONL.by.qq.me },
        // (Spotify: import only, from its card to the import page)
        { id: "spotify", name: "SPOTIFY", sw: 0xff1ed760, sub: ONL.spotify.login ? `${tr("IMPORT")} · ${(ONL.spotify.user && ONL.spotify.user.name) || tr("CONNECTED")}` : `${tr("IMPORT")} · ${tr("NOT CONNECTED")}`,
          on: OV.section === "import" && !OV.open, in: ONL.spotify.login, off: ONL.state !== "ready" },
    ];
    for (const s of src) {
        const h = dp(48), hov = OV.hover && OV.hover.id === "onl-src" && OV.hover.data === s.id;
        if (s.on) gr.FillSolidRect(x, y, w, h, C.panel);
        box(gr, x, y, w, h, s.on ? C.fg : hov && !s.off ? C.accent : C["line-faint"]);
        // the service's mark: a plain tile with its number, its colour a line down the tile's left edge (three filled
        // brand squares, two of them green, were the loudest thing on the page and said nothing the names do not)
        const tx = x + dp(10), ty = y + dp(10), tz = dp(28), under = s.on ? C.panel : C.bg;
        box(gr, tx, ty, tz, tz, C["line-dim"]);
        gr.FillSolidRect(tx, ty, dp(3), tz, s.off ? withAlpha(s.sw, .35) : s.sw);
        label(gr, pad(src.indexOf(s) + 1, 2), st(OV_ST.tiny, s.off ? C["text-muted"] : C["fg-soft"], under), tx + dp(3) + Math.round((tz - dp(3)) / 2), ty + Math.round((tz - labelHeight(OV_ST.tiny)) / 2), 1);
        label(gr, s.name, st(OV_ST.name, s.off ? C["text-muted"] : C.fg, under), x + dp(48), y + dp(10));
        label(gr, fitLabel(s.sub, st(OV_ST.tiny, C["text-muted"]), w - dp(70)), st(OV_ST.tiny, C["text-muted"], under), x + dp(48), y + dp(28));
        if (s.in) gr.FillSolidRect(x + w - dp(16), y + dp(21), dp(6), dp(6), 0xff3fa66a);
        if (!s.off) hits.add("onl-src", x, y, w, h, s.id);   // (Spotify's card: the import page)
        y += h + dp(8);
    }
    y += dp(18);
    const secs = [["home", tr("HOME")], ["liked", tr("LIKED SONGS")], ["playlists", tr("MY PLAYLISTS")], ["import", tr("IMPORT")]].concat(ONL.search ? [["search", tr("SEARCH")]] : []);
    label(gr, `${tr("SECTION")}  ·  ${pad(secs.length, 2)}`, st(OV_ST.sec, C["text-muted"]), x, y);
    y += dp(22);
    const liked = onlLikedList();
    const counts = { liked: liked ? liked.count : null, playlists: ONL.home && ONL.home.playlists ? ONL.home.playlists.length : null, import: ONL.imports.length || null };
    secs.forEach(([id, name], i) => {
        const no = counts[id] != null ? String(counts[id]) : pad(i + 1, 2);
        const h = dp(30), cur = id === "liked" ? !!(OV.open && liked && OV.open.id === liked.id) : !OV.open && OV.section === id, hov = OV.hover && OV.hover.id === "onl-sec" && OV.hover.data === id;
        if (cur) gr.FillSolidRect(x, y, w, h, C.fg);
        const fg = cur ? C.bg : hov ? C.fg : C["fg-soft"], bg = cur ? C.fg : C.bg;
        label(gr, name, st(OV_ST.btn, fg, bg), x + dp(10), y + Math.round((h - labelHeight(OV_ST.btn)) / 2));
        label(gr, no, st(OV_ST.tiny, cur ? C.bg : C["text-muted"], bg), x + w - dp(10), y + Math.round((h - labelHeight(OV_ST.tiny)) / 2), 2);
        if (ONL.me || (id === "import" && ONL.state === "ready")) hits.add("onl-sec", x, y, w, h, id);   // (an import needs no account)
        y += h + dp(2);
    });
    // the searches that led somewhere (a click searches again)
    // (the foot sits at the bottom, but never on the sections: on a low window it follows them, its lines closer)
    const tight = y + OV.rail + dp(14) > H - dp(128), fy = tight ? y + dp(10) : H - dp(128), fp = tight ? dp(15) : dp(18), ft = tight ? dp(8) : dp(12);
    const qs = ONL.me ? onlRecentSearches() : [];
    if (qs.length && y + dp(60) < fy) {
        y += dp(28);
        label(gr, tr("RECENT SEARCHES"), st(OV_ST.sec, C["text-muted"]), x, y);
        y += dp(22);
        for (const q of qs) {
            if (y + dp(20) > fy - dp(12)) break;
            const hov = OV.hover && OV.hover.id === "onl-q" && OV.hover.data === q, t = fitLabel(q, st(OV_ST.row, 0), w - dp(10));
            label(gr, t, st(OV_ST.row, hov ? C.accent : C["fg-soft"]), x, y);
            hits.add("onl-q", x, y - dp(4), Math.max(dp(40), labelWidth(t, st(OV_ST.row, 0))), dp(22), q);
            y += dp(22);
        }
    }
    // the bridge's state at the foot
    hline(gr, x, fy, w, C["line-faint"]);
    const vip = !!(ONL.me && ONL.me.vip > 0), quality = !ONL.me ? "—" : ONL.src === "qq" ? (vip ? "MP3 · 320" : "MP3 · 128") : vip ? "FLAC" : "MP3 · 320";
    const rows = [[tr("BRIDGE"), ONL.state === "ready" ? `● ${tr("ONLINE")}` : tr((ONL.state || "off").toUpperCase())], [tr("ACCOUNT"), ONL.me ? (vip ? "VIP" : tr("STANDARD")) : "—"], [tr("QUALITY"), quality]];
    rows.forEach(([k, v], i) => {
        label(gr, k, st(OV_ST.tiny, C["text-muted"]), x, fy + ft + i * fp);
        label(gr, v, st(OV_ST.tiny, C.fg), x + w, fy + ft + i * fp, 2);
    });
    if (ONL.me) {
        const t = tr("LOG OUT"), tw = labelWidth(t, st(OV_ST.tiny, 0)), ly = fy + ft + 3 * fp, hov = OV.hover && OV.hover.id === "onl-logout";
        label(gr, t, st(OV_ST.tiny, hov ? C.accent : C["text-muted"]), x + w, ly, 2);
        hits.add("onl-logout", x + w - tw, ly - dp(2), tw, dp(14));
    }
    return fy + ft + 4 * fp + dp(10);
}

// ---- the bridge not there / starting / failed ----
function drawOnlineState(gr, x, y, x1) {
    const s = ONL.state;
    label(gr, s === "absent" ? tr("NOT INSTALLED") : s === "installing" ? tr("INSTALLING") : s === "error" ? tr("FAULT") : tr("STARTING"), st(OV_ST.big, C.fg), x, y);
    y += dp(48);
    const lines = s === "absent" ? [tr("06 ONLINE needs a small local bridge (Node.js and the music services' libraries, about 160 MB)."), tr("It is installed beside the foobar2000 profile and runs only while foobar2000 does.")]
        : s === "installing" ? [ONL.detail || tr("Downloading…")]
        : s === "error" ? [ONL.detail || tr("Something went wrong.")]
        : [tr("Waiting for the bridge…")];
    lines.forEach((l, i) => label(gr, l, st(OV_ST.row, C["fg-soft"]), x, y + i * dp(20)));
    y += lines.length * dp(20) + dp(24);
    if (s === "absent" || s === "error") onlButton(gr, s === "absent" ? tr("INSTALL") : tr("TRY AGAIN"), x, y, "onl-install", true);
}

function onlButton(gr, text, x, y, id, accent = false, data = null, under = C.bg) {
    const h = dp(30), w = labelWidth(text, st(OV_ST.btn, 0)) + dp(28), hov = OV.hover && OV.hover.id === id && OV.hover.data === data;
    if (accent) gr.FillSolidRect(x, y, w, h, hov ? C.fg : C.accent);
    else box(gr, x, y, w, h, hov ? C.accent : C.fg);
    const fg = accent ? (hov ? C.bg : C["on-accent"]) : C.fg, bg = accent ? (hov ? C.fg : C.accent) : under;
    label(gr, text, st(OV_ST.btn, fg, bg), x + dp(14), y + Math.round((h - labelHeight(OV_ST.btn)) / 2));
    hits.add(id, x, y, w, h, data);
    return w;
}

// ---- logging in ----
// (QQ Music: the code is for one app's scanner, chosen under the steps: QQ Music's, QQ's or WeChat's)
const ONL_CHANNELS = [["qqmusic", "QQ MUSIC APP"], ["qq", "QQ"], ["wechat", "WECHAT"]];
function drawOnlineLogin(gr, x, y, x1) {
    const qq = ONL.src === "qq", ch = qq ? ONL.by.qq.channel : "";
    label(gr, tr(qq ? "CONNECT QQ MUSIC" : "CONNECT NETEASE"), st(OV_ST.big, C.fg), x, y);
    y += dp(52);
    const steps = !qq ? [tr("Open the NetEase Cloud Music app"), tr("Scan with the app's own scanner (not the camera or WeChat)"), tr("Confirm the login on the phone")]
        : ch === "wechat" ? [tr("Open WeChat on the phone"), tr("Scan with WeChat's scanner"), tr("Confirm the login on the phone")]
        : ch === "qq" ? [tr("Open QQ on the phone"), tr("Scan with QQ's scanner"), tr("Confirm the login on the phone")]
        : [tr("Open the QQ Music app"), tr("Scan with the app's own scanner"), tr("Confirm the login on the phone")];
    hline(gr, x, y, dp(420), C.fg);
    steps.forEach((t, i) => {
        const ry = y + i * dp(36);
        label(gr, pad(i + 1, 2), st(OV_ST.rowB, C.accent), x, ry + dp(11));
        label(gr, t, st(OV_ST.row, C.fg), x + dp(36), ry + dp(11));
        hline(gr, x, ry + dp(36), dp(420), C["line-faint"]);
    });
    label(gr, tr("No password: the login is kept on this computer only, encrypted, and goes when you log out."), st(OV_ST.tiny, C["text-muted"]), x, y + 3 * dp(36) + dp(16));
    if (qq) {
        // the scanner: three buttons, the one in use filled
        let bx = x;
        const by = y + 3 * dp(36) + dp(70);
        label(gr, tr("SCAN WITH"), st(OV_ST.tiny, C["text-muted"]), x, by - dp(18));
        for (const [id, name] of ONL_CHANNELS) {
            const t = tr(name), bw = labelWidth(t, st(OV_ST.btn, 0)) + dp(24), cur = id === ch, hov = OV.hover && OV.hover.id === "onl-chan" && OV.hover.data === id;
            if (cur) gr.FillSolidRect(bx, by, bw, dp(28), C.fg);
            box(gr, bx, by, bw, dp(28), cur ? C.fg : hov ? C.accent : C["line-faint"]);
            label(gr, t, st(OV_ST.btn, cur ? C.bg : C.fg, cur ? C.fg : C.bg), bx + dp(12), by + Math.round((dp(28) - labelHeight(OV_ST.btn)) / 2));
            if (!cur) hits.add("onl-chan", bx, by, bw, dp(28), id);
            bx += bw + dp(6);
        }
    }
    // the code, as a case window
    const q = ONL.qr || {}, size = dp(240), qx = Math.max(x + dp(460), x1 - size - dp(56)), qy = y - dp(40);
    gr.FillSolidRect(qx - dp(20), qy - dp(20), size + dp(40), size + dp(40), C.panel);
    box(gr, qx - dp(20), qy - dp(20), size + dp(40), size + dp(40), C["line-faint"]);
    gr.FillSolidRect(qx - dp(24), qy - dp(24), dp(8), dp(8), C.accent);
    if (q.img && q.state !== "expired") gr.DrawImage(q.img, qx, qy, size, size, 0, 0, q.img.Width, q.img.Height);
    else gr.FillSolidRect(qx, qy, size, size, C.well);
    const state = q.state === "scanned" ? tr("SCANNED · CONFIRM ON THE PHONE") : q.state === "expired" ? tr("EXPIRED") : q.state === "error" ? tr("FAULT") : tr("WAITING FOR SCAN");
    gr.FillSolidRect(qx - dp(20), qy + size + dp(36), dp(7), dp(7), q.state === "scanned" ? 0xff3fa66a : C.accent);
    label(gr, state, st(OV_ST.btn, C.fg), qx - dp(6), qy + size + dp(32));
    if (q.state === "expired" || q.state === "error") onlButton(gr, tr("NEW CODE"), qx - dp(20), qy + size + dp(60), "onl-qr", true);
}

// ---- home ----
function onlGreeting() { const h = new Date().getHours(); return tr(h < 5 ? "GOOD NIGHT" : h < 12 ? "GOOD MORNING" : h < 18 ? "GOOD AFTERNOON" : "GOOD EVENING"); }
function drawCover(gr, url, x, y, s, fallback = C.case) {
    const img = onlineCover(url);
    if (img) gr.DrawImage(img, x, y, s, s, 0, 0, img.Width, img.Height);
    else gr.FillSolidRect(x, y, s, s, fallback);
}
// The day's songs as a card (the date, the first songs' covers, the first five by name, PLAY ALL / SHUFFLE, the rest as
// a list), then the online lists played lately (where they were left), the account's playlists and recommended ones on
// shelves of one tile size; it scrolls when the window is short
function drawOnlineHome(gr, x, y, x1) {
    const H0 = ONL.home || {}, w = x1 - x, daily = H0.daily || [], lists = H0.playlists, liked = onlLikedList();
    y -= OV.scroll;
    label(gr, `ONLINE / ${onlSrcName()} / HOME`, st(OV_ST.tiny, C["text-muted"]), x, y);
    // the greeting, the account in three numbers at its right
    const playable = daily.filter(onlPlayable).length;
    const stats = [[liked ? String(liked.count) : "—", "", tr("LIKED")], [lists ? String(lists.length) : "—", "", tr("LISTS")],
                   [H0.daily ? String(playable) : "—", H0.daily ? `/${daily.length}` : "", tr("PLAYABLE TODAY")]];
    let sx = x1;
    for (let i = stats.length - 1; i >= 0; i--) {
        const [v, rest, k] = stats[i], vw = labelWidth(v, st(OV_ST.stat, 0)), rw = rest ? labelWidth(rest, st(OV_ST.stat, 0)) : 0;
        sx -= Math.max(vw + rw, labelWidth(k, st(OV_ST.tiny, 0)));
        label(gr, v, st(OV_ST.stat, C.fg), sx, y + dp(12));
        if (rest) label(gr, rest, st(OV_ST.stat, C["text-muted"]), sx + vw, y + dp(12));
        label(gr, k, st(OV_ST.tiny, C["text-muted"]), sx, y + dp(36));
        sx -= dp(28);
    }
    const hi = ONL.me ? tr("{0}, {1}", onlGreeting(), String(ONL.me.name).toUpperCase()) : onlGreeting();
    label(gr, fitLabel(hi, st(OV_ST.big, C.fg), sx - x), st(OV_ST.big, C.fg), x, y + dp(14));
    y += dp(64);
    hline(gr, x, y, w, C.fg);
    y += dp(18);

    // ---- the day ----
    const dh = dp(196), dw = dp(170), now = new Date(), P = C.panel;
    const months = tr("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC").split(" "), days = tr("SUN MON TUE WED THU FRI SAT").split(" ");
    gr.FillSolidRect(x, y, w, dh, P);
    box(gr, x, y, w, dh, C["line-faint"]);
    gr.FillSolidRect(x - dp(1), y - dp(1), dp(8), dp(8), C.accent);
    label(gr, tr("DAILY · FOR YOU"), st(OV_ST.tiny, C["text-muted"], P), x + dp(20), y + dp(16));
    label(gr, pad(now.getDate(), 2), st(OV_ST.huge, C.fg, P), x + dp(16), y + dp(34));
    label(gr, fitLabel(`${months[now.getMonth()]}  ·  ${days[now.getDay()]}  ·  ${H0.daily ? tr("{0} SONGS", daily.length) : tr("LOADING")}`, st(OV_ST.tiny, 0), dw - dp(30)),
          st(OV_ST.tiny, C["text-muted"], P), x + dp(20), y + dh - dp(28));
    vline(gr, x + dw, y + HAIR, dh - 2 * HAIR, C.hair);
    // the covers: the first song's large, the next four small beside it, as the width allows (the names need 300 dp)
    const big = dh - dp(36), small = Math.floor((big - dp(8)) / 2), room = w - dw - dp(320);
    const showBig = room >= big + dp(18), showSmall = room >= 2 * big + dp(26);
    let cx = x + dw + dp(18);
    if (showBig) { drawCover(gr, daily[0] && daily[0].cover, cx, y + dp(18), big); cx += big + dp(8); }
    if (showSmall) {
        for (let i = 0; i < 4; i++) drawCover(gr, daily[i + 1] && daily[i + 1].cover, cx + (i % 2) * (small + dp(8)), y + dp(18) + Math.floor(i / 2) * (small + dp(8)), small);
        cx += big + dp(8);
    }
    // the first five by name (a click plays the day from that song)
    const lx = showBig ? cx + dp(16) : x + dw + dp(20), lw = x + w - dp(20) - lx, rh = dp(26);
    if (!H0.daily) label(gr, tr("LOADING"), st(OV_ST.tiny, C["text-muted"], P), lx, y + dp(20));
    const playing = onlineSongOf(fb.GetNowPlaying());
    daily.slice(0, 5).forEach((s, i) => {
        const ry = y + dp(14) + i * rh, can = onlPlayable(s), isNow = !!(playing && playing.id === s.id);
        const hov = can && OV.hover && OV.hover.id === "onl-day" && OV.hover.data === i, bg = hov ? C["panel-hi"] : P;
        if (hov) gr.FillSolidRect(lx - dp(6), ry, lw + dp(6), rh - HAIR, bg);
        const mid = ry + Math.round((rh - labelHeight(OV_ST.row)) / 2);
        label(gr, isNow ? "▶" : pad(i + 1, 2), st(OV_ST.tiny, isNow ? C.accent : C["text-muted"], bg), lx, mid + dp(1));
        const sec = Math.round((s.ms || 0) / 1000), time = `${Math.floor(sec / 60)}:${pad(sec % 60, 2)}`;
        const tag = s.ok === false ? tr("LOCKED") : s.vip && !onlVip(s) ? tr("VIP · TRIAL") : "";
        const tw = labelWidth(time, st(OV_ST.row, 0)), gw = tag ? labelWidth(tag, st(OV_ST.tiny, 0)) + dp(14) : 0;
        label(gr, time, st(OV_ST.row, can ? C["fg-soft"] : C["text-muted"], bg), lx + lw, mid, 2);
        if (tag) label(gr, tag, st(OV_ST.tiny, C["text-muted"], bg), lx + lw - tw - dp(14), mid + dp(1), 2);
        // the title, then "— artists" in the grey, the title keeping at least half the room
        const nx = lx + dp(30), avail = lw - dp(30) - tw - gw - dp(16);
        const tst = st(isNow ? OV_ST.rowB : OV_ST.row, isNow ? C.accent : can ? C.fg : C["text-muted"], bg), ast = st(OV_ST.row, C["text-muted"], bg);
        const who = `  —  ${(s.artists || []).join(" / ")}`, t = fitLabel(s.title, tst, Math.max(avail / 2, avail - labelWidth(who, ast)));
        const tW = label(gr, t, tst, nx, mid);
        if (avail - tW > dp(30)) label(gr, fitLabel(who, ast, avail - tW), ast, nx + tW, mid);
        hline(gr, lx - dp(6), ry + rh - HAIR, lw + dp(6), C.hair);
        if (can) hits.add("onl-day", lx - dp(6), ry, lw + dp(6), rh, i);
    });
    const by = y + dh - dp(46);
    if (playable) {
        const pw = onlButton(gr, `▶  ${tr("PLAY ALL")}`, lx, by, "onl-play", true, "daily", P);
        onlButton(gr, tr("SHUFFLE"), lx + pw + dp(8), by, "onl-play", false, "shuffle", P);
    }
    if (daily.length > 5) {
        const t = tr("+{0} MORE  ›", daily.length - 5), mw = labelWidth(t, st(OV_ST.tiny, 0)), hov = OV.hover && OV.hover.id === "onl-daily-all";
        label(gr, t, st(OV_ST.tiny, hov ? C.accent : C["text-muted"], P), lx + lw, by + dp(10), 2);
        hits.add("onl-daily-all", lx + lw - mw, by + dp(6), mw, dp(18));
    }
    y += dh + dp(28);

    // ---- the online lists played lately, where they were left ----
    const recent = onlRecentShown();
    if (recent.length) {
        label(gr, `▪ ${tr("JUMP BACK IN")}  ·  ${recent.length}`, st(OV_ST.sec, C.fg), x, y);
        y += dp(22);
        const gap = dp(12), cw = (w - 3 * gap) / 4, ch = dp(64);
        recent.forEach((r, i) => {
            const rx = Math.round(x + i * (cw + gap)), hov = OV.hover && OV.hover.id === "onl-recent" && OV.hover.data === i;
            box(gr, rx, y, Math.round(cw), ch, hov ? C.accent : C["line-faint"]);
            const art = r.cover ? null : onlRecentArt(r), cs = ch - 2 * HAIR;
            if (art && art.img) gr.DrawImage(art.img, rx + HAIR, y + HAIR, cs, cs, 0, 0, art.img.Width, art.img.Height);
            else drawCover(gr, r.cover, rx + HAIR, y + HAIR, cs);
            const tx = rx + ch + dp(10), tw = cw - ch - dp(20);
            label(gr, fitLabel(r.name, st(OV_ST.name, C.fg), tw), st(OV_ST.name, C.fg), tx, y + dp(16));
            // (under the name: where it was left; reading it; or that nothing in it plays now)
            const src = r.src === "import" ? tr("IMPORT") : onlSrcName(r.src), busy = ONL.busy === r.pl;
            const meta = busy ? `${tr("LOADING")}…` : r.none ? tr("NOTHING PLAYABLE NOW") : `${src}  ·  ${r.pos} / ${r.count}`;
            label(gr, fitLabel(meta, st(OV_ST.tiny, 0), tw), st(OV_ST.tiny, busy || r.none ? C.accent : C["text-muted"]), tx, y + dp(36));
            const f = r.count ? clamp(r.pos / r.count, 0, 1) : 0;
            if (f) gr.FillSolidRect(rx + ch, y + ch - dp(2), Math.round((cw - ch) * f), dp(2), C.accent);
            hits.add("onl-recent", rx, y, Math.round(cw), ch, i);
        });
        y += ch + dp(28);
    }

    // ---- the account's playlists (its liked songs first), then recommended ones: one tile size, as many as fit ----
    const n = Math.max(3, Math.floor((w + dp(16)) / (dp(136) + dp(16)))), tw = (w - (n - 1) * dp(16)) / n;
    const shelf = (title, list, more) => {
        label(gr, title, st(OV_ST.sec, C.fg), x, y);
        if (more) { const t = tr("SEE ALL  ›"), hov = OV.hover && OV.hover.id === "onl-sec" && OV.hover.data === more; label(gr, t, st(OV_ST.tiny, hov ? C.accent : C["text-muted"]), x1, y, 2); hits.add("onl-sec", x1 - labelWidth(t, st(OV_ST.tiny, 0)), y - dp(2), labelWidth(t, st(OV_ST.tiny, 0)), dp(14), more); }
        y += dp(22);
        if (!list) { label(gr, tr("LOADING"), st(OV_ST.tiny, C["text-muted"]), x, y); y += dp(40); return; }
        list.slice(0, n).forEach((p, i) => drawOnlineTile(gr, p, "onl-pl", x + i * (tw + dp(16)), y, tw));
        y += tw + dp(76);
    };
    const mine = lists ? lists.slice().sort((a, b) => (b.liked ? 1 : 0) - (a.liked ? 1 : 0) || b.own - a.own) : null;
    shelf(`▪ ${tr("YOUR PLAYLISTS")}  ·  ${mine ? mine.length : "—"}`, mine, "playlists");
    shelf(`▪ ${tr("RECOMMENDED")}${H0.picks ? "  ·  " + H0.picks.length : ""}`, H0.picks, null);
    OV.scrollMax = Math.max(0, y + OV.scroll - (H - dp(8)));
    if (OV.scroll > OV.scrollMax) OV.scroll = OV.scrollMax;
}
// A playlist's tile: its cover (the liked songs: their count on a plate, a heart), its name and count; hovered, a ring
// and a play key in the corner (onl-plplay: plays the list without opening it)
function drawOnlineTile(gr, p, id, x, y, w) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w);
    const hov = OV.hover && (OV.hover.id === id || OV.hover.id === "onl-plplay") && OV.hover.data === p.id;
    if (p.liked) {
        const B = C["panel-hi"], cst = st(OV_ST.count, C.fg, B);
        gr.FillSolidRect(x, y, w, w, B);
        box(gr, x, y, w, w, C["line-faint"]);
        gr.FillSolidRect(x - dp(1), y - dp(1), dp(6), dp(6), C.accent);
        onlHeart(gr, x + w - dp(20), y + dp(20), dp(18), C.accent);
        const big = labelWidth(String(p.count), cst) > w - dp(20) ? st(Object.assign({}, OV_ST.count, { size: OV_ST.count.size * (w - dp(20)) / labelWidth(String(p.count), cst) }), C.fg, B) : cst;
        label(gr, String(p.count), big, x + dp(10), y + w - dp(28) - labelHeight(big));
        label(gr, tr("SONGS"), st(OV_ST.tiny, C["text-muted"], B), x + dp(10), y + w - dp(22));
    } else drawCover(gr, p.cover, x, y, w);
    const busy = ONL.busy === p.id;
    if (hov) box(gr, x - dp(3), y - dp(3), w + dp(6), w + dp(6), C.accent, Math.max(HAIR, dp(1)));
    if (hov || busy) {
        // the play key (being read: dark, three dots)
        const k = dp(30), kx = x + w - k - dp(8), ky = y + w - k - dp(8), on = hov && OV.hover.id === "onl-plplay";
        gr.FillSolidRect(kx, ky, k, k, busy || on ? C.fg : C.accent);
        if (busy) for (let i = 0; i < 3; i++) gr.FillSolidRect(kx + dp(8) + i * dp(6), Math.round(ky + k / 2 - dp(1)), dp(3), dp(3), C.bg);
        else icon(gr, "play", kx + k / 2 + dp(1), ky + k / 2, 10, on ? C.bg : C["on-accent"]);
    }
    const name = p.liked ? tr("LIKED SONGS") : p.title;
    label(gr, fitLabel(name, st(OV_ST.name, C.fg), w), st(OV_ST.name, C.fg), x, y + w + dp(12));
    const sub = p.liked ? onlSrcName() : `${tr("{0} SONGS", p.count)}${p.own ? "" : p.owner ? "  ·  " + p.owner : ""}`;
    label(gr, fitLabel(sub, st(OV_ST.tiny, C["text-muted"]), w), st(OV_ST.tiny, C["text-muted"]), x, y + w + dp(30));
    hits.add(id, x, y, w, w + dp(42), p.id);
    if (hov) hits.add("onl-plplay", x + w - dp(38), y + w - dp(38), dp(30), dp(30), p.id);
}
// a heart's outline, about s wide, centred on cx, cy
function onlHeart(gr, cx, cy, s, colour) {
    const k = s / 34, pts = [];
    for (let i = 0; i < 48; i++) {
        const t = i / 48 * 2 * Math.PI;
        pts.push(cx + 16 * Math.pow(Math.sin(t), 3) * k, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2.5) * k);
    }
    try { gr.SetSmoothingMode(4); } catch (e) { /* no smoothing here */ }
    gr.DrawPolygon(colour, Math.max(HAIR, dp(1.4)), pts);
    try { gr.SetSmoothingMode(0); } catch (e) { /* (as above) */ }
}

// ---- all the account's playlists, a grid that scrolls ----
function drawOnlineAll(gr, x, y, x1) {
    const list = ONL.home && ONL.home.playlists ? ONL.home.playlists.slice().sort((a, b) => b.own - a.own) : [], w = x1 - x;
    label(gr, `ONLINE / ${onlSrcName()} / PLAYLISTS`, st(OV_ST.tiny, C["text-muted"]), x, y);
    label(gr, `${tr("MY PLAYLISTS")}  ·  ${list.length}`, st(OV_ST.big, C.fg), x, y + dp(14));
    y += dp(56);
    hline(gr, x, y, w, C.fg);
    y += dp(18);
    const n = Math.max(3, Math.floor((w + dp(16)) / (dp(150) + dp(16)))), tw = (w - (n - 1) * dp(16)) / n, rh = tw + dp(60);
    const rows = Math.ceil(list.length / n);
    OV.scrollMax = Math.max(0, rows * rh - (H - y - dp(24)));
    OV.scroll = clamp(OV.scroll, 0, OV.scrollMax);
    const first = Math.floor(OV.scroll / rh);
    for (let r = first; r < rows && r * rh - OV.scroll < H - y; r++)
        for (let c = 0; c < n && r * n + c < list.length; c++) drawOnlineTile(gr, list[r * n + c], "onl-pl", x + c * (tw + dp(16)), y + r * rh - OV.scroll, tw);
}

// ---- a playlist: its card on the left, its songs on the right ----
function drawOnlinePlaylist(gr, x, y, x1) {
    const pl = onlineList(OV.open.id), meta = OV.open, cw = dp(240);
    const bt = tr("‹  BACK"), bw = labelWidth(bt, st(OV_ST.tiny, 0)), hovB = OV.hover && OV.hover.id === "onl-back";
    label(gr, bt, st(OV_ST.tiny, hovB ? C.accent : C["text-muted"]), x, y);
    hits.add("onl-back", x, y - dp(2), bw, dp(14));
    y += dp(24);
    gr.FillSolidRect(x + dp(8), y + dp(8), cw, cw, C.case);
    drawCover(gr, meta.cover, x, y, cw);
    let cy = y + cw + dp(24);
    label(gr, meta.owner ? `${tr("BY")} ${meta.owner}` : onlSrcName(), st(OV_ST.tiny, C["text-muted"]), x, cy);
    cy += dp(16);
    // the name in two lines at most
    const words = String(meta.title), stB = st(OV_ST.name, C.fg);
    label(gr, fitLabel(words, stB, cw), stB, x, cy);
    cy += dp(28);
    const failed = pl === "failed", tracks = pl && !failed ? pl.tracks : null, ok = tracks ? tracks.filter(onlPlayable).length : 0;
    hline(gr, x, cy, cw, C.fg);
    const cells = [[tracks ? tracks.length : "—", tr("SONGS")], [tracks ? ok : "—", tr("PLAYABLE")], [tracks ? tracks.length - ok : "—", tr("TRIAL / LOCKED")]];
    // (the numbers at one size, the largest that lets the longest fit its third: a liked-songs list runs to thousands)
    const widest = Math.max(...cells.map(([n]) => labelWidth(String(n), st(OV_ST.big, 0))));
    const nst = widest <= cw / 3 - dp(10) ? OV_ST.big : Object.assign({}, OV_ST.big, { size: OV_ST.big.size * (cw / 3 - dp(10)) / widest });
    cells.forEach(([n, k], i) => {
        const ccx = x + i * cw / 3;
        label(gr, String(n), st(nst, i === 2 && tracks && tracks.length - ok ? C.accent : C.fg), ccx, cy + dp(10) + labelHeight(OV_ST.big) - labelHeight(nst));
        label(gr, k, st(OV_ST.tiny, C["text-muted"]), ccx, cy + dp(46));
    });
    cy += dp(72);
    if (tracks && ok) onlButton(gr, `▶  ${tr("PLAY {0}", ok)}`, x, cy, "onl-play", true, "open");
    if (failed) { label(gr, tr("THE LIST DID NOT LOAD"), st(OV_ST.rowB, C.fg), x + cw + dp(40), y); onlButton(gr, tr("TRY AGAIN"), x + cw + dp(40), y + dp(28), "onl-retry", true); return; }
    drawOnlineTracks(gr, tracks, meta.title, x + cw + dp(40), y, x1);
}

// A list of songs from y down (a header row, then the songs, scrolling): a click plays the list from that song
function drawOnlineTracks(gr, tracks, name, lx, y, x1) {
    const lw = x1 - lx;
    OV.tracks = tracks ? { name, list: tracks } : null;
    const cols = [[tr("#"), 0], [tr("TITLE"), dp(44)], [tr("ARTIST"), dp(44) + lw * .42], [tr("TIME"), lw - dp(150)], [tr("STATE"), lw - dp(90)]];
    cols.forEach(([t, cx]) => label(gr, t, st(OV_ST.tiny, C["text-muted"]), lx + cx, y));
    const ty = y + dp(18);
    hline(gr, lx, ty, lw, C.fg);
    if (!tracks) { label(gr, tr("LOADING"), st(OV_ST.tiny, C["text-muted"]), lx, ty + dp(14)); return; }
    const rh = dp(30), top = ty + HAIR;
    OV.scrollMax = Math.max(0, tracks.length * rh - (H - top - dp(24)));
    OV.scroll = clamp(OV.scroll, 0, OV.scrollMax);
    gr.PushClip(lx, top, lw, H - top);
    const playing = onlineSongOf(fb.GetNowPlaying());
    for (let i = Math.floor(OV.scroll / rh); i < tracks.length; i++) {
        const s = tracks[i], ry = top + i * rh - OV.scroll;
        if (ry > H) break;
        const can = onlPlayable(s), hov = OV.hover && OV.hover.id === "onl-track" && OV.hover.data === i, now = playing && playing.id === s.id;
        if (hov && can) gr.FillSolidRect(lx, ry, lw, rh, C.panel);
        const ink = can ? C.fg : C["text-muted"], tb = hov && can ? C.panel : C.bg, mid = ry + Math.round((rh - labelHeight(OV_ST.row)) / 2);
        if (now) gr.FillSolidRect(lx, ry + dp(8), dp(3), rh - dp(16), C.accent);
        label(gr, pad(i + 1, 2), st(OV_ST.tiny, C["text-muted"], tb), lx + dp(8), mid + dp(1));
        label(gr, fitLabel(s.title, st(now ? OV_ST.rowB : OV_ST.row, ink, tb), lw * .42 - dp(56)), st(now ? OV_ST.rowB : OV_ST.row, ink, tb), lx + dp(44), mid);
        label(gr, fitLabel(s.artists.join(" / "), st(OV_ST.row, can ? C["fg-soft"] : C["text-muted"], tb), lw - dp(150) - lw * .42 - dp(56)), st(OV_ST.row, can ? C["fg-soft"] : C["text-muted"], tb), lx + dp(44) + lw * .42, mid);
        const sec = Math.round((s.ms || 0) / 1000);
        label(gr, `${Math.floor(sec / 60)}:${pad(sec % 60, 2)}`, st(OV_ST.row, ink, tb), lx + lw - dp(150), mid);
        const tag = s.ok === false ? tr("LOCKED") : s.vip && !onlVip(s) ? tr("VIP · TRIAL") : "";
        if (tag) label(gr, tag, st(OV_ST.tiny, C["text-muted"], tb), lx + lw - dp(90), mid + dp(1));
        hline(gr, lx, ry + rh - HAIR, lw, C["line-faint"]);
        if (can) hits.add("onl-track", lx, Math.max(top, ry), lw, rh, i);
    }
    gr.PopClip();
}

// ---- search: what the shown service found for the header's search box (playlists on a shelf, then songs) ----
function drawOnlineSearch(gr, x, y, x1) {
    const S = ONL.search, w = x1 - x;
    label(gr, `ONLINE / ${onlSrcName()} / SEARCH`, st(OV_ST.tiny, C["text-muted"]), x, y);
    label(gr, fitLabel(`“${S.q}”`, st(OV_ST.big, C.fg), w), st(OV_ST.big, C.fg), x, y + dp(14));
    y += dp(56);
    hline(gr, x, y, w, C.fg);
    y += dp(18);
    if (S.lists && S.lists.length) {
        const n = Math.max(4, Math.floor((w + dp(16)) / (dp(120) + dp(16)))), tw = (w - (n - 1) * dp(16)) / n;
        label(gr, `▪ ${tr("PLAYLISTS")}`, st(OV_ST.sec, C.fg), x, y);
        S.lists.slice(0, n).forEach((p, i) => drawOnlineTile(gr, p, "onl-pl", x + i * (tw + dp(16)), y + dp(22), tw));
        y += dp(22) + tw + dp(56);
    }
    label(gr, `▪ ${tr("SONGS")}`, st(OV_ST.sec, C.fg), x, y);
    drawOnlineTracks(gr, S.songs, tr("Search · {0}", S.q), x, y + dp(22), x1);
}
// ---- import: what it reads, two ways in, and what was imported this session (each: found / missing, PLAY, the list of
// what is missing, the playlist online) ----
function drawOnlineImport(gr, x, y, x1) {
    const w = x1 - x;
    label(gr, "ONLINE / IMPORT", st(OV_ST.tiny, C["text-muted"]), x, y);
    label(gr, tr("IMPORT A PLAYLIST"), st(OV_ST.big, C.fg), x, y + dp(14));
    y += dp(56);
    hline(gr, x, y, w, C.fg);
    y += dp(18);
    const lines = [tr("A NetEase or QQ Music playlist link, or a file: Exportify's CSV (Spotify), Spotify's data export (Playlist1.json), a CSV, or \"artist - title\" lines."),
                   tr("What your library has becomes a foobar2000 playlist; the rest goes on a list of what is missing.")];
    lines.forEach((l, i) => label(gr, fitLabel(l, st(OV_ST.row, C["fg-soft"]), w), st(OV_ST.row, C["fg-soft"]), x, y + i * dp(20)));
    y += lines.length * dp(20) + dp(18);
    const busy = ONL.importing && ONL.importing.state === "reading";
    let bx = x + onlButton(gr, tr("PASTE A LINK"), x, y, "onl-imp-link", true) + dp(10);
    onlButton(gr, tr("OPEN A FILE"), bx, y, "onl-imp-file", false);
    y += dp(46);
    if (busy) label(gr, tr("READING…"), st(OV_ST.btn, C.accent), x, y);
    else if (ONL.importing && ONL.importing.state === "error") label(gr, fitLabel(ONL.importing.detail, st(OV_ST.row, C.accent), w), st(OV_ST.row, C.accent), x, y);
    y += dp(30);
    // Spotify: a link of its is read once its login is here (the reader's own Spotify app)
    const S = ONL.spotify, sy = y;
    gr.FillSolidRect(x, sy + dp(9), dp(12), dp(12), 0xff1ed760);
    label(gr, "SPOTIFY", st(OV_ST.name, C.fg), x + dp(22), sy + dp(6));
    const who = S.login ? (S.user && S.user.name ? tr("CONNECTED AS {0}", S.user.name) : tr("CONNECTED")) : S.waiting ? tr("LOG IN IN THE BROWSER …") : tr("NOT CONNECTED");
    label(gr, who, st(OV_ST.tiny, S.login ? C.fg : C["text-muted"]), x + dp(120), sy + dp(9));
    // (logged in, but Spotify refuses the app: why, under it — Premium, most likely)
    if (S.login && S.user && S.user.error) { const why = tr(ONL_IMPORT_ERRORS[S.user.error] || S.user.error, ""); label(gr, fitLabel(why, st(OV_ST.tiny, C.accent), x1 - x - dp(320)), st(OV_ST.tiny, C.accent), x + dp(120), sy + dp(27)); }
    const t = S.login ? tr("DISCONNECT") : tr("CONNECT SPOTIFY"), bw = labelWidth(t, st(OV_ST.btn, 0)) + dp(28);
    onlButton(gr, t, x1 - bw, sy, S.login ? "onl-sp-out" : "onl-sp-in", false);
    y += dp(48);
    if (!ONL.imports.length) return;
    label(gr, `▪ ${tr("IMPORTED")}  ·  ${ONL.imports.length}`, st(OV_ST.sec, C.fg), x, y);
    y += dp(22);
    hline(gr, x, y, w, C.fg);
    const rh = dp(64);
    ONL.imports.forEach((r, i) => {
        const ry = y + i * rh;
        if (ry > H) return;
        const src = r.source === "ne" ? "NETEASE" : r.source === "qq" ? "QQ MUSIC" : r.source === "spotify" ? "SPOTIFY" : tr("LOCAL FILE");
        if (r.cover) drawCover(gr, r.cover, x, ry + dp(10), dp(44)); else gr.FillSolidRect(x, ry + dp(10), dp(44), dp(44), C.case);
        label(gr, fitLabel(r.name, st(OV_ST.name, C.fg), w * .4), st(OV_ST.name, C.fg), x + dp(58), ry + dp(14));
        label(gr, src, st(OV_ST.tiny, C["text-muted"]), x + dp(58), ry + dp(36));
        const cx = x + w * .44;
        label(gr, `${r.found} / ${r.total}`, st(OV_ST.rowB, C.fg), cx, ry + dp(14));
        label(gr, r.total - r.found ? tr("{0} MISSING", r.total - r.found) : tr("ALL FOUND"), st(OV_ST.tiny, r.total - r.found ? C.accent : C["text-muted"]), cx, ry + dp(36));
        let ax = x1;
        const act = (t, id, accent) => { const bw = labelWidth(t, st(OV_ST.btn, 0)) + dp(28); ax -= bw; onlButton(gr, t, ax, ry + dp(17), id, accent, i); ax -= dp(8); };
        if (r.source === "ne" || r.source === "qq") act(tr("OPEN ONLINE"), "onl-imp-online", false);
        if (r.file) act(tr("MISSING LIST"), "onl-imp-missing", false);
        if (r.pl) act(`▶  ${tr("PLAY")}`, "onl-imp-play", true);
        hline(gr, x, ry + rh - HAIR, w, C["line-faint"]);
    });
}
// the account's liked songs (its playlist of them)
const onlLikedList = () => ONL.home && ONL.home.playlists ? ONL.home.playlists.find(p => p.liked) || null : null;

// ---- right: what plays now (an online song: its cover and names; else the track's) ----
function drawOnlineNow(gr, x, y, w) {
    label(gr, tr("NOW PLAYING"), st(OV_ST.sec, C["text-muted"]), x, y);
    y += dp(22);
    const h = fb.GetNowPlaying(), s = onlineSongOf(h);
    // (an online song: its cover as the service gave it; a file: its album art)
    const cv = !(s && s.cover) && h ? cover(h, () => window.Repaint()) : null;
    if (s && s.cover) drawCover(gr, s.cover, x, y, w);
    else if (cv && cv.img) gr.DrawImage(cv.img, x, y, w, w, 0, 0, cv.img.Width, cv.img.Height);
    else gr.FillSolidRect(x, y, w, w, C.case);
    y += w + dp(18);
    if (!h) { label(gr, tr("STANDBY"), st(OV_ST.name, C["text-muted"]), x, y); return; }
    const title = s && s.title ? s.title : fb.TitleFormat("%title%").EvalWithMetadb(h), artists = s && s.artists ? s.artists.join(" / ") : fb.TitleFormat("%artist%").EvalWithMetadb(h);
    const album = s && s.album ? s.album : fb.TitleFormat("[%album%]").EvalWithMetadb(h), who = album ? `${artists}  —  ${album}` : artists;
    label(gr, fitLabel(title, st(OV_ST.big, C.fg), w), st(OV_ST.big, C.fg), x, y);
    label(gr, fitLabel(who, st(OV_ST.row, C["fg-soft"]), w), st(OV_ST.row, C["fg-soft"]), x, y + dp(38));
    // where it is: the times either side of a line
    const t = fb.PlaybackTime, len = fb.PlaybackLength, mmss = v => `${pad(Math.floor(v / 60), 2)}:${pad(Math.floor(v % 60), 2)}`;
    const ts = st(OV_ST.tiny, C["text-muted"]), py = y + dp(66), l0 = labelWidth(mmss(t), ts) + dp(10), l1 = len > 0 ? labelWidth(mmss(len), ts) + dp(10) : 0;
    label(gr, mmss(t), ts, x, py - dp(5));
    if (len > 0) label(gr, mmss(len), ts, x + w, py - dp(5), 2);
    hline(gr, x + l0, py, w - l0 - l1, C["line-faint"]);
    if (len > 0) gr.FillSolidRect(x + l0, py - dp(1), Math.round((w - l0 - l1) * clamp(t / len, 0, 1)), dp(3), C.accent);
    y += dp(86);
    hline(gr, x, y, w, C["line-faint"]);
    const loc = plman.GetPlayingItemLocation(), plName = loc.IsValid ? plman.GetPlaylistName(loc.PlaylistIndex) : "";
    const from = plName.replace(/^(NetEase|QQ Music|Import) · /, "");
    const rows = [[tr("SOURCE"), s ? onlSrcName(s.src || "ne") : tr("LOCAL")], [tr("FROM"), from || "—"], [tr("FORMAT"), fb.TitleFormat("%codec% · %bitrate% kbps").EvalWithMetadb(h)]];
    rows.forEach(([k, v], i) => {
        label(gr, k, st(OV_ST.tiny, C["text-muted"]), x, y + dp(14) + i * dp(18));
        label(gr, fitLabel(v, st(OV_ST.tiny, C.fg), w - dp(80)), st(OV_ST.tiny, C.fg), x + dp(80), y + dp(14) + i * dp(18));
    });
    y += dp(14) + 3 * dp(18) + dp(22);
    // what comes after it in its playlist (in the playlist's order: under shuffle or random, nothing is known)
    const next = onlNextItems(loc);
    if (!next.length || y + dp(60) > H) return;
    label(gr, tr("UP NEXT"), st(OV_ST.sec, C["text-muted"]), x, y);
    y += dp(22);
    for (const n of next) {
        if (y + dp(32) > H - dp(16)) break;
        const o = onlineSongOf(n);
        if (o && o.cover) drawCover(gr, o.cover, x, y, dp(32)); else gr.FillSolidRect(x, y, dp(32), dp(32), C.case);
        const nt = o && o.title ? o.title : fb.TitleFormat("%title%").EvalWithMetadb(n), na = o && o.artists ? o.artists.join(" / ") : fb.TitleFormat("%artist%").EvalWithMetadb(n);
        const sec = o && o.ms ? Math.round(o.ms / 1000) : Math.round(n.Length || 0), d = `${Math.floor(sec / 60)}:${pad(sec % 60, 2)}`, dw = labelWidth(d, ts) + dp(8);
        label(gr, fitLabel(nt, st(OV_ST.row, C.fg), w - dp(42) - dw), st(OV_ST.row, C.fg), x + dp(42), y + dp(2));
        label(gr, fitLabel(na, ts, w - dp(42) - dw), ts, x + dp(42), y + dp(19));
        label(gr, d, ts, x + w, y + dp(4), 2);
        y += dp(40);
    }
}
// the next (up to) four items of the playing playlist, kept until the playing item or the list changes
function onlNextItems(loc) {
    const order = plman.PlaybackOrder;
    if (!loc.IsValid || (order !== 0 && order !== 1)) return [];
    const pl = loc.PlaylistIndex, n = plman.PlaylistItemCount(pl), key = `${pl}:${loc.PlaylistItemIndex}:${n}:${order}`;
    if (OV.next && OV.next.key === key) return OV.next.items;
    const all = plman.GetPlaylistItems(pl), items = [];
    for (let k = 1; k <= 4 && items.length < n - 1; k++) {
        const i = loc.PlaylistItemIndex + k;
        if (i < n) items.push(all[i]); else if (order === 1) items.push(all[i - n]); else break;
    }
    OV.next = { key, items };
    return items;
}

// ---- the mouse ----
function onlineMouseMove(a, x) {
    if (x !== undefined) OV.mx = x;
    const h = a && a.id.startsWith("onl-") ? { id: a.id, data: a.data } : null;
    if ((h && h.id) !== (OV.hover && OV.hover.id) || (h && h.data) !== (OV.hover && OV.hover.data)) { OV.hover = h; window.Repaint(); }
    return !!h;
}
function onlineClick(a) {
    if (!a) return;
    if (OV.section === "search" && ONL.search && !OV.open && (a.id === "onl-track" || a.id === "onl-pl")) onlRememberSearch(ONL.search.q);
    if (a.id === "onl-install") { onlineInstall(); return; }
    if (a.id === "onl-qr") { onlineQr(); return; }
    if (a.id === "onl-chan") { onlineQr(a.data); window.Repaint(); return; }
    if (a.id === "onl-imp-link") { onlineImportLink(); return; }
    if (a.id === "onl-sp-in") { onlineSpotifyConnect(); return; }
    if (a.id === "onl-sp-out") { onlineSpotifyLogout(); return; }
    if (a.id === "onl-imp-file") { onlineImportFile(); return; }
    if (a.id === "onl-imp-play") {
        const r = ONL.imports[a.data], pl = r ? plman.FindPlaylist(r.pl) : -1;
        if (pl >= 0) { onlRemember({ src: "import", id: null, name: r.name, cover: r.cover, count: plman.PlaylistItemCount(pl), pl: r.pl, pos: 1 }); plman.ActivePlaylist = pl; plman.ExecutePlaylistDefaultAction(pl, 0); }
        return;
    }
    if (a.id === "onl-imp-missing") { const r = ONL.imports[a.data]; if (r && r.file) try { new ActiveXObject("WScript.Shell").Run(`"${r.file}"`); } catch (e) { /* no viewer */ } return; }
    if (a.id === "onl-imp-online") {
        const r = ONL.imports[a.data];
        if (!r) return;
        onlineSetSource(r.source);
        OV.open = { id: r.id, title: r.name, cover: r.cover }; OV.scroll = 0; window.Repaint(); return;
    }
    if (a.id === "onl-logout") { onlineLogout(); return; }
    if (a.id === "onl-src" && a.data === "spotify") { OV.open = null; OV.section = "import"; OV.scroll = 0; window.Repaint(); return; }
    if (a.id === "onl-src") { if (a.data === ONL.src) { OV.open = null; OV.section = "home"; OV.scroll = 0; window.Repaint(); } else onlineSetSource(a.data); return; }
    if (a.id === "onl-sec" && a.data === "liked") { const l = onlLikedList(); if (l) { OV.open = l; OV.scroll = 0; window.Repaint(); } return; }
    if (a.id === "onl-sec") { OV.open = null; OV.section = a.data; OV.scroll = 0; window.Repaint(); return; }
    if (a.id === "onl-retry" && OV.open) { onlineList(OV.open.id, true); window.Repaint(); return; }
    if (a.id === "onl-back") { OV.open = null; OV.scroll = 0; window.Repaint(); return; }
    if (a.id === "onl-pl") { OV.open = onlPlaylistMeta(a.data); OV.scroll = 0; window.Repaint(); return; }
    if (a.id === "onl-play" && a.data === "daily") { onlinePlay(tr("Daily"), ONL.home.daily, 0, ONL_DAILY()); return; }
    if (a.id === "onl-play" && a.data === "shuffle") {
        const d = ONL.home.daily.slice();
        for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
        onlinePlay(tr("Daily"), d, 0, ONL_DAILY()); return;
    }
    if (a.id === "onl-day") { onlinePlay(tr("Daily"), ONL.home.daily, a.data, ONL_DAILY()); return; }
    if (a.id === "onl-daily-all") { OV.open = ONL_DAILY(); OV.scroll = 0; window.Repaint(); return; }
    if (a.id === "onl-recent") { onlineResume(onlRecentShown()[a.data]); return; }
    if (a.id === "onl-q") { send("online-search-set", a.data); onlineSearch(a.data); return; }
    if (a.id === "onl-plplay") { onlinePlayList(onlPlaylistMeta(a.data)); return; }
    if (a.id === "onl-play" && a.data === "open") { const pl = onlineList(OV.open.id); if (pl && pl !== "failed") onlinePlay(OV.open.title, pl.tracks, 0, OV.open); return; }
    if (a.id === "onl-track" && OV.tracks) { onlinePlay(OV.tracks.name, OV.tracks.list, a.data, OV.open); return; }
}
function onlineWheel(step) {
    if (OV.railMax > 0 && OV.mx < dp(32) + dp(220) + dp(16)) { OV.rail = clamp(OV.rail - step * dp(60), 0, OV.railMax); window.Repaint(); return; }
    if (!OV.open && OV.section === "import") return;
    OV.scroll = clamp(OV.scroll - step * dp(90), 0, OV.scrollMax);
    window.Repaint();
}
