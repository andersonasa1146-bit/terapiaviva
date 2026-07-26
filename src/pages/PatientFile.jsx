import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { analyzeSession } from '../lib/ai'
import { today as todayStr } from '../lib/format'
import { useToast } from '../components/Toast'
import { SITE } from '../config/site'
import { logPatientAccess } from '../lib/audit'
import ScalesPanel from '../components/ScalesPanel'
import FilesPanel from '../components/FilesPanel'
import AudioPanel from '../components/AudioPanel'
import BillingPanel from '../components/BillingPanel'
import SignaturePanel from '../components/SignaturePanel'

const BLANK_FORM = { session_date: todayStr(), mode:'presencial', arrival:'', content:'', mood:5, spirit:5, openness:5, goals_done:[], next_goals:'', private_notes:'' }

// Copia o relatorio da tela para o container de impressao. Fora do componente
// para ser uma referencia estavel em addEventListener/removeEventListener.
function fillPrintArea() {
  const src = document.getElementById('rpt-content')
  const area = document.getElementById('print-area')
  if (!src || !area) return
  area.innerHTML = `<div class="rpt-doc">${src.innerHTML}</div>`
}

export default function PatientFile() {
  const { id } = useParams()
  const nav = useNavigate()
  const { session, ownerId, hasFinancialAccess } = useAuth()
  const { toast, confirm } = useToast()
  const [patient, setPatient] = useState(null)
  const [sessions, setSessions] = useState([])
  const [tab, setTab] = useState('sess')
  const [form, setForm] = useState(BLANK_FORM)
  const [editingId, setEditingId] = useState(null)
  const [audioOpenId, setAudioOpenId] = useState(null)
  const [ai, setAi] = useState(null)
  const [aiLoad, setAiLoad] = useState(false)
  const [aiErr, setAiErr] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data: p } = await supabase.from('patients').select('*').eq('id', id).maybeSingle()
    if (!p) { nav('/patients'); return }
    setPatient(p)
    const { data: s } = await supabase.from('sessions').select('*').eq('patient_id', id).order('session_date', {ascending:false})
    setSessions(s ?? [])
  }
  useEffect(() => { if (session?.user) load() }, [id, session])

  // Task #31: registra no log de auditoria a abertura do prontuario — uma
  // vez por visita (nao a cada re-fetch de save/edicao), para nao poluir o
  // log com ruido.
  useEffect(() => { if (session?.user && id) logPatientAccess(id, 'view_patient') }, [id, session])
  useEffect(() => { if (session?.user && id && tab === 'relatorio') logPatientAccess(id, 'view_report') }, [tab, id, session])

  // Impressao do relatorio: o conteudo e copiado para #print-area (unico bloco
  // visivel em @media print). Fica ligado ao evento beforeprint para que
  // Ctrl+P / menu do navegador gerem o mesmo PDF que o botao — antes, sem
  // clicar no botao, o #print-area saia vazio. O afterprint limpa a copia
  // para nao deixar dado clinico duplicado no DOM.
  useEffect(() => {
    if (tab !== 'relatorio') return
    const clear = () => { const a = document.getElementById('print-area'); if (a) a.innerHTML = '' }
    window.addEventListener('beforeprint', fillPrintArea)
    window.addEventListener('afterprint', clear)
    return () => {
      window.removeEventListener('beforeprint', fillPrintArea)
      window.removeEventListener('afterprint', clear)
      clear()
    }
  }, [tab])

  const toggleGoal = (g) => {
    const list = form.goals_done.includes(g) ? form.goals_done.filter(x=>x!==g) : [...form.goals_done, g]
    setForm({ ...form, goals_done: list })
  }

  const startEdit = (s) => {
    setEditingId(s.id)
    setForm({
      session_date: s.session_date, mode: s.mode, arrival: s.arrival || '', content: s.content || '',
      mood: s.mood, spirit: s.spirit, openness: s.openness, goals_done: s.goals_done || [],
      next_goals: s.next_goals || '', private_notes: s.private_notes || '',
    })
    setAi(null); setAiErr(null)
    setTab('sess')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(BLANK_FORM)
    setAi(null); setAiErr(null)
  }

  const removeSession = async (s) => {
    const ok = await confirm(`Excluir permanentemente a Sessao #${s.session_number} de ${new Date(s.session_date).toLocaleDateString('pt-BR')}? Esta acao nao pode ser desfeita.`, { danger: true, confirmLabel: 'Excluir' })
    if (!ok) return
    const { error } = await supabase.from('sessions').delete().eq('id', s.id)
    if (error) { toast.error(error.message); return }
    toast.success('Sessao excluida.')
    if (editingId === s.id) cancelEdit()
    load()
  }

  const save = async () => {
    if (!form.content || form.content.trim().length < 10) { toast.error('Preencha as anotacoes antes de salvar.'); return }
    setSaving(true)

    if (editingId) {
      const { data, error } = await supabase.from('sessions').update({
        session_date: form.session_date,
        mode: form.mode,
        arrival: form.arrival,
        content: form.content,
        mood: Number(form.mood),
        spirit: Number(form.spirit),
        openness: Number(form.openness),
        goals_done: form.goals_done,
        next_goals: form.next_goals,
        private_notes: form.private_notes,
        edited_at: new Date().toISOString(),
      }).eq('id', editingId).select().single()
      setSaving(false)
      if (error) { toast.error(error.message); return }
      toast.success('Sessao atualizada.')
      cancelEdit()
      load()
      return data
    }

    const num = sessions.length + 1
    const { data, error } = await supabase.from('sessions').insert({
      patient_id: id,
      therapist_id: ownerId,
      session_number: num,
      session_date: form.session_date,
      mode: form.mode,
      arrival: form.arrival,
      content: form.content,
      mood: Number(form.mood),
      spirit: Number(form.spirit),
      openness: Number(form.openness),
      goals_done: form.goals_done,
      next_goals: form.next_goals,
      private_notes: form.private_notes,
    }).select().single()
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Sessao salva.')
    setForm(BLANK_FORM)
    setAi(null); setAiErr(null)
    load()
    return data
  }

  const analyzeCurrent = async () => {
    // salva primeiro para ter session_id
    const created = await save()
    if (!created) return
    setAiLoad(true); setAi(null); setAiErr(null)
    try {
      const r = await analyzeSession(created.id)
      setAi(r.analysis)
    } catch (e) { setAiErr(e.message) }
    setAiLoad(false)
  }

  if (!patient) return <div style={{padding:24}}>Carregando…</div>

  const editingSession = editingId ? sessions.find(s => s.id === editingId) : null

  return (
    <div className="pf-wrap">
      <div className="pf-hdr">
        <button className="pf-back" onClick={()=>nav('/patients')}>← Pacientes</button>
        <div className="pf-card">
          <div className="pf-avt" style={{background:patient.avatar_bg,color:patient.avatar_fg}}>{patient.initials}</div>
          <div>
            <div className="pf-name">{patient.full_name}</div>
            <div className="pf-meta">
              {patient.profession || '—'} · {patient.church || '—'} · {sessions.length} sessao(oes) · Desde {new Date(patient.started_at).toLocaleDateString('pt-BR')}
            </div>
          </div>
          <div className="pf-actions">
            <span className={`rpill r${patient.risk[0]}`} style={{fontSize:11,padding:'3px 8px'}}>Risco {patient.risk}</span>
            <button className="btn btn-sm btn-t" onClick={()=>setTab('relatorio')}>📄 Gerar PDF</button>
          </div>
        </div>
      </div>

      <div className="tabs">
        {[['sess','📝 Sessoes'],['escalas','📊 Escalas'],['arquivos','📎 Arquivos'],...(hasFinancialAccess ? [['cobranca','💵 Cobranca']] : []),['ficha','🗂 Ficha'],['relatorio','📄 Relatorio']].map(([t,l]) => (
          <button key={t} className={`tab ${tab===t?'on':''}`} onClick={()=>setTab(t)}>{l}</button>
        ))}
      </div>

      {tab === 'sess' && (
        <>
          <div className="card" style={{marginBottom:12}}>
            <div className="chdr" style={{background: editingId ? '#FDF6E3' : 'var(--pl)', color: editingId ? '#8a5a06' : 'var(--pd)'}}>
              <span>{editingId ? `✏️ Editando Sessao #${editingSession?.session_number ?? ''}` : <>📝 Registro de Sessao — <strong>Sessao #{sessions.length+1}</strong></>}</span>
              <div style={{display:'flex', gap:7}}>
                {editingId && <button className="btn btn-sm" onClick={cancelEdit}>Cancelar edicao</button>}
                <button className="btn btn-sm btn-p" onClick={save} disabled={saving}>{saving?'Salvando…':(editingId?'Salvar alteracoes':'Salvar sessao')}</button>
              </div>
            </div>
            <div className="dual">
              <div className="dp-l">
                <div className="dp-hdr"><div className="dp-dot" style={{background:'var(--p)'}}></div>Anotacoes da Terapeuta <span style={{fontSize:10,fontWeight:400,color:'var(--txt3)',marginLeft:'auto'}}>Confidencial</span></div>
                <div className="dp-body">
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                    <div className="field"><label>Data</label><input type="date" value={form.session_date} onChange={e=>setForm({...form,session_date:e.target.value})} /></div>
                    <div className="field"><label>Modalidade</label>
                      <select value={form.mode} onChange={e=>setForm({...form,mode:e.target.value})}>
                        <option value="presencial">Presencial</option><option value="online">Online</option>
                      </select>
                    </div>
                  </div>
                  <div className="field"><label>Como o paciente chegou</label><input value={form.arrival} onChange={e=>setForm({...form,arrival:e.target.value})} placeholder="Estado emocional, postura, tom de voz..." /></div>
                  <div className="field"><label>Conteudo da sessao</label><textarea rows={6} value={form.content} onChange={e=>setForm({...form,content:e.target.value})} placeholder="Temas abordados, falas significativas entre aspas, intervencoes..." /></div>
                  {['mood','spirit','openness'].map((k,i)=>(
                    <div className="field" key={k}>
                      <label>{['😊 Humor','✨ Presenca espiritual','🔓 Abertura'][i]} — {form[k]}/10</label>
                      <div className="sc-wrap">
                        <input type="range" min={1} max={10} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} />
                        <span className="sc-val">{form[k]}</span>
                      </div>
                    </div>
                  ))}
                  <div className="field">
                    <label>Objetivos trabalhados</label>
                    {(patient.goals ?? []).map(g => (
                      <label key={g} className="check-item">
                        <input type="checkbox" checked={form.goals_done.includes(g)} onChange={()=>toggleGoal(g)} style={{accentColor:'var(--p)'}} /> {g}
                      </label>
                    ))}
                  </div>
                  <div className="field"><label>Objetivos proxima sessao</label><textarea rows={2} value={form.next_goals} onChange={e=>setForm({...form,next_goals:e.target.value})} /></div>
                  <div className="field"><label>Observacoes confidenciais</label><textarea rows={2} value={form.private_notes} onChange={e=>setForm({...form,private_notes:e.target.value})} /></div>
                  <div style={{display:'flex',gap:7,marginTop:4}}>
                    <button className="btn btn-t" onClick={analyzeCurrent} disabled={aiLoad}>{aiLoad?'Analisando…':'🧠 Salvar e analisar com IA'}</button>
                  </div>
                </div>
              </div>
              <div>
                <div className="dp-hdr"><div className="dp-dot" style={{background:'var(--t)'}}></div>Analise IA de Apoio Clinico</div>
                <div className="dp-body">
                  {aiLoad ? <div className="loading"><div className="spin"></div>Analisando sessao…</div>
                  : aiErr ? <div style={{padding:14,fontSize:12,color:'var(--red)'}}>{aiErr}</div>
                  : ai ? <AISessResult r={ai} />
                  : <div style={{padding:20,textAlign:'center',fontSize:12,color:'var(--txt2)'}}><div style={{fontSize:22,marginBottom:10}}>🧠</div>Salve e clique em <strong>Analisar com IA</strong> para receber apoio clinico.</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="card hist-wrap">
            <div className="chdr">Historico de sessoes ({sessions.length})</div>
            <div className="cbdy" style={{padding:'4px 13px'}}>
              {sessions.length ? sessions.map(s => (
                <div key={s.id} className="hist-row">
                  <div className="hist-hdr">
                    <span className="hist-num">Sessao #{s.session_number}</span>
                    <span className="hist-date">{new Date(s.session_date).toLocaleDateString('pt-BR')}</span>
                    {s.edited_at && <span style={{fontSize:9.5,color:'var(--txt3)',fontStyle:'italic'}}>editada</span>}
                    <span style={{marginLeft:'auto',fontSize:10,color:'var(--txt2)'}}>😊{s.mood}/10 · ✨{s.spirit}/10</span>
                    <button className="btn btn-sm" style={{padding:'2px 8px',fontSize:10.5}} onClick={()=>setAudioOpenId(audioOpenId===s.id?null:s.id)}>🎙️ Audio{s.audio_path?' ✓':''}</button>
                    <button className="btn btn-sm" style={{padding:'2px 8px',fontSize:10.5}} onClick={()=>startEdit(s)}>✏️ Editar</button>
                    <button className="btn btn-sm" style={{padding:'2px 8px',fontSize:10.5,color:'var(--red)'}} onClick={()=>removeSession(s)}>🗑</button>
                  </div>
                  <div className="hist-sum">{s.content}</div>
                  {audioOpenId === s.id && <AudioPanel s={s} onUpdated={load} />}
                </div>
              )) : <div style={{padding:'14px 0',textAlign:'center',fontSize:12,color:'var(--txt3)'}}>Nenhuma sessao registrada ainda.</div>}
            </div>
          </div>
        </>
      )}

      {tab === 'escalas' && <ScalesPanel patientId={id} />}

      {tab === 'arquivos' && <FilesPanel patientId={id} />}

      {tab === 'cobranca' && hasFinancialAccess && <BillingPanel patientId={id} />}

      {tab === 'ficha' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div className="card"><div className="chdr">Dados de identificacao</div><div className="cbdy">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {[['Nome',patient.full_name],['Nascimento',patient.birthdate||'—'],['Profissao',patient.profession||'—'],['Cidade',patient.city||'—'],['Igreja',patient.church||'—'],['Telefone',patient.phone||'—']].map(([k,v])=>(
                <div key={k}><div style={{fontSize:10,color:'var(--txt2)',marginBottom:1}}>{k}</div><div style={{fontSize:12,fontWeight:500}}>{v}</div></div>
              ))}
            </div>
          </div></div>
          <div className="card"><div className="chdr">Objetivos terapeuticos</div><div className="cbdy">
            {(patient.goals ?? []).map(g=>(
              <div key={g} style={{display:'flex',alignItems:'center',gap:7,padding:'6px 0',borderBottom:'1px solid var(--bdr)',fontSize:12}}>
                <span style={{color:'var(--p)'}}>✓</span>{g}
              </div>
            ))}
          </div></div>
        </div>
      )}

      {tab === 'relatorio' && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div><h2 style={{fontSize:15,fontWeight:600}}>Relatorio Clinico — {patient.full_name}</h2>
              <p style={{fontSize:11,color:'var(--txt2)'}}>Documento confidencial · LGPD</p></div>
            {/* fillPrintArea explicito alem do beforeprint: alguns navegadores
                (Safari mais antigo) nao disparam o evento de forma confiavel. */}
            <button className="btn btn-t btn-sm" onClick={() => {
              fillPrintArea()
              window.print()
            }}>🖨 Imprimir / Salvar PDF</button>
          </div>
          <div className="rpt-doc" id="rpt-content">
            <div className="rpt-logo"><h2>{SITE.appName}</h2><p>Documento confidencial · LGPD</p></div>
            <div className="rpt-sec"><div className="rpt-ttl">Identificacao</div><div className="rpt-grid">
              {[['Nome',patient.full_name],['Profissao',patient.profession||'—'],['Igreja',patient.church||'—'],['Total de sessoes',sessions.length],['Nivel de risco',patient.risk.toUpperCase()],['Data',new Date().toLocaleDateString('pt-BR')]].map(([k,v])=>(
                <div key={k} className="rpt-fld"><strong>{k}</strong>{v}</div>
              ))}
            </div></div>
            <div className="rpt-sec"><div className="rpt-ttl">Objetivos Terapeuticos</div>
              {(patient.goals ?? []).map(g=><div key={g} style={{fontSize:12,marginBottom:3}}>• {g}</div>)}
            </div>
            <div className="rpt-sec"><div className="rpt-ttl">Historico de Sessoes</div>
              {sessions.length ? sessions.map(s=>(
                <div className="rpt-sess" key={s.id}>
                  <div className="rpt-sess-hdr">
                    <span style={{background:'var(--tl)',color:'var(--td)',padding:'1px 7px',borderRadius:4,fontSize:11}}>Sessao #{s.session_number}</span>
                    <span>{new Date(s.session_date).toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'})}</span>
                    <span style={{marginLeft:'auto',fontSize:11,color:'var(--txt2)'}}>Humor {s.mood}/10 · Espiritual {s.spirit}/10</span>
                  </div>
                  <div className="rpt-sess-txt">{s.content}</div>
                </div>
              )) : <p style={{fontSize:12,color:'var(--txt2)'}}>Nenhuma sessao registrada.</p>}
            </div>
          </div>
          <SignaturePanel patientId={id} />
        </div>
      )}
    </div>
  )
}

