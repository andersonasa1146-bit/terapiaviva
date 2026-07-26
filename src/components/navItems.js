// Config unica de navegacao — usada pela Sidebar (desktop) e MobileNav
// (barra inferior no celular), para os itens e permissoes nunca divergirem.
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export const NAV = [
  {
    g: 'Principal',
    items: [
      { to: '/', ico: '📊', lbl: 'Dashboard', short: 'Início' },
      {
        to: '/alertas',
        ico: '🚨',
        lbl: 'Alertas',
        badgeKey: 'unresolved_risk_alerts',
        variant: 'r',
        clinical: true,
      },
      { to: '/patients', ico: '👥', lbl: 'Pacientes', short: 'Pacientes' },
      { to: '/agenda', ico: '📅', lbl: 'Agenda', short: 'Agenda' },
      {
        to: '/anamnese',
        ico: '📋',
        lbl: 'Anamnese',
        short: 'Anamnese',
        badgeKey: 'pending_anamneses',
        clinical: true,
      },
    ],
  },
  {
    g: 'Clínico',
    items: [
      { to: '/ia', ico: '🧠', lbl: 'IA Clínica', variant: 't', clinical: true },
      { to: '/prayer', ico: '🙏', lbl: 'Oração' },
      { to: '/biblical', ico: '📖', lbl: 'Bíblico' },
    ],
  },
  {
    g: 'Gestão',
    items: [
      { to: '/financial', ico: '💰', lbl: 'Financeiro', financial: true },
      { to: '/auditoria', ico: '🗂', lbl: 'Auditoria', adminOnly: true },
      { to: '/config', ico: '⚙️', lbl: 'Config' },
    ],
  },
  { g: 'Plataforma', items: [{ to: '/admin', ico: '🛠', lbl: 'Painel admin', platformOnly: true }] },
]

export function allowedItems(items, perms) {
  const { hasClinicalAccess, hasFinancialAccess, isTeamAdmin, isPlatformAdmin } = perms
  return items.filter(
    (it) =>
      (!it.clinical || hasClinicalAccess) &&
      (!it.financial || hasFinancialAccess) &&
      (!it.adminOnly || isTeamAdmin) &&
      (!it.platformOnly || isPlatformAdmin),
  )
}

// KPIs usados como badge (alertas nao resolvidos, anamneses pendentes).
export function useNavKpis() {
  const { session, ownerId } = useAuth()
  const loc = useLocation()
  const [kpis, setKpis] = useState({})
  useEffect(() => {
    if (!session?.user || !ownerId) return
    supabase
      .from('v_dashboard_kpis')
      .select('*')
      .eq('therapist_id', ownerId)
      .maybeSingle()
      .then(({ data }) => setKpis(data ?? {}))
  }, [session, ownerId, loc.pathname])
  return kpis
}
