export const brl = (v) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const monthLabel = (dateStr) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
}

export const monthYear = (dateStr) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

export const today = () => new Date().toISOString().slice(0, 10)

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || '??'

export const monthKey = (d) => d.toISOString().slice(0, 7)  // YYYY-MM
