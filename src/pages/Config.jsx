import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Config() {
  const { session, therapist } = useAuth()
  const [form, setForm] = useState({ full_name:'', city:'', church:'', crp:'', bio:'' })
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (therapist) setForm({
      full_name: therapist.full_name || '',
      city: therapist.city || '',
      church: therapist.church || '',
      crp: therapist.crp || '',
      bio: therapist.bio || '',
    })
  }, [therapist])

  const save = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('therapists').update(form).eq('id', session.user.id)
    setMsg(error ? '❌ '+error.message : '✅ Perfil atualizado.')
    setTimeout(()=>setMsg(''), 3000)
  }

  return (
    <div style={{padding:14}}>
      <div style={{marginBottom:12}}><h2 style={{fontSize:15,fontWeight:600}}>⚙️ Configuracoes</h2></div>

      <div className="card" style={{marginBottom:12}}>
        <div className="chdr">👤 Perfil profissional</div>
        <div className="cbdy">
          <form onSubmit={save}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div className="field"><label>Nome completo</label><input value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} /></div>
              <div className="field"><label>Cidade</label><input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} /></div>
              <div className="field"><label>Igreja</label><input value={form.church} onChange={e=>setForm({...form,church:e.target.value})} /></div>
              <div className="field"><label>Registro profissional (CRP/opcional)</label><input value={form.crp} onChange={e=>setForm({...form,crp:e.target.value})} /></div>
            </div>
            <div className="field"><label>Bio (aparece em relatorios e portal)</label><textarea rows={2} value={form.bio} onChange={e=>setForm({...form,bio:e.target.value})} /></div>
            <button className="btn btn-p" type="submit">Salvar perfil</button>
            {msg && <span style={{marginLeft:10,fontSize:11,color: msg.startsWith('✅')?'var(--pd)':'var(--red)'}}>{msg}</span>}
          </form>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="chdr">🔒 Seguranca</div>
        <div className="cbdy">
          <div className="callout clprv">
            <strong>Sua chave da IA esta protegida</strong>
            A chave da Anthropic fica <em>somente no servidor</em> (Edge Function). Nem voce, nem qualquer navegador ou extensao consegue acessar. As chamadas passam pelo Supabase, autenticadas via JWT, e a resposta vem cifrada por HTTPS.
          </div>
          <div className="callout clwrn">
            <strong>LGPD e prontuario</strong>
            Dados sensiveis (sessoes, anamneses) sao protegidos por Row Level Security no banco: outra terapeuta nunca ve seus pacientes. Backup diario automatico do Supabase. Direito ao esquecimento habilitado por paciente.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="chdr">🚀 Proximas integracoes</div>
        {['WhatsApp (Z-API): envio de anamnese + lembretes','Google Calendar sync','Teleconsulta integrada (Daily.co)','Assinatura digital para relatorios','Pix / Stripe / Asaas para cobranca automatica','Notificacoes push (PWA)'].map(c =>
          <div key={c} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 13px',borderBottom:'1px solid var(--bdr)',fontSize:12}}>
            {c}<span style={{fontSize:10,color:'var(--txt3)'}}>Roadmap Fase 2</span>
          </div>
        )}
      </div>
    </div>
  )
}
