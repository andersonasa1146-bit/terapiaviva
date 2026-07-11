import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart,
  Line, Bar, Area, CartesianGrid, XAxis, YAxis, Legend, Tooltip,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { brl, monthLabel } from '../lib/format'
import FinancialTip from '../components/charts/FinancialTip'
import { useToast } from '../components/Toast'
import { PROSPECCAO, FORMACAO } from '../data/growthIdeas'
import { entriesToCsv, monthlySummaryToCsv, downloadCsv } from '../lib/exportFinancial'

// -----------------------------------------------------------------------------
// Helpers de dados
// -----------------------------------------------------------------------------

function buildMonthlySeries(rows) {
  // Recebe rows da view v_financial_monthly (2 anos) e devolve:
  //  - series de 12 meses do ano atual com comparacao YoY
  const map = {}
  rows.forEach((r) => { map[r.month.slice(0, 7)] = r })

  const out = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = d.toISOString().slice(0, 7)
    const prev = new Date(d.getFullYear() - 1, d.getMonth(), 1).toISOString().slice(0, 7)
    const cur = map[key]
    const yoy = map[prev]
    out.push({
      key,
      label: monthLabel(d.toISOString()),
      revenue: Number(cur?.revenue ?? 0),
      expenses: Number(cur?.expenses ?? 0),
      net: Number(cur?.net ?? 0),
      revenue_prev: Number(yoy?.revenue ?? 0),
      net_prev: Number(yoy?.net ?? 0),
    })
  }
  return out
}

function defaultRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
  const to = now.toISOString().slice(0, 10)
  return { from, to }
}

