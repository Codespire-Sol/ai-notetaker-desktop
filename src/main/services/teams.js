// ─────────────────────────────────────────────────────────────────────────────
// teams.js — Microsoft Teams / Outlook Calendar integration (Electron main)
//
// Desktop OAuth 2.0 using the Authorization Code + PKCE flow for a PUBLIC client.
// NO client secret is ever embedded or used — public clients must not ship one.
//
// Flow overview:
//   1. connectTeams()  -> generate PKCE, spin up a loopback HTTP listener on
//      http://localhost:8412/callback, open the system browser to Microsoft's
//      authorize endpoint. When Microsoft redirects back with ?code=..., we
//      exchange the code (+ code_verifier) for tokens and persist them.
//   2. getTeamsStatus() -> report whether we hold tokens + the account email.
//   3. disconnectTeams() -> wipe stored tokens.
//   4. getUpcomingMeetings() -> ensure a fresh access token (refresh if needed)
//      then query MS Graph calendarView for the next 24h.
//
// Uses only built-ins: node:crypto, node:http, global fetch (Node 18+/20),
// plus electron's shell for opening the browser.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto'
import http from 'node:http'
import { shell } from 'electron'

// ── Constants ────────────────────────────────────────────────────────────────
// Which Microsoft accounts the sign-in page accepts. This MUST match the
// "Supported account types" chosen on the user's OWN Azure app registration:
//   personal → 'consumers'     (outlook.com / hotmail / live personal accounts)
//   work     → 'organizations' (work / school / Microsoft 365 org accounts)
//   both     → 'common'        (either)
// The user picks this in Settings; the resolved tenant is threaded through the
// whole OAuth flow (authorize → token exchange → later refreshes) and stored
// with the tokens so refreshes keep using the same endpoint.
export function tenantForAccountType(accountType) {
  if (accountType === 'work') return 'organizations'
  if (accountType === 'both') return 'common'
  return 'consumers' // personal (default)
}
const authorizeUrl = (tenant) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`
const tokenUrl = (tenant) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

// Fixed loopback redirect. This exact value must be registered as a
// "Mobile and desktop applications" redirect URI on the Azure app registration.
const REDIRECT_PORT = 8412
const REDIRECT_PATH = '/callback'
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}${REDIRECT_PATH}`

// Only Calendars.Read is needed (title, timings, attendee emails). OnlineMeetings.Read
// is work/school-only and would block personal-account sign-in, so it's omitted —
// the recorder captures audio itself and never needs Teams join URLs.
const SCOPES = 'Calendars.Read User.Read offline_access'

const STORE_KEY = 'msTokens'

// How long to wait for the user to complete the browser sign-in before giving up.
const AUTH_TIMEOUT_MS = 3 * 60 * 1000 // ~3 minutes

// Refresh the access token this long before its real expiry to avoid races.
const EXPIRY_SKEW_MS = 60 * 1000 // 60 seconds

