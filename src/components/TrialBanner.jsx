import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { trialBanner } from '../lib/access'

// Faixa no topo do conteudo durante o teste gratis (so para a proprietaria
// da clinica, que e quem assina). Fica em destaque na ultima semana.
export default function TrialBanner() {
  const { access } = useAuth()
  const banner = trialBanner(access)
  if (!banner) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        flexWrap: 'wrap',
        margin: '10px 14px 10px',
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 12,
        background: banner.urgent ? 'var(--aml)' : 'var(--pl)',
        color: banner.urgent ? 'var(--am)' : 'var(--pd)',
        border: `1px solid ${banner.urgent ? 'var(--am)' : 'var(--bdr)'}`,
      }}
    >
      <span>⏳ {banner.text}</span>
      <Link to="/config" className="btn btn-p btn-sm" style={{ textDecoration: 'none' }}>
        Assinar agora
      </Link>
    </div>
  )
}
