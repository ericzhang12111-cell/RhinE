// QQ Music for the online bridge (bridge.js requires this file): the community library
// @yakult-green-tea/qq-music-api, loaded on the first /qq/ request and asked through a private server of its own on
// 127.0.0.1 (a random port, a random secret: nothing else can reach it). It plays what the account may play — the
// stream address QQ Music hands this account; no decryption, no other site's copies.
//
//   GET /qq/qr?channel=qqmusic|qq|wechat   a login QR code { key, file }: QQ Music's app, QQ's or WeChat's scanner
//   GET /qq/qr/check?id=<key>              { state: wait | scanned | ok | expired | error }; on ok the session is kept
//   GET /qq/logout · /qq/me · /qq/playlists · /qq/playlist/<id> · /qq/daily · /qq/picks
//   GET /qq/search?q=&type=song|playlist
//   GET /qq/play/<mid>                     the song, relayed with a tag (bridge.js relay())
//
// The session (the library's credential records and our token for them) is kept in <data>/qq.session, encrypted for
// this Windows user (DPAPI); the library's device identity in <data>/qq.device.json (QQ Music limits how many devices an
// account has: a new identity each time would use them up).
const http = require('http')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

module.exports = function qqMusic({ DATA, dpapi, known }) {
    const SESSION = path.join(DATA, 'qq.session')
    let qs = { sessions: [], token: '', user: null }
    if (fs.existsSync(SESSION)) try { qs = { ...qs, ...JSON.parse(dpapi('unprotect', fs.readFileSync(SESSION, 'utf8'))) } } catch (e) { console.log('qq session not read:', String(e).slice(0, 200)) }
    const save = () => {
        if (qs.token || (qs.sessions && qs.sessions.length)) fs.writeFileSync(SESSION, dpapi('protect', JSON.stringify(qs)))
        else if (fs.existsSync(SESSION)) fs.unlinkSync(SESSION)
    }

    // the library, its own server not started (it listens on 3200 when required outside a test environment)
    let lib = null
    const start = () => lib || (lib = new Promise((ok, fail) => {
        process.env.QQ_AUTH_STATE_PATH = path.join(DATA, 'qq.device.json')
        process.env.QQ_DISABLE_UPDATE_CHECK = 'true'
        process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error'
        const prev = process.env.NODE_ENV
        process.env.NODE_ENV = 'test'
        let qq
        try { qq = require('@yakult-green-tea/qq-music-api') } catch (e) { lib = null; fail(e); return }
        finally { if (prev === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev }
        qq.configureAuthSessionRepository({
            kind: 'audio-archive-dpapi',
            load: () => qs.sessions,
            save: v => { qs.sessions = v; save() },   // (renewed credentials are kept as they come)
        })
        const secret = crypto.randomBytes(24).toString('hex'), cb = qq.default.callback()
        const srv = http.createServer((req, res) => req.headers['x-bridge'] === secret ? cb(req, res) : (res.writeHead(403), res.end()))
        srv.on('error', e => { lib = null; fail(e) })
        srv.listen(0, '127.0.0.1', () => ok({ port: srv.address().port, secret }))
    }))
    // ask(route, params[, anon]): anon = without the account (the stream addresses of free songs: see stream())
    const ask = async (route, params = {}, anon = false) => {
        const { port, secret } = await start()
        const u = new URL(`http://127.0.0.1:${port}${route}`)
        for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, String(v))
        const r = await fetch(u, { headers: { 'x-bridge': secret, 'x-qq-session': anon ? '' : qs.token || '' }, signal: AbortSignal.timeout(30000) })
        const body = await r.json().catch(() => null)
        if (r.status === 401 && qs.token && !anon) { qs.token = ''; qs.user = null; save() }   // the login lapsed
        if (!r.ok) { const e = new Error(`QQ ${route} ${r.status}`); e.body = body || {}; throw e }
        return body || {}
    }

    // ---- what the theme gets, in the shape NetEase's songs have ----
    const cover = (albumMid, px = 300) => albumMid ? `https://y.gtimg.cn/music/photo_new/T002R${px}x${px}M000${albumMid}.jpg` : ''
    const song = s => {
        const al = s.album || {}, mid = s.mid || s.songmid
        const o = {
            id: mid, title: s.title || s.name || s.songname || '', artists: (s.singer || []).map(a => a.name || a.title).filter(Boolean),
            album: al.title || al.name || s.albumname || '', cover: cover(al.mid || s.albummid), ms: (s.interval || 0) * 1000,
            // pay_play 1: only a VIP (or a buyer) plays it whole; anyone else gets a minute's preview
            vip: !!(s.pay && (s.pay.pay_play === 1 || s.pay.payplay === 1)),
        }
        known.set('qq:' + mid, { title: o.title, artists: o.artists, album: o.album, pic: cover(al.mid || s.albummid, 800), media: (s.file || {}).media_mid || s.strMediaMid || '' })
        if (known.size > 20000) known.delete(known.keys().next().value)
        return o
    }
    const playlist = p => ({
        id: String(p.tid || p.dissid || p.disstid || p.id || p.dirId || ''), title: p.title || p.dissname || p.diss_name || p.name || '',
        cover: p.picurl || p.logo || p.cover || p.diss_cover || p.imgurl || p.picUrl || '', count: p.songnum || p.song_cnt || p.songNum || p.total || 0,
        owner: (p.creator && (p.creator.nick || p.creator.name)) || p.nickname || p.nick || '', own: !!p.own, liked: !!p.liked,
    })
    // a list's songs, wherever the answer keeps them
    const songsOf = d => d.songs || d.songlist || d.list || (d.data && (d.data.songs || d.data.songlist || d.data.list)) || []
    // Which free songs play whole from here: QQ Music says so only by handing out a stream address (outside the
    // mainland most songs have none, free ones too, and nothing in a song's details tells which), so the addresses are
    // asked for, fifty songs at a time, two of those at once, WITHOUT the account: asked with it, a few dozen of these
    // got the account's own address requests refused for a while (104009). What was found is kept 6 hours. A VIP
    // song is left to the account (onlPlayable in the theme: the account a VIP or not).
    const avail = new Map()   // mid -> { ok, until }
    async function mark(tracks) {
        const now = Date.now(), todo = []
        for (const t of tracks) {
            if (t.vip) continue
            const a = avail.get(t.id)
            if (a && now < a.until) t.ok = a.ok; else todo.push(t)
        }
        const chunks = []; for (let i = 0; i < todo.length; i += 50) chunks.push(todo.slice(i, i + 50))
        let next = 0
        const worker = async () => {
            while (next < chunks.length) {
                const c = chunks[next++]
                try {
                    const d = await ask('/getMusicPlay', { songmid: c.map(t => t.id).join(','), quality: '128' }, true)
                    const got = (d.data || {}).playUrl || {}
                    for (const t of c) { t.ok = !!(got[t.id] && got[t.id].url); avail.set(t.id, { ok: t.ok, until: Date.now() + 6 * 3600 * 1000 }) }
                } catch (e) { /* left as they were: tried when played */ }
            }
        }
        await Promise.all([worker(), worker()])
        if (avail.size > 50000) avail.clear()
        return tracks
    }

    const lists = new Map()
    const owned = new Map()   // the account's own playlists: tid -> dirId (their songs are asked for through the account)
    const routes = {
        async '/qq/qr'(q) {
            const channel = ['qq', 'wechat', 'qqmusic'].includes(q.get('channel')) ? q.get('channel') : 'qqmusic'
            const key = (await ask('/login/qr/key', { channel })).data.unikey
            const img = (await ask('/login/qr/create', { key })).data.qrimg
            const m = /^data:image\/(\w+);base64,(.+)$/.exec(img || '')
            if (!m) throw new Error('no QR image')
            const file = path.join(DATA, `qq-qr.${m[1] === 'jpeg' ? 'jpg' : m[1]}`)
            fs.writeFileSync(file, Buffer.from(m[2], 'base64'))
            return { key, file, channel }
        },
        async '/qq/qr/check'(q) {
            const r = await ask('/login/qr/check', { key: q.get('id') })
            if (r.code === 803) {
                const t = /qqmusic_session=([^;]+)/.exec(r.cookie || '')
                if (t) { qs.token = t[1]; qs.user = await me(); save() }
            }
            return { state: { 800: 'expired', 801: 'wait', 802: 'scanned', 803: 'ok' }[r.code] || 'error', code: r.code, message: r.message || undefined }
        },
        async '/qq/logout'() { if (qs.token) try { await ask('/logout') } catch (e) { /* gone */ } qs = { sessions: qs.sessions, token: '', user: null }; save(); return { ok: true } },
        async '/qq/me'() { return qs.user },

        // the account's playlists: its own (dirName; 201 is 我喜欢, its liked songs) and the ones it collected (name)
        async '/qq/playlists'() {
            if (!qs.token) return []
            const d = await ask('/user/playlist')
            return (d.playlist || []).map(p => {
                const own = p.dirName != null || (qs.user && String(p.uin) === qs.user.uid)
                if (own) owned.set(String(p.tid), p.dirId)
                return { id: String(p.tid), title: p.dirName || p.name || '', cover: p.picUrl || p.logo || '', count: p.songNum ?? p.songnum ?? 0,
                         owner: own ? '' : p.nickname || '', own, liked: p.dirId === 201 }
            })
        },
        // A playlist and its songs: an own one through the account (it may be private; a hundred songs a page, four
        // pages at once), any other as the public one (all of it in one answer)
        async '/qq/playlist/:id'(q, id) {
            // (?nomark=1: an import, which needs the names only, not what plays; ?fresh=1: asked anew)
            const kept = lists.get(id)
            if (kept && Date.now() < kept.until && !q.get('fresh')) return kept.body
            let body
            if (qs.token && !owned.size) try { await routes['/qq/playlists']() } catch (e) { /* asked as a public one */ }
            if (qs.token && owned.has(id)) {
                const dirid = owned.get(id), page = offset => ask('/user/playlist-detail', { tid: id, dirid, offset, limit: 100 })
                const first = await page(0), pages = [first.songs || []], total = Math.min(first.total || 0, 20000)
                const rest = []; for (let o = 100; o < total; o += 100) rest.push(o)
                let next = 0
                const worker = async () => { while (next < rest.length) { const k = next++; pages[k + 1] = (await page(rest[k])).songs || [] } }
                await Promise.all([worker(), worker(), worker(), worker()])
                const tracks = pages.flat().map(s => ({ ...song(s), ok: true }))
                if (!q.get('nomark')) await mark(tracks)
                const p = ((await routes['/qq/playlists']()) || []).find(x => x.id === id) || { id, title: '', cover: '', own: true }
                body = { ...p, count: tracks.length, tracks }
            } else {
                const d = await ask('/getSongListDetail', { disstid: id })
                const cd = (d.response && d.response.cdlist && d.response.cdlist[0]) || {}
                const tracks = (cd.songlist || []).map(s => ({ ...song(s), ok: true }))
                if (!q.get('nomark')) await mark(tracks)
                body = { id, title: cd.dissname || '', cover: cd.logo || '', count: tracks.length, owner: cd.nickname || cd.nick || '', own: false, liked: false, tracks }
            }
            if (!q.get('nomark')) lists.set(id, { body, until: Date.now() + 10 * 60 * 1000 })
            if (lists.size > 40) lists.delete(lists.keys().next().value)
            return body
        },
        async '/qq/daily'() { return qs.token ? mark(songsOf(await ask('/user/daily-songs')).map(s => ({ ...song(s), ok: true }))) : [] },
        async '/qq/picks'() { const d = await ask('/recommend/playlists'); return (d.playlists || (d.data && d.data.playlists) || []).map(playlist) },
        async '/qq/search'(q) {
            const type = q.get('type') === 'playlist' ? 'playlist' : 'song'
            const d = await ask('/search', { keyword: q.get('q') || '', type, limit: 30, page: 1 + Math.floor((+(q.get('offset') || 0)) / 30) })
            const items = d.items || []
            if (type === 'song') return mark(items.map(s => ({ ...song(s), ok: true })))
            return items.map(p => playlist({ tid: p.dissid, title: p.dissname, picurl: p.logo, songnum: p.songnum, nickname: p.nickname }))
        },
    }
    async function me() {
        const d = await ask('/login/status')
        const p = (d.data && d.data.profile) || null
        if (!p) return null
        const info = p.info || {}
        let vip = 0
        try { const v = await ask('/user/vip'); const x = v.data || v; vip = x.isVip || x.vip || x.svip || x.green ? 1 : 0 } catch (e) { /* not known */ }
        return { uid: String(p.musicid || p.str_musicid || ''), name: p.nickname || p.nick || info.nick || '', avatar: p.avatarUrl || info.logo || '', vip }
    }

    // ---- the stream; an address kept 15 minutes ----
    // A VIP account: through the account, 320 kbit/s, else 128 (lossless is for SVIP: a setting later). Any other: a
    // free song's 128 kbit/s address as anyone gets it (the account adds nothing to it), the account asked only when
    // that has none.
    const streams = new Map()
    async function stream(mid) {
        let s = streams.get(mid)
        if (!s || Date.now() > s.until) {
            const media = (known.get('qq:' + mid) || {}).media || ''
            const tries = qs.user && qs.user.vip ? [['320', false], ['128', false], ['128', true]] : [['128', true], ['128', false]]
            let got = null
            for (const [quality, anon] of tries) {
                if (!anon && !qs.token) continue
                try {
                    const d = await ask('/getMusicPlay', { songmid: mid, mediaId: media, quality }, anon)
                    got = ((d.data || {}).playUrl || {})[mid] || {}
                } catch (e) { got = { error: String(e.message || e) } }
                if (got.url) break
            }
            s = { url: got && got.url || '', code: got && got.restriction ? got.restriction.key : got && got.error, until: Date.now() + (got && got.url ? 15 * 60 * 1000 : 30 * 1000) }
            streams.set(mid, s)
            if (streams.size > 500) streams.delete(streams.keys().next().value)
        }
        return s
    }
    // the song's tag: what a list showed of it, else its details asked for
    async function meta(mid) {
        let m = known.get('qq:' + mid)
        if (!m) try { const d = await ask('/getSongInfo', { songmid: mid }); const t = ((d.response || {}).songinfo || {}).data || {}; if (t.track_info) { song(t.track_info); m = known.get('qq:' + mid) } } catch (e) { /* nameless */ }
        return m || { title: '', artists: [], album: '', pic: '' }
    }

    // (ask: the library's own answers, for the dev tools; never a route)
    return { routes, stream, meta, ask, status: () => ({ login: !!qs.token, user: qs.user }) }
}
