import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'

export default function Config() {
  const { session, therapist } = useAuth()
  const { toast } = useToast()
  const [form, setForm] = useState({ full_name:'', city:'', church:'', crp:'', bio:'' })

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
    if (error) toast.error(error.message)
    else toast.success('Perfil atualizado.')
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
          </form>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="chdr">🔒 Seguranca e privacidade</div>
        <div className="cbdy">
          <div className="callout clprv">
            <strong>Sua chave da IA esta protegida</strong>
            A chave da Anthropic fica <em>somente no servidor</em> (Edge Function). Nem voce, nem qualquer navegador ou extensao consegue acessar. As chamadas passam pelo Supabase, autenticadas via JWT, e a resposta vem cifrada por HTTPS.
          </div>
          <div className="callout clwrn">
            <strong>LGPD e prontuario</strong>
            Dados sensiveis (sessoes, anamneses) sao protegidos por Row Level Security no banco: outra terapeuta nunca ve seus pacientes. Na tela de <strong>Pacientes</strong>, cada cadastro tem os botoes <strong>Exportar</strong> (baixa todos os dados do paciente em JSON, para portabilidade) e <strong>Excluir</strong> (apaga definitivamente o cadastro, sessoes, anamneses e agendamentos daquele paciente — direito ao esquecimento, LGPD art. 18).
          </div>
          <div className="callout clwrn">
            <strong>Aviso importante</strong>
            Este produto ainda nao possui Termos de Uso e Politica de Privacidade revisados por um advogado — consulte <a href="/termos.html" target="_blank" rel="noreferrer">/termos.html</a> e <a href="/privacidade.html" target="_blank" rel="noreferrer">/privacidade.html</a> (rascunhos) antes de operar com pacientes reais.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="chdr">🚀 Proximas integracoes</div>
        {['WhatsApp (Z-API): envio de anamnese + lembretes','Google Calendar sync','Teleconsulta integrada (Daily.co)','Assinatura digital para relatorios','Cobranca automatica (Mercado Pago)','Notificacoes push (PWA)'].map(c =>
          <div key={c} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 13px',borderBottom:'1px solid var(--bdr)',fontSize:12}}>
            {c}<span style={{fontSize:10,color:'var(--txt3)'}}>Roadmap Fase 2</span>
          </div>
        )}
      </div>
    </div>
  )
}