// ── PKCE helpers ─────────────────────────────────────────────────────────────
const base64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function generatePkce() {
  // Verifier: 43-128 chars of unreserved characters. 32 random bytes -> 43 chars.
  const verifier = base64url(crypto.randomBytes(32))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

// ── Small HTML page shown in the browser after the redirect ──────────────────
function resultPage(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0F172A;color:#E2E8F0;
       display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .card{max-width:420px;text-align:center;padding:32px;background:#1E293B;border-radius:16px;
        box-shadow:0 10px 40px rgba(0,0,0,.4)}
  h1{font-size:20px;margin:0 0 8px}
  p{font-size:14px;color:#94A3B8;margin:0}
</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) connectTeams
// ─────────────────────────────────────────────────────────────────────────────
export async function connectTeams({ clientId, store, accountType }) {
  if (!clientId || !String(clientId).trim()) {
    throw new Error('Microsoft Client ID not configured')
  }
  if (!store) {
    throw new Error('A persistent store instance is required to connect Teams')
  }

  const tenant = tenantForAccountType(accountType)
  const { verifier, challenge } = generatePkce()
  // Opaque state value to defend against CSRF on the loopback callback.
  const state = base64url(crypto.randomBytes(16))

  // Wait for the loopback server to receive the authorization code (or fail).
  const code = await new Promise((resolve, reject) => {
    let settled = false
    let timer = null

    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      // Close the server once, after the response has a chance to flush.
      try {
        server.close()
      } catch {
        /* ignore */
      }
      fn(arg)
    }

    const server = http.createServer((req, res) => {
      try {
        // Only handle the expected callback path; ignore favicon etc.
        const reqUrl = new URL(req.url, REDIRECT_URI)
        if (reqUrl.pathname !== REDIRECT_PATH) {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not found')
          return
        }

        const params = reqUrl.searchParams
        const err = params.get('error')
        const errDesc = params.get('error_description')
        const returnedCode = params.get('code')
        const returnedState = params.get('state')

        if (err) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end(resultPage('Sign-in failed', errDesc || err))
          finish(reject, new Error(`Microsoft sign-in error: ${errDesc || err}`))
          return
        }

        if (returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end(resultPage('Sign-in failed', 'State mismatch — please try again.'))
          finish(reject, new Error('OAuth state mismatch — possible CSRF, aborting'))
          return
        }

        if (!returnedCode) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end(resultPage('Sign-in failed', 'No authorization code returned.'))
          finish(reject, new Error('No authorization code returned by Microsoft'))
          return
        }

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(resultPage('Connected', 'You can close this tab and return to Codespire Notetaker.'))
        finish(resolve, returnedCode)
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Internal error')
        finish(reject, e instanceof Error ? e : new Error(String(e)))
      }
    })

    server.on('error', (e) => {
      // e.g. EADDRINUSE if port 8412 is taken.
      finish(reject, new Error(`Could not start local auth server on port ${REDIRECT_PORT}: ${e.message}`))
    })

    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      const authUrl =
        `${authorizeUrl(tenant)}?` +
        new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: REDIRECT_URI,
          response_mode: 'query',
          scope: SCOPES,
          state,
          code_challenge: challenge,
          code_challenge_method: 'S256'
        }).toString()

      // Arm the timeout only once we're actually listening.
      timer = setTimeout(() => {
        finish(reject, new Error('Timed out waiting for Microsoft sign-in (3 minutes)'))
      }, AUTH_TIMEOUT_MS)

      shell.openExternal(authUrl).catch((e) => {
        finish(reject, new Error(`Could not open the system browser: ${e.message}`))
      })
    })
  })

  // Exchange the authorization code for tokens (PKCE — no client secret).
  const tokenSet = await exchangeCode({ clientId, code, codeVerifier: verifier, tenant })

  // Resolve the account email from Graph so status can display it.
  let email = null
  try {
    const me = await graphGet(tokenSet.access_token, '/me?$select=mail,userPrincipalName,displayName')
    email = me.mail || me.userPrincipalName || null
  } catch {
    // Non-fatal: we still store tokens even if the profile lookup fails.
    email = null
  }

  persistTokens(store, tokenSet, email, tenant)

  return { ok: true, email }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) getTeamsStatus
// ─────────────────────────────────────────────────────────────────────────────
export async function getTeamsStatus({ store }) {
  const tokens = store?.get(STORE_KEY)
  if (!tokens || !tokens.refresh_token) {
    return { connected: false, email: null }
  }
  return { connected: true, email: tokens.email || null }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) disconnectTeams
// ─────────────────────────────────────────────────────────────────────────────
export async function disconnectTeams({ store }) {
  if (store) store.delete(STORE_KEY)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) getUpcomingMeetings
