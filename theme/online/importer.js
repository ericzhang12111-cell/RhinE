// Playlist import for the online bridge (bridge.js requires this file): a playlist from elsewhere read into one shape —
// { playlists: [{ name, source, id, tracks: [{ title, artists, album, ms }] }] } — which the theme then matches against
// the foobar2000 library (js/lib/online.js): what it has becomes a playlist, the rest a list of what is missing.
//
//   GET /import/link?url=<link>   a NetEase or QQ Music playlist link (short links too: 163cn.tv, c6.y.qq.com)
//   GET /import/file?path=<file>  a file: Exportify's CSV (Spotify), Spotify's own data export (Playlist1.json,
//                                 YourLibrary.json), a CSV with title and artist columns, or a text file of
//                                 "artist - title" lines (an .m3u's #EXTINF lines count too)
//
// A Spotify playlist or album link is read with the reader's own Spotify app once logged in (spotify.js); without
// one, the two exports above cover it.
const fs = require('fs')
const path = require('path')

module.exports = function importer({ routes, qq, spotify }) {
    // ---- links ----
    // Short links are followed (three hops at most), only on the services' own hosts: nothing else is fetched
    const SHORT = /^(163cn\.tv|y\.music\.163\.com|music\.163\.com|c6\.y\.qq\.com|c\.y\.qq\.com|url\.cn|spotify\.link)$/i
    async function follow(url) {
        for (let i = 0; i < 3; i++) {
            const u = new URL(url)
            if (!SHORT.test(u.hostname) || /[?&]id=\d+/.test(u.search) || /playlist\/\d+/.test(u.pathname)) return url
            const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
            const loc = r.headers.get('location')
            if (!loc) return url
            url = new URL(loc, u).href
        }
        return url
    }
    function which(url) {
        const u = new URL(url), h = u.hostname.toLowerCase(), all = u.href
        if (/(^|\.)163\.com$/.test(h) || /163cn\.tv$/.test(h)) {
            const m = /[?&#/]id=(\d+)/.exec(all) || /playlist\/(\d+)/.exec(all)
            return m && /playlist|id=/.test(all) ? { source: 'ne', id: m[1] } : null
        }
        if (/(^|\.)qq\.com$/.test(h)) {
            const m = /playlist\/(\d+)/.exec(all) || /[?&](?:id|disstid)=(\d+)/.exec(all)
            return m ? { source: 'qq', id: m[1] } : null
        }
        if (/spotify\.(com|link)$/.test(h)) {
            const m = /\/(playlist|album)\/([A-Za-z0-9]{10,40})/.exec(u.pathname)
            return { source: 'spotify', kind: m ? m[1] : '', id: m ? m[2] : '' }
        }
        return null
    }
    const plain = t => ({ title: t.title, artists: t.artists, album: t.album, ms: t.ms })

    const importRoutes = {
        async '/import/link'(q) {
            let url = String(q.get('url') || '').trim()
            const m = /https?:\/\/\S+/.exec(url)   // (a share text: the link inside it)
            if (!m) return { error: 'no-link' }
            url = await follow(m[0].replace(/[)\]】」>,，。]+$/, ''))
            const w = which(url)
            if (!w) return { error: 'unknown-link' }
            if (w.source === 'spotify') {
                if (!w.id) return { error: 'unknown-link' }
                try {
                    const p = await spotify.read(w.kind, w.id)
                    return { playlists: [{ name: p.name || w.id, source: 'spotify', id: w.id, cover: p.cover, tracks: p.tracks }] }
                } catch (e) {
                    const b = e.body || {}
                    return { error: b.error === 'spotify-login' ? 'spotify-link' : b.error || 'spotify-api', detail: b.detail || String(e.message || e) }
                }
            }
            const p = w.source === 'ne'
                ? await routes['/ne/playlist/:id'](new URLSearchParams(), w.id)
                : await qq.routes['/qq/playlist/:id'](new URLSearchParams('nomark=1&public=1'), w.id)
            if (!p || !p.tracks) return { error: 'not-found' }
            return { playlists: [{ name: p.title || w.id, source: w.source, id: w.id, cover: p.cover || '', tracks: p.tracks.map(plain) }] }
        },
        async '/import/file'(q) {
            const file = String(q.get('path') || '').trim().replace(/^"|"$/g, '')
            if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return { error: 'no-file' }
            if (fs.statSync(file).size > 64 * 1024 * 1024) return { error: 'too-large' }
            const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
            const ext = path.extname(file).toLowerCase(), base = path.basename(file, ext)
            let lists = []
            if (ext === '.json') lists = fromJson(JSON.parse(text), base)
            else if (ext === '.csv') lists = fromCsv(text, base)
            else lists = fromText(text, base)
            lists = lists.filter(l => l.tracks.length)
            return lists.length ? { playlists: lists } : { error: 'nothing-read' }
        },
    }

    // ---- files ----
    // Spotify's data export: Playlist1.json { playlists: [{ name, items: [{ track: { trackName, artistName, albumName } }] }] },
    // YourLibrary.json { tracks: [{ artist, album, track }] }; anything else that is a list of objects with a title
    function fromJson(d, base) {
        const t = (title, artist, album, ms) => title ? { title: String(title), artists: splitArtists(artist), album: String(album || ''), ms: +ms || 0 } : null
        if (d && Array.isArray(d.playlists)) return d.playlists.map(p => ({
            name: p.name || base, source: 'file',
            tracks: (p.items || []).map(i => i.track && t(i.track.trackName, i.track.artistName, i.track.albumName)).filter(Boolean),
        }))
        if (d && Array.isArray(d.tracks)) return [{ name: base, source: 'file', tracks: d.tracks.map(x => t(x.track || x.title || x.name, x.artist || x.artists, x.album)).filter(Boolean) }]
        if (Array.isArray(d)) return [{ name: base, source: 'file', tracks: d.map(x => x && t(x.title || x.name || x.track || x.trackName, x.artist || x.artists || x.artistName, x.album || x.albumName, x.ms || x.duration_ms)).filter(Boolean) }]
        return []
    }
    // A CSV with a header row: the columns found by name (Exportify: "Track Name", "Artist Name(s)", "Album Name",
    // "Duration (ms)"; others: title / name / song, artist, album)
    function fromCsv(text, base) {
        const rows = parseCsv(text)
        if (rows.length < 2) return []
        const head = rows[0].map(h => h.trim().toLowerCase())
        // a column by its name: an exact one first, then one that starts with it (never a URI / id column: Exportify's
        // "Artist URI(s)" comes before "Artist Name(s)")
        const col = (...names) => {
            for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i }
            for (const n of names) { const i = head.findIndex(h => h.startsWith(n) && !/\buri|\bid\b|url/.test(h)); if (i >= 0) return i }
            return -1
        }
        // (Exportify writes its column names in the reader's language: English, Chinese, Japanese names are known)
        let ti = col('track name', 'title', 'name', 'song', '曲目名称', '歌曲名称', '歌名', '曲名', '标题', '歌曲', 'トラック名', '曲名')
        let ai = col('artist name', 'artist', 'artists', '艺人名称', '艺术家名称', '歌手', '艺人', 'アーティスト名', 'アーティスト')
        let bi = col('album name', 'album', '专辑名称', '专辑', 'アルバム名', 'アルバム')
        let di = col('duration (ms)', 'track duration (ms)', 'duration_ms', '曲目时长（毫秒）', '时长（毫秒）', '時間（ミリ秒）')
        // Any other language: Exportify's columns by what is in them — the name after each spotify:track: / :artist: /
        // :album: column, the length the column of whole numbers that all look like milliseconds of a song
        const body = rows.slice(1, 40), after = kind => {
            const i = head.findIndex((h, k) => body.length && body.every(r => !r[k] || r[k].startsWith(`spotify:${kind}:`)) && body.some(r => r[k]))
            return i >= 0 && i + 1 < head.length ? i + 1 : -1
        }
        if (ti < 0) ti = after('track')
        if (ai < 0) ai = after('artist')
        if (bi < 0) bi = after('album')
        if (di < 0) di = head.findIndex((h, k) => body.length && body.every(r => /^\d{5,7}$/.test(r[k] || '')))
        if (ti < 0) return []   // (no title column: nothing read, rather than every line taken for a title)
        return [{ name: base, source: 'file', tracks: rows.slice(1).filter(r => r[ti]).map(r => ({
            title: r[ti].trim(), artists: splitArtists(ai >= 0 ? r[ai] : ''), album: bi >= 0 ? (r[bi] || '').trim() : '', ms: di >= 0 ? +r[di] || 0 : 0,
        })) }]
    }
    function parseCsv(text) {
        const rows = []
        let row = [], cell = '', quoted = false
        for (let i = 0; i < text.length; i++) {
            const c = text[i]
            if (quoted) {
                if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false }
                else cell += c
            } else if (c === '"') quoted = true
            else if (c === ',') { row.push(cell); cell = '' }
            else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
            else cell += c
        }
        if (cell || row.length) { row.push(cell); rows.push(row) }
        return rows.filter(r => r.some(x => x.trim()))
    }
    // "artist - title" a line (an #EXTINF line: what follows its comma); a line without " - " is a title alone
    function fromText(text, base) {
        const tracks = []
        for (let line of text.split(/\r?\n/)) {
            line = line.trim()
            if (!line || (line.startsWith('#') && !line.startsWith('#EXTINF'))) continue
            if (line.startsWith('#EXTINF')) line = line.slice(line.indexOf(',') + 1)
            else if (/^(https?:|[a-z]:\\|\\\\|\/)/i.test(line) || /\.(mp3|flac|m4a|ogg|opus|wav|ape)$/i.test(line)) continue   // a file or address line
            const k = line.indexOf(' - ')
            tracks.push(k > 0 ? { title: line.slice(k + 3).trim(), artists: splitArtists(line.slice(0, k)), album: '', ms: 0 } : { title: line, artists: [], album: '', ms: 0 })
        }
        return [{ name: base, source: 'file', tracks }]
    }
    const splitArtists = a => (Array.isArray(a) ? a : String(a || '').split(/\s*(?:,|;|\/|、|&| feat\.? | ft\. )\s*/i)).map(x => String(x).trim()).filter(Boolean)

    return { routes: importRoutes }
}
