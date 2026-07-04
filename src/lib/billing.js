import { supabase } from './supabase'

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

// Cria uma assinatura no Mercado Pago e devolve a URL de checkout.
// Lanca erro com mensagem amigavel se a cobranca ainda nao estiver configurada
// (MERCADOPAGO_ACCESS_TOKEN ausente no servidor).
export const createSubscription = () => callFunction('create-subscription')

// --- Cobranca de pacientes (token Mercado Pago pessoal da terapeuta) ------

export const chargePatient = (patientId, amount, description, sessionId) =>
  callFunction('charge-patient', { patient_id: patientId, amount, description, session_id: sessionId })

export async function setPatientMpToken(token) {
  const { error } = await supabase.rpc('set_patient_mp_token', { p_token: token })
  if (error) throw error
}

export async function clearPatientMpToken() {
  const { error } = await supabase.rpc('clear_patient_mp_token')
  if (error) throw error
}

export async function hasPatientMpToken() {
  const { data, error } = await supabase.rpc('has_patient_mp_token')
  if (error) throw error
  return !!data
}
