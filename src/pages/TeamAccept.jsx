import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { acceptTeamInvite } from '../lib/team'
import { SITE } from '../config/site'

export default function TeamAccept() {
  const { token } = useParams()
  const { session } = useAuth()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  const accept = async () => {
    setBusy(true); setErr('')
    try {
      await acceptTeamInvite(token)
      setDone(true)
      setTimeout(() => nav('/', { replace: true }), 1500)
    } catch (e) {
      setErr(e.message || 'Nao foi possivel aceitar o convite.')
    }
    setBusy(false)
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>🌿 {SITE.appName}</h1>
        <p className="sub">Convite para a equipe da clinica</p>

        {done ? (
          <div style={{fontSize:12.5,color:'var(--pd)',background:'var(--pl)',borderRadius:8,padding:12,textAlign:'center'}}>
            ✅ Convite aceito! Redirecionando…
          </div>
        ) : !session ? (
          <div style={{fontSize:12.5,color:'var(--txt2)',lineHeight:1.7,textAlign:'center'}}>
            Voce recebeu um convite para operar como membro de equipe em uma clinica no {SITE.appName}.
            Faca login (ou crie uma conta) com o <strong>mesmo e-mail que recebeu o convite</strong> e depois
            volte a abrir este link para confirmar.
            <div style={{marginTop:14}}>
              <Link to="/login" className="btn btn-p" style={{textDecoration:'none',display:'inline-block'}}>Ir para o login</Link>
            </div>
          </div>
        ) : (
          <div style={{textAlign:'center'}}>
            <p style={{fontSize:12.5,color:'var(--txt2)',marginBottom:14,lineHeight:1.7}}>
              Voce esta logada(o) como <strong>{session.user.email}</strong>. Confirme abaixo para aceitar o
              convite e passar a operar sobre os dados desta clinica de acordo com o papel definido pela
              proprietaria da conta.
            </p>
            {err && <div style={{fontSize:11,color:'var(--red)',background:'var(--redl)',borderRadius:6,padding:8,marginBottom:10}}>{err}</div>}
            <button className="btn btn-p" onClick={accept} disabled={busy} style={{width:'100%'}}>
              {busy ? 'Aceitando…' : 'Aceitar convite'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
