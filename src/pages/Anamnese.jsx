import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { analyzeAnamnesis } from '../lib/ai'
import { useToast } from '../components/Toast'

export const ANM_SECTIONS = [
  { id:'consent', title:'Termo e Consentimento', desc:'Leia com atencao. Em caso de risco imediato: SAMU 192 ou CVV 188.', fields:[
    { k:'c1', l:'Concordo em responder para fins de anamnese', t:'radio', r:true, o:['Concordo','Prefiro conversar antes'] },
    { k:'c2', l:'Autorizo uso das informacoes para o atendimento', t:'radio', r:true, o:['Sim, autorizo','Nao autorizo','Tenho duvidas'] },
  ]},
  { id:'id', title:'1. Identificacao', desc:'Informacoes basicas.', fields:[
    { k:'nome', l:'Nome completo', t:'text', r:true },
    { k:'nasc', l:'Data de nascimento', t:'date' },
    { k:'estado_civil', l:'Estado civil', t:'radio', o:['Solteiro(a)','Casado(a)','Divorciado(a)','Uniao estavel','Viuvo(a)'] },
    { k:'profissao', l:'Profissao', t:'text' },
    { k:'tel', l:'WhatsApp', t:'text', r:true },
    { k:'cidade', l:'Cidade/Estado', t:'text' },
  ]},
  { id:'queixa', title:'2. Queixa Principal', desc:'O que motivou o inicio do acompanhamento.', fields:[
    { k:'qp', l:'Qual seu principal problema neste momento?', t:'textarea', r:true },
    { k:'qe', l:'O que espera do acompanhamento?', t:'textarea' },
    { k:'qa', l:'Areas que deseja trabalhar', t:'check', o:['Emocional','Espiritual','Familiar','Conjugal','Ansiedade','Tristeza','Traumas','Proposito','Sexualidade','Vicios','Saude fisica'] },
  ]},
  { id:'historia', title:'3. Historia de Vida', desc:'Experiencias que podem influenciar o momento atual.', fields:[
    { k:'hi', l:'Descreva sua infancia', t:'textarea' },
    { k:'hid', l:'O que foi doloroso na infancia?', t:'textarea' },
    { k:'hd', l:'Sua visao de Deus', t:'textarea' },
  ]},
  { id:'dif', title:'4. Dificuldades Pessoais', desc:'Sem julgamento.', fields:[
    { k:'df', l:'Sentimentos internos', t:'check', o:['Ansiedade excessiva','Tristeza','Inferioridade','Culpa intensa','Medo','Rancor','Desejo de morrer','Nao se aplica'] },
    { k:'dc', l:'Comportamentos/relacionamentos', t:'check', o:['Manipulacao','Ciumes','Ira','Isolamento','Mentira','Violencia','Nao se aplica'] },
    { k:'de', l:'Conflitos espirituais', t:'check', o:['Duvidas sobre fe','Religiosidade sem transformacao','Ocultismo anterior','Nao se aplica'] },
  ]},
  { id:'sintomas', title:'5. Sintomas e Alertas', desc:'⚠️ Risco atual: SAMU 192 ou CVV 188.', fields:[
    { k:'sl', l:'Sintomas vividos', t:'check', o:['Pensamentos de suicidio','Panico','Pesadelos','Alucinacoes','Depressao profunda','Ira','Nao se aplica'] },
    { k:'ri', l:'Sente-se em risco de ferir a si mesma(o) ou outra pessoa?', t:'radio', r:true, o:['Nao','Sim – estou em risco','Nao sei','Prefiro conversar'] },
  ]},
  { id:'saude', title:'6. Saude', desc:'Fatores clinicos.', fields:[
    { k:'sa', l:'Como avalia sua saude fisica?', t:'radio', o:['Excelente','Boa','Regular','Decaindo','Ruim'] },
    { k:'sm', l:'Medicamentos atuais', t:'textarea' },
    { k:'sd', l:'Diagnosticos medicos', t:'textarea' },
    { k:'re', l:'Se considera religiosa/espiritualizada?', t:'radio', o:['Sim','Nao','Em parte','Em busca'] },
    { k:'ig', l:'Igreja/denominacao', t:'text' },
    { k:'fc', l:'Tem certeza da salvacao?', t:'radio', o:['Sim','Nao','Duvidas','Nao se aplica'] },
  ]},
  { id:'familia', title:'7. Familia', desc:'Vinculos.', fields:[
    { k:'fp', l:'Relacionamento dos seus pais entre si', t:'textarea' },
    { k:'fpa', l:'Seu relacionamento com o pai', t:'textarea' },
    { k:'fma', l:'Seu relacionamento com a mae', t:'textarea' },
    { k:'rd', l:'Relacionamento conjugal/afetivo atual', t:'textarea' },
  ]},
  { id:'close', title:'8. Encerramento', desc:'Ultimas informacoes.', fields:[
    { k:'obj', l:'Objetivos para o acompanhamento', t:'textarea', r:true },
    { k:'ext', l:'Algo importante que devo saber?', t:'textarea' },
    { k:'conf', l:'Confirmo respostas livres e conscientes', t:'radio', r:true, o:['Sim, confirmo','Desejo conversar antes'] },
  ]},
]
export const ANM_TABS = ['Consent.','Identificacao','Queixa','Historia','Dificuldades','Sintomas','Saude','Familia','Encerramento']

