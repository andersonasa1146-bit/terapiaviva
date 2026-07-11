import { describe, it, expect } from 'vitest'
import { brl, monthLabel, initials, today, monthKey } from './format'

describe('brl', () => {
  it('formata numero como moeda brasileira', () => {
    expect(brl(1500.5)).toContain('1.500,50')
  })
  it('trata valores invalidos como zero', () => {
    expect(brl(undefined)).toBe(brl(0))
    expect(brl(null)).toBe(brl(0))
    expect(brl('abc')).toBe(brl(0))
  })
})

describe('initials', () => {
  it('pega as duas primeiras iniciais do nome', () => {
    expect(initials('Maria das Gracas Silva')).toBe('MD')
    expect(initials('Joao')).toBe('J')
  })
  it('retorna ?? para nome vazio', () => {
    expect(initials('')).toBe('??')
    expect(initials()).toBe('??')
  })
})

describe('monthLabel', () => {
  it('retorna abreviacao do mes em pt-BR sem ponto', () => {
    const label = monthLabel('2026-01-15')
    expect(label).not.toContain('.')
    expect(label.length).toBeGreaterThan(0)
  })
})

describe('today', () => {
  it('retorna data no formato YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('monthKey', () => {
  it('retorna YYYY-MM', () => {
    expect(monthKey(new Date('2026-03-10T00:00:00Z'))).toBe('2026-03')
  })
})
