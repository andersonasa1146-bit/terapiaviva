import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import { chargePatient, hasPatientMpToken } from '../lib/billing'

const STATUS_STYLE = {
  pending: { bg: '#FDF6E3', fg: '#8a5a06', label: 'Pendente' },
  paid: { bg: '#E1F5EE', fg: '#0B5E44', label: 'Pago' },
  cancelled: { bg: '#EEF3F2', fg: '#556866', label: 'Cancelado' },
  expired: { bg: '#FBE4E4', fg: '#A32D2D', label: 'Expirado' },
}

function fmtBRL(n) {
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function BillingPanel({ patientId }) {
  const { toast, promptCopy } = useToast()
  const [charges, setCharges] = useState([])
  const [loading, setLoading] = useState(true)
  const [tokenReady, setTokenReady] = useState(null)
  const [form, setForm] = useState({ amount: '', description: '' })
  const [creating, setCreating] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('patient_charges')
      .select('*').eq('patient_id', patientId).order('created_at', { ascending: false })
    setCharges(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (patientId) load()
    hasPatientMpToken().then(setTokenReady).catch(() => setTokenReady(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  const create = async (e) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!amount || amount <= 0) { toast.error('Informe um valor valido.'); return }
    if (!form.description.trim()) { toast.error('Informe uma descricao para a cobranca.'); return }
    setCreating(true)
    try {
      const r = await chargePatient(patientId, amount, form.description.trim())
      setForm({ amount: '', description: '' })
      await load()
      if (r.payment_link) {
        await promptCopy('Cobranca criada! Envie este link de pagamento ao paciente:', r.payment_link)
      } else {
        toast.success('Cobranca criada.')
      }
    } catch (err) {
      toast.error(err.message)
    }
    setCreating(false)
  }

  const copyLink = (c) => {
    if (!c.payment_link) return
    promptCopy('Link de pagamento desta cobranca:', c.payment_link)
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="chdr">💵 Cobranca de pacientes ({charges.length})</div>
      <div className="cbdy" style={{ padding: '10px 13px' }}>
        {tokenReady === false && (
          <div className="callout clwrn" style={{ marginBottom: 10 }}>
            <strong>Configure seu token do Mercado Pago</strong>
            Para gerar cobrancas, va em <Link to="/config">Configuracoes → Cobranca de pacientes</Link> e
            cole seu Access Token pessoal do Mercado Pago.
          </div>
        )}

        <form onSubmit={create} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
          <div className="field" style={{ maxWidth: 120, margin: 0 }}>
            <label>Valor (R$)</label>
            <input type="number" min="0.01" step="0.01" value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="150.00" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160, margin: 0 }}>
            <label>Descricao</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Sessao de 04/07, pacote mensal..." />
          </div>
          <button className="btn btn-p btn-sm" type="submit" disabled={creating || tokenReady === false}>
            {creating ? 'Gerando…' : '+ Nova cobranca'}
          </button>
        </form>

        {loading ? (
          <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>Carregando…</div>
        ) : charges.length ? charges.map(c => {
          const st = STATUS_STYLE[c.status] || STATUS_STYLE.pending
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--bdr)' }}>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.fg, fontWeight: 600, flexShrink: 0 }}>{st.label}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{c.description}</div>
                <div style={{ fontSize: 10.5, color: 'var(--txt2)' }}>
                  {fmtBRL(c.amount)} · {new Date(c.created_at).toLocaleDateString('pt-BR')}
                  {c.paid_at ? ` · pago em ${new Date(c.paid_at).toLocaleDateString('pt-BR')}` : ''}
                </div>
              </div>
              {c.payment_link && c.status === 'pending' && (
                <button className="btn btn-sm" onClick={() => copyLink(c)}>🔗 Copiar link</button>
              )}
            </div>
          )
        }) : (
          <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>Nenhuma cobranca gerada ainda.</div>
        )}
      </div>
    </div>
  )
}
