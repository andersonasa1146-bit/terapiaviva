import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'

const SOURCE_LABEL = {
  clinical_scale: '📊 Escala clinica',
  ai_session: '🧠 IA de sessao',
  ai_anamnese: '🧠 IA de anamnese',
  self_report: '🙋 Autorrelato do paciente',
}
const SEV_STYLE = {
  critico: { bg: '#FBE4E4', fg: '#A32D2D', label: '⚠ Critico' },
  alto: { bg: '#FDF6E3', fg: '#8a5a06', label: '⚠ Alto' },
  moderado: { bg: '#EEF3F2', fg: '#33403E', label: 'Moderado' },
}

export default function Alerts() {
  const { session } = useAuth()
  const { toast, confirm } = useToast()
  const [alerts, setAlerts] = useState([])
  const [showResolved, setShowResolved] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    let q = supabase.from('risk_alerts')
      .select('*, patients:patient_id(id,full_name,initials,avatar_bg,avatar_fg,risk)')
      .order('created_at', { ascending: false })
    if (!showResolved) q = q.eq('resolved', false)
    const { data } = await q
    setAlerts(data ?? [])
    setLoading(false)
  }
  useEffect(() => { if (session?.user) load() }, [session, showResolved])

  const resolve = async (a) => {
    const ok = await confirm('Marcar este alerta como resolvido? Use apos ter avaliado o risco e tomado as medidas necessarias.', { confirmLabel: 'Marcar resolvido' })
    if (!ok) return
    const { error } = await supabase.from('risk_alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', a.id)
    if (error) { toast.error(error.message); return }
    toast.success('Alerta marcado como resolvido.')
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 600 }}>🚨 Alertas de risco</h2>
          <p style={{ fontSize: 11.5, color: 'var(--txt2)' }}>
            Sinais automaticos de risco vindos de escalas clinicas, analises de IA e autorrelato de pacientes.
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} style={{ accentColor: 'var(--p)' }} />
          Mostrar resolvidos
        </label>
      </div>

      <div className="card">
        <div className="cbdy" style={{ padding: '4px 13px' }}>
          {loading ? (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>Carregando…</div>
          ) : alerts.length ? alerts.map((a) => {
            const p = a.patients
            const sev = SEV_STYLE[a.severity] || SEV_STYLE.moderado
            return (
              <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid var(--bdr)', opacity: a.resolved ? 0.55 : 1 }}>
                {p ? (
                  <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0, background: p.avatar_bg, color: p.avatar_fg }}>
                    {p.initials}
                  </div>
                ) : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: sev.bg, color: sev.fg, fontWeight: 600 }}>{sev.label}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--txt2)' }}>{SOURCE_LABEL[a.source] || a.source}</span>
                    <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{new Date(a.created_at).toLocaleString('pt-BR')}</span>
                    {a.resolved ? <span style={{ fontSize: 10, color: 'var(--txt3)', fontStyle: 'italic' }}>resolvido</span> : null}
                  </div>
                  {p ? (
                    <Link to={`/patients/${p.id}`} style={{ fontSize: 13, fontWeight: 600, color: 'var(--pd)', textDecoration: 'none' }}>{p.full_name}</Link>
                  ) : <span style={{ fontSize: 13, fontWeight: 600 }}>Paciente removido</span>}
                  <div style={{ fontSize: 12.5, color: 'var(--txt2)', marginTop: 2 }}>{a.message}</div>
                </div>
                {!a.resolved && (
                  <button className="btn btn-sm btn-p" onClick={() => resolve(a)} style={{ flexShrink: 0 }}>✓ Marcar resolvido</button>
                )}
              </div>
            )
          }) : (
            <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 12.5, color: 'var(--txt3)' }}>
              {showResolved ? 'Nenhum alerta encontrado.' : 'Nenhum alerta ativo no momento. 🎉'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
