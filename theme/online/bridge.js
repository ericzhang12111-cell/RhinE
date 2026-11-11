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
//   GET /ne/playlist/<id>              a playlist and its tracks
//   GET /ne/likes                      the liked songs' ids
//   GET /ne/daily                      the daily recommended songs
//   GET /ne/picks                      recommended playlists
//   GET /ne/search?q=&type=song|album|playlist|artist&offset=
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
    }
    known.set(o.id, { title: o.title, artists: o.artists, album: o.album, pic: al.picUrl ? `${al.picUrl}?param=600y600` : '' })
    if (known.size > 20000) known.delete(known.keys().next().value)
    return o
}
const playlist = p => ({ id: String(p.id), title: p.name, cover: pic(p.coverImgUrl || p.picUrl), count: p.trackCount || 0,
                         owner: (p.creator || {}).nickname || '', own: !!(ne.user && p.creator && p.creator.userId === ne.user.uid),
                         liked: p.specialType === 5 })   // (the account's liked songs)
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
    keepCookies(r.cookie)
    return r.body
}

const lists = new Map()   // playlist id -> { body, until }: the last answer for it

const qq = require('./qq.js')({ DATA, dpapi, known })

const routes = {
    async '/status'() { return { ok: true, netease: { login: !!ne.cookie, user: ne.user }, qq: qq.status() } },

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
            const a = await call('user_account')
            ne.user = a.profile ? { uid: a.profile.userId, name: a.profile.nickname, avatar: pic(a.profile.avatarUrl, 120), vip: (a.account || {}).vipType || 0 } : null
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
    async '/ne/playlist/:id'(q, id) {
        const kept = lists.get(id)
        if (kept && Date.now() < kept.until && !q.get('fresh')) return kept.body
        const d = await call('playlist_detail', { id, s: 0 })
        const ids = (((d.playlist || {}).trackIds) || []).map(t => t.id).slice(0, 20000)
        const chunks = []; for (let i = 0; i < ids.length; i += 1000) chunks.push(ids.slice(i, i + 1000))
        const got = new Array(chunks.length)
        let next = 0
        const worker = async () => {
            while (next < chunks.length) {
                const k = next++
                got[k] = await call('song_detail', { ids: chunks[k].join(',') })
            }
        }
        await Promise.all([worker(), worker(), worker(), worker()])
        const byId = new Map(), priv = new Map()
        for (const g of got) {
            for (const s of g.songs || []) byId.set(s.id, s)
            for (const p of g.privileges || []) priv.set(p.id, p)
        }
        const tracks = ids.map(i => byId.get(i)).filter(Boolean).map(s => ({ ...song(s), ok: playable(s, priv.get(s.id)) }))
        const body = { ...playlist(d.playlist || {}), tracks }
        lists.set(id, { body, until: Date.now() + 10 * 60 * 1000 })
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
const streams = new Map()
async function stream(id) {
    let s = streams.get(id)
    if (!s || Date.now() > s.until) {
        const d = ((await call('song_url_v1', { id, level: 'lossless' })).data || [])[0] || {}
        s = { url: d.url, code: d.code, until: Date.now() + (d.url ? Math.min(15 * 60, (d.expi || 1200) - 120) * 1000 : 30 * 1000) }
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

// An ID3v2.4 tag for the song (title, the artists each a value of their own, album, the album's cover): the services'
// MP3 streams carry none, so foobar2000 would know a song by its playlist line only. The cover also goes to
// <data>/art/<name>.jpg (name: the NetEase id, qq-<mid> for QQ Music), where the theme finds it (foobar2000 reads no
// pictures from a stream).
const ART = path.join(DATA, 'art')
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
    if (m.pic) try {
        const jpg = await fetchAll(m.pic)
        try { fs.mkdirSync(ART, { recursive: true }); fs.writeFileSync(path.join(ART, `${name}.jpg`), jpg) } catch (e) { /* the tag has it */ }
        frames.push(frame('APIC', Buffer.concat([Buffer.from([0]), Buffer.from('image/jpeg\0\x03\0', 'latin1'), jpg])))
    } catch (e) { /* no cover */ }
    const body = Buffer.concat(frames), head = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0])
    syncsafe(head, 6, body.length)
    const tag = Buffer.concat([head, body])
    tags.set(name, tag)
    if (tags.size > 64) tags.delete(tags.keys().next().value)
    return tag
}

// /ne/play/<id>, /qq/play/<mid>: an MP3 is relayed with the tag before it, its byte ranges moved by the tag's length (so
// seeking works); anything else (FLAC) is sent on to the service's address as it is
async function play(src, id, req, res) {
    const s = src === 'qq' ? await qq.stream(id) : await stream(id)
    if (!s.url) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end(`no stream (${s.code || '?'})`); return }
    if (!s.size) {
        const r = await fetchRange(s.url, 'bytes=0-0'); r.resume()
        const total = /\/(\d+)$/.exec(r.headers['content-range'] || '')
        s.size = total ? +total[1] : +(r.headers['content-length'] || 0)
        s.type = r.headers['content-type'] || ''
    }
    // (an MP3 by its type, or by its name: QQ Music's servers may call one application/x-www-form-urlencoded)
    if (!(/mpeg|mp3/i.test(s.type) || /\.mp3(\?|$)/i.test(s.url)) || !s.size) { res.writeHead(302, { Location: s.url }); res.end(); return }
    const tag = src === 'qq' ? await id3('qq-' + id, () => qq.meta(id)) : await id3(id, () => neMeta(id)), T = tag.length, N = T + s.size
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
    let a = 0, b = N - 1
    if (m) { if (m[1] === '') a = Math.max(0, N - +m[2]); else { a = +m[1]; if (m[2]) b = Math.min(+m[2], N - 1) } }
    if (a > b || a >= N) { res.writeHead(416, { 'Content-Range': `bytes */${N}` }); res.end(); return }
    res.writeHead(m ? 206 : 200, { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1, ...(m ? { 'Content-Range': `bytes ${a}-${b}/${N}` } : {}) })
    if (req.method === 'HEAD') { res.end(); return }
    if (a < T) res.write(tag.subarray(a, Math.min(b + 1, T)))
    if (b < T) { res.end(); return }
    const up = await fetchRange(s.url, `bytes=${Math.max(a, T) - T}-${b - T}`)
    if (up.statusCode !== 206 && up.statusCode !== 200) { up.resume(); s.until = 0; res.destroy(); return }   // (gone stale: asked anew next time)
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
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: msg }))
    }
}).listen(PORT, '127.0.0.1', () => console.log(`bridge on ${PORT}`))

// gone with foobar2000: the process that started it, looked for every second (a foobar2000 started again at once must
// not find this one still answering and keep it)
const parent = process.ppid
setInterval(() => { try { process.kill(parent, 0) } catch (e) { process.exit(0) } }, 1000).unref()
