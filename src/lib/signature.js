import { supabase } from './supabase'

// Fase 2: assinatura digital para relatorios (via Autentique).

async function callFunction(name, payload = {}) {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) throw new Error('Voce precisa estar autenticada.')

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) throw new Error(body?.error || `Erro ${res.status}`)
  return body
}

export const signReport = (patientId, signerName, signerEmail) =>
  callFunction('sign-report', { patient_id: patientId, signer_name: signerName, signer_email: signerEmail })

export async function listSignatures(patientId) {
  const { data, error } = await supabase
    .from('document_signatures').select('*').eq('patient_id', patientId).order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}
