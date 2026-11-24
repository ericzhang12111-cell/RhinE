// The online bridge (2.0): a small local server between the theme, foobar2000 and the music services (NetEase here,
// QQ Music in qq.js). It listens on
// 127.0.0.1 only; every request carries the key the theme gave it (?k=), so no other page or program can use the
// reader's account through it.
//   node bridge.js --data <dir> --key <key> [--port 38517]
// theme/tools/online.ps1 installs it (and Node, and the libraries it names in package.json) beside the profile;
// js/lib/online.js starts it and talks to it.
//
//   GET /status                        { ok, netease: { login, user }, qq: { login, user } }
//   GET /ne/qr                         a login QR code { key, file (a PNG in <data>) }; scanned with the NetEase app
//   GET /ne/qr/check?id=<key>          { state: wait | scanned | ok | expired }; on ok the session is kept
//   GET /ne/logout
//   GET /ne/me                         the account { uid, name, avatar, vip }
//   GET /ne/playlists                  the account's playlists (own and collected)
//   GET /ne/playlist/<id>              a playlist and its tracks (?fresh=1: not the one kept; ?gentle=1: slowly,
//                                      and partial: true when some of its songs could not be read, throttled: true
//                                      too when NetEase refused them, where without it the list fails)
// A failure answers 502 { error, code (the service's), throttled (when it said too often) }.
//   GET /ne/likes                      the liked songs' ids
//   GET /ne/daily                      the daily recommended songs
//   GET /ne/picks                      recommended playlists
//   GET /ne/search?q=&type=song|album|playlist|artist&offset=
//   GET /ne/pl/add?pid=&ids= · /ne/pl/del?pid=&ids=   songs into / out of one of the account's lists ({ ok, already })
//   GET /ne/pl/create?name=&private= · /ne/pl/rename?id=&name= · /ne/pl/delete?id= · /ne/pl/collect?id=&on=1|0
//   GET /ne/play/<id>                  302 to the song's stream, asked anew each time (the stream's address lasts
//                                      20 minutes; a playlist keeps this one): what foobar2000's playlists hold
//   GET /qq/...                        the same for QQ Music (qq.js)
//   GET /import/link?url= · /import/file?path=   a playlist from elsewhere, read for the theme to match (importer.js)
//   GET /spotify/...                   the reader's own Spotify app: a login, for importing its playlists (spotify.js)
//
// The session (the account's cookie) is kept in <data>/netease.session, encrypted for this Windows user (DPAPI).
// Never used: the library's `unblock` (other sites' copies of a song) and `realIP` (a made-up mainland address).
const http = require('http')
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')

const arg = name => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : null }
const DATA = arg('data'), KEY = arg('key'), PORT = +(arg('port') || 38517)
if (!DATA || !KEY) { console.error('usage: node bridge.js --data <dir> --key <key> [--port n]'); process.exit(2) }
fs.mkdirSync(path.join(DATA, 'tmp'), { recursive: true })
// the library keeps its own state (anonymous token, keys) in the temp folder: ours
process.env.TMP = process.env.TEMP = path.join(DATA, 'tmp')
const api = require('@neteasecloudmusicapienhanced/api')
const { cookieToJson, generateDeviceId } = require('@neteasecloudmusicapienhanced/api/util')

// One device to NetEase, always the same (its id kept), with the cookies it was given kept and sent back (a jar): a
// login code is bound to the device that asked for it, so a code asked for by one and checked by another (no cookies,
// a new id each time) never sees the scan.
const DEVICE = path.join(DATA, 'netease.device')
let device = null
try { device = JSON.parse(fs.readFileSync(DEVICE, 'utf8')) } catch (e) { /* first run */ }
if (!device || !device.id) { device = { id: generateDeviceId(), jar: {} }; fs.writeFileSync(DEVICE, JSON.stringify(device)) }
global.deviceId = device.id
const keepCookies = list => {
    let changed = false
    for (const c of list || []) {
        const [kv] = String(c).split(';'), i = kv.indexOf('=')
        if (i <= 0) continue
        const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim()
        // (the account's own cookies go to the session, not the device's jar)
        if (k === 'MUSIC_U' || k === '__csrf' || device.jar[k] === v) continue
        device.jar[k] = v; changed = true
    }
    if (changed) fs.writeFileSync(DEVICE, JSON.stringify(device))
}

