// Firebase client SDK init for browser-side Authentication.
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyBsVH7YW7YusP8HVNNzi6U1WTG2h_hJ8cY',
  authDomain: 'medreachai-679aa.firebaseapp.com',
  projectId: 'medreachai-679aa',
  storageBucket: 'medreachai-679aa.firebasestorage.app',
  messagingSenderId: '894235176706',
  appId: '1:894235176706:web:e3f4cbca7331999529dc1b',
  measurementId: 'G-6CCD751JZ1',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
