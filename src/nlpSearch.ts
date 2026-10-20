import { getFirebaseAuth } from './firebase'

export class NLPAuthenticationError extends Error {}

export async function searchDataset(baseUrl: string, query: string, datasetId: string) {
  let token: string
  try {
    const auth = getFirebaseAuth()
    await auth.authStateReady()
    if (!auth.currentUser) {
      throw new NLPAuthenticationError('Sign in with your Firebase account before running a query.')
    }
    token = await auth.currentUser.getIdToken()
  } catch (error) {
    if (error instanceof NLPAuthenticationError) throw error
    throw new NLPAuthenticationError(
      error instanceof Error ? error.message : 'Unable to authenticate. Please sign in again.',
    )
  }

  return globalThis.fetch(`${baseUrl}/api/dataset/nlp-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, dataset_id: datasetId }),
  })
}
