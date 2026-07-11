import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import { SCALES, SCALE_OPTIONS, scoreScale } from '../lib/scales'

const SEV_COLOR = {
  'Minima': '#1D9E75', 'Leve': '#1D9E75', 'Moderada': '#B5720A',
  'Moderadamente severa': '#C0392B', 'Severa': '#A32D2D',
}

export default function ScalesPanel({ patientId }) {
  const { ownerId } = useAuth()
  const { toast, confirm } = useToast()
  const [history, setHistory] = useState([])
  const [applying, setApplying] = useState(null) // 'phq9' | 'gad7' | null
  const [answers, setAnswers] = useState([])

  const load = async () => {
    const { data } = await supabase.from('clinical_scales')
      .select('*').eq('patient_id', patientId).order('applied_at', { ascending: true })
    setHistory(data ?? [])
  }
  useEffect(() => { if (patientId) load() }, [patientId])

  const startApply = (key) => {
    setApplying(key)
    setAnswers(Array(SCALES[key].questions.length).fill(null))
  }

  const submit = async () => {
    if (answers.some((a) => a === null)) { toast.error('Responda todas as perguntas antes de salvar.'); return }
    const { total, severity, riskFlag } = scoreScale(applying, answers)
    const { error } = await supabase.from('clinical_scales').insert({
      therapist_id: ownerId,
      patient_id: patientId,
      scale: applying,
      answers,
      total_score: total,
      severity,
    })
    if (error) { toast.error(error.message); return }
    if (riskFlag) {
      await confirm(
        'Atencao: a resposta ao item sobre pensamentos de morte/autolesao foi maior que zero. Considere avaliacao de risco imediata e, se necessario, oriente CVV 188 / SAMU 192.',
        { confirmLabel: 'Entendi', cancelLabel: 'Fechar' }
      )
    }
    toast.success(`${SCALES[applying].label} salva — pontuacao ${total} (${severity}).`)
    setApplying(null)
    load()
  }

  const chartData = useMemo(() => {
    const byDate = {}
    history.forEach((h) => {
      const key = h.applied_at
      byDate[key] = byDate[key] || { date: key }
      byDate[key][h.scale] = h.total_score
    })
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
  }, [history])

  if (applying) {
    const def = SCALES[applying]
    return (
      <div className="card">
        <div className="chdr">{def.label}</div>
        <div className="cbdy">
          <p style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 12 }}>{def.intro}</p>
          {def.questions.map((q, i) => (
            <div key={i} className="field" style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12.5, fontWeight: 500 }}>{i + 1}. {q}</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {SCALE_OPTIONS.map((o) => (
                  <label key={o.v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5 }}>
                    <input
                      type="radio"
                      name={`q${i}`}
                      checked={answers[i] === o.v}
                      onChange={() => setAnswers((a) => a.map((x, idx) => idx === i ? o.v : x))}
                    /> {o.l}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-p" onClick={submit}>Salvar escala</button>
            <button className="btn" onClick={() => setApplying(null)}>Cancelar</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="chdr">
          <span>📊 Escalas clinicas padronizadas</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-p" onClick={() => startApply('phq9')}>+ Aplicar PHQ-9</button>
            <button className="btn btn-sm btn-p" onClick={() => startApply('gad7')}>+ Aplicar GAD-7</button>
          </div>
        </div>
        <div className="cbdy" style={{ padding: '12px 8px' }}>
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DDE8E5" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#556866' }} />
                <YAxis tick={{ fontSize: 11, fill: '#556866' }} domain={[0, 27]} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="phq9" name="PHQ-9 (depressao)" stroke="#1D9E75" strokeWidth={2} connectNulls />
                <Line type="monotone" dataKey="gad7" name="GAD-7 (ansiedade)" stroke="#534AB7" strokeWidth={2} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: '18px 0', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>
              Nenhuma escala aplicada ainda. Use os botoes acima para comecar o acompanhamento.
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="chdr">Historico de aplicacoes</div>
        <div className="cbdy" style={{ padding: '4px 13px' }}>
          {history.length ? [...history].reverse().map((h) => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--bdr)' }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{SCALES[h.scale].label}</div>
                <div style={{ fontSize: 10.5, color: 'var(--txt2)' }}>{new Date(h.applied_at).toLocaleDateString('pt-BR')}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{h.total_score}/{SCALES[h.scale].maxScore}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, color: '#fff', background: SEV_COLOR[h.severity] || '#556866' }}>{h.severity}</span>
              </div>
            </div>
          )) : <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>Sem registros.</div>}
        </div>
      </div>
    </div>
  )
}
