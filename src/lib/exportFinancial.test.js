import { describe, it, expect } from 'vitest'
import { entriesToCsv, monthlySummaryToCsv } from './exportFinancial'

const entry = (over = {}) => ({
  entry_date: '2026-07-01',
  kind: 'receita',
  category: 'sessao',
  description: 'Sessão individual',
  amount: 150,
  status: 'pago',
  ...over,
})

describe('entriesToCsv', () => {
  it('começa com BOM para abrir acentuado no Excel', () => {
    expect(entriesToCsv([]).charCodeAt(0)).toBe(0xfeff)
  })
  it('gera cabeçalho e linha com valor em vírgula decimal', () => {
    const csv = entriesToCsv([entry()])
    const [header, row] = csv.replace('﻿', '').split('\r\n')
    expect(header).toBe('Data;Tipo;Categoria;Descrição;Valor;Status')
    expect(row).toBe('2026-07-01;Receita;sessao;Sessão individual;150,00;pago')
  })
  it('traduz kind despesa e escapa ponto e vírgula/aspas na descrição', () => {
    const csv = entriesToCsv([entry({ kind: 'despesa', description: 'Aluguel; sala "B"' })])
    const row = csv.split('\r\n')[1]
    expect(row).toContain('Despesa')
    expect(row).toContain('"Aluguel; sala ""B"""')
  })
  it('escapa quebras de linha dentro de campos', () => {
    const csv = entriesToCsv([entry({ description: 'linha1\nlinha2' })])
    expect(csv).toContain('"linha1\nlinha2"')
  })
})

describe('monthlySummaryToCsv', () => {
  it('gera resumo mensal com vírgula decimal', () => {
    const csv = monthlySummaryToCsv([
      { label: 'jul/26', revenue: 1000, expenses: 250.5, net: 749.5 },
    ])
    const [header, row] = csv.replace('﻿', '').split('\r\n')
    expect(header).toBe('Mês;Receita (R$);Despesa (R$);Líquido (R$)')
    expect(row).toBe('jul/26;1000,00;250,50;749,50')
  })
})