// ─────────────────────────────────────────────────────────────────────────────
export async function getUpcomingMeetings({ store, clientId, lookbackMinutes = 0 }) {
  const accessToken = await ensureValidToken({ store, clientId })

  // Start the window `lookbackMinutes` in the past so a meeting that JUST ended
  // is still returned (needed to label a recording processed right after it ends).
  const now = new Date()
  const start = new Date(now.getTime() - lookbackMinutes * 60 * 1000)
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const query = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $orderby: 'start/dateTime',
    $select: 'subject,start,end,onlineMeeting,attendees,organizer'
  }).toString()

  const data = await graphGet(accessToken, `/me/calendarView?${query}`, {
    // Ask Graph to return times in UTC so the ISO strings are unambiguous.
    Prefer: 'outlook.timezone="UTC"'
  })

  // Graph returns UTC times but WITHOUT a 'Z' suffix (per the Prefer header),
  // so new Date() would treat them as local. Normalize to a real UTC ISO string
  // (append 'Z') so the UI converts them to the user's local timezone correctly.
  const toUtcIso = (dt) => {
    if (!dt) return null
    const hasTz = /[zZ]$|[+-]\d{2}:\d{2}$/.test(dt)
    return new Date(hasTz ? dt : dt + 'Z').toISOString()
  }

  return (data.value || []).map((e) => ({
    id: e.id,
    title: e.subject || 'Untitled Meeting',
    start: toUtcIso(e.start?.dateTime),
    end: toUtcIso(e.end?.dateTime),
    joinUrl: e.onlineMeeting?.joinUrl || null,
    attendees: (e.attendees || [])
      .map((a) => a.emailAddress?.address)
      .filter(Boolean),
    organizer: e.organizer?.emailAddress?.address || null
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Exchange an authorization code for a token set (PKCE public client). */
async function exchangeCode({ clientId, code, codeVerifier, tenant }) {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
    scope: SCOPES
  })
  return postToken(tokenUrl(tenant), body, 'Failed to exchange authorization code')
}

/** Redeem a refresh token for a fresh access token (PKCE public client). */
async function refreshAccessToken({ clientId, refreshToken, tenant }) {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPES
  })
  return postToken(tokenUrl(tenant), body, 'Failed to refresh Microsoft access token')
}

/** POST to the token endpoint and normalize errors. */
async function postToken(url, body, failMessage) {
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
  } catch (e) {
    throw new Error(`${failMessage}: network error (${e.message})`)
  }

  const text = await res.text()
  let json = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    /* leave json empty; handled below */
  }

  if (!res.ok) {
    const detail = json.error_description || json.error || text || `HTTP ${res.status}`
    throw new Error(`${failMessage}: ${detail}`)
  }
  return json
}

/** Build a persisted token record and save it under STORE_KEY. */
function persistTokens(store, tokenSet, emailFallback, tenant) {
  const existing = store.get(STORE_KEY) || {}
  const expiresAt = Date.now() + (Number(tokenSet.expires_in) || 3600) * 1000

  store.set(STORE_KEY, {
    access_token: tokenSet.access_token,
    // Microsoft rotates refresh tokens; keep the previous one if none returned.
    refresh_token: tokenSet.refresh_token || existing.refresh_token || null,
    expires_at: expiresAt,
    email: emailFallback || existing.email || null,
    // Remember which tenant we authed against so refreshes hit the same endpoint.
    tenant: tenant || existing.tenant || 'consumers'
  })
}

/**
 * Return a valid access token, refreshing via the refresh_token when the
 * stored access token is missing or (about to be) expired.
 */
async function ensureValidToken({ store, clientId }) {
  if (!store) throw new Error('A persistent store instance is required')

  const tokens = store.get(STORE_KEY)
  if (!tokens || !tokens.refresh_token) {
    throw new Error('Microsoft account not connected. Please connect Teams first.')
  }

  const stillValid =
    tokens.access_token && typeof tokens.expires_at === 'number' && tokens.expires_at - EXPIRY_SKEW_MS > Date.now()

  if (stillValid) return tokens.access_token

  // Need a refresh — clientId is required to talk to the token endpoint.
  if (!clientId || !String(clientId).trim()) {
    throw new Error('Microsoft Client ID not configured')
  }

  const tenant = tokens.tenant || 'consumers'
  const refreshed = await refreshAccessToken({ clientId, refreshToken: tokens.refresh_token, tenant })
  persistTokens(store, refreshed, tokens.email, tenant)
  return refreshed.access_token
}

/** GET a MS Graph resource and return parsed JSON, with clear error messages. */
async function graphGet(accessToken, path, extraHeaders = {}) {
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`

  let res
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...extraHeaders
      }
    })
  } catch (e) {
    throw new Error(`Microsoft Graph request failed: network error (${e.message})`)
  }

  const text = await res.text()
  let json = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    /* handled below */
  }

  if (!res.ok) {
    const detail = json.error?.message || text || `HTTP ${res.status}`
    throw new Error(`Microsoft Graph request failed (${res.status}): ${detail}`)
  }
  return json
}
