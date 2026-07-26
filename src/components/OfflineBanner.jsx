import { useEffect, useState } from 'react'

// Task #36 (PWA instalavel + suporte offline): feedback simples e honesto
// de conectividade. O service worker (ver vite.config.js) deixa a INTERFACE
// (HTML/CSS/JS ja carregados) continuar de pe quando a conexao cai, mas
// dados de pacientes/agenda/financeiro exigem rede — nunca cacheamos
// chamadas ao Supabase (seria perigoso mostrar dados clinicos desatualizados
// sem deixar isso claro). Este banner deixa a limitacao explicita para quem
// esta usando o app, em vez de deixar requisicoes falharem silenciosamente.
export default function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (online) return null

  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: '#4A3A10', color: '#FAC775', textAlign: 'center',
        fontSize: 12, padding: '6px 12px',
      }}
    >
      ⚠ Você está offline. O app continua aberto, mas pacientes, agenda e financeiro só atualizam quando a conexão voltar.
    </div>
  )
}
