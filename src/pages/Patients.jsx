import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { initials } from '../lib/format'
import { useToast } from '../components/Toast'

const PALETTES = [
  { bg:'#E1F5EE', fg:'#085041' }, { bg:'#EEEDFE', fg:'#3C3489' },
  { bg:'#FAEEDA', fg:'#633806' }, { bg:'#FCEBEB', fg:'#A32D2D' },
  { bg:'#EAF3DE', fg:'#27500A' },
]

export default function Patients() {
  const { session } = useAuth()
  const { toast, confirm } = useToast()
  const [list, setList] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name:'', phone:'', profession:'', city:'', church:'', risk:'baixo', goals:'' })

  const load = () => supabase.from('patients')
    .select('*, sessions:sessions(count)')
    .eq('therapist_id', session.user.id)
    .order('created_at', {ascending:false})
    .then(({data}) => setList(data ?? []))

  useEffect(() => { if (session?.user) load() }, [session])

  const save = async (e) => {
    e.preventDefault()
    const p = PALETTES[Math.floor(Math.random()*PALETTES.length)]
    const { error } = await supabase.from('patients').insert({
      therapist_id: session.user.id,
      full_name: form.full_name,
      initials: initials(form.full_name),
      phone: form.phone || null,
      profession: form.profession || null,
      city: form.city || null,
      church: form.church || null,
      risk: form.risk,
      goals: form.goals ? form.goals.split('\n').map(s=>s.trim()).filter(Boolean) : [],
      avatar_bg: p.bg, avatar_fg: p.fg,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Paciente cadastrado(a).')
    setForm({ full_name:'', phone:'', profession:'', city:'', church:'', risk:'baixo', goals:'' })
    setShowForm(false)
    load()
  }

  const exportData = async (patientId, name) => {
    const { data, error } = await supabase.rpc('export_patient_data', { p_patient_id: patientId })
    if (error) { toast.error('Nao foi possivel exportar: ' + error.message); return }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dados-${(name || 'paciente').replace(/\s+/g,'-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exportacao gerada.')
  }

  const erasePatient = async (patientId, name) => {
    const ok = await confirm(
      `Excluir permanentemente os dados de ${name}?\n\nIsso apaga o cadastro, sessoes, anamneses e agendamentos vinculados a este paciente. Esta acao nao pode ser desfeita.\n\nRecomendamos exportar os dados antes de excluir.`,
      { danger: true, confirmLabel: 'Excluir definitivamente' }
    )
    if (!ok) return
    const { error } = await supabase.rpc('erase_patient', { p_patient_id: patientId })
    if (error) { toast.error('Nao foi possivel excluir: ' + error.message); return }
    toast.success('Dados do paciente excluidos.')
    load()
  }

  return (
    <div style={{padding:14}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
        <h2 style={{fontSize:15,fontWeight:600}}>Pacientes ativos ({list.length})</h2>
        <button className="btn btn-p btn-sm" onClick={()=>setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Novo paciente'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{marginBottom:12}}>
          <div className="chdr">Cadastrar novo paciente</div>
          <div className="cbdy">
            <form onSubmit={save}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div className="field"><label>Nome completo *</label><input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} /></div>
                <div className="field"><label>Telefone/WhatsApp</label><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} /></div>
                <div className="field"><label>Profissao</label><input value={form.profession} onChange={e=>setForm({...form,profession:e.target.value})} /></div>
                <div className="field"><label>Cidade</label><input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} /></div>
                <div className="field"><label>Igreja</label><input value={form.church} onChange={e=>setForm({...form,church:e.target.value})} /></div>
                <div className="field">
                  <label>Nivel de risco</label>
                  <select value={form.risk} onChange={e=>setForm({...form,risk:e.target.value})}>
                    <option value="baixo">Baixo</option><option value="moderado">Moderado</option>
                    <option value="alto">Alto</option><option value="critico">Critico</option>
                  </select>
                </div>
              </div>
              <div className="field"><label>Objetivos terapeuticos (1 por linha)</label>
                <textarea rows={3} value={form.goals} onChange={e=>setForm({...form,goals:e.target.value})} placeholder="Ansiedade&#10;Restauracao conjugal" />
              </div>
              <button className="btn btn-p" type="submit">Salvar paciente</button>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="cbdy" style={{padding:'4px 13px'}}>
          {list.length ? list.map((p) => (
            <div className="prow" key={p.id} style={{alignItems:'center'}}>
              <Link to={`/patients/${p.id}`} style={{textDecoration:'none',color:'inherit',display:'flex',alignItems:'center',flex:1,gap:10}}>
                <div className="pavt" style={{background:p.avatar_bg,color:p.avatar_fg,width:34,height:34,fontSize:11}}>{p.initials}</div>
                <div className="pinf">
                  <div className="pnm" style={{fontSize:13}}>{p.full_name}</div>
                  <div className="psub">
                    {p.next_appointment_at ? `Proxima: ${new Date(p.next_appointment_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}` : 'Sem proxima sessao'} · {p.sessions?.[0]?.count ?? 0} sessao(oes)
                  </div>
                </div>
                <span className={`rpill r${p.risk[0]}`} style={{fontSize:10,padding:'2px 8px'}}>{p.risk}</span>
              </Link>
              <div style={{display:'flex',gap:6,marginLeft:8}}>
                <button className="btn btn-sm" title="Exportar dados (LGPD)" onClick={()=>exportData(p.id, p.full_name)}>⬇ Exportar</button>
                <button className="btn btn-sm" title="Excluir dados (direito ao esquecimento)" style={{color:'var(--red)'}} onClick={()=>erasePatient(p.id, p.full_name)}>🗑 Excluir</button>
              </div>
            </div>
          )) : <div style={{padding:'22px 0',textAlign:'center',fontSize:12,color:'var(--txt3)'}}>Nenhum paciente cadastrado. Clique em "+ Novo paciente".</div>}
        </div>
      </div>
    </div>
  )
}
