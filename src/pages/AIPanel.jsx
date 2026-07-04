import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function AIPanel() {
  const { session, ownerId } = useAuth()
  const [list, setList] = useState([])

  useEffect(() => {
    if (!session?.user || !ownerId) return
    supabase.from('patients').select('*, sessions:sessions(count)').eq('therapist_id', ownerId).eq('status','ativo').then(({data}) => setList(data ?? []))
  }, [session, ownerId])

  return (
    <div style={{padding:14}}>
      <div style={{marginBottom:12}}>
        <h2 style={{fontSize:15,fontWeight:600}}>🧠 IA Clinica por Paciente</h2>
        <p style={{fontSize:11,color:'var(--txt2)'}}>Abra um prontuario para registrar e analisar sessoes com IA (chave protegida no servidor).</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {list.map(p => (
          <Link key={p.id} to={`/patients/${p.id}`} style={{textDecoration:'none',color:'inherit'}}>
            <div className="card" style={{cursor:'pointer'}}>
              <div className="chdr">
                <div style={{display:'flex',alignItems:'center',gap:7}}>
                  <div className="pavt" style={{background:p.avatar_bg,color:p.avatar_fg,width:26,height:26,fontSize:10}}>{p.initials}</div>
                  {p.full_name}
                </div>
                <span className={`rpill r${p.risk[0]}`}>{p.risk}</span>
              </div>
              <div className="cbdy" style={{fontSize:11,color:'var(--txt2)'}}>
                {p.sessions?.[0]?.count ?? 0} sessao(oes) · Abrir prontuario ›
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
