import { supabase } from './supabase'

// Fase 2: teleconsulta integrada (Daily.co).

async function callFunction(name, payload = {}) {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) throw new Error('Você precisa estar autenticada.')

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

export const createVideoRoom = (appointmentId) => callFunction('create-video-room', { appointment_id: appointmentId })
