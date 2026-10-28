import { getFirebaseAuth } from './firebase'
import { apiFetch } from './apiClient'

export class NLPAuthenticationError extends Error {}

export async function searchDataset(baseUrl: string, query: string, datasetId: string) {
  try {
    const auth = getFirebaseAuth()
    await auth.authStateReady()
    if (!auth.currentUser) {
      throw new NLPAuthenticationError('Sign in with your Firebase account before running a query.')
    }
  } catch (error) {
    if (error instanceof NLPAuthenticationError) throw error
    throw new NLPAuthenticationError(
      error instanceof Error ? error.message : 'Unable to authenticate. Please sign in again.',
    )
  }

  return apiFetch(`${baseUrl}/api/dataset/nlp-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, dataset_id: datasetId }),
  })
}
