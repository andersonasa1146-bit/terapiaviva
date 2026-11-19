import { supabase } from './supabase'

// Fluxo "Esqueci minha senha" (Supabase Auth).
//
// 1. Na tela de login, a pessoa informa o e-mail e o Supabase envia um link
//    de redefinicao (resetPasswordForEmail) que volta para RESET_PATH.
// 2. O link chega com os tokens da sessao de recuperacao no #hash (fluxo
//    implicito, padrao do supabase-js) — ou, conforme a configuracao do
//    projeto, como ?code= (PKCE) ou ?token_hash= (template de e-mail
//    customizado). Como o client usa `detectSessionInUrl: false`
//    (src/lib/supabase.js), a sessao e montada aqui, manualmente.
// 3. Com a sessao ativa, a pessoa define a nova senha (updateUser).
//
// Links enviados pelo painel do Supabase ("Send password recovery") caem no
// Site URL (raiz do app); App.jsx usa isRecoveryRedirect() para encaminhar
// esses casos para RESET_PATH sem perder o #hash.
//
// Configuracao necessaria no Supabase (Authentication -> URL Configuration):
//   Site URL      = endereco publico do app (ex.: https://app.seudominio.com)
//   Redirect URLs = https://app.seudominio.com/**

export const RESET_PATH = '/redefinir-senha'
export const MIN_PASSWORD_LENGTH = 8

export function parseRecoveryParams(hash = '', search = '') {
  const h = new URLSearchParams(String(hash).replace(/^#/, ''))
  const q = new URLSearchParams(String(search).replace(/^\?/, ''))
  const get = (key) => h.get(key) || q.get(key)

  const error = get('error_description') || get('error_code') || get('error')
  if (error) return { kind: 'error', error }

  const accessToken = h.get('access_token')
  const refreshToken = h.get('refresh_token')
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken }
  }

  const code = q.get('code')
  if (code) return { kind: 'code', code }

  const tokenHash = get('token_hash')
  if (tokenHash) return { kind: 'token_hash', tokenHash }

  return { kind: 'none' }
}

// true quando a URL atual veio de um link de recuperacao de senha (ou de um
// link de e-mail que falhou/expirou) e precisa ser tratada em RESET_PATH.
export function isRecoveryRedirect(hash = '') {
  const h = new URLSearchParams(String(hash).replace(/^#/, ''))
  return h.get('type') === 'recovery' || h.has('error_code')
}

export async function requestPasswordReset(email, origin = window.location.origin) {
  const { error } = await supabase.auth.resetPasswordForEmail(String(email).trim(), {
    redirectTo: `${origin}${RESET_PATH}`,
  })
  if (error) throw error
}

export async function establishRecoverySession(params) {
  let result
  if (params.kind === 'tokens') {
    result = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    })
  } else if (params.kind === 'code') {
    result = await supabase.auth.exchangeCodeForSession(params.code)
  } else if (params.kind === 'token_hash') {
    result = await supabase.auth.verifyOtp({ token_hash: params.tokenHash, type: 'recovery' })
  } else {
    throw new Error('Link de recuperacao invalido')
  }
  if (result.error) throw result.error
  return result.data?.session ?? null
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

export function translateAuthError(err) {
  const msg = String(err?.message || err || '')
  const code = String(err?.code || '')
  // SMTP padrao do Supabase so entrega para e-mails da equipe do projeto.
  if (code === 'email_address_not_authorized' || /address not authorized/i.test(msg)) {
    return 'Não foi possível enviar o e-mail para este endereço agora. Fale com o administrador do TerapiaViva.'
  }
  if (code === 'insufficient_aal' || /aal2/i.test(msg)) {
    return 'Confirme a verificação em duas etapas antes de trocar a senha.'
  }
  if (/different from the old password/i.test(msg)) {
    return 'A nova senha precisa ser diferente da senha atual.'
  }
  if (/at least \d+ characters|password is too short/i.test(msg)) {
    return 'A senha é curta demais. Use pelo menos 8 caracteres.'
  }
  if (/weak|pwned|easy to guess/i.test(msg)) {
    return 'Essa senha é fraca ou já apareceu em vazamentos de dados. Escolha outra.'
  }
  if (/rate limit|too many|only request this after/i.test(msg)) {
    return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'
  }
  if (/validate email|invalid format/i.test(msg)) {
    return 'Confira o e-mail digitado.'
  }
  if (
    /expired|access_denied|link is invalid|invalid (refresh |jwt|token|grant|flow)|session missing|recuperacao invalido/i.test(
      msg,
    )
  ) {
    return 'Este link é inválido ou já expirou. Peça um novo link.'
  }
  return msg || 'Não foi possível concluir. Tente novamente.'
}
