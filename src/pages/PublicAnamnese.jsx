import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ANM_SECTIONS } from './Anamnese'

// Portal publico para o paciente responder — nao requer login.
// Usa a funcao RPC submit_anamnesis que o esquema publica.

export default function PublicAnamnese() {
  const { token } = useParams()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const s = ANM_SECTIONS[step]
  const pct = Math.round(step / ANM_SECTIONS.length * 100)
  const rv = answers.ri
  const showCrisis = step === 5 && (rv === 'Sim – estou em risco' || rv === 'Nao sei' || rv === 'Prefiro conversar')

  const set = (k, v) => setAnswers(a => ({ ...a, [k]: v }))
  const toggle = (k, o) => setAnswers(a => {
    const list = Array.isArray(a[k]) ? [...a[k]] : []
    const i = list.indexOf(o)
    if (i >= 0) list.splice(i, 1); else list.push(o)
    return { ...a, [k]: list }
  })

  const submit = async () => {
    setBusy(true)
    const risk = ['Sim – estou em risco','Nao sei'].includes(answers.ri)
    const { data, error } = await supabase.rpc('submit_anamnesis', {
      p_token: token, p_answers: answers, p_risk_flagged: risk,
    })
    setBusy(false)
    if (error || data?.ok === false) { alert(error?.message || data?.error || 'Erro ao enviar.'); return }
    setDone(true)
  }

  if (done) return (
    <div className="auth-shell">
      <div className="auth-card" style={{textAlign:'center'}}>
        <div style={{fontSize:40,marginBottom:14}}>✅</div>
        <h1>Anamnese enviada!</h1>
        <p className="sub">Suas respostas foram entregues com seguranca a sua terapeuta.<br/><br/>Em caso de crise: CVV 188 · SAMU 192</p>
      </div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)'}}>
      <div style={{background:'var(--card)',borderBottom:'1px solid var(--bdr)',padding:'12px 16px'}}>
        <div style={{maxWidth:640,margin:'0 auto',display:'flex',alignItems:'center',gap:8}}>
          <div className="logo-dot">TV</div>
          <div><strong style={{fontSize:14,color:'var(--pd)'}}>TerapiaViva</strong><div style={{fontSize:10,color:'var(--txt3)'}}>Formulario confidencial · LGPD</div></div>
        </div>
      </div>
      <div className="anm-prog"><div className="anm-prog-fill" style={{width:`${pct}%`}}></div></div>
      <div className="anm-wrap">
        <div className="anm-sec-hdr"><h2>{s.title}</h2><p>{s.desc}</p></div>
        {step===0 && <div className="consent-box">Este formulario e <strong>estritamente confidencial</strong> e protegido pela LGPD. Responda apenas o que se sentir confortavel. <strong>⚠️ Risco imediato: SAMU 192 · CVV 188</strong></div>}
        {showCrisis && <div className="crisis-box"><strong>⚠️ Atencao imediata</strong>Ligue agora: CVV 188 · SAMU 192 · UPA mais proxima.<br/>Voce pode continuar — a terapeuta sera notificada com prioridade.</div>}

        {s.fields.map(f => (
          <div className="field" key={f.k}>
            <label style={{fontSize:13,fontWeight:500,color:'var(--txt)',marginBottom:6,display:'block'}}>
              {f.l}{f.r && <span style={{color:'var(--red)',marginLeft:2}}>*</span>}
            </label>
            {f.t === 'text' || f.t === 'date' ? (
              <input type={f.t} value={answers[f.k] || ''} onChange={e => set(f.k, e.target.value)} />
            ) : f.t === 'textarea' ? (
              <textarea rows={3} value={answers[f.k] || ''} onChange={e => set(f.k, e.target.value)} />
            ) : f.t === 'radio' ? (
              <div className="radio-list">
                {f.o.map(o => (
                  <label className="radio-item" key={o}>
                    <input type="radio" name={`anm_${f.k}`} checked={answers[f.k] === o} onChange={() => set(f.k, o)} /> {o}
                  </label>
                ))}
              </div>
            ) : f.t === 'check' ? (
              <div className="check-grid">
                {f.o.map(o => (
                  <label className="check-item2" key={o}>
                    <input type="checkbox" checked={Array.isArray(answers[f.k]) && answers[f.k].includes(o)} onChange={() => toggle(f.k, o)} /> {o}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ))}

        <div className="anm-nav">
          <span className="anm-step">Etapa {step+1} de {ANM_SECTIONS.length}</span>
          <div style={{display:'flex',gap:8}}>
            {step > 0 && <button className="btn" onClick={() => setStep(step-1)}>← Anterior</button>}
            {step < ANM_SECTIONS.length - 1
              ? <button className="btn btn-p" onClick={() => setStep(step+1)}>Proximo →</button>
              : <button className="btn btn-p" onClick={submit} disabled={busy}>{busy?'Enviando…':'Enviar anamnese'}</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
