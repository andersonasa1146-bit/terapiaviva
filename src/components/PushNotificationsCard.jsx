import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import { isPushSupported, getPushSubscriptionStatus, subscribeToPush, unsubscribeFromPush, sendTestPush } from '../lib/push'

// Fase 2: card de notificacoes push (PWA) — disponivel para qualquer
// usuario logado (proprietaria ou membro de equipe), ja que cada pessoa
// ativa isso no PROPRIO dispositivo, igual ao 2FA.
export default function PushNotificationsCard() {
  const { ownerId } = useAuth()
  const { toast } = useToast()
  const [status, setStatus] = useState('checking') // checking | unsupported | denied | subscribed | not-subscribed
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    getPushSubscriptionStatus().then(setStatus).catch(() => setStatus('unsupported'))
  }
  useEffect(() => { refresh() }, [])

  const activate = async () => {
    setBusy(true)
    try {
      await subscribeToPush(ownerId)
      toast.success('Notificações ativadas neste dispositivo.')
      refresh()
    } catch (e) { toast.error(e.message) }
    setBusy(false)
  }

  const deactivate = async () => {
    setBusy(true)
    try {
      await unsubscribeFromPush()
      toast.success('Notificações desativadas neste dispositivo.')
      refresh()
    } catch (e) { toast.error(e.message) }
    setBusy(false)
  }

  const test = async () => {
    setBusy(true)
    try {
      const r = await sendTestPush()
      if (r.sent > 0) toast.success('Notificação de teste enviada — confira seu dispositivo.')
      else toast.error('Nenhuma notificação foi enviada. Confirme se já ativou nesse dispositivo e se o VAPID está configurado no servidor.')
    } catch (e) { toast.error(e.message) }
    setBusy(false)
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="chdr">🔔 Notificações push neste dispositivo</div>
      <div className="cbdy">
        <p style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 10 }}>
          Receba um aviso direto no celular/computador (mesmo com o app fechado) quando uma sessão estiver
          chegando ou um alerta de risco for gerado. Precisa instalar o TerapiaViva na tela de início
          primeiro (ver aviso de instalação do app) — no iPhone, o push só funciona após essa instalação.
        </p>

        {status === 'checking' && <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Verificando…</div>}

        {status === 'unsupported' && (
          <div className="callout clwrn"><strong>Não suportado</strong>Este navegador/dispositivo não suporta notificações push.</div>
        )}

        {status === 'denied' && (
          <div className="callout clwrn"><strong>Permissão bloqueada</strong>Você negou a permissão de notificação anteriormente. Libere em Configurações do navegador/sistema para ativar.</div>
        )}

        {status === 'not-subscribed' && (
          <button className="btn btn-p btn-sm" onClick={activate} disabled={busy}>{busy ? 'Ativando…' : '+ Ativar notificações'}</button>
        )}

        {status === 'subscribed' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>✅ Ativado neste dispositivo</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={test} disabled={busy}>Enviar teste</button>
              <button className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={deactivate} disabled={busy}>Desativar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
