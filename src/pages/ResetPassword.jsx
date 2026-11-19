import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SITE } from '../config/site'
import { useAuth } from '../contexts/AuthContext'
import MFAChallenge from '../components/MFAChallenge'
import { supabase } from '../lib/supabase'
import {
  MIN_PASSWORD_LENGTH,
  establishRecoverySession,
  parseRecoveryParams,
  translateAuthError,
  updatePassword,
} from '../lib/recovery'

// Tela aberta pelo link de "Esqueci minha senha" enviado por e-mail.
// Ver src/lib/recovery.js para o fluxo completo.
//
// Contas com 2FA: a sessao de recuperacao nasce em aal1 e o Supabase exige
// aal2 para trocar a senha (erro insufficient_aal) — por isso, antes do
// formulario, a tela pede o codigo do autenticador (MFAChallenge), como no
// login normal.
export default function ResetPassword() {
  const nav = useNavigate()
  const { session, mfaChecked, mfaPending } = useAuth()
  const started = useRef(false)
  const hadSession = useRef(false)
  const finishing = useRef(false)
  const [stage, setStage] = useState('checking') // checking | form | invalid
  const [error, setError] = useState('')
  const [password, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const params = parseRecoveryParams(window.location.hash, window.location.search)
    // Tira os tokens da barra de endereco e do historico do navegador.
    if (params.kind !== 'none') window.history.replaceState(null, '', window.location.pathname)
    ;(async () => {
      try {
        if (params.kind === 'error') throw new Error(params.error)
        if (params.kind === 'none') {
          const { data } = await supabase.auth.getSession()
          if (!data?.session) {
            setStage('invalid')
            return
          }
        } else {
          await establishRecoverySession(params)
        }
        setStage('form')
      } catch (e) {
        setError(translateAuthError(e))
        setStage('invalid')
      }
    })()
  }, [])

  // Se a pessoa sair pelo desafio de 2FA ("Sair e entrar com outra conta"),
  // volta para o login em vez de ficar presa nesta tela.
  useEffect(() => {
    if (session) {
      hadSession.current = true
    } else if (hadSession.current && stage === 'form' && !finishing.current) {
      nav('/login', { replace: true })
    }
  }, [session, stage, nav])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      return
    }
    if (password !== confirm) {
      setError('As duas senhas não são iguais.')
      return
    }
    setBusy(true)
    try {
      await updatePassword(password)
      finishing.current = true
      // Encerra a sessao de recuperacao (e as demais sessoes da conta) para
      // que o proximo acesso use a senha nova — e passe pelo 2FA, se ativo.
      await supabase.auth.signOut().catch(() => {})
      nav('/login', {
        replace: true,
        state: { msg: '✅ Senha alterada. Entre com a nova senha.' },
      })
    } catch (e2) {
      setError(translateAuthError(e2))
      setBusy(false)
    }
  }

  const errorBox = error && (
    <div
      style={{
        fontSize: 11,
        color: 'var(--red)',
        marginBottom: 8,
        padding: 8,
        background: 'var(--redl)',
        borderRadius: 6,
      }}
    >
      {error}
    </div>
  )

  if (stage === 'form' && session && mfaChecked && mfaPending) return <MFAChallenge />

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>🌿 {SITE.appName}</h1>
        <p className="sub">Criar nova senha</p>

        {(stage === 'checking' || (stage === 'form' && (!session || !mfaChecked))) && (
          <p style={{ fontSize: 12, color: 'var(--txt2)', textAlign: 'center' }}>
            Verificando o link…
          </p>
        )}

        {stage === 'invalid' && (
          <>
            {errorBox || (
              <p style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 12 }}>
                Abra esta página pelo link que enviamos para o seu e-mail.
              </p>
            )}
            <button
              type="button"
              className="btn btn-p"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => nav('/login', { replace: true, state: { mode: 'forgot' } })}
            >
              Pedir um novo link
            </button>
            <p style={{ fontSize: 11, marginTop: 14, textAlign: 'center' }}>
              <a
                onClick={() => nav('/login', { replace: true })}
                style={{ color: 'var(--p)', cursor: 'pointer', fontWeight: 500 }}
              >
                Ir para o login
              </a>
            </p>
          </>
        )}

        {stage === 'form' && session && mfaChecked && (
          <form onSubmit={submit}>
            <div className="field">
              <label>Nova senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPass(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Repita a nova senha</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
              />
            </div>
            <p style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 8 }}>
              Mínimo de {MIN_PASSWORD_LENGTH} caracteres.
            </p>
            {errorBox}
            <button
              type="submit"
              disabled={busy}
              className="btn btn-p"
              style={{ width: '100%', marginTop: 8 }}
            >
              {busy ? 'Aguarde…' : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
