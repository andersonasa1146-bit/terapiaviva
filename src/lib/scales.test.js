import { describe, it, expect } from 'vitest'
import { SCALES, SCALE_OPTIONS, scoreScale } from './scales'

describe('definições das escalas', () => {
  it('PHQ-9 tem 9 perguntas e score máximo 27', () => {
    expect(SCALES.phq9.questions).toHaveLength(9)
    expect(SCALES.phq9.maxScore).toBe(27)
  })
  it('GAD-7 tem 7 perguntas e score máximo 21', () => {
    expect(SCALES.gad7.questions).toHaveLength(7)
    expect(SCALES.gad7.maxScore).toBe(21)
  })
  it('opções de resposta vão de 0 a 3', () => {
    expect(SCALE_OPTIONS.map((o) => o.v)).toEqual([0, 1, 2, 3])
  })
})

describe('scoreScale — PHQ-9', () => {
  it('soma as respostas e classifica severidade minima', () => {
    const r = scoreScale('phq9', [0, 0, 1, 0, 0, 0, 0, 0, 0])
    expect(r.total).toBe(1)
    expect(r.severity).toBe('Minima')
    expect(r.riskFlag).toBe(false)
  })
  it('classifica todas as faixas de severidade nos limites', () => {
    const sev = (t) => SCALES.phq9.severity(t)
    expect(sev(4)).toBe('Minima')
    expect(sev(5)).toBe('Leve')
    expect(sev(9)).toBe('Leve')
    expect(sev(10)).toBe('Moderada')
    expect(sev(14)).toBe('Moderada')
    expect(sev(15)).toBe('Moderadamente severa')
    expect(sev(19)).toBe('Moderadamente severa')
    expect(sev(20)).toBe('Severa')
    expect(sev(27)).toBe('Severa')
  })
  it('sinaliza risco quando o item 9 (ideação) é maior que zero', () => {
    const answers = [0, 0, 0, 0, 0, 0, 0, 0, 1]
    expect(scoreScale('phq9', answers).riskFlag).toBe(true)
  })
  it('trata respostas invalidas como zero', () => {
    const r = scoreScale('phq9', [null, undefined, 'x', 2, 0, 0, 0, 0, 0])
    expect(r.total).toBe(2)
  })
})

describe('scoreScale — GAD-7', () => {
  it('classifica todas as faixas nos limites', () => {
    const sev = (t) => SCALES.gad7.severity(t)
    expect(sev(4)).toBe('Minima')
    expect(sev(5)).toBe('Leve')
    expect(sev(10)).toBe('Moderada')
    expect(sev(15)).toBe('Severa')
    expect(sev(21)).toBe('Severa')
  })
  it('nunca sinaliza risco (não tem item de ideação)', () => {
    expect(scoreScale('gad7', [3, 3, 3, 3, 3, 3, 3]).riskFlag).toBe(false)
  })
})