// ---- the session, encrypted for this Windows user ----
const SESSION = path.join(DATA, 'netease.session')
function dpapi(op, text) {
    const ps = op === 'protect'
        ? '$s = [Console]::In.ReadToEnd(); ConvertTo-SecureString $s -AsPlainText -Force | ConvertFrom-SecureString'
        : '$s = ConvertTo-SecureString ([Console]::In.ReadToEnd().Trim()); [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))'
    // (without PSModulePath: started from foobar2000 it can name PowerShell 7's modules, which Windows PowerShell's
    // ConvertTo-SecureString then fails on)
    const env = { ...process.env }; delete env.PSModulePath
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { input: text, encoding: 'utf8', windowsHide: true, env }).trim()
}
let ne = { cookie: '', user: null }
// The account as NetEase has it now: its VIP level changes when VIP is bought or runs out, and the one saved at the
// login would keep the VIP songs locked (or open). Read again on the first status after a start and every 10 minutes
// at most after that; the saved one stands meanwhile, or when the read fails.
const neUser = a => a && a.profile ? { uid: a.profile.userId, name: a.profile.nickname, avatar: pic(a.profile.avatarUrl, 120), vip: (a.account || {}).vipType || 0 } : null
let userAt = 0, userAsk = null
function freshUser() {
    if (!ne.cookie || Date.now() - userAt < 10 * 60e3) return Promise.resolve()
    if (!userAsk) userAsk = (async () => {
        try {
            const u = neUser(await call('user_account'))
            if (u && JSON.stringify(u) !== JSON.stringify(ne.user)) { ne.user = u; saveSession() }
        } catch (e) { /* the saved one */ }
        userAt = Date.now(); userAsk = null
    })()
    return userAsk
}
if (fs.existsSync(SESSION)) try { ne = JSON.parse(dpapi('unprotect', fs.readFileSync(SESSION, 'utf8'))) } catch (e) { console.log('session not read:', String(e).slice(0, 200)) }
const saveSession = () => {
    if (ne.cookie) fs.writeFileSync(SESSION, dpapi('protect', JSON.stringify(ne)))
    else if (fs.existsSync(SESSION)) fs.unlinkSync(SESSION)
}

// ---- what the theme gets: only what it draws, in one shape for every service ----
const pic = (u, px = 300) => u ? `${u}?param=${px}y${px}` : ''
// (every song handed out is kept by id: its stream's tag says what it is)
const known = new Map()   // id (QQ Music's: qq:<mid>) -> { title, artists, album, pic (the cover for the tag) }
const song = s => {
    const al = s.al || s.album || {}
    const o = {
        id: String(s.id), title: s.name, artists: (s.ar || s.artists || []).map(a => a.name),
        album: al.name || '', cover: pic(al.picUrl), ms: s.dt || s.duration || 0,
        // fee 1 / 4: the account must have bought it or be VIP; st < 0 or no privilege: not in this region
        vip: s.fee === 1 || s.fee === 4,
        // what the Archive builds its online albums from (songs of one album id together, in disc / track order, the
        // year on the case, the cover at any size: pic is the bare address, ?param= asks for a size). publishTime is
        // the release day's midnight in Beijing (UTC+8): read in UTC a 1 January release would be the year before.
        alId: String(al.id || 0), no: s.no || 0, cd: parseInt(s.cd, 10) || 1,
        year: s.publishTime > 0 ? new Date(s.publishTime + 8 * 3600 * 1000).getUTCFullYear() : 0, pic: al.picUrl || '',
    }
    known.set(o.id, { title: o.title, artists: o.artists, album: o.album, pic: al.picUrl ? `${al.picUrl}?param=600y600` : '' })
    if (known.size > 20000) known.delete(known.keys().next().value)
    return o
}
const playlist = p => ({ id: String(p.id), title: p.name, cover: pic(p.coverImgUrl || p.picUrl), count: p.trackCount || 0,
                         owner: (p.creator || {}).nickname || '', own: !!(ne.user && p.creator && p.creator.userId === ne.user.uid),
                         liked: p.specialType === 5,   // (the account's liked songs)
                         // when its songs last changed: the Archive asks again only for a list whose upd moved
                         upd: p.trackUpdateTime || p.updateTime || 0 })
const playable = (s, priv) => {
    const p = priv || s.privilege || {}
    return p.st == null ? true : p.st >= 0 && p.pl > 0   // pl: the highest bitrate this account may play now
}

