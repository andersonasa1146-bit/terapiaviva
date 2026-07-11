import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { listAccessAuditLog, ACTION_LABEL } from '../lib/audit'

const ACTION_STYLE = {
  view_patient: { bg: '#EEF3F2', fg: '#33403E' },
  view_session: { bg: '#EEF3F2', fg: '#33403E' },
  view_scale: { bg: '#EEEDFE', fg: '#3C3489' },
  view_files: { bg: '#EEEDFE', fg: '#3C3489' },
  view_billing: { bg: '#E1F5EE', fg: '#0B5E44' },
  view_report: { bg: '#E1F5EE', fg: '#0B5E44' },
  export_patient_data: { bg: '#FDF6E3', fg: '#8a5a06' },
  erase_patient: { bg: '#FBE4E4', fg: '#A32D2D' },
}

export default function AuditLog() {
  const { session, isTeamAdmin } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    listAccessAuditLog({ limit: 300 }).then(setEntries).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { if (session?.user && isTeamAdmin) load() }, [session, isTeamAdmin])

  if (!isTeamAdmin) {
    return (
      <div style={{ padding: 14 }}>
        <div className="card"><div className="cbdy" style={{ padding: '22px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--txt2)' }}>
          Somente a proprietaria ou administradores da clinica podem ver o log de auditoria.
        </div></div>
      </div>
    )
  }

  return (
    <div style={{ padding: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>🗂 Log de auditoria de acesso</h2>
        <p style={{ fontSize: 11, color: 'var(--txt2)' }}>
          Registro de quem acessou o prontuario de cada paciente e quando — util para atender a LGPD art. 37
          (registro das operacoes de tratamento) e para investigar acessos indevidos.
        </p>
      </div>

      <div className="card">
        <div className="cbdy" style={{ padding: '4px 13px' }}>
          {loading ? (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>Carregando…</div>
          ) : entries.length ? entries.map((e) => {
            const st = ACTION_STYLE[e.action] || ACTION_STYLE.view_patient
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.fg, fontWeight: 600, flexShrink: 0 }}>
                  {ACTION_LABEL[e.action] || e.action}
                </span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                  <strong>{e.actor_name}</strong> — {e.patient_name}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--txt3)', flexShrink: 0 }}>
                  {new Date(e.created_at).toLocaleString('pt-BR')}
                </div>
              </div>
            )
          }) : (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>Nenhum acesso registrado ainda.</div>
          )}
        </div>
      </div>
    </div>
  )
}
