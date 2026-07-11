import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { getPlatformStats, listAccounts, setMrrPrice, PLAN_LABEL, SUB_STATUS_LABEL } from '../lib/admin'

function fmtBRL(n) {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const PLAN_STYLE = {
  trial: { bg: '#EEF3F2', fg: '#33403E' },
  profissional: { bg: '#E1F5EE', fg: '#0B5E44' },
  cancelado: { bg: '#FBE4E4', fg: '#A32D2D' },
}

export default function AdminPanel() {
  const { session, isPlatformAdmin } = useAuth()
  const { toast } = useToast()
  const [stats, setStats] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [priceInput, setPriceInput] = useState('')
  const [savingPrice, setSavingPrice] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [s, a] = await Promise.all([getPlatformStats(), listAccounts()])
      setStats(s)
      setAccounts(a)
      setPriceInput(String(s?.mrr_price_brl ?? '97.00'))
    } catch (e) {
      toast.error(e.message || 'Falha ao carregar dados do painel')
    }
    setLoading(false)
  }

  useEffect(() => { if (session?.user && isPlatformAdmin) load() }, [session, isPlatformAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const savePrice = async (e) => {
    e.preventDefault()
    const price = Number(priceInput)
    if (!price || price <= 0) { toast.error('Informe um valor valido.'); return }
    setSavingPrice(true)
    try {
      await setMrrPrice(price)
      toast.success('Preco de referencia atualizado.')
      await load()
    } catch (err) {
      toast.error(err.message)
    }
    setSavingPrice(false)
  }

  if (!isPlatformAdmin) {
    return (
      <div style={{ padding: 14 }}>
        <div className="card"><div className="cbdy" style={{ padding: '22px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--txt2)' }}>
          Este painel e restrito ao operador da plataforma TerapiaViva.
        </div></div>
      </div>
    )
  }

  return (
    <div style={{ padding: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>🛠 Painel administrativo</h2>
        <p style={{ fontSize: 11, color: 'var(--txt2)' }}>
          Visao agregada de todas as contas/clinicas cadastradas nesta instalacao — uso, planos e receita
          recorrente estimada. Visivel apenas para o operador da plataforma.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>Carregando…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Contas/clinicas', value: stats?.total_accounts ?? 0 },
              { label: 'Assinaturas ativas', value: stats?.active_subscriptions ?? 0 },
              { label: 'Em trial', value: stats?.trial_accounts ?? 0 },
              { label: 'Canceladas', value: stats?.cancelled_accounts ?? 0 },
              { label: 'Pacientes cadastrados', value: stats?.total_patients ?? 0 },
              { label: 'Chamadas de IA (mes)', value: stats?.total_ai_calls_this_month ?? 0 },
              { label: 'MRR estimado', value: fmtBRL(stats?.mrr_estimate) },
            ].map((k) => (
              <div key={k.label} className="card">
                <div className="cbdy" style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--txt2)', marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--pd)' }}>{k.value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chdr">💵 Preco de referencia para o calculo de MRR</div>
            <div className="cbdy" style={{ padding: '10px 13px' }}>
              <p style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 10 }}>
                Usado apenas para estimar a receita recorrente acima (numero de assinaturas ativas x este valor).
                Nao altera a cobranca real, que e configurada via <code>MP_PLAN_PRICE</code> nas secrets do Supabase.
              </p>
              <form onSubmit={savePrice} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="field" style={{ maxWidth: 140, margin: 0 }}>
                  <label>Valor mensal (R$)</label>
                  <input type="number" min="0.01" step="0.01" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} />
                </div>
                <button className="btn btn-p btn-sm" type="submit" disabled={savingPrice}>
                  {savingPrice ? 'Salvando…' : 'Salvar'}
                </button>
              </form>
            </div>
          </div>

          <div className="card">
            <div className="chdr">👥 Contas cadastradas ({accounts.length})</div>
            <div className="cbdy" style={{ padding: '4px 13px' }}>
              {accounts.length ? accounts.map((a) => {
                const planSt = PLAN_STYLE[a.plan] || PLAN_STYLE.trial
                return (
                  <div key={a.owner_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--bdr)', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.full_name || '—'}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--txt2)' }}>{a.email}</div>
                    </div>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: planSt.bg, color: planSt.fg, fontWeight: 600 }}>
                      {PLAN_LABEL[a.plan] || a.plan || 'trial'}
                    </span>
                    {a.mp_subscription_status && (
                      <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{SUB_STATUS_LABEL[a.mp_subscription_status] || a.mp_subscription_status}</span>
                    )}
                    <span style={{ fontSize: 10.5, color: 'var(--txt2)' }}>IA: {a.ai_calls_this_month}/{a.plan_ai_limit}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--txt2)' }}>{a.team_size} pessoa(s)</span>
                    <span style={{ fontSize: 10.5, color: 'var(--txt2)' }}>{a.patient_count} pacientes</span>
                    <span style={{ fontSize: 10, color: 'var(--txt3)' }}>desde {new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                )
              }) : (
                <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>Nenhuma conta encontrada.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
