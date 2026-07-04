import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'

export default function Agenda() {
  const { session } = useAuth()
  const { toast } = useToast()
  const [appts, setAppts] = useState([])
  const [patients, setPatients] = useState([])
  const [show, setShow] = useState(false)
  const [form, setForm] = useState({ patient_id:'', starts_at:'', ends_at:'', mode:'presencial', amount:'' })

  const load = () => {
    supabase.from('appointments').select('*, patients:patient_id (full_name, initials)').eq('therapist_id', session.user.id).order('starts_at').then(({data}) => setAppts(data ?? []))
    supabase.from('patients').select('id, full_name').eq('therapist_id', session.user.id).eq('status','ativo').then(({data}) => setPatients(data ?? []))
  }
  useEffect(() => { if (session?.user) load() }, [session])

  const save = async (e) => {
    e.preventDefault()
    const starts = new Date(form.starts_at)
    const ends = form.ends_at ? new Date(form.ends_at) : new Date(starts.getTime() + 60*60*1000)
    const { error } = await supabase.from('appointments').insert({
      therapist_id: session.user.id,
      patient_id: form.patient_id || null,
      starts_at: starts.toISOString(), ends_at: ends.toISOString(),
      mode: form.mode, amount: form.amount ? Number(form.amount) : null,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Agendamento salvo.')
    setShow(false); setForm({ patient_id:'', starts_at:'', ends_at:'', mode:'presencial', amount:'' })
    load()
  }

  const today = new Date()
  const monthName = today.toLocaleDateString('pt-BR', { month:'long', year:'numeric' })
  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab']

  const byDay = useMemo(() => {
    const map = {}
    appts.forEach(a => {
      const k = new Date(a.starts_at).toISOString().slice(0,10)
      map[k] = (map[k] || 0) + 1
    })
    return map
  }, [appts])

  const todayList = appts.filter(a => new Date(a.starts_at).toDateString() === today.toDateString())

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
              </div>
              <button className="btn btn-p" type="submit">Salvar</button>
            </form>
          </div>
        </div>
      )}

      <div className="card">
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
                    <div style={{fontSize:12,fontWeight:500}}>{p?.full_name || 'Sem paciente'}</div>
                    <div style={{fontSize:10,color:'var(--txt2)'}}>{a.mode === 'online' ? 'Online' : 'Presencial'}</div>
                  </div>
                  <span className={`sbg ${a.mode==='online'?'son':'spr'}`} style={{marginLeft:'auto'}}>
                    {a.mode==='online'?'🎥':'📍'} {a.mode}
                  </span>
                </div>
              )
            }) : <div style={{padding:'12px 0',textAlign:'center',fontSize:12,color:'var(--txt3)'}}>Sem sessoes hoje.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