// What the library needs before its first request, kept in our temp folder: an anonymous token (asked for only without an
// account), the xeapi public key (the stream addresses are asked for with it; renewed when it says) and the neapi key.
// The library's own generateConfig does these but under a new device id each time; ours keeps the one device.
const TMP = process.env.TMP
let ready = null
const prepare = () => ready || (ready = (async () => {
    const anon = path.join(TMP, 'anonymous_token')
    if (!ne.cookie && !(fs.existsSync(anon) && fs.readFileSync(anon, 'utf8'))) try {
        const r = await api.register_anonimous({})
        const c = cookieToJson((r.body && r.body.cookie) || '')
        if (c.MUSIC_A) fs.writeFileSync(anon, c.MUSIC_A)
    } catch (e) { console.log('anonymous token:', e && e.body ? JSON.stringify(e.body).slice(0, 120) : e) }
    global.deviceId = device.id   // (register_anonimous sets its own)
    try {
        const file = path.join(TMP, 'xeapi_public_key')
        let cur = {}
        try { cur = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { /* none yet */ }
        const next = Number(cur.nextUpdateTime) || 0, at = next < 1e12 ? next * 1000 : next
        if (!cur.publicKey || !cur.sk || (at && Date.now() >= at)) {
            const { getXeapiPublicKey } = require('@neteasecloudmusicapienhanced/api/util/xeapiKey')
            fs.writeFileSync(file, JSON.stringify(await getXeapiPublicKey(cur, device.id)))
        }
    } catch (e) { console.log('xeapi key:', e) }
    try {
        const { loadNeapiKey } = require('@neteasecloudmusicapienhanced/api/util/neapiKey')
        const cur = loadNeapiKey()
        await require('@neteasecloudmusicapienhanced/api/module/register_neapikey')({ version: cur ? cur.version : 0, behavior: cur ? 'update' : 'open' }, null)
    } catch (e) { console.log('neapi key:', e) }
})())

const call = async (fn, q = {}) => {
    await prepare()
    const r = await api[fn]({ ...q, cookie: { ...device.jar, ...cookieToJson(ne.cookie || '') }, timestamp: Date.now() })
    // (playlist_tracks wraps the library's whole answer, its cookies too, in its body)
    keepCookies(r.cookie || (r.body && r.body.cookie))
    return r.body
}
// NetEase's answer when asked too often: 405 ("操作频繁"), -460 / -462 (its "cheating" check), 429, or a message saying
// so. Such a call is asked again after a pause, three times at most and each pause longer (a playlist of thousands
// is a dozen calls in a row, and one refused among them would otherwise lose the lot); anything else fails at once,
// as before.
const THROTTLE_CODES = new Set([405, 429, -460, -462])
const throttled = e => !!(e && e.body && (THROTTLE_CODES.has(Number(e.body.code)) || /频繁|frequent|拥挤|cheating/i.test(String(e.body.message || e.body.msg || ''))))
const sleep = ms => new Promise(ok => setTimeout(ok, ms))
const RETRY_WAITS = [5000, 15000, 45000]
const callRetry = async (fn, q = {}) => {
    for (let i = 0; ; i++) {
        try { return await call(fn, q) }
        catch (e) { if (i >= RETRY_WAITS.length || !throttled(e)) throw e; console.log(`${fn}: throttled (${e.body.code}), again in ${RETRY_WAITS[i] / 1000} s`); await sleep(RETRY_WAITS[i]) }
    }
}

const lists = new Map()   // playlist id -> { body, until }: the last answer for it

const qq = require('./qq.js')({ DATA, dpapi, known })

const routes = {
    async '/status'() {
        await Promise.race([freshUser(), sleep(4000)])
        return { ok: true, netease: { login: !!ne.cookie, user: ne.user }, qq: qq.status() }
    },

    async '/ne/qr'() {
        const key = (await call('login_qr_key')).data.unikey
        // (the app confirms a login for this kind of link; scanned, the library's login?codekey= link only logged
        // the app's own web page in)
        const url = `https://music.163.com/st/platform/scanlogin?codekey=${key}`, file = path.join(DATA, 'qr.png')
        await require('qrcode').toFile(file, url, { margin: 2, scale: 10 })
        return { key, file }
    },
    async '/ne/qr/check'(q) {
        const r = await call('login_qr_check', { key: q.get('id') })
        const code = r.code
        if (code === 803) {
            ne.cookie = r.cookie
            ne.user = neUser(await call('user_account'))
            userAt = Date.now()
            saveSession()
        }
        return { state: { 800: 'expired', 801: 'wait', 802: 'scanned', 803: 'ok' }[code] || 'error', code, message: r.message || undefined }
    },
    async '/ne/logout'() { if (ne.cookie) try { await call('logout') } catch (e) { /* gone */ } ne = { cookie: '', user: null }; saveSession(); return { ok: true } },
    async '/ne/me'() { return ne.user },

    async '/ne/playlists'() {
        if (!ne.user) return []
        return ((await call('user_playlist', { uid: ne.user.uid, limit: 1000 })).playlist || []).map(playlist)
    },
    // A playlist and all its songs (a liked-songs list runs to thousands): its song ids once, then the songs a thousand
    // at a time, four of those at once (the library's playlist_track_all asks for the whole list again for each
    // thousand: 60 s for 8000 songs). Kept 10 minutes (?fresh=1: asked anew).
    // ?gentle=1 (the Archive's own reading, in the background, where time does not matter): one thousand at a time,
    // with a pause between. Each call is asked again when NetEase says too often (callRetry). Once NetEase has refused a
    // thousand three times over, the rest are not asked for (they would only be refused too). A thousand that still
    // fails: for a gentle reading the songs got are given with partial: true (and throttled: true when NetEase's
    // refusals stopped it), and such an answer is not kept; for any other (05 ONLINE keeps what it is given as the
    // whole list) the list fails, as before.
    // Each song carries added, when it was put in the list (ms; liked songs: when liked).
    async '/ne/playlist/:id'(q, id) {
        const kept = lists.get(id), eg = edits.get(id) || 0
        if (kept && Date.now() < kept.until && !q.get('fresh')) return kept.body
        const gentle = !!q.get('gentle')
        const d = await callRetry('playlist_detail', { id, s: 0 })
        const tids = (((d.playlist || {}).trackIds) || []).slice(0, 20000)
        const ids = tids.map(t => t.id), added = new Map(tids.map(t => [t.id, t.at || 0]))
        const chunks = []; for (let i = 0; i < ids.length; i += 1000) chunks.push(ids.slice(i, i + 1000))
        const got = new Array(chunks.length).fill(null)
        // (stop: NetEase refused one too often, kept apart from error, which a later failure of another kind in one of
        // the other workers would replace)
        let next = 0, failed = 0, error = null, stop = null
        const worker = async () => {
            while (next < chunks.length && !stop) {
                const k = next++
                if (gentle && k) await sleep(800)
                try { got[k] = await callRetry('song_detail', { ids: chunks[k].join(',') }) }
                catch (e) { failed++; error = e; if (throttled(e) && !stop) stop = e; console.log(`playlist ${id}: songs ${k * 1000}+ not read:`, e && e.body ? JSON.stringify(e.body).slice(0, 160) : String(e)) }
            }
        }
        await Promise.all(Array.from({ length: gentle ? 1 : 4 }, worker))
        // (not one thousand read: the list's failure, as before, with NetEase's code for the theme)
        if (chunks.length && !got.some(Boolean)) throw stop || error
        if (!gentle && (failed || next < chunks.length)) throw stop || error
        const byId = new Map(), priv = new Map()
        for (const g of got.filter(Boolean)) {
            for (const s of g.songs || []) byId.set(s.id, s)
            for (const p of g.privileges || []) priv.set(p.id, p)
        }
        const tracks = ids.map(i => byId.get(i)).filter(Boolean).map(s => ({ ...song(s), ok: playable(s, priv.get(s.id)), added: added.get(s.id) || 0 }))
        const body = { ...playlist(d.playlist || {}), tracks }
        if (failed || next < chunks.length) { body.partial = true; if (stop) body.throttled = true; return body }
        // (edited while it was read: what was read may be from before the edit, so it is not kept)
        if ((edits.get(id) || 0) === eg) lists.set(id, { body, until: Date.now() + 10 * 60 * 1000 })
        if (lists.size > 40) lists.delete(lists.keys().next().value)
        return body
    },
    async '/ne/likes'() { return ne.user ? ((await call('likelist', { uid: ne.user.uid })).ids || []).map(String) : [] },
    async '/ne/daily'() {
        const d = await call('recommend_songs')
        return ((d.data || {}).dailySongs || []).map(s => ({ ...song(s), ok: playable(s) }))
    },
    async '/ne/picks'() { return ((await call('personalized', { limit: 30 })).result || []).map(playlist) },
    async '/ne/search'(q) {
        const type = { song: 1, album: 10, artist: 100, playlist: 1000 }[q.get('type') || 'song'] || 1
        const r = (await call('cloudsearch', { keywords: q.get('q') || '', type, limit: 30, offset: +(q.get('offset') || 0) })).result || {}
        if (type === 1) return (r.songs || []).map(s => ({ ...song(s), ok: playable(s) }))
        if (type === 1000) return (r.playlists || []).map(playlist)
        if (type === 10) return (r.albums || []).map(a => ({ id: String(a.id), title: a.name, artists: (a.artists || []).map(x => x.name), cover: pic(a.picUrl), count: a.size || 0 }))
        return (r.artists || []).map(a => ({ id: String(a.id), title: a.name, cover: pic(a.picUrl || a.img1v1Url) }))
    },

    // ---- the account's playlists edited (05 ONLINE's right-click menus): each answers { ok } or fails as any route ----
    // songs put into / taken out of one of the account's own lists (ids: a comma list). The liked songs are liked and
    // unliked instead (NetEase's heart), one song at a time, so the heart in NetEase's app agrees.
    async '/ne/pl/add'(q) { return plSongs(q, 'add') },
    async '/ne/pl/del'(q) { return plSongs(q, 'del') },
    // a new list (private=1: one only the account sees) -> { ok, playlist } in /ne/playlists' shape
    async '/ne/pl/create'(q) {
        mustLogin()
        const name = String(q.get('name') || '').trim()
        if (!name) throw { body: { code: 400, message: 'no name' } }
        const b = must(await callEdit('playlist_create', { name, privacy: q.get('private') === '1' ? '10' : '0' }))
        const p = b.playlist || { id: b.id, name }
        return { ok: true, playlist: { ...playlist(p), own: true, count: p.trackCount || 0 } }
    },
    async '/ne/pl/rename'(q) {
        mustLogin()
        const id = plId(q), name = String(q.get('name') || '').trim()
        if (!name) throw { body: { code: 400, message: 'no name' } }
        must(await callEdit('playlist_name_update', { id, name }))
        edited(id)
        return { ok: true }
    },
    // (never the liked songs: NetEase has no account without them)
    async '/ne/pl/delete'(q) {
        mustLogin()
        const id = plId(q)
        if (id === await likedId()) throw { body: { code: 400, message: 'the liked songs cannot be deleted' } }
        must(await callEdit('playlist_delete', { id }))
        edited(id)
        return { ok: true }
    },
    // someone else's list collected into the account's (on=1), or let go (on=0)
    async '/ne/pl/collect'(q) {
        mustLogin()
        const id = plId(q), on = q.get('on') !== '0'
        must(await callEdit('playlist_subscribe', { id, t: on ? 1 : 2 }))   // (t a number: the library checks === 1)
        return { ok: true }
    },
}

// ---- editing: NetEase's answers checked ----
// call() hands back the body even when it says no: the library lets some failures through as answers (code 502 among
// them), and playlist_tracks turns every failure into one (and wraps its success in another layer)
const unwrap = b => b && b.code === undefined && b.body && typeof b.body === 'object' ? b.body : b
function must(b) {
    const r = unwrap(b)
    if (r && r.code === 200) return r
    throw { body: r && r.code !== undefined ? r : { code: -1, message: 'no answer' } }
}
// An edit, asked once more after a short pause when NetEase says too often (whether it fails with that or, as
// playlist_tracks does, answers with it): the theme waits a minute at most for an edit, where callRetry can wait longer
async function callEdit(fn, q) {
    for (let i = 0; ; i++) {
        let b, e = null
        try { b = await call(fn, q); if (throttled({ body: unwrap(b) })) e = { body: unwrap(b) } } catch (x) { e = x }
        if (!e) return b
        if (i >= 1 || !throttled(e)) throw e
        console.log(`${fn}: throttled (${e.body.code}), again in 4 s`)
        await sleep(4000)
    }
}
// how many times a list was edited: a reading of it that began before an edit is not kept (/ne/playlist/:id)
const edits = new Map()   // list id -> n
const edited = id => { edits.set(id, (edits.get(id) || 0) + 1); lists.delete(id) }
function mustLogin() { if (!ne.user) throw { body: { code: 301, message: 'not logged in' } } }
function plId(q) {
    const id = String(q.get('pid') || q.get('id') || '')
    if (!/^\d+$/.test(id)) throw { body: { code: 400, message: 'no playlist' } }
    return id
}
// the account's liked-songs list (specialType 5): learned from its playlists, once per account
let liked = { uid: 0, id: '' }
async function likedId() {
    if (liked.uid !== ne.user.uid || !liked.id) {
        const all = (await call('user_playlist', { uid: ne.user.uid, limit: 1000 })).playlist || []
        const p = all.find(x => x.specialType === 5)
        liked = { uid: ne.user.uid, id: p ? String(p.id) : '' }
    }
    return liked.id
}
// /ne/pl/add, /ne/pl/del -> { ok, already } (already: every song was in the list already, nothing added)
async function plSongs(q, op) {
    mustLogin()
    const pid = plId(q), ids = String(q.get('ids') || '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).slice(0, 500)
    if (!ids.length) throw { body: { code: 400, message: 'no songs' } }
    let already = false
    if (pid === await likedId()) {
        for (const [i, id] of ids.entries()) { if (i) await sleep(300); must(await callEdit('like', { id, like: op === 'add' ? 'true' : 'false' })) }
    } else {
        const b = await callEdit('playlist_tracks', { op, pid, tracks: ids.join(',') })
        const r = unwrap(b)
        // (NetEase's "歌单内歌曲重复": the songs are there already, which is what was wanted)
        already = op === 'add' && !!r && r.code === 502 && /重复|exist/i.test(String(r.message || r.msg || ''))
        if (!already) must(b)
    }
    edited(pid)
    return { ok: true, already }
}

const spotify = require('./spotify.js')({ DATA, PORT, dpapi })
const importer = require('./importer.js')({ routes, qq, spotify })

// what the stream would be (for the view: its level, size, a trial's span)
routes['/ne/url/:id'] = async (q, id) => {
    const d = ((await call('song_url_v1', { id, level: q.get('level') || 'lossless' })).data || [])[0] || {}
    return { id: String(d.id), ok: !!d.url, code: d.code, level: d.level, type: d.type, br: d.br, size: d.size, ms: d.time, trial: d.freeTrialInfo || null, fee: d.fee, expires: d.expi }
}

// ---- the stream ----
// The best the reader allowed (setting later) that the account may play here. foobar2000 opens a stream several times
// (its start, its end for the tags, back), so an address is kept while it lasts (expi seconds, less a margin), and
// asked for once.
// Hi-Res first (24-bit, up to 192 kHz, for the accounts that have it; NetEase answers with the best it has up to the
// level asked), lossless when that gives no address; the level that worked is kept for the song, so an address asked
// for again later is for the same file (foobar2000 keeps the size of its first open).
const streams = new Map(), levels = new Map()
async function stream(id) {
    let s = streams.get(id)
    if (!s || Date.now() > s.until) {
        const ask = async level => ((await call('song_url_v1', { id, level })).data || [])[0] || {}
        let level = levels.get(id) || 'hires', d = await ask(level)
        if (!d.url && level === 'hires') { level = 'lossless'; d = await ask(level) }
        if (d.url) { levels.set(id, level); if (levels.size > 5000) levels.delete(levels.keys().next().value) }
        s = { url: d.url, code: d.code, level: d.level, until: Date.now() + (d.url ? Math.min(15 * 60, (d.expi || 1200) - 120) * 1000 : 30 * 1000) }
        streams.set(id, s)
        if (streams.size > 500) streams.delete(streams.keys().next().value)
    }
    return s
}
const fetchRange = (url, range) => new Promise((ok, fail) => {
    const req = (url.startsWith('https') ? require('https') : http).get(url, { headers: range ? { Range: range } : {} }, ok)
    req.on('error', fail)
    req.setTimeout(15000, () => req.destroy(new Error('timeout')))
})
const fetchAll = async url => {
    const r = await fetchRange(url)
    if (r.statusCode !== 200) { r.resume(); throw new Error(`HTTP ${r.statusCode}`) }
    const parts = []; for await (const c of r) parts.push(c)
    return Buffer.concat(parts)
}

// ---- what a stream says it is ----
// The services' streams carry little of the song (their MP3s no tag at all, their FLACs at most what the service's
// encoder wrote), so foobar2000 would know a song by its playlist line only. Each is relayed with a head of our own
// in place of what it had: an MP3 with an ID3v2.4 tag before it (id3), a FLAC with its metadata blocks rebuilt
// (flacHead). Both name the title, the artists each a value of their own, the album, and carry the album's cover.
// The cover also goes to <data>/art/<name>.jpg (name: the NetEase id, qq-<mid> for QQ Music), where the theme finds
// it, for every stream whatever its kind: foobar2000 reads no pictures from a stream.
const ART = path.join(DATA, 'art')
const NONE = Buffer.alloc(0)
const arts = new Map()   // name -> the cover's bytes, a promise (null: none); asked for once however often it is opened
function saveArt(name, getMeta) {
    let p = arts.get(name)
    if (p) return p
    p = (async () => {
        const file = path.join(ART, `${name}.jpg`)
        // (saved by an earlier play: the same song has the same cover)
        try { const kept = fs.readFileSync(file); if (kept.length) return kept } catch (e) { /* not yet */ }
        const m = await getMeta()
        // (no picture known: not remembered, the details may come next time)
        if (!m.pic) throw new Error('no picture')
        const img = await fetchAll(m.pic)
        // (written whole or not at all: the theme may read it the moment it appears)
        try { fs.mkdirSync(ART, { recursive: true }); fs.writeFileSync(file + '.part', img); fs.renameSync(file + '.part', file) } catch (e) { /* the tag still has it */ }
        return img
    })().catch(() => { if (arts.get(name) === p) arts.delete(name); return null })   // (a failed download: tried again next time)
    arts.set(name, p)
    if (arts.size > 32) arts.delete(arts.keys().next().value)
    return p
}
// (the services' "jpg" may be a PNG)
function pictureMime(img) { return img[0] === 0x89 && img[1] === 0x50 ? 'image/png' : 'image/jpeg' }

const tags = new Map()   // name -> Buffer
async function neMeta(id) {
    let m = known.get(id)
    if (!m) try { const d = await call('song_detail', { ids: id }); if (d.songs && d.songs[0]) { song(d.songs[0]); m = known.get(id) } } catch (e) { /* nameless */ }
    return m || { title: '', artists: [], album: '', pic: '' }
}
async function id3(name, getMeta) {
    if (tags.has(name)) return tags.get(name)
    const m = await getMeta()
    const syncsafe = (buf, at, n) => { for (let i = 0; i < 4; i++) buf[at + 3 - i] = (n >> (7 * i)) & 0x7f }
    const frame = (name, data) => { const h = Buffer.alloc(10); h.write(name, 0, 'latin1'); syncsafe(h, 4, data.length); return Buffer.concat([h, data]) }
    // (UTF-8; several values apart by a zero byte)
    const text = (name, values) => (values = [].concat(values).filter(Boolean)).length ? frame(name, Buffer.concat([Buffer.from([3]), Buffer.from(values.join('\0'), 'utf8')])) : Buffer.alloc(0)
    const frames = [text('TIT2', m.title), text('TPE1', m.artists), text('TALB', m.album)]
    const img = await saveArt(name, getMeta)
    if (img) frames.push(frame('APIC', Buffer.concat([Buffer.from([0]), Buffer.from(pictureMime(img) + '\0\x03\0', 'latin1'), img])))
    const body = Buffer.concat(frames), head = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0])
    syncsafe(head, 6, body.length)
    const tag = Buffer.concat([head, body])
    tags.set(name, tag)
    if (tags.size > 64) tags.delete(tags.keys().next().value)
    return tag
}