function AISessResult({ r }) {
  const rc = {baixo:'rb', moderado:'rm', alto:'ra'}[r.nivel_sessao] || 'rm'
  const List = ({a}) => (a||[]).map((i,idx) => <div key={idx} className="ai-li">{i}</div>)
  return (
    <>
      <div className={`ai-pill ${rc}`}>⚠ Sessao: {r.nivel_sessao}</div>
      <div className="ai-blk"><div className="ai-ttl">Observacoes clinicas</div><List a={r.observacoes_clinicas} /></div>
      <div className="ai-blk"><div className="ai-ttl">Estado geral</div><div className="ai-focus">{r.estado_geral}</div></div>
      <div className="ai-blk"><div className="ai-ttl">Padroes identificados</div><List a={r.padroes} /></div>
      <div className="ai-blk"><div className="ai-ttl">Sugestoes proxima sessao</div><List a={r.sugestoes_proxima} /></div>
      <div className="ai-blk"><div className="ai-ttl">Recursos biblicos</div>
        {(r.versiculos||[]).map((v,i) => <div key={i} className="ai-verse"><strong>{v.ref}</strong>{v.contexto}</div>)}
      </div>
      {(r.alertas||[]).length ? <div className="ai-blk"><div className="ai-ttl" style={{color:'var(--red)'}}>⚠ Alertas</div><List a={r.alertas} /></div> : null}
      <div className="ai-blk"><div className="ai-ttl">Nota para a terapeuta</div><div className="ai-note">{r.nota_terapeuta}</div></div>
    </>
  )
}
