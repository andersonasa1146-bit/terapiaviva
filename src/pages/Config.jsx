import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { createSubscription, setPatientMpToken, clearPatientMpToken, hasPatientMpToken } from '../lib/billing'
import { connectGoogleCalendar, disconnectGoogleCalendar } from '../lib/googleCalendar'
import { listTeamMembers, inviteTeamMember, removeTeamMember, updateTeamMemberRole, ROLE_LABEL, ROLE_DESCRIPTION } from '../lib/team'
import TwoFactorCard from '../components/TwoFactorCard'
import PushNotificationsCard from '../components/PushNotificationsCard'

const PLAN_LABEL = { trial: 'Periodo de teste', basico: 'Basico', profissional: 'Profissional', cancelado: 'Cancelado' }
const TEAM_ROLE_LABEL = { owner: 'Proprietaria(o) da conta', admin: 'Administrador(a)', terapeuta: 'Terapeuta', recepcao: 'Recepcao' }
const WEEKDAYS = [['mon','Seg'],['tue','Ter'],['wed','Qua'],['thu','Qui'],['fri','Sex'],['sat','Sab'],['sun','Dom']]
const DEFAULT_HOURS = { mon:[['08:00','18:00']], tue:[['08:00','18:00']], wed:[['08:00','18:00']], thu:[['08:00','18:00']], fri:[['08:00','18:00']], sat:[], sun:[] }

function toRowState(workingHours) {
  const wh = workingHours || DEFAULT_HOURS
  const rows = {}
  WEEKDAYS.forEach(([k]) => {
    const range = wh[k]?.[0]
    rows[k] = { enabled: !!range, from: range?.[0] || '08:00', to: range?.[1] || '18:00' }
  })
  return rows
}

function toJsonb(rows) {
  const out = {}
  WEEKDAYS.forEach(([k]) => { out[k] = rows[k].enabled ? [[rows[k].from, rows[k].to]] : [] })
  return out
}