// A FLAC's metadata: "fLaC", then blocks, each a 4-byte header (the last one's flag, 1 bit; its type, 7; its length,
// 24, big-endian) and its body, STREAMINFO (type 0, 34 bytes) first; the audio frames follow the last. Read from the
// stream's first bytes, as far as they go: { blocks: [{ type, data }], end (where the frames start) } once all are
// there, { need: n } when the first n bytes are needed to go on, null when this is no FLAC we can rewrite (the first
// frame's sync code is looked for too: a block whose length lies would put it elsewhere).
function flacParse(buf) {
    if (buf.length < 4) return { need: 4 }
    if (buf.toString('latin1', 0, 4) !== 'fLaC') return null
    const blocks = []
    for (let at = 4; ;) {
        if (at + 4 > buf.length) return { need: at + 4 }
        const last = buf[at] & 0x80, type = buf[at] & 0x7f, len = buf.readUIntBE(at + 1, 3)
        if (type === 127 || (blocks.length ? type === 0 : type !== 0 || len !== 34)) return null
        if (at + 4 + len > buf.length) return { need: at + 4 + len }
        blocks.push({ type, data: buf.subarray(at + 4, at + 4 + len) })
        at += 4 + len
        if (!last) continue
        if (at + 2 > buf.length) return { need: at + 2 }
        return buf[at] === 0xff && (buf[at + 1] & 0xfe) === 0xf8 ? { blocks, end: at } : null
    }
}
// VORBIS_COMMENT's body: little-endian lengths, a vendor string, then NAME=value fields (an artist each a field)
function vorbisComment(m) {
    const fields = [['TITLE', m.title], ...[].concat(m.artists || []).map(a => ['ARTIST', a]), ['ALBUM', m.album]]
        .filter(f => f[1]).map(([k, v]) => Buffer.from(`${k}=${v}`, 'utf8'))
    const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }
    const vendor = Buffer.from('RhinE bridge', 'utf8')
    return Buffer.concat([u32(vendor.length), vendor, u32(fields.length), ...fields.flatMap(f => [u32(f.length), f])])
}
// PICTURE's body: big-endian; type 3 (the front cover), its MIME type, no description, its size and colours left 0
// (unknown, which readers accept), then the picture
function flacPicture(img) {
    const mime = Buffer.from(pictureMime(img), 'latin1'), u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b }
    return Buffer.concat([u32(3), u32(mime.length), mime, u32(0), u32(0), u32(0), u32(0), u32(0), u32(img.length), img])
}
// The metadata served in place of the original's: its blocks kept (STREAMINFO still first; SEEKTABLE's offsets count
// from the first frame, so they still hold) but for its padding and, when we know the song's title, its own comments
// and pictures, which ours replace; the last block flagged as such.
function flacHeader(blocks, m, img) {
    const named = !!(m && m.title)
    const ours = named ? [{ type: 4, data: vorbisComment(m) }] : []
    if (named && img && img.length + 64 <= 0xffffff) ours.push({ type: 6, data: flacPicture(img) })
    const all = blocks.filter(b => b.type !== 1 && !(named && (b.type === 4 || b.type === 6))).concat(ours)
    return Buffer.concat([Buffer.from('fLaC', 'latin1'), ...all.map((b, i) => {
        const h = Buffer.alloc(4)
        h[0] = (i === all.length - 1 ? 0x80 : 0) | b.type; h.writeUIntBE(b.data.length, 1, 3)
        return Buffer.concat([h, b.data])
    })])
}
// Bytes a..b (inclusive) of a stream served as head + the original from skip on: the part from the head ([from, to),
// null if none) and the part from the original ([from, to], inclusive as a Range header asks, null if none).
function servedRange(a, b, H, skip) {
    return { head: a < H ? [a, Math.min(b + 1, H)] : null, orig: b >= H ? [Math.max(a, H) - H + skip, b - H + skip] : null }
}

