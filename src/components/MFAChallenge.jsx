import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { listFactors, challengeAndVerify } from '../lib/mfa'
import { SITE } from '../config/site'

// Task #30: exibida quando a sessao esta em aal1 (so senha) mas o usuario
// tem um fator TOTP verificado — bloqueia o acesso ao app ate confirmar o
// codigo de 6 digitos do aplicativo autenticador.
export default function MFAChallenge() {
  const { refreshMfaStatus, signOut } = useAuth()
  const [factorId, setFactorId] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [loadingFactors, setLoadingFactors] = useState(true)

  useEffect(() => {
    listFactors().then((factors) => {
      const verified = factors.find((f) => f.status === 'verified')
      setFactorId(verified?.id ?? null)
      setLoadingFactors(false)
    }).catch(() => setLoadingFactors(false))
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!factorId) return
    setBusy(true); setErr('')
    try {
      await challengeAndVerify(factorId, code.trim())
      await refreshMfaStatus()
    } catch (e2) {
      setErr(e2.message || 'Código inválido. Tente novamente.')
    }
    setBusy(false)
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>🌿 {SITE.appName}</h1>
        <p className="sub">Verificação em duas etapas</p>
        {loadingFactors ? (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--txt2)' }}>Carregando…</div>
        ) : !factorId ? (
          <div style={{ fontSize: 12.5, color: 'var(--red)', textAlign: 'center' }}>
            Não foi possível localizar seu fator de autenticação. Entre em contato com a proprietária da conta.
          </div>
        ) : (
          <form onSubmit={submit}>
            <p style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 12, lineHeight: 1.6 }}>
              Abra o aplicativo autenticador (Google Authenticator, Authy, 1Password, etc.) e digite o código de 6
              dígitos exibido para esta conta.
            </p>
            <div className="field">
              <label>Código de verificação</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoFocus
                placeholder="000000"
                style={{ letterSpacing: 4, textAlign: 'center', fontSize: 18 }}
              />
            </div>
            {err && <div style={{ fontSize: 11, color: 'var(--red)', background: 'var(--redl)', borderRadius: 6, padding: 8, marginBottom: 8 }}>{err}</div>}
            <button type="submit" disabled={busy || code.length < 6} className="btn btn-p" style={{ width: '100%', marginTop: 4 }}>
              {busy ? 'Verificando…' : 'Confirmar'}
            </button>
          </form>
        )}
        <p style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 16, textAlign: 'center' }}>
          <a onClick={() => signOut()} style={{ cursor: 'pointer', color: 'var(--txt2)' }}>Sair e entrar com outra conta</a>
        </p>
      </div>
    </div>
  )
}
