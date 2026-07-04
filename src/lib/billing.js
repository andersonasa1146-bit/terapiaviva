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