export default function Config() {
  const { session, therapist, profile, isOwner, teamRole } = useAuth()
  const { toast, confirm, promptCopy } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [form, setForm] = useState({ full_name:'', city:'', church:'', crp:'', bio:'' })
  const [reminders, setReminders] = useState({ reminder_hours_before: 24, reminder_email_enabled: true, reminder_whatsapp_enabled: false })
  const [hours, setHours] = useState(toRowState(DEFAULT_HOURS))
  const [subBusy, setSubBusy] = useState(false)
  const [gBusy, setGBusy] = useState(false)
  const [mpConnected, setMpConnected] = useState(false)
  const [mpTokenInput, setMpTokenInput] = useState('')
  const [mpBusy, setMpBusy] = useState(false)
  const [team, setTeam] = useState([])
  const [teamLoading, setTeamLoading] = useState(true)
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'terapeuta' })
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        city: profile.city || '',
        church: profile.church || '',
        crp: profile.crp || '',
        bio: profile.bio || '',
      })
    }
  }, [profile])

  useEffect(() => {
    if (therapist) {
      setReminders({
        reminder_hours_before: therapist.reminder_hours_before ?? 24,
        reminder_email_enabled: therapist.reminder_email_enabled ?? true,
        reminder_whatsapp_enabled: therapist.reminder_whatsapp_enabled ?? false,
      })
      setHours(toRowState(therapist.working_hours))
    }
  }, [therapist])

  useEffect(() => {
    if (session?.user && isOwner) hasPatientMpToken().then(setMpConnected).catch(() => {})
  }, [session, isOwner])

  const loadTeam = () => {
    setTeamLoading(true)
    listTeamMembers().then(setTeam).catch(() => {}).finally(() => setTeamLoading(false))
  }
  useEffect(() => { if (session?.user) loadTeam() }, [session])

  useEffect(() => {
    const g = searchParams.get('google')
    if (g === 'connected') toast.success('Google Calendar conectado com sucesso.')
    else if (g === 'error') toast.error(`Falha ao conectar Google Calendar: ${searchParams.get('msg') || 'erro desconhecido'}`)
    if (g) { searchParams.delete('google'); searchParams.delete('msg'); setSearchParams(searchParams, { replace: true }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('therapists').update(form).eq('id', session.user.id)
    if (error) toast.error(error.message)
    else toast.success('Perfil atualizado.')
  }

  const saveReminders = async (next) => {
    setReminders(next)
    const { error } = await supabase.from('therapists').update(next).eq('id', session.user.id)
    if (error) toast.error(error.message)
  }

  const updateHoursRow = (day, patch) => {
    const next = { ...hours, [day]: { ...hours[day], ...patch } }
    setHours(next)
  }

  const saveHours = async () => {
    const { error } = await supabase.from('therapists').update({ working_hours: toJsonb(hours) }).eq('id', session.user.id)
    if (error) toast.error(error.message)
    else toast.success('Horario de expediente atualizado.')
  }

  const subscribe = async () => {
    setSubBusy(true)
    try {
      const r = await createSubscription()
      window.location.href = r.checkout_url
    } catch (e) {
      toast.error(e.message)
    }
    setSubBusy(false)
  }

  const connectGoogle = async () => {
    setGBusy(true)
    try {
      await connectGoogleCalendar()
    } catch (e) {
      toast.error(e.message)
      setGBusy(false)
    }
  }

  const disconnectGoogle = async () => {
    const ok = await confirm('Desconectar o Google Calendar? Novos agendamentos deixarao de ser sincronizados.', { confirmLabel: 'Desconectar' })
    if (!ok) return
    try {
      await disconnectGoogleCalendar()
      toast.success('Google Calendar desconectado.')
      window.location.reload()
    } catch (e) { toast.error(e.message) }
  }

  const saveMpToken = async () => {
    if (!mpTokenInput.trim()) { toast.error('Cole seu Access Token do Mercado Pago.'); return }
    setMpBusy(true)
    try {
      await setPatientMpToken(mpTokenInput.trim())
      setMpTokenInput('')
      setMpConnected(true)
      toast.success('Token salvo. Voce ja pode cobrar seus pacientes.')
    } catch (e) { toast.error(e.message) }
    setMpBusy(false)
  }

  const removeMpToken = async () => {
    const ok = await confirm('Remover seu token pessoal do Mercado Pago? Voce nao podera mais gerar cobrancas para pacientes ate configurar novamente.', { confirmLabel: 'Remover' })
    if (!ok) return
    try {
      await clearPatientMpToken()
      setMpConnected(false)
      toast.success('Token removido.')
    } catch (e) { toast.error(e.message) }
  }

  const sendInvite = async (e) => {
    e.preventDefault()
    if (!inviteForm.email.trim()) { toast.error('Informe o e-mail da pessoa a convidar.'); return }
    setInviting(true)
    try {
      const token = await inviteTeamMember(inviteForm.email.trim(), inviteForm.role)
      setInviteForm({ email: '', role: 'terapeuta' })
      loadTeam()
      const url = `${window.location.origin}/equipe/aceitar/${token}`
      await promptCopy('Convite gerado! Envie este link para a pessoa aceitar (ela deve criar conta/entrar com este mesmo e-mail):', url)
    } catch (e) { toast.error(e.message) }
    setInviting(false)
  }

  const copyInviteLink = (m) => {
    const url = `${window.location.origin}/equipe/aceitar/${m.invite_token}`
    promptCopy('Link de convite (ainda pendente):', url)
  }

  const changeRole = async (m, role) => {
    try {
      await updateTeamMemberRole(m.id, role)
      loadTeam()
      toast.success('Papel atualizado.')
    } catch (e) { toast.error(e.message) }
  }

  const remove = async (m) => {
    const ok = await confirm(`Remover ${m.invited_email} da equipe? A pessoa perdera acesso aos dados da clinica imediatamente.`, { danger: true, confirmLabel: 'Remover' })
    if (!ok) return
    try {
      await removeTeamMember(m.id)
      loadTeam()
      toast.success('Membro removido.')
    } catch (e) { toast.error(e.message) }
  }

  const plan = therapist?.plan || 'trial'
  const used = therapist?.ai_calls_this_month ?? 0
  const limit = therapist?.plan_ai_limit ?? 30
  const pct = Math.min(100, Math.round((used / (limit || 1)) * 100))
  const googleConnected = !!therapist?.google_calendar_connected

  return (
    <div style={{padding:14}}>
      <div style={{marginBottom:12}}><h2 style={{fontSize:15,fontWeight:600}}>⚙️ Configuracoes</h2></div>

      {!isOwner && (
        <div className="card" style={{marginBottom:12}}>
          <div className="cbdy" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:12.5,color:'var(--txt2)'}}>
              Voce esta operando na equipe desta clinica como <strong>{TEAM_ROLE_LABEL[teamRole] || teamRole}</strong>.
              Configuracoes de plano, cobranca, Google Calendar e horario de expediente sao gerenciadas pela
              proprietaria da conta.
            </div>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="card" style={{marginBottom:12}}>
          <div className="chdr">💳 Plano e uso de IA</div>
          <div className="cbdy">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{PLAN_LABEL[plan] || plan}</div>
                <div style={{fontSize:11,color:'var(--txt2)'}}>{used} de {limit} analises de IA usadas este mes (compartilhado por toda a equipe)</div>
              </div>
              {plan !== 'profissional' && (
                <button className="btn btn-p btn-sm" onClick={subscribe} disabled={subBusy}>
                  {subBusy ? 'Abrindo checkout…' : 'Assinar plano Profissional'}
                </button>
              )}
            </div>
            <div style={{height:6,borderRadius:4,background:'var(--bdr)',overflow:'hidden'}}>
              <div style={{height:'100%',width:`${pct}%`,background: pct>=100?'var(--red)':'var(--p)'}} />
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{marginBottom:12}}>
        <div className="chdr">👥 Equipe da clinica</div>
        <div className="cbdy">
          {!isOwner ? (
            <p style={{fontSize:12,color:'var(--txt2)'}}>Somente a proprietaria da conta pode convidar ou remover membros da equipe.</p>
          ) : (
            <>
              <p style={{fontSize:11.5,color:'var(--txt2)',marginBottom:10}}>
                Convide colegas (terapeutas associadas, recepcao) para operar nos mesmos pacientes, agenda e
                (opcionalmente) financeiro, cada uma com seu proprio login e nivel de acesso.
              </p>
              <form onSubmit={sendInvite} style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
                <input type="email" placeholder="email@exemplo.com" value={inviteForm.email}
                  onChange={e=>setInviteForm({...inviteForm, email:e.target.value})} style={{flex:1,minWidth:180}} />
                <select value={inviteForm.role} onChange={e=>setInviteForm({...inviteForm, role:e.target.value})}>
                  <option value="admin">Administrador(a)</option>
                  <option value="terapeuta">Terapeuta</option>
                  <option value="recepcao">Recepcao</option>
                </select>
                <button className="btn btn-p btn-sm" type="submit" disabled={inviting}>{inviting?'Convidando…':'+ Convidar'}</button>
              </form>
              <div style={{fontSize:10.5,color:'var(--txt3)',marginBottom:12}}>
                {Object.entries(ROLE_LABEL).map(([k,l]) => (
                  <div key={k} style={{marginBottom:2}}><strong>{l}:</strong> {ROLE_DESCRIPTION[k]}</div>
                ))}
              </div>

              {teamLoading ? (
                <div style={{padding:'10px 0',textAlign:'center',fontSize:12,color:'var(--txt3)'}}>Carregando…</div>
              ) : team.length ? team.map(m => (
                <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:'1px solid var(--bdr)'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12.5,fontWeight:500}}>{m.invited_email}{m.is_me ? ' (voce)' : ''}</div>
                    <div style={{fontSize:10.5,color:'var(--txt2)'}}>
                      {m.status === 'pendente' ? 'Convite pendente' : 'Ativo'} · desde {new Date(m.invited_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <select value={m.role} onChange={e=>changeRole(m, e.target.value)} style={{fontSize:11.5,padding:'4px 6px'}}>
                    <option value="admin">Administrador(a)</option>
                    <option value="terapeuta">Terapeuta</option>
                    <option value="recepcao">Recepcao</option>
                  </select>
                  {m.status === 'pendente' && <button className="btn btn-sm" onClick={()=>copyInviteLink(m)}>🔗 Link</button>}
                  <button className="btn btn-sm" style={{color:'var(--red)'}} onClick={()=>remove(m)}>Remover</button>
                </div>
              )) : <div style={{padding:'10px 0',textAlign:'center',fontSize:12,color:'var(--txt3)'}}>Nenhum membro convidado ainda.</div>}
            </>
          )}
        </div>
      </div>

      {isOwner && (
        <div className="card" style={{marginBottom:12}}>
          <div className="chdr">💵 Cobranca de pacientes (Mercado Pago pessoal)</div>
          <div className="cbdy">
            <p style={{fontSize:11.5,color:'var(--txt2)',marginBottom:10}}>
              Diferente da assinatura acima (que paga o uso do TerapiaViva), aqui voce conecta a <strong>sua propria
              conta</strong> do Mercado Pago para cobrar sessoes e pacotes diretamente dos seus pacientes — o dinheiro
              cai na sua conta, nao na nossa. Gere o Access Token em Mercado Pago → Suas integracoes → Credenciais de producao.
            </p>
            {mpConnected ? (
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{fontSize:13,fontWeight:600}}>✅ Token configurado</div>
                <button className="btn btn-sm" style={{color:'var(--red)'}} onClick={removeMpToken}>Remover token</button>
              </div>
            ) : (
              <div style={{display:'flex',gap:8}}>
                <input type="password" placeholder="APP_USR-... (Access Token de producao)" value={mpTokenInput}
                  onChange={e=>setMpTokenInput(e.target.value)} style={{flex:1}} />
                <button className="btn btn-p btn-sm" onClick={saveMpToken} disabled={mpBusy}>{mpBusy?'Salvando…':'Salvar token'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {isOwner && (
        <div className="card" style={{marginBottom:12}}>
          <div className="chdr">📅 Google Calendar</div>
          <div className="cbdy">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{googleConnected ? '✅ Conectado' : 'Nao conectado'}</div>
                <div style={{fontSize:11,color:'var(--txt2)'}}>
                  {googleConnected
                    ? 'Novos agendamentos sao espelhados automaticamente na sua agenda do Google.'
                    : 'Conecte para sincronizar automaticamente os agendamentos do TerapiaViva com seu Google Calendar.'}
                </div>
              </div>
              {googleConnected ? (
                <button className="btn btn-sm" onClick={disconnectGoogle}>Desconectar</button>
              ) : (
                <button className="btn btn-p btn-sm" onClick={connectGoogle} disabled={gBusy}>
                  {gBusy ? 'Redirecionando…' : 'Conectar Google Calendar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="card" style={{marginBottom:12}}>
          <div className="chdr">🗓️ Horario de expediente e conflitos<div className="chdr-act"><button className="btn btn-sm btn-p" onClick={saveHours}>Salvar</button></div></div>
          <div className="cbdy">
            <p style={{fontSize:11.5,color:'var(--txt2)',marginBottom:10}}>
              Usado para avisar (sem bloquear) quando um agendamento cai fora do seu expediente. Agendamentos
              que se sobrepoem no mesmo horario sao sempre impedidos automaticamente, para evitar conflito de agenda.
            </p>
            {WEEKDAYS.map(([k,label]) => (
              <div key={k} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 0',borderBottom:'1px solid var(--bdr)'}}>
                <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,width:90}}>
                  <input type="checkbox" checked={hours[k]?.enabled ?? false} onChange={e=>updateHoursRow(k,{enabled:e.target.checked})} style={{accentColor:'var(--p)'}} />
                  {label}
                </label>
                {hours[k]?.enabled ? (
                  <>
                    <input type="time" value={hours[k].from} onChange={e=>updateHoursRow(k,{from:e.target.value})} style={{fontSize:12,padding:'4px 6px'}} />
                    <span style={{fontSize:11,color:'var(--txt3)'}}>ate</span>
                    <input type="time" value={hours[k].to} onChange={e=>updateHoursRow(k,{to:e.target.value})} style={{fontSize:12,padding:'4px 6px'}} />
                  </>
                ) : <span style={{fontSize:11,color:'var(--txt3)'}}>Sem atendimento</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {isOwner && (
        <div className="card" style={{marginBottom:12}}>
          <div className="chdr">🔔 Lembretes automaticos de sessao</div>
          <div className="cbdy">
            <p style={{fontSize:11.5,color:'var(--txt2)',marginBottom:10}}>
              Envia um lembrete automatico ao paciente antes da sessao agendada (requer e-mail/telefone
              cadastrados no paciente e os provedores configurados pelo administrador — Resend para
              e-mail, Z-API para WhatsApp).
            </p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <label style={{display:'flex',alignItems:'center',gap:7,fontSize:12.5}}>
                <input type="checkbox" checked={reminders.reminder_email_enabled}
                  onChange={e=>saveReminders({...reminders, reminder_email_enabled:e.target.checked})}
                  style={{accentColor:'var(--p)'}} />
                Enviar por e-mail
              </label>
              <label style={{display:'flex',alignItems:'center',gap:7,fontSize:12.5}}>
                <input type="checkbox" checked={reminders.reminder_whatsapp_enabled}
                  onChange={e=>saveReminders({...reminders, reminder_whatsapp_enabled:e.target.checked})}
                  style={{accentColor:'var(--p)'}} />
                Enviar por WhatsApp
              </label>
            </div>
            <div className="field" style={{maxWidth:220}}>
              <label>Enviar com quantas horas de antecedencia</label>
              <select value={reminders.reminder_hours_before} onChange={e=>saveReminders({...reminders, reminder_hours_before:Number(e.target.value)})}>
                <option value={1}>1 hora</option>
                <option value={3}>3 horas</option>
                <option value={12}>12 horas</option>
                <option value={24}>24 horas</option>
                <option value={48}>48 horas</option>
              </select>
            </div>
          </div>
        </div>
      )}

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

      <TwoFactorCard />

      <PushNotificationsCard />

      <div className="card" style={{marginBottom:12}}>
        <div className="chdr">🔒 Seguranca e privacidade</div>
        <div className="cbdy">
          <div className="callout clprv">
            <strong>Sua chave da IA esta protegida</strong>
            A chave da Anthropic fica <em>somente no servidor</em> (Edge Function). Nem voce, nem qualquer navegador ou extensao consegue acessar. As chamadas passam pelo Supabase, autenticadas via JWT, e a resposta vem cifrada por HTTPS.
          </div>
          <div className="callout clwrn">
            <strong>LGPD e prontuario</strong>
            Dados sensiveis (sessoes, anamneses) sao protegidos por Row Level Security no banco: outra clinica nunca ve seus pacientes, e cada papel da equipe so acessa o que lhe compete. Na tela de <strong>Pacientes</strong>, cada cadastro tem os botoes <strong>Exportar</strong> (baixa todos os dados do paciente em JSON, para portabilidade) e <strong>Excluir</strong> (apaga definitivamente o cadastro, sessoes, anamneses e agendamentos daquele paciente — direito ao esquecimento, LGPD art. 18).
          </div>
          <div className="callout clwrn">
            <strong>Aviso importante</strong>
            Este produto ainda nao possui Termos de Uso e Politica de Privacidade revisados por um advogado — consulte <a href="/termos.html" target="_blank" rel="noreferrer">/termos.html</a> e <a href="/privacidade.html" target="_blank" rel="noreferrer">/privacidade.html</a> (rascunhos) antes de operar com pacientes reais.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="chdr">🚀 Integracoes Fase 2</div>
        {[
          ['Notificacoes push (PWA)', 'Disponivel — ative no card acima'],
          ['Assinatura digital para relatorios', 'Implementado — aguardando AUTENTIQUE_API_TOKEN'],
          ['Teleconsulta integrada (Daily.co)', 'Implementado — aguardando DAILY_API_KEY'],
        ].map(([c, s]) =>
          <div key={c} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 13px',borderBottom:'1px solid var(--bdr)',fontSize:12}}>
            {c}<span style={{fontSize:10,color:'var(--txt3)'}}>{s}</span>
          </div>
        )}
      </div>
    </div>
  )
}
