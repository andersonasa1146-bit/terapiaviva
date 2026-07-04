import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { initials } from '../lib/format'

export default function TopBar() {
  const { therapist, signOut } = useAuth()
  const nav = useNavigate()
  const initial = initials(therapist?.full_name || 'Terapeuta')
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })

  const handleSignOut = async () => {
    await signOut()
    nav('/login', { replace: true })
  }

  return (
    <header className="topbar">
      <Link to="/" className="logo">
        <div className="logo-dot">{initial}</div>
        TerapiaViva
      </Link>
      <div className="topbar-r">
        <span className="top-date">{today}</span>
        <span className="api-badge api-ok" title="IA rodando no servidor (chave protegida)">🔒 IA segura</span>
        <div className="avatar" title={therapist?.full_name || ''} onClick={handleSignOut}>{initial}</div>
      </div>
    </header>
  )
}