// bytes from..to of a stream (fewer if it ends before)
async function readRange(url, from, to) {
    const r = await fetchRange(url, `bytes=${from}-${to}`)
    const start = /^bytes (\d+)-/.exec(r.headers['content-range'] || '')
    if (!(r.statusCode === 206 && start && +start[1] === from) && !(r.statusCode === 200 && from === 0)) { r.resume(); throw new Error(`HTTP ${r.statusCode}`) }
    const want = to - from + 1, parts = []
    let got = 0
    for await (const c of r) { parts.push(c); got += c.length; if (got >= want) break }   // (a server sending all of it: left there)
    r.destroy()
    return Buffer.concat(parts).subarray(0, want)
}
// A FLAC stream's new metadata, { head, metaEnd } (metaEnd: where the original's frames start), or null: served as it
// is then (nothing here may stop a song playing). Built once per song and size (its first bytes read until all its
// blocks are in), kept for 32 songs (a head holds a cover); a build that failed is not tried again for this address.
const flat = new Set()    // name/size: served as it is for the session (its head could not be built)
const flacs = new Map()   // name/size -> a promise of { head, metaEnd } or null
async function buildFlacHead(name, s, getMeta) {
    let buf = NONE, r
    while ((r = flacParse(buf)) && r.need) {
        if (r.need > s.size || r.need > 16 * 1024 * 1024) throw new Error('metadata past the end')
        const more = await readRange(s.url, buf.length, Math.min(s.size, Math.max(r.need, buf.length + 65536)) - 1)
        if (!more.length) throw new Error('stream ended')
        buf = Buffer.concat([buf, more])
    }
    if (!r) throw new Error('not a FLAC we can rewrite')
    const [m, img] = await Promise.all([getMeta(), saveArt(name, getMeta)])
    return { head: flacHeader(r.blocks, m, img), metaEnd: r.end }
}
async function flacHead(name, s, getMeta) {
    // The layout a song is served in (rewritten head or as it is) stays the same for the session: foobar2000 keeps the
    // size and offsets of its first open, and a stream address renewed later (or a head built again after a failure)
    // must not move its bytes. So a failure is remembered (flat), and the heads kept are many.
    const key = `${name}/${s.size}`
    if (s.flat || flat.has(key)) return null
    let p = flacs.get(key)
    if (!p) {
        p = buildFlacHead(name, s, getMeta).catch(e => { console.log(`flac ${name}: served as it is (${e && e.message || e})`); flat.add(key); if (flacs.get(key) === p) flacs.delete(key); return null })
        flacs.set(key, p)
        if (flacs.size > 300) flacs.delete(flacs.keys().next().value)
    }
    const f = await p
    if (!f) s.flat = true
    else s.metaEnd = f.metaEnd
    return f
}

