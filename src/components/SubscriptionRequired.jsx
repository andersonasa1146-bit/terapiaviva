import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { createSubscription } from '../lib/billing'
import { logPatientAccess } from '../lib/audit'
import { formatDate, TRIAL_DAYS } from '../lib/access'
import { SITE } from '../config/site'

// Tela exibida no lugar do app quando a clinica perde o acesso (teste de
// 45 dias vencido ou assinatura cancelada/pausada). Nada e apagado: os
// dados ficam guardados e voltam assim que a assinatura for confirmada
// pelo Mercado Pago. O bloqueio de verdade e feito no banco (somente
// leitura + IA desligada); esta tela e a parte visivel dele.
export default function SubscriptionRequired() {
  const { access, refreshAccess, signOut } = useAuth()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [msg, setMsg] = useState('')

  const isOwner = !!access?.is_owner
  const cancelled = access?.status === 'cancelado'

  const title = cancelled
    ? 'Sua assinatura está cancelada'
    : `Seu teste grátis de ${TRIAL_DAYS} dias terminou`
  const intro = cancelled
    ? 'A assinatura do plano Profissional foi cancelada ou pausada no Mercado Pago.'
    : `O período de teste terminou em ${formatDate(access?.trial_ends_at)}.`

  const subscribe = async () => {
    setBusy(true)
    setMsg('')
    try {
      const r = await createSubscription()
      window.location.href = r.checkout_url
    } catch (e) {
      setMsg(e.message || 'Não foi possível abrir o pagamento. Tente novamente.')
      setBusy(false)
    }
  }

  const checkAgain = async () => {
    setChecking(true)
    setMsg('')
    const status = await refreshAccess()
    setChecking(false)
    if (!status || status.has_access) nav('/', { replace: true })
    else
      setMsg(
        'Ainda não recebemos a confirmação do Mercado Pago. Ela costuma chegar em poucos minutos após o pagamento.',
      )
  }

  // LGPD: mesmo sem assinatura, a proprietaria pode baixar uma copia dos
  // dados dos pacientes (o banco continua permitindo leitura e exportacao).
  const [exporting, setExporting] = useState(false)
  const exportAll = async () => {
    setExporting(true)
    setMsg('')
    try {
      const { data: patients, error } = await supabase.from('patients').select('id')
      if (error) throw error
      const records = []
      for (const p of patients ?? []) {
        const { data, error: e2 } = await supabase.rpc('export_patient_data', {
          p_patient_id: p.id,
        })
        if (e2) throw e2
        logPatientAccess(p.id, 'export_patient_data')
        records.push(data)
      }
      const blob = new Blob(
        [JSON.stringify({ exported_at: new Date().toISOString(), patients: records }, null, 2)],
        { type: 'application/json' },
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dados-pacientes-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setMsg('Não foi possível exportar: ' + (e.message || 'erro desconhecido'))
    }
    setExporting(false)
  }

  const leave = async () => {
    await signOut()
    nav('/login', { replace: true })
  }

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ maxWidth: '92vw' }}>
        <h1>🌿 {SITE.appName}</h1>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 600,
            textAlign: 'center',
            margin: '10px 0 8px',
            color: 'var(--txt)',
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: 12.5,
            color: 'var(--txt2)',
            lineHeight: 1.6,
            textAlign: 'center',
            marginBottom: 14,
          }}
        >
          {intro} Seus pacientes, sessões e anotações continuam guardados com segurança — nada foi
          apagado.
        </p>

        {isOwner ? (
          <>
            <p
              style={{
                fontSize: 12.5,
                color: 'var(--txt2)',
                lineHeight: 1.6,
                textAlign: 'center',
                marginBottom: 14,
              }}
            >
              Assine o plano Profissional para voltar a usar todos os recursos agora mesmo.
            </p>
            <button
              className="btn btn-p"
              style={{ width: '100%' }}
              onClick={subscribe}
              disabled={busy}
            >
              {busy ? 'Abrindo pagamento…' : 'Assinar plano Profissional'}
            </button>
            <button
              className="btn"
              style={{ width: '100%', marginTop: 8 }}
              onClick={checkAgain}
              disabled={checking}
            >
              {checking ? 'Verificando…' : 'Já assinei — verificar de novo'}
            </button>
          </>
        ) : (
          <div className="consent-box" style={{ textAlign: 'center' }}>
            A assinatura desta clínica é gerenciada pela proprietária da conta. Peça a ela para
            assinar o plano Profissional — assim que o pagamento for confirmado, seu acesso volta
            automaticamente.
          </div>
        )}

        {msg && (
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--red)',
              background: 'var(--redl)',
              borderRadius: 6,
              padding: 8,
              marginTop: 10,
            }}
          >
            {msg}
          </div>
        )}

        {isOwner && (
          <p
            style={{
              fontSize: 11,
              color: 'var(--txt3)',
              marginTop: 16,
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Precisa de uma cópia dos dados dos seus pacientes?{' '}
            <a
              onClick={exporting ? undefined : exportAll}
              style={{ color: 'var(--p)', cursor: 'pointer', fontWeight: 500 }}
            >
              {exporting ? 'Gerando arquivo…' : 'Baixar cópia (LGPD)'}
            </a>
          </p>
        )}
        <p style={{ textAlign: 'center', marginTop: 10 }}>
          <a
            onClick={leave}
            style={{ fontSize: 11.5, color: 'var(--p)', cursor: 'pointer', fontWeight: 500 }}
          >
            Sair
          </a>
        </p>
      </div>
    </div>
  )
}