export default function Anamnese() {
  const { session } = useAuth()
  const { toast, promptCopy } = useToast()
  const [list, setList] = useState([])
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState(0)
  const [ai, setAi] = useState(null)
  const [aiLoad, setAiLoad] = useState(false)
  const [aiErr, setAiErr] = useState(null)

  const load = () => supabase.from('anamneses')
    .select('*, patients:patient_id (full_name, initials, avatar_bg, avatar_fg)')
    .eq('therapist_id', session.user.id).order('created_at', {ascending:false})
    .then(({data}) => setList(data ?? []))

  useEffect(() => { if (session?.user) load() }, [session])

  const createLink = async () => {
    const { data, error } = await supabase.from('anamneses')
      .insert({ therapist_id: session.user.id, status: 'sent' })
      .select().single()
    if (error) { toast.error(error.message); return }
    const url = `${window.location.origin}/a/${data.public_token}`
    await promptCopy('Link seguro de anamnese (expira em 7 dias) — envie ao paciente por WhatsApp:', url)
    load()
  }

  const runAI = async () => {
    if (!selected) return
    setAiLoad(true); setAi(null); setAiErr(null)
    try {
      const r = await analyzeAnamnesis(selected.id)
      setAi(r.evaluation)
    } catch (e) { setAiErr(e.message) }
    setAiLoad(false)
  }

  useEffect(() => { setAi(selected?.ai_evaluation ?? null); setAiErr(null) }, [selected?.id])

  if (!selected) {
    return (
      <div style={{padding:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div>
            <h2 style={{fontSize:15,fontWeight:600}}>📋 Anamneses</h2>
            <p style={{fontSize:11,color:'var(--txt2)'}}>Gere um link seguro por WhatsApp e revise as respostas com apoio da IA.</p>
          </div>
          <button className="btn btn-p btn-sm" onClick={createLink}>+ Gerar link de anamnese</button>
        </div>
        <div className="card">
          <div className="cbdy" style={{padding:'4px 13px'}}>
            {list.length ? list.map((a) => {
              const p = Array.isArray(a.patients) ? a.patients[0] : a.patients
              const st = { pending:'Aguardando envio', sent:'Enviado — aguardando paciente', submitted:'Recebido — revisar', reviewed:'Revisado' }[a.status]
              return (
                <div key={a.id} className="prow" onClick={()=>setSelected(a)}>
                  <div className="pavt" style={{background:p?.avatar_bg||'#EEEDFE', color:p?.avatar_fg||'#3C3489'}}>{p?.initials || '?'}</div>
                  <div className="pinf">
                    <div className="pnm">{p?.full_name || 'Sem paciente vinculado'}</div>
                    <div className="psub">{st} · {new Date(a.created_at).toLocaleDateString('pt-BR')}</div>
                  </div>
                  {a.risk_flagged ? <span className="rpill ra">⚠ RISCO</span> : null}
                  <button className="btn btn-sm" style={{marginLeft:8}}>Abrir ›</button>
                </div>
              )
            }) : <div style={{padding:'22px 0',textAlign:'center',fontSize:12,color:'var(--txt3)'}}>Nenhuma anamnese ainda.</div>}
          </div>
        </div>
      </div>
    )
  }

  const d = selected.answers || {}
  const anmGet = (k) => d[k] ?? ''

  return (
    <div>
      <div className="anm-bar">
        <button className="anm-btn" onClick={()=>{setSelected(null); setAi(null)}}>← Anamneses</button>
        <span style={{fontSize:12,color:'var(--txt2)'}}>{anmGet('nome') || 'Sem nome'} · {selected.status}</span>
        {selected.risk_flagged ? <span className="rpill ra">⚠ RISCO IMEDIATO</span> : null}
      </div>
      <div className="t-split">
        <div className="t-pnl">
          <div className="t-pnl-hdr"><div style={{width:8,height:8,borderRadius:'50%',background:'var(--p)'}}></div>Anamnese do Paciente</div>
          <div className="tab-row-sm">
            {ANM_TABS.map((l,i)=><button key={i} className={`tab-sm ${tab===i?'on':''}`} onClick={()=>setTab(i)}>{l}</button>)}
          </div>
          <div className="tab-bdy">
            {ANM_SECTIONS[tab].fields.map(f => {
              const v = anmGet(f.k)
              const list = Array.isArray(v) && v.length ? v.map(x => <span key={x} className="tag">{x}</span>)
                        : (v && v.toString().trim() ? <span className="ans-v">{v.toString()}</span> : <span className="ans-v ans-empty">Nao informado</span>)
              return (
                <div className="ans-item" key={f.k}>
                  <div className="ans-q">{f.l}</div>
                  <div>{list}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="t-pnl">
          <div className="t-pnl-hdr"><div style={{width:8,height:8,borderRadius:'50%',background:'var(--t)'}}></div>Avaliacao Preliminar IA</div>
          <div style={{padding:13,overflowY:'auto'}}>
            {aiLoad ? <div className="loading"><div className="spin"></div>Analisando…</div>
            : aiErr ? <div style={{padding:14,fontSize:12,color:'var(--red)'}}>{aiErr}<br/><br/><button className="btn btn-sm" onClick={runAI}>Tentar novamente</button></div>
            : ai ? <AnamAI r={ai} onRerun={runAI} />
            : <div style={{padding:18,textAlign:'center'}}>
                <p style={{marginBottom:12,fontSize:12,color:'var(--txt2)',lineHeight:1.6}}>Gere a avaliacao preliminar baseada nos dados da anamnese.</p>
                <button className="btn btn-t" onClick={runAI}>Gerar avaliacao com IA</button>
              </div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function AnamAI({ r, onRerun }) {
  const rc = {baixo:'rb', moderado:'rm', alto:'ra', critico:'rc'}[r.nivel_risco] || 'rm'
  const rn = {baixo:'Risco Baixo', moderado:'Risco Moderado', alto:'Risco Alto', critico:'⚠ Risco Critico'}[r.nivel_risco] || r.nivel_risco
  const List = ({a}) => (a||[]).map((i,idx) => <div key={idx} className="ai-li">{i}</div>)
  return (
    <>
      <div className={`ai-pill ${rc}`}>⚠ {rn}</div>
      <div className="ai-blk"><div className="ai-ttl">Justificativa</div><p style={{fontSize:12,lineHeight:1.6,color:'var(--txt2)'}}>{r.justificativa_risco}</p></div>
      <div className="ai-blk"><div className="ai-ttl">Foco primeira sessao</div><div className="ai-focus">{r.foco_primeira_sessao}</div></div>
      <div className="ai-blk"><div className="ai-ttl">Indicadores clinicos</div><List a={r.indicadores_clinicos} /></div>
      <div className="ai-blk"><div className="ai-ttl">Hipoteses</div><List a={r.hipoteses_diagnosticas} /></div>
      <div className="ai-blk"><div className="ai-ttl">Observacoes espirituais</div><List a={r.observacoes_espirituais} /></div>
      <div className="ai-blk"><div className="ai-ttl">Fatores de protecao</div><List a={r.fatores_protecao} /></div>
      <div className="ai-blk"><div className="ai-ttl">Abordagens recomendadas</div><List a={r.abordagens_recomendadas} /></div>
      <div className="ai-blk"><div className="ai-ttl">Nota para a terapeuta</div><div className="ai-note">{r.nota_terapeuta}</div></div>
      <div style={{textAlign:'right',marginTop:8}}><button className="btn btn-sm" onClick={onRerun}>↻ Reanalisar</button></div>
    </>
  )
}
