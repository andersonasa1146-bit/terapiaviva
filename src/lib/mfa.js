import { supabase } from './supabase'

// Task #30: Autenticacao de dois fatores (2FA / TOTP), usando a API nativa
// do Supabase Auth (supabase.auth.mfa.*). Nao depende de nenhuma Edge
// Function ou segredo adicional — o segredo TOTP e gerenciado inteiramente
// pelo Supabase Auth e nunca passa pelo nosso backend.

export async function listFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return data?.totp ?? []
}

export async function enrollTotp() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (error) throw error
  return data // { id, totp: { qr_code, secret, uri } }
}

export async function verifyEnrollment(factorId, code) {
  const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
  if (chErr) throw chErr
  const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
  if (vErr) throw vErr
}

export async function unenrollFactor(factorId) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
}

export async function getAssuranceLevel() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) throw error
  return data // { currentLevel, nextLevel, currentAuthenticationMethods }
}

// Usado na tela de desafio pos-login: cria o challenge e verifica o codigo
// digitado, elevando a sessao de aal1 para aal2.
export async function challengeAndVerify(factorId, code) {
  const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
  if (chErr) throw chErr
  const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
  if (vErr) throw vErr
}
