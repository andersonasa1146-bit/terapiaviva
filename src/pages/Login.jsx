import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { SITE } from '../config/site'

export default function Login() {
  const { session, signIn, signUp } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState('login')
  const [full_name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const { error } = mode === 'login'
        ? await signIn(email, password)
        : await signUp(email, password, full_name)
      if (error) throw error
      if (mode === 'signup') {
        setErr('✅ Conta criada. Verifique seu email e faca login.')
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
        {SITE.loginVerse && <p className="sub">{SITE.loginVerse}</p>}
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
          <div className="field">
            <label>Senha</label>
            <input type="password" value={password} onChange={(e)=>setPass(e.target.value)} required autoComplete={mode==='login'?'current-password':'new-password'} />
          </div>
          {err && <div style={{fontSize:11,color:err.startsWith('✅')?'var(--pd)':'var(--red)',marginBottom:8,padding:8,background:err.startsWith('✅')?'var(--pl)':'var(--redl)',borderRadius:6}}>{err}</div>}
          <button type="submit" disabled={busy} className="btn btn-p" style={{width:'100%',marginTop:8}}>
            {busy ? 'Aguarde…' : (mode==='login' ? 'Entrar' : 'Criar conta')}
          </button>
        </form>
        <p style={{fontSize:11,color:'var(--txt2)',marginTop:14,textAlign:'center'}}>
          {mode==='login' ? 'Nova terapeuta?' : 'Já tem conta?'}{' '}
          <a onClick={()=>setMode(mode==='login'?'signup':'login')} style={{color:'var(--p)',cursor:'pointer',fontWeight:500}}>
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
