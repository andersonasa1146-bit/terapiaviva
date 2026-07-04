import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { SITE } from '../config/site'

const VERSE = { r:'Salmo 23', t:'O Senhor e o meu Pastor; nada me faltara.' }

export default function Dashboard() {
  const { therapist, session } = useAuth()
  const [kpis, setKpis] = useState({})
  const [patients, setPatients] = useState([])
  const [todayAppts, setTodayAppts] = useState([])

  useEffect(() => {
    if (!session?.user) return
    const uid = session.user.id
    const today = new Date(); today.setHours(0,0,0,0)
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1)

    Promise.all([
      supabase.from('v_dashboard_kpis').select('*').eq('therapist_id', uid).maybeSingle(),
      supabase.from('patients').select('id,initials,full_name,avatar_bg,avatar_fg,risk,next_appointment_at,goals').eq('status','ativo').order('next_appointment_at', {ascending:true, nullsLast:true}).limit(5),
      supabase.from('appointments').select('id,starts_at,mode,patients:patient_id(initials,full_name,avatar_bg,avatar_fg)')
        .gte('starts_at', today.toISOString()).lt('starts_at', tomorrow.toISOString()).order('starts_at'),
    ]).then(([k, p, a]) => {
      setKpis(k.data ?? {})
      setPatients(p.data ?? [])
      setTodayAppts(a.data ?? [])
    })
  }, [session])

  const first = (therapist?.full_name || SITE.therapistName || 'Terapeuta').split(' ')[0]
  const dayStr = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
  const hasToday = todayAppts.length
  const hasPending = (kpis.pending_anamneses ?? 0) > 0

  return (
    <div>
      <div className="hero">
        <div className="hero-txt">
          <h1>Bom dia, {first} 🌿</h1>
          <p>
            Voce tem <strong style={{color:'#9FE1CB'}}>{hasToday} sessao(oes) hoje</strong>
            {hasPending ? <> e <strong style={{color:'#FAC775'}}>{kpis.pending_anamneses} anamnese(s) pendente(s)</strong></> : null}.
          </p>
          <div className="hero-verse">"{VERSE.t}" — {VERSE.r}</div>
        </div>
        <div className="hero-photo">
          <img src={SITE.heroPhoto} alt="Sessao terapeutica" loading="lazy" />
          <div className="hero-photo-ov"></div>
          <div className="hero-lbl">{therapist?.city || SITE.city || '—'} · {dayStr}</div>
        </div>
      </div>

      <div className="stats">
        <div className="sc">
          <div className="sl">Pacientes ativos</div>
          <div className="sv" style={{color:'var(--p)'}}>{kpis.active_patients ?? 0}</div>
          <div className="ss">Acompanhamento regular</div>
        </div>
        <div className="sc">
          <div className="sl">Sessoes hoje</div>
          <div className="sv" style={{color:'var(--t)'}}>{kpis.today_appointments ?? 0}</div>
          <div className="ss">{todayAppts.filter(a=>a.mode==='presencial').length} presenciais · {todayAppts.filter(a=>a.mode==='online').length} online</div>
        </div>
        <div className="sc">
          <div className="sl">Anamneses pendentes</div>
          <div className="sv" style={{color:'var(--am)'}}>{kpis.pending_anamneses ?? 0}</div>
          <div className="ss">{kpis.flagged_anamneses ? `⚠ ${kpis.flagged_anamneses} com risco` : 'Sem risco sinalizado'}</div>
        </div>
      </div>

      <div className="cgrid" style={{marginTop:10}}>
        <div>
          <div className="card" style={{marginBottom:10}}>
            <div className="chdr">Agenda do dia<div className="chdr-act"><Link to="/agenda"><button>Ver agenda</button></Link></div></div>
            <div className="cbdy" style={{padding:'4px 13px'}}>
              {todayAppts.length ? todayAppts.map((s) => {
                const p = Array.isArray(s.patients) ? s.patients[0] : s.patients
                const t = new Date(s.starts_at).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
                return (
                  <div className="srow" key={s.id}>
                    <div className="stm">{t}</div>
                    <div>
                      <div style={{fontSize:12,fontWeight:500}}>{p?.full_name}</div>
                      <span className={`sbg ${s.mode==='online'?'son':'spr'}`}>{s.mode==='online'?'🎥 Online':'📍 Presencial'}</span>
                    </div>
                  </div>
                )
              }) : <div style={{padding:'14px 0',textAlign:'center',fontSize:12,color:'var(--txt3)'}}>Nenhum atendimento hoje.</div>}
            </div>
          </div>

          <div className="card">
            <div className="chdr">🧠 Insights da IA</div>
            <div className="cbdy" style={{padding:'4px 13px'}}>
              {[
                {i:'⚠️', t:'Verifique pacientes de risco moderado/alto — sugerimos revisar metas terapeuticas.'},
                {i:'📈', t:'Pacientes com anamnese completa progridem 40% mais rapido nas primeiras 4 sessoes.'},
                {i:'🔄', t:'Faltas seguidas indicam ansiedade evitativa — considere contato proativo.'},
                {i:'💡', t:'Analise IA das ultimas sessoes revela padroes de tema para grupos de apoio.'},
              ].map((a,i)=>(
                <div className="aii" key={i}>
                  <div className="aiico">{a.i}</div>
                  <div style={{color:'var(--txt2)'}}>{a.t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="card" style={{marginBottom:10}}>
            <div className="chdr">Pacientes<div className="chdr-act"><Link to="/patients"><button>Ver todos</button></Link></div></div>
            <div className="cbdy" style={{padding:'4px 13px'}}>
              {patients.length ? patients.map((p) => (
                <Link key={p.id} to={`/patients/${p.id}`} style={{textDecoration:'none',color:'inherit'}}>
                  <div className="prow">
                    <div className="pavt" style={{background:p.avatar_bg, color:p.avatar_fg}}>{p.initials}</div>
                    <div className="pinf">
                      <div className="pnm">{p.full_name}</div>
                      <div className="psub">{p.next_appointment_at ? new Date(p.next_appointment_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'Sem proxima sessao'}</div>
                    </div>
                    <span className={`rpill r${p.risk[0]}`}>{p.risk}</span>
                    <span style={{fontSize:11,color:'var(--txt3)',marginLeft:4}}>›</span>
                  </div>
                </Link>
              )) : <div style={{padding:'14px 0',textAlign:'center',fontSize:12,color:'var(--txt3)'}}>Nenhum paciente ainda. <Link to="/patients" style={{color:'var(--p)'}}>Cadastrar</Link></div>}
            </div>
          </div>

          <div className="card">
            <div className="chdr">🙏 Oracao intercessoria<div className="chdr-act"><Link to="/prayer"><button>Abrir</button></Link></div></div>
            <div className="cbdy" style={{padding:'4px 13px'}}>
              {patients.slice(0,3).map((p) => (
                <div key={p.id} style={{display:'flex',gap:8,padding:'6px 0',borderBottom:'1px solid var(--bdr)',alignItems:'flex-start'}}>
                  <input type="checkbox" style={{accentColor:'var(--p)',marginTop:2}} />
                  <div>
                    <div style={{fontSize:12,fontWeight:500}}>{p.full_name}</div>
                    <div style={{fontSize:10,color:'var(--txt2)'}}>{p.goals?.[0] || 'Cuidado terapeutico'}</div>
                  </div>
                </div>
              ))}
              <div style={{fontSize:10,color:'var(--txt3)',fontStyle:'italic',marginTop:7}}>"Orai uns pelos outros, para que sareis." — Tiago 5:16</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
