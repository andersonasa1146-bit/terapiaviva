import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { initials } from '../lib/format'
import { SITE } from '../config/site'

const ROLE_BADGE = { admin: 'Admin', terapeuta: 'Terapeuta', recepcao: 'Recepcao' }

export default function TopBar() {
  const { profile, teamRole, isOwner, signOut } = useAuth()
  const nav = useNavigate()
  const initial = initials(profile?.full_name || 'Terapeuta')
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })

  const handleSignOut = async () => {
    await signOut()
    nav('/login', { replace: true })
  }

  return (
    <header className="topbar">
      <Link to="/" className="logo">
        <div className="logo-dot">{initial}</div>
        {SITE.appName}
      </Link>
      <div className="topbar-r">
        <span className="top-date">{today}</span>
        {!isOwner && (
          <span className="api-badge" style={{background:'#EEEDFE',color:'#3C3489'}} title="Voce esta operando na equipe desta clinica">
            👤 {ROLE_BADGE[teamRole] || teamRole}
          </span>
        )}
        <span className="api-badge api-ok" title="IA rodando no servidor (chave protegida)">🔒 IA segura</span>
        <div className="avatar" title={`${profile?.full_name || ''} · Clique para sair`} onClick={handleSignOut}>{initial}</div>
      </div>
    </header>
  )
}
