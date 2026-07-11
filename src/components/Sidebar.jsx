import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { NAV, allowedItems, useNavKpis } from './navItems'

export default function Sidebar() {
  const auth = useAuth()
  const kpis = useNavKpis()

  return (
    <nav className="sidebar">
      {NAV.map((g) => {
        const items = allowedItems(g.items, auth)
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
                  {badge > 0 ? (
                    <span className={`nb ${it.variant === 'r' ? 'nb-r' : ''}`}>{badge}</span>
                  ) : null}
                </NavLink>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}
