import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { syncAppointmentToGoogle } from '../lib/googleCalendar'
import { createVideoRoom } from '../lib/video'
import VideoCallModal from '../components/VideoCallModal'

const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat']

function withinWorkingHours(date, workingHours) {
  if (!workingHours) return true
  const key = DAY_KEYS[date.getDay()]
  const ranges = workingHours[key] || []
  if (!ranges.length) return false
  const mins = date.getHours() * 60 + date.getMinutes()
  return ranges.some(([from, to]) => {
    const [fh, fm] = from.split(':').map(Number)
    const [th, tm] = to.split(':').map(Number)
    const fromMins = fh * 60 + fm, toMins = th * 60 + tm
    return mins >= fromMins && mins <= toMins
  })
}

function addOccurrence(date, repeat, i) {
  const d = new Date(date)
  if (repeat === 'weekly') d.setDate(d.getDate() + 7 * i)
  else if (repeat === 'biweekly') d.setDate(d.getDate() + 14 * i)
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + i)
  return d
}

export default function Agenda() {
  const { session, therapist, ownerId } = useAuth()
  const { toast, confirm } = useToast()
  const [appts, setAppts] = useState([])
  const [patients, setPatients] = useState([])
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ patient_id:'', starts_at:'', ends_at:'', mode:'presencial', amount:'', repeat:'none', occurrences:4 })
  const [videoBusyId, setVideoBusyId] = useState(null)
  const [videoRoomUrl, setVideoRoomUrl] = useState(null)

  const load = () => {
    supabase.from('appointments').select('*, patients:patient_id (full_name, initials)').eq('therapist_id', ownerId).order('starts_at').then(({data}) => setAppts(data ?? []))
    supabase.from('patients').select('id, full_name').eq('therapist_id', ownerId).eq('status','ativo').then(({data}) => setPatients(data ?? []))
  }
  useEffect(() => { if (session?.user && ownerId) load() }, [session, ownerId])

  const createOne = async (starts, ends, recurrenceId, idx) => {
    const { data, error } = await supabase.from('appointments').insert({
      therapist_id: ownerId,
      patient_id: form.patient_id || null,
      starts_at: starts.toISOString(), ends_at: ends.toISOString(),
      mode: form.mode, amount: form.amount ? Number(form.amount) : null,
      recurrence_id: recurrenceId, recurrence_index: recurrenceId ? idx : null,
    }).select().single()
    return { data, error }
  }

  const save = async (e) => {
    e.preventDefault()
    const starts = new Date(form.starts_at)
    const ends = form.ends_at ? new Date(form.ends_at) : new Date(starts.getTime() + 60*60*1000)
    const durationMs = ends.getTime() - starts.getTime()

    if (ends <= starts) { toast.error('O horario de fim deve ser depois do inicio.'); return }

    if (!withinWorkingHours(starts, therapist?.working_hours)) {
      const ok = await confirm('Este horario esta fora do seu expediente configurado (ver Configuracoes). Deseja agendar mesmo assim?', { confirmLabel: 'Agendar assim mesmo' })
      if (!ok) return
    }

    const isRecurring = form.repeat !== 'none'
    const count = isRecurring ? Math.max(2, Math.min(52, Number(form.occurrences) || 2)) : 1
    const recurrenceId = isRecurring ? crypto.randomUUID() : null

    const occurrences = Array.from({ length: count }, (_, i) => {
      const s = addOccurrence(starts, form.repeat, i)
      const en = new Date(s.getTime() + durationMs)
      return { starts: s, ends: en }
    })

    // Checagem proativa de conflitos para cada ocorrencia da serie. A
    // constraint no banco (exclusion constraint) e sempre a garantia final
    // e nunca permite sobreposicao — por isso, agendamentos com conflito
    // sao sempre pulados, nunca forcados.
    const conflictIdx = []
    for (let i = 0; i < occurrences.length; i++) {
      const { data: conflicts } = await supabase.rpc('check_appointment_conflict', {
        p_starts_at: occurrences[i].starts.toISOString(), p_ends_at: occurrences[i].ends.toISOString(),
      })
      if (conflicts?.length) conflictIdx.push(i)
    }

    if (conflictIdx.length === occurrences.length) {
      toast.error(isRecurring
        ? 'Todas as ocorrencias dessa serie tem conflito de horario com agendamentos existentes. Ajuste o horario e tente novamente.'
        : 'Ja existe um agendamento nesse horario. Escolha outro horario ou cancele o existente antes de continuar.')
      return
    }
    if (conflictIdx.length) {
      const ok = await confirm(
        `${conflictIdx.length} de ${count} ocorrencia(s) tem conflito de horario com agendamentos ja existentes e sera(ao) pulada(s). Deseja criar as demais ${count - conflictIdx.length} ocorrencia(s) sem conflito?`,
        { confirmLabel: 'Criar as sem conflito' }
      )
      if (!ok) return
    }

    setSaving(true)
    let createdCount = 0, skipped = 0
    for (let i = 0; i < occurrences.length; i++) {
      if (conflictIdx.includes(i)) { skipped++; continue }
      const { data, error } = await createOne(occurrences[i].starts, occurrences[i].ends, recurrenceId, i + 1)
      if (error) { skipped++; continue }
      createdCount++
      if (therapist?.google_calendar_connected && data) syncAppointmentToGoogle(data.id, 'upsert')
    }
    setSaving(false)

    if (!createdCount) { toast.error('Nenhum agendamento pode ser criado (todos em conflito).'); return }
    toast.success(isRecurring
      ? `${createdCount} sessao(oes) da serie criada(s)${skipped ? ` (${skipped} pulada(s) por conflito)` : ''}.`
      : 'Agendamento salvo.')
    setShow(false)
    setForm({ patient_id:'', starts_at:'', ends_at:'', mode:'presencial', amount:'', repeat:'none', occurrences:4 })
    load()
  }

  const cancelOne = async (a) => {
    const ok = await confirm('Cancelar este agendamento?', { confirmLabel: 'Cancelar agendamento' })
    if (!ok) return
    const { error } = await supabase.from('appointments').update({ status: 'cancelado' }).eq('id', a.id)
    if (error) { toast.error(error.message); return }
    toast.success('Agendamento cancelado.')
    if (therapist?.google_calendar_connected) syncAppointmentToGoogle(a.id, 'delete')
    load()
  }

  const cancelSeries = async (a) => {
    const ok = await confirm('Cancelar esta e todas as proximas ocorrencias desta serie recorrente?', { danger: true, confirmLabel: 'Cancelar serie' })
    if (!ok) return
    const { data, error } = await supabase.rpc('cancel_recurrence_series', { p_recurrence_id: a.recurrence_id })
    if (error) { toast.error(error.message); return }
    toast.success(`${data} ocorrencia(s) futura(s) cancelada(s).`)
    load()
  }

  const startVideoCall = async (a) => {
    setVideoBusyId(a.id)
    try {
      const r = await createVideoRoom(a.id)
      setVideoRoomUrl(r.room_url)
    } catch (e) {
      toast.error(e.message)
    }
    setVideoBusyId(null)
  }

  const today = new Date()
  const monthName = today.toLocaleDateString('pt-BR', { month:'long', year:'numeric' })
  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab']

  const byDay = useMemo(() => {
    const map = {}
    appts.forEach(a => {
      if (a.status === 'cancelado') return
      const k = new Date(a.starts_at).toISOString().slice(0,10)
      map[k] = (map[k] || 0) + 1
    })
    return map
  }, [appts])

  const todayList = appts.filter(a => new Date(a.starts_at).toDateString() === today.toDateString() && a.status !== 'cancelado')
  const upcoming = useMemo(() => appts
    .filter(a => new Date(a.starts_at) > today && a.status !== 'cancelado')
    .slice(0, 12), [appts])

  return (
    <div style={{padding:14}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
        <h2 style={{fontSize:15,fontWeight:600}}>Agenda — {monthName}</h2>
        <button className="btn btn-p btn-sm" onClick={()=>setShow(!show)}>{show?'Cancelar':'+ Agendar'}</button>
      </div>

      {show && (
        <div className="card" style={{marginBottom:12}}>
          <div className="chdr">Novo agendamento</div>
          <div className="cbdy">
            <form onSubmit={save}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div className="field"><label>Paciente</label>
                  <select value={form.patient_id} onChange={e=>setForm({...form,patient_id:e.target.value})}>
                    <option value="">Sem paciente vinculado</option>
                    {patients.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </div>
                <div className="field"><label>Modalidade</label>
                  <select value={form.mode} onChange={e=>setForm({...form,mode:e.target.value})}>
                    <option value="presencial">Presencial</option><option value="online">Online</option>
                  </select>
                </div>
                <div className="field"><label>Inicio *</label><input type="datetime-local" required value={form.starts_at} onChange={e=>setForm({...form,starts_at:e.target.value})} /></div>
                <div className="field"><label>Fim</label><input type="datetime-local" value={form.ends_at} onChange={e=>setForm({...form,ends_at:e.target.value})} /></div>
                <div className="field"><label>Valor (R$)</label><input type="number" step="0.01" min="0" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} /></div>
                <div className="field"><label>Repetir</label>
                  <select value={form.repeat} onChange={e=>setForm({...form,repeat:e.target.value})}>
                    <option value="none">Nao repetir</option>
                    <option value="weekly">Semanalmente</option>
                    <option value="biweekly">Quinzenalmente</option>
                    <option value="monthly">Mensalmente</option>
                  </select>
                </div>
                {form.repeat !== 'none' && (
                  <div className="field"><label>Numero de sessoes na serie</label>
                    <input type="number" min={2} max={52} value={form.occurrences} onChange={e=>setForm({...form,occurrences:e.target.value})} />
                  </div>
                )}
              </div>
              <button className="btn btn-p" type="submit" disabled={saving}>{saving?'Salvando…':'Salvar'}</button>
            </form>
          </div>
        </div>
      )}

      <div className="card" style={{marginBottom:12}}>
        <div className="cbdy">
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:10,textAlign:'center'}}>
            {days.map(d => <div key={d} style={{fontSize:10,color:'var(--txt2)',fontWeight:500,padding:3}}>{d}</div>)}
            {Array.from({length:35}, (_,i) => {
              const first = new Date(today.getFullYear(), today.getMonth(), 1)
              const day = i - first.getDay() + 1
              const date = new Date(today.getFullYear(), today.getMonth(), day)
              const inMonth = date.getMonth() === today.getMonth()
              const isToday = inMonth && date.toDateString() === today.toDateString()
              const k = date.toISOString().slice(0,10)
              const has = byDay[k]
              return (
                <div key={i} style={{
                  textAlign:'center',padding:'6px 3px',borderRadius:7,fontSize:11,cursor:'pointer',
                  background: isToday ? 'var(--p)' : has ? 'var(--pl)' : 'transparent',
                  color: isToday ? 'var(--pl)' : inMonth ? 'var(--txt)' : 'var(--txt3)',
                  fontWeight: isToday ? 600 : 400,
                  position:'relative',
                }}>
                  {inMonth ? date.getDate() : ''}
                  {has ? <div style={{position:'absolute',bottom:1,left:'50%',transform:'translateX(-50%)',width:4,height:4,borderRadius:'50%',background: isToday ? '#fff' : 'var(--p)'}}></div> : null}
                </div>
              )
            })}
          </div>
          <div style={{borderTop:'1px solid var(--bdr)',paddingTop:10}}>
            <div style={{fontSize:11,fontWeight:500,color:'var(--txt2)',marginBottom:7}}>Hoje — {today.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</div>
            {todayList.length ? todayList.map(a => {
              const p = Array.isArray(a.patients) ? a.patients[0] : a.patients
              const t = new Date(a.starts_at).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})
              return (
                <div className="srow" key={a.id}>
                  <div className="stm">{t}</div>
                  <div>
                    <div style={{fontSize:12,fontWeight:500}}>{p?.full_name || 'Sem paciente'}{a.recurrence_id ? ' 🔁' : ''}</div>
                    <div style={{fontSize:10,color:'var(--txt2)'}}>{a.mode === 'online' ? 'Online' : 'Presencial'}</div>
                  </div>
                  {a.mode === 'online' && (
                    <button className="btn btn-sm btn-p" style={{marginLeft:'auto',marginRight:7}} onClick={()=>startVideoCall(a)} disabled={videoBusyId===a.id}>
                      {videoBusyId===a.id ? 'Abrindo…' : '🎥 Iniciar teleconsulta'}
                    </button>
                  )}
                  <span className={`sbg ${a.mode==='online'?'son':'spr'}`} style={a.mode==='online'?{}:{marginLeft:'auto'}}>
                    {a.mode==='online'?'🎥':'📍'} {a.mode}
                  </span>
                </div>
              )
            }) : <div style={{padding:'12px 0',textAlign:'center',fontSize:12,color:'var(--txt3)'}}>Sem sessoes hoje.</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="chdr">Proximos agendamentos</div>
        <div className="cbdy" style={{padding:'4px 13px'}}>
          {upcoming.length ? upcoming.map(a => {
            const p = Array.isArray(a.patients) ? a.patients[0] : a.patients
            return (
              <div key={a.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0',borderBottom:'1px solid var(--bdr)'}}>
                <div style={{fontSize:11.5,color:'var(--txt2)',width:120,flexShrink:0}}>
                  {new Date(a.starts_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} · {new Date(a.starts_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                </div>
                <div style={{fontSize:12.5,fontWeight:500,flex:1}}>{p?.full_name || 'Sem paciente'}{a.recurrence_id ? <span style={{fontSize:10,color:'var(--txt3)',fontWeight:400}}> 🔁 recorrente</span> : null}</div>
                {a.mode === 'online' && (
                  <button className="btn btn-sm btn-p" onClick={()=>startVideoCall(a)} disabled={videoBusyId===a.id}>
                    {videoBusyId===a.id ? 'Abrindo…' : '🎥 Teleconsulta'}
                  </button>
                )}
                <button className="btn btn-sm" onClick={()=>cancelOne(a)}>Cancelar</button>
                {a.recurrence_id && <button className="btn btn-sm" style={{color:'var(--red)'}} onClick={()=>cancelSeries(a)}>Cancelar serie</button>}
              </div>
            )
          }) : <div style={{padding:'14px 0',textAlign:'center',fontSize:12,color:'var(--txt3)'}}>Nenhum agendamento futuro.</div>}
        </div>
      </div>

      <VideoCallModal roomUrl={videoRoomUrl} onClose={()=>setVideoRoomUrl(null)} />
    </div>
  )
}
