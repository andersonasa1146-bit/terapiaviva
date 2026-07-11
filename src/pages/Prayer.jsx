import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Prayer() {
  const { session, ownerId } = useAuth()
  const [items, setItems] = useState([])
  const [text, setText] = useState('')
  const [patients, setPatients] = useState([])
  const [pid, setPid] = useState('')

  const load = () => {
    supabase.from('prayer_requests').select('*, patients:patient_id (full_name, initials)').eq('therapist_id', ownerId).order('created_at', {ascending:false}).then(({data}) => setItems(data ?? []))
    supabase.from('patients').select('id, full_name').eq('therapist_id', ownerId).then(({data}) => setPatients(data ?? []))
  }
  useEffect(() => { if (session?.user && ownerId) load() }, [session, ownerId])

  const add = async (e) => {
    e.preventDefault()
    if (!text) return
    await supabase.from('prayer_requests').insert({
      therapist_id: ownerId, patient_id: pid || null, intention: text,
    })
    setText(''); setPid(''); load()
  }

  const toggle = async (r) => {
    await supabase.from('prayer_requests').update({
      answered: !r.answered, answered_at: !r.answered ? new Date().toISOString() : null,
    }).eq('id', r.id)
    load()
  }

  return (
    <div style={{padding:14}}>
      <div style={{marginBottom:12}}>
        <h2 style={{fontSize:15,fontWeight:600}}>🙏 Mural de Oracao</h2>
      </div>
      <div style={{background:'linear-gradient(135deg,#1a4a3a,#2d6e52)',borderRadius:'var(--r)',padding:15,color:'#fff',marginBottom:12,textAlign:'center',fontSize:12,fontStyle:'italic',lineHeight:1.7}}>
        "Confessai, pois, os vossos pecados uns aos outros, e orai uns pelos outros, para que sareis." — Tiago 5:16
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div className="chdr">+ Adicionar intencao</div>
        <div className="cbdy">
          <form onSubmit={add} style={{display:'grid',gridTemplateColumns:'1fr 200px auto',gap:8}}>
            <input value={text} onChange={e=>setText(e.target.value)} placeholder="Ex.: Restauracao do casamento…" style={{border:'1px solid var(--bdr2)',borderRadius:7,padding:'7px 10px',fontSize:12}} />
            <select value={pid} onChange={e=>setPid(e.target.value)} style={{border:'1px solid var(--bdr2)',borderRadius:7,padding:'7px 10px',fontSize:12}}>
              <option value="">Sem paciente</option>
              {patients.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <button className="btn btn-p" type="submit">Adicionar</button>
          </form>
        </div>
      </div>

      <div className="card">
        {items.length ? items.map(r => {
          const p = Array.isArray(r.patients) ? r.patients[0] : r.patients
          return (
            <div key={r.id} style={{display:'flex',alignItems:'flex-start',gap:9,padding:'10px 13px',borderBottom:'1px solid var(--bdr)'}}>
              <input type="checkbox" checked={r.answered} onChange={()=>toggle(r)} style={{accentColor:'var(--p)',marginTop:2}} />
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500,textDecoration:r.answered?'line-through':'none',opacity:r.answered?.6:1}}>{r.intention}</div>
                <div style={{fontSize:11,color:'var(--txt2)'}}>{p?.full_name || 'Geral'} · {new Date(r.created_at).toLocaleDateString('pt-BR')}</div>
              </div>
            </div>
          )
        }) : <div style={{padding:'22px 0',textAlign:'center',fontSize:12,color:'var(--txt3)'}}>Nenhuma intencao ainda.</div>}
      </div>
    </div>
  )
}
