import { useState } from 'react'
import { useNavigate, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { SITE } from '../config/site'
import { requestPasswordReset, translateAuthError } from '../lib/recovery'

export default function Login() {
  const { session, signIn, signUp } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  // mode: 'login' | 'signup' | 'forgot' (Esqueci minha senha)
  const [mode, setMode] = useState(location.state?.mode || 'login')
  const [full_name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPass] = useState('')
  const [err, setErr] = useState(location.state?.msg || '')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    if (mode === 'forgot') {
      try {
        await requestPasswordReset(email)
        setErr('✅ Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Confira também a caixa de spam.')
        setMode('login')
      } catch (e2) {
        setErr(translateAuthError(e2))
      } finally { setBusy(false) }
      return
    }
    try {
      const { error } = mode === 'login'
        ? await signIn(email, password)
        : await signUp(email, password, full_name)
      if (error) throw error
      if (mode === 'signup') {
        setErr('✅ Conta criada. Verifique seu e-mail e faça login.')
        setMode('login')
      } else {
        nav('/', { replace: true })
      }
    } catch (e2) {
      setErr(e2.message || 'Erro ao autenticar')
    } finally { setBusy(false) }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>🌿 {SITE.appName}</h1>
        {SITE.loginVerse && mode !== 'forgot' && <p className="sub">{SITE.loginVerse}</p>}
        {mode === 'forgot' && (
          <p className="sub">Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.</p>
        )}
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <div className="field">
              <label>Nome completo</label>
              <input value={full_name} onChange={(e)=>setName(e.target.value)} required />
            </div>
          )}
          <div className="field">
            <label>E-mail</label>
            <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required autoComplete="email" />
          </div>
          {mode !== 'forgot' && (
            <div className="field">
              <label>Senha</label>
              <input type="password" value={password} onChange={(e)=>setPass(e.target.value)} required autoComplete={mode==='login'?'current-password':'new-password'} />
            </div>
          )}
          {mode === 'login' && (
            <p style={{fontSize:11,textAlign:'right',margin:'-2px 0 6px'}}>
              <a onClick={()=>{ setErr(''); setMode('forgot') }} style={{color:'var(--p)',cursor:'pointer',fontWeight:500}}>
                Esqueci minha senha
              </a>
            </p>
          )}
          {err && <div style={{fontSize:11,color:err.startsWith('✅')?'var(--pd)':'var(--red)',marginBottom:8,padding:8,background:err.startsWith('✅')?'var(--pl)':'var(--redl)',borderRadius:6}}>{err}</div>}
          <button type="submit" disabled={busy} className="btn btn-p" style={{width:'100%',marginTop:8}}>
            {busy ? 'Aguarde…' : (mode==='login' ? 'Entrar' : mode==='forgot' ? 'Enviar link' : 'Criar conta')}
          </button>
        </form>
        <p style={{fontSize:11,color:'var(--txt2)',marginTop:14,textAlign:'center'}}>
          {mode==='login' ? 'Nova terapeuta?' : mode==='forgot' ? 'Lembrou a senha?' : 'Já tem conta?'}{' '}
          <a onClick={()=>{ setErr(''); setMode(mode==='login'?'signup':'login') }} style={{color:'var(--p)',cursor:'pointer',fontWeight:500}}>
            {mode==='login' ? 'Criar conta grátis' : 'Fazer login'}
          </a>
        </p>
        <p style={{fontSize:10,color:'var(--txt3)',marginTop:18,textAlign:'center'}}>
          Ao continuar, você concorda com os <a href="/termos.html" target="_blank" rel="noreferrer" style={{color:'var(--txt2)'}}>Termos de Uso</a> e a <a href="/privacidade.html" target="_blank" rel="noreferrer" style={{color:'var(--txt2)'}}>Política de Privacidade</a>.
        </p>
      </div>
    </div>
  )
}
