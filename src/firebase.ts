import { getApp, getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'

const useEmulator = import.meta.env.DEV && import.meta.env.VITE_USE_AUTH_EMULATOR === 'true'
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'medreachai-679aa'
let authInstance: Auth | undefined

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance

  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || (useEmulator ? 'local-emulator-key' : '')
  if (!apiKey) throw new Error('Set VITE_FIREBASE_API_KEY to enable Firebase sign-in.')

  const app = getApps().length ? getApp() : initializeApp({
    apiKey,
    projectId,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  })
  const auth = getAuth(app)
  if (useEmulator && !auth.emulatorConfig) {
    connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099')
  }
  authInstance = auth
  return auth
}
