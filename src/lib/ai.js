import { supabase } from './supabase'

async function callFunction(name, payload) {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) throw new Error('Voce precisa estar autenticada.')

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) throw new Error(body?.error || `Erro ${res.status}`)
  return body
}

export const analyzeSession   = (sessionId)   => callFunction('analyze-session',   { session_id: sessionId })
export const analyzeAnamnesis = (anamnesisId) => callFunction('analyze-anamnese', { anamnesis_id: anamnesisId })
