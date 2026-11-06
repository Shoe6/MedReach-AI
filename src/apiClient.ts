import { getFirebaseAuth } from './firebase'

// Empty string means calls are relative (proxied via the Vite dev server or Firebase Hosting rewrites).
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''
// Production uploads bypass Firebase Hosting's 60-second proxy deadline.
export const UPLOAD_API_BASE_URL = import.meta.env.DEV
  ? API_BASE_URL
  : 'https://medreach-ai-894235176706.us-east1.run.app'

export class APIAuthenticationError extends Error {}

async function getIdToken(forceRefresh = false): Promise<string> {
  const auth = getFirebaseAuth()
  await auth.authStateReady()
  const token = await auth.currentUser?.getIdToken(forceRefresh)
  if (!token) {
    throw new APIAuthenticationError('Sign in with your Firebase account before making API requests.')
  }
  return token
}

function withAuthorization(init: RequestInit, token: string): RequestInit {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

// fetch wrapper that attaches the signed-in user's Firebase ID token. On a 401 the token is
// force-refreshed once before giving up. Authentication errors propagate to the caller.
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken()
  const response = await globalThis.fetch(input, withAuthorization(init, token))
  if (response.status !== 401) return response

  const refreshed = await getIdToken(true)
  return globalThis.fetch(input, withAuthorization(init, refreshed))
}