// /ne/play/<id>, /qq/play/<mid>: an MP3 is relayed with the ID3 tag before all of it; a FLAC with its metadata
// rebuilt (flacHead; as it is, should that fail), its frames following from where the original's start (metaEnd). The
// byte ranges asked for are moved by the difference (servedRange), so seeking works, and a HEAD gets the same length.
// Anything else is sent on to the service's address. Every kind has its cover saved for the theme. What a stream is
// comes from its first bytes: the services' own types and names are not to be trusted (NetEase has sent FLACs as
// audio/mpeg, which foobar2000 then opens with its MP3 decoder; QQ Music may call an MP3
// application/x-www-form-urlencoded).
async function play(src, id, req, res) {
    const s = src === 'qq' ? await qq.stream(id) : await stream(id)
    if (!s.url) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end(`no stream (${s.code || '?'})`); return }
    // (the song's details asked for once, however many of the steps below need them)
    const name = src === 'qq' ? 'qq-' + id : id
    let asked = null
    const meta = () => asked || (asked = src === 'qq' ? qq.meta(id) : neMeta(id))
    saveArt(name, meta)   // (not waited for here: the tag or the metadata below waits for it, a redirect does not)
    if (!s.size) {
        const r = await fetchRange(s.url, 'bytes=0-3')
        const head = await new Promise(ok => {   // (its first 4 bytes only, should the server send all of it)
            const c = [], done = () => { r.destroy(); ok(Buffer.concat(c)) }
            r.on('data', b => { c.push(b); if (Buffer.concat(c).length >= 4) done() }); r.on('end', done); r.on('error', done)
        })
        if (r.statusCode !== 206 && r.statusCode !== 200) { s.until = 0; res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end(`stream refused (${r.statusCode})`); return }
        const total = /\/(\d+)$/.exec(r.headers['content-range'] || '')
        s.size = total ? +total[1] : r.statusCode === 200 ? +(r.headers['content-length'] || 0) : 0
        s.kind = head.subarray(0, 4).toString('latin1') === 'fLaC' ? 'flac'
            : head.subarray(0, 3).toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) ? 'mp3' : ''
    }
    if (!s.kind || !s.size) { res.writeHead(302, { Location: s.url }); res.end(); return }
    // what is served: head, then the original from skip on
    let head = NONE, skip = 0
    if (s.kind === 'mp3') head = await id3(name, meta)
    else { const f = await flacHead(name, s, meta); if (f) { head = f.head; skip = f.metaEnd } }
    const H = head.length, N = H + s.size - skip
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
    let a = 0, b = N - 1
    if (m) { if (m[1] === '') a = Math.max(0, N - +m[2]); else { a = +m[1]; if (m[2]) b = Math.min(+m[2], N - 1) } }
    if (a > b || a >= N) { res.writeHead(416, { 'Content-Range': `bytes */${N}` }); res.end(); return }
    res.writeHead(m ? 206 : 200, { 'Content-Type': s.kind === 'mp3' ? 'audio/mpeg' : 'audio/flac', 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1, ...(m ? { 'Content-Range': `bytes ${a}-${b}/${N}` } : {}) })
    if (req.method === 'HEAD') { res.end(); return }
    const part = servedRange(a, b, H, skip)
    if (part.head) res.write(head.subarray(part.head[0], part.head[1]))
    if (!part.orig) { res.end(); return }
    // (the headers are out: a failure from here on can only close the connection)
    let up
    try { up = await fetchRange(s.url, `bytes=${part.orig[0]}-${part.orig[1]}`) } catch (e) { s.until = 0; res.destroy(); return }
    // (a whole answer is only right from the start: past it, it would put the wrong bytes where these go)
    if (up.statusCode !== 206 && !(up.statusCode === 200 && part.orig[0] === 0 && part.orig[1] === s.size - 1)) { up.resume(); s.until = 0; res.destroy(); return }   // (gone stale: asked anew next time)
    up.pipe(res)
    req.on('close', () => up.destroy())
}

