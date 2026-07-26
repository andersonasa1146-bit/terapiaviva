// Exportacao financeira em CSV — formato universal que abre corretamente
// no Excel, Google Sheets e LibreOffice, sem depender de bibliotecas de
// terceiros para gerar .xlsx binario (evitando superficie de risco extra
// em dados financeiros sensiveis).

function csvEscape(v) {
  const s = String(v ?? '')
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(header, rows) {
  // BOM no inicio garante que acentos abram corretamente no Excel/Windows.
  return '﻿' + [header, ...rows].map((r) => r.map(csvEscape).join(';')).join('\r\n')
}

export function entriesToCsv(entries) {
  const header = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Status']
  const rows = entries.map((e) => [
    e.entry_date,
    e.kind === 'receita' ? 'Receita' : 'Despesa',
    e.category,
    e.description,
    Number(e.amount).toFixed(2).replace('.', ','),
    e.status,
  ])
  return toCsv(header, rows)
}

export function monthlySummaryToCsv(monthlySummary) {
  const header = ['Mês', 'Receita (R$)', 'Despesa (R$)', 'Líquido (R$)']
  const rows = monthlySummary.map((m) => [
    m.label,
    m.revenue.toFixed(2).replace('.', ','),
    m.expenses.toFixed(2).replace('.', ','),
    m.net.toFixed(2).replace('.', ','),
  ])
  return toCsv(header, rows)
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadCsv(filename, csvString) {
  triggerDownload(new Blob([csvString], { type: 'text/csv;charset=utf-8;' }), filename)
}
