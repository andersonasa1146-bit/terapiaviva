import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const NAV = [
  { g: 'Principal', items: [
    { to: '/',           ico: '📊', lbl: 'Dashboard' },
    { to: '/patients',   ico: '👥', lbl: 'Pacientes' },
    { to: '/agenda',     ico: '📅', lbl: 'Agenda' },
    { to: '/anamnese',   ico: '📋', lbl: 'Anamnese', badgeKey: 'pending_anamneses' },
  ]},
  { g: 'Clinico', items: [
    { to: '/ia',         ico: '🧠', lbl: 'IA Clinica',  variant: 't' },
    { to: '/prayer',     ico: '🙏', lbl: 'Oracao' },
    { to: '/biblical',   ico: '📖', lbl: 'Biblico' },
  ]},
  { g: 'Gestao', items: [
    { to: '/financial',  ico: '💰', lbl: 'Financeiro' },
    { to: '/config',     ico: '⚙️', lbl: 'Config' },
  ]},
]

export default function Sidebar() {
  const { session } = useAuth()
  const loc = useLocation()
  const [kpis, setKpis] = useState({})

  useEffect(() => {
    if (!session?.user) return
    supabase.from('v_dashboard_kpis').select('*').eq('therapist_id', session.user.id).maybeSingle()
      .then(({ data }) => setKpis(data ?? {}))
  }, [session, loc.pathname])

  return (
    <nav className="sidebar">
      {NAV.map((g) => (
        <div key={g.g}>
          <div className="nav-grp">{g.g}</div>
          {g.items.map((it) => {
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
                {badge > 0 ? <span className="nb">{badge}</span> : null}
              </NavLink>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
