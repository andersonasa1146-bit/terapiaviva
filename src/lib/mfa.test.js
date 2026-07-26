import { describe, it, expect, vi, beforeEach } from 'vitest'

const mfaApi = vi.hoisted(() => ({
  listFactors: vi.fn(),
  enroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  unenroll: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
}))
vi.mock('./supabase', () => ({ supabase: { auth: { mfa: mfaApi } } }))

import { listFactors, verifyEnrollment, challengeAndVerify, getAssuranceLevel } from './mfa'

beforeEach(() => Object.values(mfaApi).forEach((f) => f.mockReset()))

describe('listFactors', () => {
  it('retorna apenas fatores TOTP', async () => {
    mfaApi.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1' }] }, error: null })
    await expect(listFactors()).resolves.toEqual([{ id: 'f1' }])
  })
  it('retorna lista vazia quando não há fatores', async () => {
    mfaApi.listFactors.mockResolvedValue({ data: {}, error: null })
    await expect(listFactors()).resolves.toEqual([])
  })
  it('propaga erro da API', async () => {
    mfaApi.listFactors.mockResolvedValue({ data: null, error: new Error('boom') })
    await expect(listFactors()).rejects.toThrow('boom')
  })
})

describe('verifyEnrollment', () => {
  it('cria challenge e verifica o código na sequência', async () => {
    mfaApi.challenge.mockResolvedValue({ data: { id: 'ch1' }, error: null })
    mfaApi.verify.mockResolvedValue({ error: null })
    await verifyEnrollment('f1', '123456')
    expect(mfaApi.challenge).toHaveBeenCalledWith({ factorId: 'f1' })
    expect(mfaApi.verify).toHaveBeenCalledWith({
      factorId: 'f1',
      challengeId: 'ch1',
      code: '123456',
    })
  })
  it('interrompe se o challenge falhar (verify não é chamado)', async () => {
    mfaApi.challenge.mockResolvedValue({ data: null, error: new Error('challenge falhou') })
    await expect(verifyEnrollment('f1', '000000')).rejects.toThrow('challenge falhou')
    expect(mfaApi.verify).not.toHaveBeenCalled()
  })
  it('propaga código TOTP inválido', async () => {
    mfaApi.challenge.mockResolvedValue({ data: { id: 'ch1' }, error: null })
    mfaApi.verify.mockResolvedValue({ error: new Error('Invalid TOTP code') })
    await expect(verifyEnrollment('f1', '999999')).rejects.toThrow('Invalid TOTP code')
  })
})

describe('challengeAndVerify / getAssuranceLevel', () => {
  it('eleva a sessão após código correto', async () => {
    mfaApi.challenge.mockResolvedValue({ data: { id: 'ch2' }, error: null })
    mfaApi.verify.mockResolvedValue({ error: null })
    await challengeAndVerify('f1', '654321')
    expect(mfaApi.verify).toHaveBeenCalledWith({
      factorId: 'f1',
      challengeId: 'ch2',
      code: '654321',
    })
  })
  it('expõe o nível de garantia atual', async () => {
    mfaApi.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    })
    await expect(getAssuranceLevel()).resolves.toEqual({ currentLevel: 'aal1', nextLevel: 'aal2' })
  })
})
