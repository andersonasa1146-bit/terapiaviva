import { Component } from 'react'
import { captureException } from '../lib/sentry'

// Evita que um erro de render em qualquer tela derrube o app inteiro
// (fundamental num sistema usado durante o atendimento de pacientes).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[TerapiaViva] Erro nao tratado:', error, info)
    // Task #32: envia para o Sentry quando VITE_SENTRY_DSN estiver
    // configurada; sem isso, e um no-op silencioso.
    captureException(error, { componentStack: info?.componentStack })
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#F3F6F5', padding: 24,
        }}>
          <div style={{
            maxWidth: 420, background: '#fff', borderRadius: 12, padding: 28,
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Algo deu errado</h2>
            <p style={{ fontSize: 13, color: '#556866', marginBottom: 18, lineHeight: 1.6 }}>
              A tela encontrou um erro inesperado. Seus dados ja salvos nao foram perdidos.
              Tente recarregar a pagina; se o problema continuar, contate o suporte.
            </p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload() }}
              style={{
                background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Recarregar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
