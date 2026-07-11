// Navegacao mobile (telas <= 768px): barra inferior fixa com os destinos
// principais + botao "Mais" que abre uma folha com o restante do menu,
// respeitando exatamente as mesmas permissoes da Sidebar.
import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { NAV, allowedItems, useNavKpis } from './navItems'

const PRIMARY = ['/', '/patients', '/agenda', '/anamnese']

export default function MobileNav() {
  const auth = useAuth()
  const kpis = useNavKpis()
  const loc = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  // Fecha a folha "Mais" ao navegar.
  useEffect(() => setMoreOpen(false), [loc.pathname])

  const all = NAV.flatMap((g) => allowedItems(g.items, auth).map((it) => ({ ...it, grp: g.g })))
  const primary = PRIMARY.map((to) => all.find((it) => it.to === to)).filter(Boolean)
  const rest = all.filter((it) => !PRIMARY.includes(it.to))
  const restBadge = rest.reduce(
    (s, it) => s + (it.badgeKey ? Number(kpis[it.badgeKey]) || 0 : 0),
    0,
  )
  const moreActive = rest.some((it) => loc.pathname === it.to)

  const badgeOf = (it) => (it.badgeKey ? Number(kpis[it.badgeKey]) || 0 : 0)

  return (
    <>
      {moreOpen && (
        <div className="msheet-ov" onClick={() => setMoreOpen(false)}>
          <div className="msheet" role="menu" onClick={(e) => e.stopPropagation()}>
            <div className="msheet-grab" />
            {NAV.map((g) => {
              const items = allowedItems(g.items, auth).filter((it) => !PRIMARY.includes(it.to))
              if (!items.length) return null
              return (
                <div key={g.g}>
                  <div className="nav-grp">{g.g}</div>
                  <div className="msheet-grid">
                    {items.map((it) => (
                      <NavLink
                        key={it.to}
                        to={it.to}
                        className={({ isActive }) => `msheet-it ${isActive ? 'on' : ''}`}
                      >
                        <span className="mnav-ico">{it.ico}</span>
                        <span>{it.lbl}</span>
                        {badgeOf(it) > 0 && <span className="mnav-badge">{badgeOf(it)}</span>}
                      </NavLink>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <nav className="mnav" aria-label="Navegacao principal">
        {primary.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/'}
            className={({ isActive }) => `mnav-it ${isActive ? 'on' : ''}`}
          >
            <span className="mnav-ico">{it.ico}</span>
            <span>{it.short || it.lbl}</span>
            {badgeOf(it) > 0 && <span className="mnav-badge">{badgeOf(it)}</span>}
          </NavLink>
        ))}
        <button
          type="button"
          className={`mnav-it ${moreActive || moreOpen ? 'on' : ''}`}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <span className="mnav-ico">☰</span>
          <span>Mais</span>
          {restBadge > 0 && <span className="mnav-badge">{restBadge}</span>}
        </button>
      </nav>
    </>
  )
}
