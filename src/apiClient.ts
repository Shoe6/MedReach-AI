import { getFirebaseAuth } from './firebase'

// Empty string means calls are relative (proxied via the Vite dev server or Firebase Hosting rewrites).
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

async function getIdToken(forceRefresh = false): Promise<string | null> {
  const auth = getFirebaseAuth()
  await auth.authStateReady()
  return auth.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null
}

function withAuthorization(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

// fetch wrapper that attaches the signed-in user's Firebase ID token. On a 401 the token is
// force-refreshed once (e.g. expired token or freshly assigned role claim) before giving up.
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let token: string | null = null
  try {
    token = await getIdToken()
  } catch {
    // Firebase is not configured; send the request unauthenticated and let the API reject it.
  }

  const response = await globalThis.fetch(input, withAuthorization(init, token))
  if (response.status !== 401 || !token) return response

  try {
    const refreshed = await getIdToken(true)
    return globalThis.fetch(input, withAuthorization(init, refreshed))
  } catch {
    return response
  }
}
