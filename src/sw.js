// TerapiaViva — Service Worker customizado (Fase 2: notificacoes push).
//
// Task #36 gerava o service worker automaticamente via estrategia
// "generateSW" do vite-plugin-pwa, que cobre cache offline mas NAO permite
// customizar eventos (push/notificationclick). Para adicionar push sem
// perder o precache de assets estaticos ja existente, migramos para a
// estrategia "injectManifest": este arquivo e o "codigo-fonte" do service
// worker, e o build injeta automaticamente a lista de arquivos a cachear
// no lugar de self.__WB_MANIFEST.
//
// Continua valendo a regra de ouro do PWA deste app: NUNCA cachear
// respostas do Supabase (dados clinicos sempre exigem rede) — aqui so
// fazemos precache de assets estaticos do proprio build.

import { precacheAndRoute } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// --- Fase 2: notificacoes push ------------------------------------------
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'TerapiaViva', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'TerapiaViva'
  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
      return undefined
    }),
  )
})
