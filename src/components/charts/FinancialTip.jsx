import { brl } from '../../lib/format'

export default function FinancialTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="tv-tip">
      <div className="tv-tip-lbl">{label}</div>
      {payload.map((p) => (
        <div className="tv-tip-it" key={p.dataKey}>
          <span style={{color:p.color}}>■ {p.name}</span>
          <strong>{brl(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}
