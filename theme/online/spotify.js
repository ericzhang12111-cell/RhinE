// Spotify for the online bridge (bridge.js requires this file): import only — Spotify's streams are DRM, so nothing is
// played from it. A playlist or album link is read through the Web API with the reader's own app (registered at
// developer.spotify.com; its Client ID only: the login is PKCE, so no client secret is ever asked for or kept). The
// app's redirect URI must be http://127.0.0.1:<port>/spotify/callback. Spotify answers such an app only while its
// owner has Premium (2026: "Active premium subscription required for the owner of the app", a 403 on every request,
// the login itself still works): that is reported as spotify-premium, and the exports remain the way in.
//
//   GET /spotify/login?client=<id>   { url }: the page to log in at (the theme opens it in the browser)
//   GET /spotify/callback            where Spotify sends the browser back (no key: checked by its state instead)
//   GET /spotify/status              { client, login, user }
//   GET /spotify/logout
//
// The tokens are kept in <data>/spotify.session, encrypted for this Windows user (DPAPI).
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

module.exports = function spotify({ DATA, PORT, dpapi }) {
    const SESSION = path.join(DATA, 'spotify.session')
    let sp = { client: '', access: '', refresh: '', until: 0, user: null }
    if (fs.existsSync(SESSION)) try { sp = { ...sp, ...JSON.parse(dpapi('unprotect', fs.readFileSync(SESSION, 'utf8'))) } } catch (e) { console.log('spotify session not read:', String(e).slice(0, 200)) }
    const save = () => {
        if (sp.client || sp.refresh) fs.writeFileSync(SESSION, dpapi('protect', JSON.stringify(sp)))
        else if (fs.existsSync(SESSION)) fs.unlinkSync(SESSION)
    }
    const REDIRECT = `http://127.0.0.1:${PORT}/spotify/callback`
    const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    let pending = null   // { state, verifier, client, until }

    async function token(params) {
        const r = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params).toString(), signal: AbortSignal.timeout(20000),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok || !d.access_token) { const e = new Error(d.error_description || d.error || `token ${r.status}`); e.body = { error: 'spotify-token', detail: d.error_description || d.error || String(r.status) }; throw e }
        sp.access = d.access_token
        if (d.refresh_token) sp.refresh = d.refresh_token
        sp.until = Date.now() + ((d.expires_in || 3600) - 60) * 1000
        save()
    }
    async function api(route) {
        if (!sp.refresh) { const e = new Error('spotify-login'); e.body = { error: 'spotify-login' }; throw e }
        if (!sp.access || Date.now() > sp.until) await token({ grant_type: 'refresh_token', refresh_token: sp.refresh, client_id: sp.client })
        const r = await fetch(route.startsWith('http') ? route : `https://api.spotify.com/v1${route}`, { headers: { Authorization: `Bearer ${sp.access}` }, signal: AbortSignal.timeout(20000) })
        // (a refusal may come as plain text, not JSON)
        const text = await r.text()
        let d = {}
        try { d = JSON.parse(text) } catch (e) { d = {} }
        if (!r.ok) {
            const msg = String((d.error && (d.error.message || d.error)) || text.trim() || r.status).slice(0, 200)
            const kind = /premium/i.test(msg) ? 'spotify-premium' : r.status === 404 ? 'not-found' : 'spotify-api'
            if (kind === 'spotify-premium' && sp.user && sp.user.error !== kind) { sp.user = { ...sp.user, error: kind }; save() }   // (shown beside the login)
            const e = new Error(`spotify ${r.status} ${msg}`); e.body = { error: kind, detail: `${r.status} ${msg}` }; throw e
        }
        return d
    }

    const routes = {
        async '/spotify/login'(q) {
            const client = String(q.get('client') || sp.client || '').trim()
            if (!/^[0-9a-f]{32}$/i.test(client)) return { error: 'spotify-client' }
            const verifier = b64url(crypto.randomBytes(48)), state = b64url(crypto.randomBytes(16))
            pending = { state, verifier, client, until: Date.now() + 10 * 60 * 1000 }
            const u = new URL('https://accounts.spotify.com/authorize')
            u.search = new URLSearchParams({
                client_id: client, response_type: 'code', redirect_uri: REDIRECT, state,
                scope: 'playlist-read-private playlist-read-collaborative user-library-read',
                code_challenge_method: 'S256', code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
            }).toString()
            return { url: u.href }
        },
        async '/spotify/status'() { return { client: sp.client, login: !!sp.refresh, user: sp.user } },
        async '/spotify/logout'() { sp = { client: sp.client, access: '', refresh: '', until: 0, user: null }; save(); return { ok: true } },
    }

    // the browser coming back: an HTML page for it, the tokens kept
    async function callback(q, res) {
        const page = (title, text) => {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
            res.end(`<!doctype html><meta charset="utf-8"><title>RhinE · Spotify</title><body style="font:15px system-ui;background:#111;color:#eee;padding:48px"><h2 style="font-weight:600">${title}</h2><p style="color:#aaa">${text}</p></body>`)
        }
        const P = pending
        if (!P || q.get('state') !== P.state || Date.now() > P.until) { page('Not connected', 'This login is out of date. Start it again from foobar2000 (06 ONLINE › IMPORT).'); return }
        pending = null
        if (q.get('error') || !q.get('code')) { page('Not connected', `Spotify said: ${String(q.get('error') || 'no code').replace(/[<>&"]/g, '')}`); return }
        try {
            sp.client = P.client
            await token({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: REDIRECT, client_id: P.client, code_verifier: P.verifier })
            let premium = false
            try { const me = await api('/me'); sp.user = { name: me.display_name || me.id, product: me.product || '' }; save() }
            catch (e) { premium = !!(e.body && e.body.error === 'spotify-premium'); sp.user = { name: '', product: '', error: e.body ? e.body.error : 'spotify-api' }; save() }
            if (premium) page('Logged in, but Spotify will not answer', 'Spotify answers an app of your own only while its owner has Premium. Without it, export the playlist with Exportify (a CSV) or ask Spotify for your data (Playlist1.json), and open that file in foobar2000 (06 ONLINE › IMPORT › OPEN A FILE).')
            else page('Spotify connected', 'You can close this tab and go back to foobar2000.')
        } catch (e) { page('Not connected', `Spotify said: ${String(e.message).replace(/[<>&"]/g, '')}`) }
    }

    // A playlist or an album, in the importer's shape
    async function read(kind, id) {
        const tracks = []
        if (kind === 'album') {
            const a = await api(`/albums/${id}`)
            let page = a.tracks
            while (page) {
                for (const t of page.items || []) tracks.push({ title: t.name, artists: (t.artists || []).map(x => x.name), album: a.name, ms: t.duration_ms || 0 })
                page = page.next ? await api(page.next) : null
            }
            return { name: a.name, cover: ((a.images || [])[0] || {}).url || '', tracks }
        }
        const p = await api(`/playlists/${id}?fields=name,images`)
        let next = `/playlists/${id}/tracks?limit=100&fields=next,items(track(name,duration_ms,artists(name),album(name)))`
        while (next && tracks.length < 10000) {
            const d = await api(next)
            for (const it of d.items || []) if (it.track && it.track.name) tracks.push({ title: it.track.name, artists: (it.track.artists || []).map(x => x.name), album: (it.track.album || {}).name || '', ms: it.track.duration_ms || 0 })
            next = d.next
        }
        return { name: p.name, cover: ((p.images || [])[0] || {}).url || '', tracks }
    }

    return { routes, callback, read }
}
