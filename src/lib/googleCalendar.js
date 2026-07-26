import { supabase } from './supabase'

async function callFunction(name, payload) {
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

// Inicia o fluxo OAuth2: pede a URL de consentimento e redireciona o navegador.
export async function connectGoogleCalendar() {
  const { url } = await callFunction('google-oauth-start', {})
  window.location.href = url
}

export async function disconnectGoogleCalendar() {
  const { error } = await supabase.rpc('disconnect_google_calendar')
  if (error) throw error
}

// Espelha um agendamento no Google Calendar. Best-effort — nunca lanca
// erro que quebre o fluxo de agenda; retorna { skipped } se nao conectado.
export async function syncAppointmentToGoogle(appointmentId, action = 'upsert') {
  try {
    return await callFunction('sync-appointment', { appointment_id: appointmentId, action })
  } catch (e) {
    console.warn('Sincronização com Google Calendar falhou (não bloqueante):', e.message)
    return { skipped: true, error: e.message }
  }
}
