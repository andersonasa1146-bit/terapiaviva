import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock do cliente Supabase — sem tocar em rede/banco real.
const getSession = vi.fn()
const rpc = vi.fn()
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: (...a) => getSession(...a) }, rpc: (...a) => rpc(...a) },
}))

import { chargePatient, setPatientMpToken, hasPatientMpToken } from './billing'

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://exemplo.supabase.co')
  global.fetch = vi.fn()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  getSession.mockReset()
  rpc.mockReset()
})

describe('chargePatient', () => {
  it('exige sessão autenticada', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(chargePatient('p1', 100, 'Sessão')).rejects.toThrow(/autenticada/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('chama a Edge Function com token e payload corretos', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, checkout_url: 'https://mp' }),
    })

    const res = await chargePatient('p1', 150, 'Sessão individual', 's9')

    expect(fetch).toHaveBeenCalledWith(
      'https://exemplo.supabase.co/functions/v1/charge-patient',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
      }),
    )
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      patient_id: 'p1',
      amount: 150,
      description: 'Sessão individual',
      session_id: 's9',
    })
    expect(res.checkout_url).toBe('https://mp')
  })

  it('propaga mensagem de erro da Edge Function', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
    fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Muitas requisicoes' }),
    })
    await expect(chargePatient('p1', 10, 'x')).rejects.toThrow('Muitas requisicoes')
  })

  it('gera erro genérico quando a resposta não tem corpo JSON', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json')
      },
    })
    await expect(chargePatient('p1', 10, 'x')).rejects.toThrow('Erro 500')
  })
})

describe('tokens Mercado Pago da terapeuta (RPCs)', () => {
  it('setPatientMpToken propaga erro do banco', async () => {
    rpc.mockResolvedValue({ error: new Error('rls') })
    await expect(setPatientMpToken('APP_USR-x')).rejects.toThrow('rls')
    expect(rpc).toHaveBeenCalledWith('set_patient_mp_token', { p_token: 'APP_USR-x' })
  })
  it('hasPatientMpToken converte resultado em booleano', async () => {
    rpc.mockResolvedValue({ data: 1, error: null })
    await expect(hasPatientMpToken()).resolves.toBe(true)
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(hasPatientMpToken()).resolves.toBe(false)
  })
})