http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1'), q = u.searchParams
    // (Spotify sends the browser back here without the key: the login's own state is checked instead)
    if (u.pathname === '/spotify/callback') { try { await spotify.callback(q, res) } catch (e) { res.writeHead(500); res.end() } return }
    if (q.get('k') !== KEY) { res.writeHead(403); res.end(); return }
    try {
        const m = /^\/(ne|qq)\/play\/(\w+)/.exec(u.pathname)
        if (m) { await play(m[1], m[2], req, res); return }
        const imp = { ...importer.routes, ...spotify.routes }
        let fn = routes[u.pathname] || qq.routes[u.pathname] || imp[u.pathname], a = null
        if (!fn) for (const [k, f] of [...Object.entries(routes), ...Object.entries(qq.routes)]) {
            const p = k.split('/:'); if (p.length === 2 && u.pathname.startsWith(p[0] + '/')) { fn = f; a = u.pathname.slice(p[0].length + 1); break }
        }
        if (!fn) { res.writeHead(404); res.end(); return }
        const body = JSON.stringify(await fn(q, a))
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body)
    } catch (e) {
        const msg = e && e.body ? (e.body.message || e.body.msg || JSON.stringify(e.body).slice(0, 200)) : String(e)
        if (res.headersSent) { res.destroy(); return }   // (a stream already under way)
        // (with the service's own code, and throttled when it said too often: the theme waits longer for that than
        // for a plain failure)
        const code = e && e.body && e.body.code != null ? Number(e.body.code) : undefined
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: msg, code, throttled: throttled(e) || undefined }))
    }
}).listen(PORT, '127.0.0.1', () => console.log(`bridge on ${PORT}`))

// gone with foobar2000: the process that started it, looked for every second (a foobar2000 started again at once must
// not find this one still answering and keep it)
const parent = process.ppid
setInterval(() => { try { process.kill(parent, 0) } catch (e) { process.exit(0) } }, 1000).unref()
