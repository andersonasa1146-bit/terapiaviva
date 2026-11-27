import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from './supabase'
import {
  TRIAL_DAYS,
  getMyAccessStatus,
  isBlocked,
  daysLabel,
  describeAccess,
  canSubscribe,
  trialBanner,
} from './access'

const until = '2027-01-11T12:00:00Z'

describe('access', () => {
  it('teste grátis é de 45 dias', () => {
    expect(TRIAL_DAYS).toBe(45)
  })

  it('status desconhecido não bloqueia (fail-open)', () => {
    expect(isBlocked(null)).toBe(false)
    expect(isBlocked(undefined)).toBe(false)
    expect(isBlocked({ has_access: true })).toBe(false)
    expect(isBlocked({ has_access: false })).toBe(true)
  })

  it('getMyAccessStatus devolve null quando a função não existe no banco', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'function not found' } })
    expect(await getMyAccessStatus()).toBeNull()
    supabase.rpc.mockRejectedValueOnce(new Error('offline'))
    expect(await getMyAccessStatus()).toBeNull()
    supabase.rpc.mockResolvedValueOnce({ data: { has_access: true, status: 'teste' }, error: null })
    expect(await getMyAccessStatus()).toEqual({ has_access: true, status: 'teste' })
  })

  it('daysLabel', () => {
    expect(daysLabel(45)).toBe('45 dias')
    expect(daysLabel(1)).toBe('1 dia')
    expect(daysLabel(0)).toBe('último dia')
    expect(daysLabel(-3)).toBe('último dia')
  })

  it('describeAccess cobre todos os estados', () => {
    expect(describeAccess({ status: 'teste', days_left: 12, trial_ends_at: until }).detail).toMatch(
      /^Faltam 12 dias — até \d{2}\/\d{2}\/2027$/,
    )
    expect(describeAccess({ status: 'teste', days_left: 0, trial_ends_at: until }).detail).toMatch(
      /^Último dia do teste/,
    )
    expect(describeAccess({ status: 'teste_encerrado', trial_ends_at: until }).label).toBe(
      'Teste encerrado',
    )
    expect(describeAccess({ status: 'cortesia' }).label).toBe('Cortesia')
    expect(describeAccess({ status: 'assinante' }).detail).toMatch(/Mercado Pago/)
    expect(describeAccess({ status: 'cancelado' }).label).toBe('Assinatura cancelada')
    expect(describeAccess(null).label).toBe('Período de teste')
  })

  it('botão Assinar só aparece para quem pode assinar', () => {
    expect(canSubscribe({ status: 'teste' })).toBe(true)
    expect(canSubscribe({ status: 'teste_encerrado' })).toBe(true)
    expect(canSubscribe({ status: 'cancelado' })).toBe(true)
    expect(canSubscribe({ status: 'cortesia' })).toBe(false)
    expect(canSubscribe({ status: 'assinante' })).toBe(false)
  })

  it('aviso de teste só para a proprietária e destacado na última semana', () => {
    expect(trialBanner({ status: 'teste', is_owner: false, days_left: 3 })).toBeNull()
    expect(trialBanner({ status: 'cortesia', is_owner: true })).toBeNull()
    expect(
      trialBanner({ status: 'teste', is_owner: true, days_left: 30, trial_ends_at: until }).urgent,
    ).toBe(false)
    expect(
      trialBanner({ status: 'teste', is_owner: true, days_left: 7, trial_ends_at: until }).urgent,
    ).toBe(true)
    expect(
      trialBanner({ status: 'teste', is_owner: true, days_left: 0, trial_ends_at: until }).text,
    ).toMatch(/último dia/)
  })
})
