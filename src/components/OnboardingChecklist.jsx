import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { listFactors } from '../lib/mfa'

// Task #35: onboarding guiado para novas terapeutas. Reaproveita a coluna
// `onboarded_at` de `therapists` (ja existia no schema desde o inicio, mas
// nunca era lida/gravada por nenhuma tela) como o "dispensado ate" desta
// checklist — null = ainda nao visto/concluido. Nao precisou de nenhuma
// migration nova: a policy `therapist_self_update` (id = auth.uid()) ja
// permite ao proprio usuario gravar essa coluna via update direto.
//
// So aparece para quem esta operando como "owner" da propria clinica (quem
// convida equipe/configura calendario/2FA e sempre a proprietaria — um
// membro convidado nao teria o que fazer com estes passos).
const STEPS = [
  { key: 'patient', required: true, ico: '👥', lbl: 'Cadastre seu primeiro paciente', to: '/patients' },
  { key: 'anamnese', required: true, ico: '📋', lbl: 'Envie um link de anamnese', to: '/anamnese' },
  { key: 'session', required: true, ico: '📝', lbl: 'Registre sua primeira sessao', to: '/patients' },
  { key: 'mfa', required: false, ico: '🔒', lbl: 'Ative a autenticacao de dois fatores (2FA)', to: '/config' },
  { key: 'calendar', required: false, ico: '📅', lbl: 'Conecte o Google Calendar', to: '/config' },
]

export default function OnboardingChecklist() {
  const { session, ownerId, profile, therapist, teamRole } = useAuth()
  const [status, setStatus] = useState(null)
  const [hidden, setHidden] = useState(false)

  const active = !!session?.user && !!ownerId && teamRole === 'owner' && !profile?.onboarded_at && !hidden

  useEffect(() => {
    if (!active) { setStatus(null); return }
    let cancelled = false

    ;(async () => {
      const [patients, anamneses, sessions, factors] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('therapist_id', ownerId),
        supabase.from('anamneses').select('id', { count: 'exact', head: true }).eq('therapist_id', ownerId),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('therapist_id', ownerId),
        listFactors().catch(() => []),
      ])
      if (cancelled) return

      const s = {
        patient: (patients.count ?? 0) > 0,
        anamnese: (anamneses.count ?? 0) > 0,
        session: (sessions.count ?? 0) > 0,
        mfa: factors.some((f) => f.status === 'verified'),
        calendar: !!therapist?.google_calendar_connected,
      }
      setStatus(s)

      // Todos os passos essenciais concluidos: encerra silenciosamente,
      // sem precisar que a pessoa clique em "Ocultar".
      if (s.patient && s.anamnese && s.session && session?.user) {
        setHidden(true)
        supabase.from('therapists').update({ onboarded_at: new Date().toISOString() }).eq('id', session.user.id)
      }
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ownerId, therapist?.google_calendar_connected])

  const dismiss = () => {
    setHidden(true)
    if (session?.user) {
      supabase.from('therapists').update({ onboarded_at: new Date().toISOString() }).eq('id', session.user.id)
    }
  }

  if (!active || !status) return null

  const doneCount = STEPS.filter((s) => status[s.key]).length

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="chdr">
        Primeiros passos ({doneCount}/{STEPS.length})
        <div className="chdr-act"><button onClick={dismiss}>Ocultar</button></div>
      </div>
      <div className="cbdy" style={{ padding: '4px 13px' }}>
        {STEPS.map((s) => (
          <Link key={s.key} to={s.to} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="srow" style={{ opacity: status[s.key] ? 0.55 : 1 }}>
              <div className="stm">{status[s.key] ? '✅' : s.ico}</div>
              <div style={{ fontSize: 12, fontWeight: 500, textDecoration: status[s.key] ? 'line-through' : 'none' }}>
                {s.lbl}
                {!s.required ? <span style={{ color: 'var(--txt3)', fontWeight: 400 }}> · opcional</span> : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
