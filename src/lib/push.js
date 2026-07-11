import { supabase } from './supabase'

// Fase 2: notificacoes push (PWA). Usa a Web Push API padrao do navegador
// (sem SDK de terceiros) — a chave publica VAPID identifica este servidor
// para o navegador, e a Edge Function send-push assina as mensagens com a
// chave privada correspondente (nunca exposta aqui).

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

export async function getPushSubscriptionStatus() {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'subscribed' : 'not-subscribed'
}

export async function subscribeToPush(ownerId) {
  if (!isPushSupported()) throw new Error('Este navegador nao suporta notificacoes push.')
  if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY nao configurada neste ambiente.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permissao de notificacao negada.')

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const json = sub.toJSON()
  const { data: sess } = await supabase.auth.getSession()
  const userId = sess?.session?.user?.id
  if (!userId) throw new Error('Sessao invalida.')

  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth_key: json.keys.auth,
    user_id: userId,
    owner_id: ownerId,
    user_agent: navigator.userAgent,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) throw error
  return true
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

export async function sendTestPush() {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) throw new Error('Voce precisa estar autenticada.')
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ test: true }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) throw new Error(body?.error || `Erro ${res.status}`)
  return body
}
