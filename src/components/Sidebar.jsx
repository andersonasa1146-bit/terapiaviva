import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const NAV = [
  { g: 'Principal', items: [
    { to: '/',           ico: '📊', lbl: 'Dashboard' },
    { to: '/alertas',    ico: '🚨', lbl: 'Alertas', badgeKey: 'unresolved_risk_alerts', variant: 'r', clinical: true },
    { to: '/patients',   ico: '👥', lbl: 'Pacientes' },
    { to: '/agenda',     ico: '📅', lbl: 'Agenda' },
    { to: '/anamnese',   ico: '📋', lbl: 'Anamnese', badgeKey: 'pending_anamneses', clinical: true },
  ]},
  { g: 'Clinico', items: [
    { to: '/ia',         ico: '🧠', lbl: 'IA Clinica',  variant: 't', clinical: true },
    { to: '/prayer',     ico: '🙏', lbl: 'Oracao' },
    { to: '/biblical',   ico: '📖', lbl: 'Biblico' },
  ]},
  { g: 'Gestao', items: [
    { to: '/financial',  ico: '💰', lbl: 'Financeiro', financial: true },
    { to: '/auditoria',  ico: '🗂', lbl: 'Auditoria', adminOnly: true },
    { to: '/config',     ico: '⚙️', lbl: 'Config' },
  ]},
  { g: 'Plataforma', items: [
    { to: '/admin',      ico: '🛠', lbl: 'Painel admin', platformOnly: true },
  ]},
]

export default function Sidebar() {
  const { session, ownerId, hasClinicalAccess, hasFinancialAccess, isTeamAdmin, isPlatformAdmin } = useAuth()
  const loc = useLocation()
  const [kpis, setKpis] = useState({})

  useEffect(() => {
    if (!session?.user || !ownerId) return
    supabase.from('v_dashboard_kpis').select('*').eq('therapist_id', ownerId).maybeSingle()
      .then(({ data }) => setKpis(data ?? {}))
  }, [session, ownerId, loc.pathname])

  return (
    <nav className="sidebar">
      {NAV.map((g) => {
        const items = g.items.filter((it) =>
          (!it.clinical || hasClinicalAccess) && (!it.financial || hasFinancialAccess) &&
          (!it.adminOnly || isTeamAdmin) && (!it.platformOnly || isPlatformAdmin)
        )
        if (!items.length) return null
        return (
          <div key={g.g}>
            <div className="nav-grp">{g.g}</div>
            {items.map((it) => {
              const badge = it.badgeKey ? kpis[it.badgeKey] : null
              return (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.to === '/'}
                  className={({ isActive }) =>
                    `nav-it ${isActive ? (it.variant === 't' ? 'on-t' : 'on') : ''}`
                  }
                >
                  <span>{it.ico}</span> {it.lbl}
                  {badge > 0 ? <span className={`nb ${it.variant === 'r' ? 'nb-r' : ''}`}>{badge}</span> : null}
                </NavLink>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}