// -----------------------------------------------------------------------------
export default function Financial() {
  const { session, ownerId, hasFinancialAccess } = useAuth()
  const { toast } = useToast()
  const [monthly, setMonthly] = useState([])
  const [byCat, setByCat] = useState([])
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState({ kind: 'receita', category: 'sessao', description: '', amount: '', entry_date: new Date().toISOString().slice(0,10), status: 'pago' })
  const [range, setRange] = useState(defaultRange())
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!session?.user || !ownerId || !hasFinancialAccess) return
    const uid = ownerId
    Promise.all([
      supabase.from('v_financial_monthly').select('*').eq('therapist_id', uid).order('month'),
      supabase.from('v_financial_by_category').select('*').eq('therapist_id', uid),
      supabase.from('financial_entries').select('*').eq('therapist_id', uid).order('entry_date', {ascending:false}).limit(20),
    ]).then(([m, c, e]) => {
      setMonthly(m.data ?? [])
      setByCat(c.data ?? [])
      setEntries(e.data ?? [])
    })
  }, [session, ownerId, hasFinancialAccess])

  const series = useMemo(() => buildMonthlySeries(monthly), [monthly])

  // KPIs do mes vigente
  const kpis = useMemo(() => {
    const now = series[series.length - 1] || {}
    const prev = series[series.length - 2] || {}
    const yoy = now.revenue_prev || 0
    return {
      revenue_month: now.revenue || 0,
      expenses_month: now.expenses || 0,
      net_month: now.net || 0,
      yoy_delta_pct: yoy ? ((now.revenue - yoy) / yoy) * 100 : 0,
      mom_delta_pct: prev.revenue ? ((now.revenue - prev.revenue) / prev.revenue) * 100 : 0,
      revenue_12m: series.reduce((s, r) => s + (r.revenue || 0), 0),
      expenses_12m: series.reduce((s, r) => s + (r.expenses || 0), 0),
    }
  }, [series])

  // Composicao por categoria (receita/despesa)
  const catData = useMemo(() => {
    const agg = {}
    byCat.forEach((r) => {
      const key = r.category
      agg[key] = agg[key] || { name: key, receita: 0, despesa: 0 }
      agg[key][r.kind === 'receita' ? 'receita' : 'despesa'] += Number(r.total)
    })
    return Object.values(agg).sort((a, b) => (b.receita + b.despesa) - (a.receita + a.despesa))
  }, [byCat])

  async function addEntry(e) {
    e.preventDefault()
    if (!form.description || !form.amount) return
    if (Number(form.amount) <= 0) { toast.error('Informe um valor maior que zero.'); return }
    const { error } = await supabase.from('financial_entries').insert({
      therapist_id: ownerId,
      kind: form.kind, category: form.category, description: form.description,
      amount: Number(form.amount), entry_date: form.entry_date, status: form.status,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Lancamento salvo.')
    setForm({ ...form, description: '', amount: '' })
    // refresh
    const uid = ownerId
    const [m, c, l] = await Promise.all([
      supabase.from('v_financial_monthly').select('*').eq('therapist_id', uid).order('month'),
      supabase.from('v_financial_by_category').select('*').eq('therapist_id', uid),
      supabase.from('financial_entries').select('*').eq('therapist_id', uid).order('entry_date', {ascending:false}).limit(20),
    ])
    setMonthly(m.data ?? []); setByCat(c.data ?? []); setEntries(l.data ?? [])
  }

  async function exportEntriesCsv() {
    setExporting(true)
    const { data, error } = await supabase.from('financial_entries')
      .select('*').eq('therapist_id', ownerId)
      .gte('entry_date', range.from).lte('entry_date', range.to)
      .order('entry_date', { ascending: true })
    setExporting(false)
    if (error) { toast.error(error.message); return }
    if (!data?.length) { toast.error('Nenhum lancamento no periodo selecionado.'); return }
    downloadCsv(`lancamentos-financeiros_${range.from}_a_${range.to}.csv`, entriesToCsv(data))
    toast.success(`${data.length} lancamento(s) exportado(s).`)
  }

  function exportMonthlySummaryCsv() {
    if (!series.length) { toast.error('Sem dados mensais para exportar.'); return }
    downloadCsv(`resumo-mensal_${series[0].key}_a_${series[series.length-1].key}.csv`, monthlySummaryToCsv(series))
    toast.success('Resumo mensal exportado.')
  }

  if (!hasFinancialAccess) {
    return (
      <div style={{padding:14}}>
        <div className="card"><div className="cbdy" style={{padding:'22px 16px',textAlign:'center',fontSize:12.5,color:'var(--txt2)'}}>
          Seu papel na equipe nao tem acesso aos dados financeiros da clinica.
        </div></div>
      </div>
    )
  }

  return (
    <div style={{padding:14}}>
      <div style={{marginBottom:12}}>
        <h2 style={{fontSize:15,fontWeight:600}}>💰 Gestao Financeira</h2>
        <p style={{fontSize:11,color:'var(--txt2)'}}>Comparativo 12 meses com YoY (year-over-year), composicao por categoria e ideias de crescimento.</p>
      </div>

      {/* ---------- KPIs do mes ---------- */}
      <div className="stats stats-4">
        <div className="sc">
          <div className="sl">Receita do mes</div>
          <div className="sv" style={{color:'#27500A'}}>{brl(kpis.revenue_month)}</div>
          <div className="ss">
            {kpis.mom_delta_pct >= 0 ? '📈' : '📉'} {kpis.mom_delta_pct.toFixed(1)}% vs mes anterior
          </div>
        </div>
        <div className="sc">
          <div className="sl">Despesas do mes</div>
          <div className="sv" style={{color:'var(--red)'}}>{brl(kpis.expenses_month)}</div>
          <div className="ss">Fluxo controlado</div>
        </div>
        <div className="sc">
          <div className="sl">Liquido</div>
          <div className="sv" style={{color:'var(--p)'}}>{brl(kpis.net_month)}</div>
          <div className="ss">Margem: {kpis.revenue_month ? ((kpis.net_month/kpis.revenue_month)*100).toFixed(0) : 0}%</div>
        </div>
        <div className="sc">
          <div className="sl">Comparativo YoY</div>
          <div className="sv" style={{color: kpis.yoy_delta_pct>=0?'var(--p)':'var(--red)'}}>{kpis.yoy_delta_pct>=0?'+':''}{kpis.yoy_delta_pct.toFixed(1)}%</div>
          <div className="ss">vs mesmo mes ano passado</div>
        </div>
      </div>

      {/* ---------- Grafico principal: Receita x Despesa x YoY ---------- */}
      <div className="card" style={{margin:'12px 0'}}>
        <div className="chdr">
          <span>📊 12 meses — Receita, Despesa e Comparativo com Ano Anterior</span>
          <span style={{fontSize:10,color:'var(--txt3)'}}>Total 12M: {brl(kpis.revenue_12m)}</span>
        </div>
        <div className="cbdy" style={{padding:'12px 8px 6px'}}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={series} margin={{top:8,right:16,left:-8,bottom:0}}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1D9E75" stopOpacity={0.35}/>
                  <stop offset="100%" stopColor="#1D9E75" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#DDE8E5" />
              <XAxis dataKey="label" tick={{fontSize:11,fill:'#556866'}} />
              <YAxis tick={{fontSize:11,fill:'#556866'}} tickFormatter={(v)=>`R$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<FinancialTip />} />
              <Legend wrapperStyle={{fontSize:11}} iconType="circle" />
              <Area type="monotone" dataKey="revenue" name="Receita" stroke="#1D9E75" strokeWidth={2} fill="url(#gRev)" />
              <Bar dataKey="expenses" name="Despesa" fill="#A32D2D" opacity={0.75} radius={[4,4,0,0]} barSize={16} />
              <Line type="monotone" dataKey="revenue_prev" name="Receita ano anterior" stroke="#534AB7" strokeDasharray="5 5" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ---------- Grafico Liquido comparado ---------- */}
      <div className="cgrid" style={{margin:'0 0 12px', gridTemplateColumns:'1fr 1fr'}}>
        <div className="card">
          <div className="chdr">📈 Liquido — este ano vs ano anterior</div>
          <div className="cbdy" style={{padding:'12px 8px 6px'}}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={series} margin={{top:8,right:16,left:-8,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DDE8E5" />
                <XAxis dataKey="label" tick={{fontSize:11,fill:'#556866'}} />
                <YAxis tick={{fontSize:11,fill:'#556866'}} tickFormatter={(v)=>`R$${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<FinancialTip />} />
                <Legend wrapperStyle={{fontSize:11}} iconType="circle" />
                <Line type="monotone" dataKey="net" name="Liquido atual" stroke="#1D9E75" strokeWidth={2.5} dot={{r:3}} />
                <Line type="monotone" dataKey="net_prev" name="Liquido ano anterior" stroke="#8FA8A5" strokeDasharray="5 5" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="chdr">🎯 Composicao por categoria (12 meses)</div>
          <div className="cbdy" style={{padding:'12px 8px 6px'}}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={catData} layout="vertical" margin={{top:4,right:16,left:20,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DDE8E5" />
                <XAxis type="number" tick={{fontSize:11,fill:'#556866'}} tickFormatter={(v)=>`R$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:'#556866'}} width={90} />
                <Tooltip content={<FinancialTip />} />
                <Legend wrapperStyle={{fontSize:11}} iconType="circle" />
                <Bar dataKey="receita" name="Receita" fill="#1D9E75" radius={[0,4,4,0]} />
                <Bar dataKey="despesa" name="Despesa" fill="#A32D2D" radius={[0,4,4,0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ---------- Exportacao ---------- */}
      <div className="card" style={{marginBottom:12}}>
        <div className="chdr">📤 Exportar dados financeiros</div>
        <div className="cbdy">
          <div style={{display:'flex',alignItems:'flex-end',gap:10,flexWrap:'wrap',marginBottom:10}}>
            <div className="field" style={{marginBottom:0}}><label>De</label><input type="date" value={range.from} onChange={e=>setRange({...range,from:e.target.value})} /></div>
            <div className="field" style={{marginBottom:0}}><label>Ate</label><input type="date" value={range.to} onChange={e=>setRange({...range,to:e.target.value})} /></div>
            <button className="btn btn-p btn-sm" onClick={exportEntriesCsv} disabled={exporting}>
              {exporting ? 'Exportando…' : '⬇ Exportar lancamentos (CSV)'}
            </button>
            <button className="btn btn-sm" onClick={exportMonthlySummaryCsv}>⬇ Exportar resumo mensal (CSV)</button>
          </div>
          <p style={{fontSize:11,color:'var(--txt2)'}}>Os arquivos CSV abrem diretamente no Excel, Google Sheets ou LibreOffice.</p>
          <div className="callout clwrn" style={{marginTop:10}}>
            <strong>Nota fiscal eletronica (NF-e/NFS-e)</strong>
            A emissao de nota fiscal exige integracao com um provedor fiscal (ex.: Focus NFe, eNotas, NFe.io),
            certificado digital e dados tributarios (CNPJ, regime, municipio) proprios de cada terapeuta —
            por isso nao esta incluida automaticamente. Quando tiver esses dados, e possivel integrar um desses
            provedores via uma nova Edge Function, seguindo o mesmo padrao usado para Mercado Pago.
          </div>
        </div>
      </div>

      {/* ---------- Novo lancamento + tabela recente ---------- */}
      <div className="cgrid" style={{margin:'0 0 12px', gridTemplateColumns:'1fr 1.4fr'}}>
        <div className="card">
          <div className="chdr">➕ Novo lancamento</div>
          <div className="cbdy">
            <form onSubmit={addEntry}>
              <div className="field">
                <label>Tipo</label>
                <select value={form.kind} onChange={(e)=>setForm({...form, kind:e.target.value, category: e.target.value==='receita'?'sessao':'aluguel'})}>
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                </select>
              </div>
              <div className="field">
                <label>Categoria</label>
                <select value={form.category} onChange={(e)=>setForm({...form, category:e.target.value})}>
                  {form.kind==='receita' ? (
                    <>
                      <option value="sessao">Sessao</option>
                      <option value="pacote">Pacote</option>
                      <option value="workshop">Workshop</option>
                      <option value="palestra">Palestra</option>
                      <option value="outros">Outros</option>
                    </>
                  ) : (
                    <>
                      <option value="aluguel">Aluguel</option>
                      <option value="plataforma">Plataforma</option>
                      <option value="marketing">Marketing</option>
                      <option value="formacao">Formacao</option>
                      <option value="material">Material</option>
                      <option value="impostos">Impostos</option>
                      <option value="outros">Outros</option>
                    </>
                  )}
                </select>
              </div>
              <div className="field">
                <label>Descricao</label>
                <input value={form.description} onChange={(e)=>setForm({...form, description:e.target.value})} placeholder="Ex.: Sessao Maria das Gracas" required />
              </div>
              <div className="field">
                <label>Valor (R$)</label>
                <input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e)=>setForm({...form, amount:e.target.value})} required />
              </div>
              <div className="field">
                <label>Data</label>
                <input type="date" value={form.entry_date} onChange={(e)=>setForm({...form, entry_date:e.target.value})} />
              </div>
              <button className="btn btn-p" type="submit" style={{width:'100%',marginTop:6}}>Salvar lancamento</button>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="chdr">📒 Ultimos lancamentos</div>
          <div className="cbdy" style={{padding:'2px 13px'}}>
            {entries.length ? entries.map((m) => (
              <div key={m.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--bdr)'}}>
                <div>
                  <div style={{fontSize:12,fontWeight:500}}>{m.description}</div>
                  <div style={{fontSize:10,color:'var(--txt2)'}}>{new Date(m.entry_date).toLocaleDateString('pt-BR')} · {m.category} · {m.status}</div>
                </div>
                <span style={{fontSize:13,fontWeight:600,color: m.kind==='receita' ? '#27500A' : 'var(--red)'}}>
                  {m.kind==='receita' ? '+ ' : '- '}{brl(m.amount)}
                </span>
              </div>
            )) : <div style={{padding:'14px 0',textAlign:'center',fontSize:12,color:'var(--txt3)'}}>Nenhum lancamento — comece pelo formulario ao lado.</div>}
          </div>
        </div>
      </div>

      {/* ---------- BLOCO: Ideias de prospeccao e aperfeicoamento ---------- */}
      <div className="card" style={{marginBottom:14}}>
        <div className="chdr" style={{background:'linear-gradient(90deg, var(--pl), var(--tl))'}}>
          <span>🚀 Crescimento — Prospeccao de clientes e aperfeicoamento profissional</span>
        </div>
        <div className="cbdy">
          <div className="prosp-grid">
            <div className="prosp-card">
              <h3>🌱 Prospeccao de clientes</h3>
              <ul>
                {PROSPECCAO.map((it, i) => (
                  <li key={i}>
                    <strong><span className={`prosp-tag ${it.tag==='REDES'||it.tag==='DIGITAL'?'t':''}${it.tag==='RETENCAO'||it.tag==='PRODUTO'||it.tag==='CRM'?'a':''}`}>{it.tag}</span>{it.title}</strong>
                    {it.desc}
                  </li>
                ))}
              </ul>
            </div>
            <div className="prosp-card">
              <h3>🎓 Aperfeicoamento profissional</h3>
              <ul>
                {FORMACAO.map((it, i) => (
                  <li key={i}>
                    <strong><span className={`prosp-tag ${it.tag==='CURSO'?'':it.tag==='LIVRO'?'t':'a'}`}>{it.tag}</span>{it.title}</strong>
                    {it.desc}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="callout clprv" style={{marginTop:14}}>
            <strong>💡 Metas de crescimento sugeridas para 90 dias</strong>
            1) Publicar 24 conteudos (Reels/Blog) · 2) Fechar 2 parcerias locais · 3) Lancar 1 workshop pago ·
            4) Iniciar 1 curso de aperfeicoamento · 5) Reativar 10 ex-pacientes por WhatsApp ·
            6) Alcancar +25% de receita YoY no proximo trimestre.
          </div>
        </div>
      </div>
    </div>
  )
}
