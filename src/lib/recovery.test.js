import { describe, it, expect, vi, beforeEach } from 'vitest'

const authApi = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  setSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
}))
vi.mock('./supabase', () => ({ supabase: { auth: authApi } }))

import {
  RESET_PATH,
  parseRecoveryParams,
  isRecoveryRedirect,
  requestPasswordReset,
  establishRecoverySession,
  updatePassword,
  translateAuthError,
} from './recovery'

beforeEach(() => Object.values(authApi).forEach((f) => f.mockReset()))

describe('parseRecoveryParams', () => {
  it('lê os tokens do #hash (fluxo implícito)', () => {
    expect(
      parseRecoveryParams('#access_token=AT&refresh_token=RT&type=recovery&expires_in=3600', ''),
    ).toEqual({ kind: 'tokens', accessToken: 'AT', refreshToken: 'RT' })
  })
  it('lê o ?code= (PKCE)', () => {
    expect(parseRecoveryParams('', '?code=abc')).toEqual({ kind: 'code', code: 'abc' })
  })
  it('lê o ?token_hash=', () => {
    expect(parseRecoveryParams('', '?token_hash=th&type=recovery')).toEqual({
      kind: 'token_hash',
      tokenHash: 'th',
    })
  })
  it('devolve o erro do link expirado', () => {
    expect(
      parseRecoveryParams(
        '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
        '',
      ),
    ).toEqual({ kind: 'error', error: 'Email link is invalid or has expired' })
  })
  it('sem parâmetros devolve none', () => {
    expect(parseRecoveryParams('', '')).toEqual({ kind: 'none' })
  })
})

describe('isRecoveryRedirect', () => {
  it('detecta link de recuperação', () => {
    expect(isRecoveryRedirect('#access_token=AT&refresh_token=RT&type=recovery')).toBe(true)
  })
  it('detecta link com erro', () => {
    expect(isRecoveryRedirect('#error=access_denied&error_code=otp_expired')).toBe(true)
  })
  it('ignora hash comum', () => {
    expect(isRecoveryRedirect('#secao-2')).toBe(false)
    expect(isRecoveryRedirect('')).toBe(false)
  })
})

describe('requestPasswordReset', () => {
  it('pede o e-mail com retorno para a tela de nova senha', async () => {
    authApi.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    await requestPasswordReset('  pessoa@exemplo.com ', 'https://app.exemplo.com')
    expect(authApi.resetPasswordForEmail).toHaveBeenCalledWith('pessoa@exemplo.com', {
      redirectTo: `https://app.exemplo.com${RESET_PATH}`,
    })
  })
  it('propaga erro da API', async () => {
    authApi.resetPasswordForEmail.mockResolvedValue({ data: null, error: new Error('boom') })
    await expect(requestPasswordReset('a@b.com', 'https://x')).rejects.toThrow('boom')
  })
})

describe('establishRecoverySession', () => {
  it('usa setSession para tokens', async () => {
    authApi.setSession.mockResolvedValue({ data: { session: { id: 's' } }, error: null })
    await expect(
      establishRecoverySession({ kind: 'tokens', accessToken: 'AT', refreshToken: 'RT' }),
    ).resolves.toEqual({ id: 's' })
    expect(authApi.setSession).toHaveBeenCalledWith({ access_token: 'AT', refresh_token: 'RT' })
  })
  it('usa exchangeCodeForSession para code', async () => {
    authApi.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null })
    await establishRecoverySession({ kind: 'code', code: 'c1' })
    expect(authApi.exchangeCodeForSession).toHaveBeenCalledWith('c1')
  })
  it('usa verifyOtp para token_hash', async () => {
    authApi.verifyOtp.mockResolvedValue({ data: { session: null }, error: null })
    await establishRecoverySession({ kind: 'token_hash', tokenHash: 'th' })
    expect(authApi.verifyOtp).toHaveBeenCalledWith({ token_hash: 'th', type: 'recovery' })
  })
  it('propaga erro da API', async () => {
    authApi.setSession.mockResolvedValue({ data: null, error: new Error('Invalid Refresh Token') })
    await expect(
      establishRecoverySession({ kind: 'tokens', accessToken: 'a', refreshToken: 'b' }),
    ).rejects.toThrow('Invalid Refresh Token')
  })
  it('recusa parâmetros vazios', async () => {
    await expect(establishRecoverySession({ kind: 'none' })).rejects.toThrow()
  })
})

describe('updatePassword', () => {
  it('atualiza a senha', async () => {
    authApi.updateUser.mockResolvedValue({ data: {}, error: null })
    await updatePassword('nova-senha-123')
    expect(authApi.updateUser).toHaveBeenCalledWith({ password: 'nova-senha-123' })
  })
  it('propaga erro da API', async () => {
    authApi.updateUser.mockResolvedValue({ data: null, error: new Error('boom') })
    await expect(updatePassword('x')).rejects.toThrow('boom')
  })
})

describe('translateAuthError', () => {
  it.each([
    ['New password should be different from the old password.', /diferente/],
    ['Password should be at least 6 characters.', /curta/],
    ['Password is known to be weak and easy to guess', /fraca/],
    ['For security purposes, you can only request this after 49 seconds.', /Aguarde/],
    ['Email rate limit exceeded', /Aguarde/],
    ['Email link is invalid or has expired', /expirou/],
    ['Invalid Refresh Token: Refresh Token Not Found', /expirou/],
    ['Unable to validate email address: invalid format', /e-mail/],
  ])('%s', (msg, expected) => {
    expect(translateAuthError(new Error(msg))).toMatch(expected)
  })
  it('traduz e-mail recusado pelo SMTP padrão', () => {
    expect(
      translateAuthError(
        Object.assign(new Error('Email address not authorized'), {
          code: 'email_address_not_authorized',
        }),
      ),
    ).toMatch(/administrador/)
  })
  it('traduz exigência de 2FA', () => {
    expect(
      translateAuthError(
        Object.assign(new Error('AAL2 session is required to update email or password'), {
          code: 'insufficient_aal',
        }),
      ),
    ).toMatch(/duas etapas/)
  })
  it('mantém mensagens desconhecidas', () => {
    expect(translateAuthError(new Error('Algo diferente'))).toBe('Algo diferente')
  })
  it('tem mensagem padrão', () => {
    expect(translateAuthError(null)).toMatch(/Tente novamente/)
  })
})
