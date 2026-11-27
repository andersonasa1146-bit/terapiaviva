// TerapiaViva — Task #34: painel administrativo do dono do produto.
// Todas as RPCs abaixo sao restritas a contas em `platform_admins`
// (checagem feita no proprio banco via `is_platform_admin()`); chamadas de
// quem nao e administrador da plataforma retornam erro / lista vazia.
import { supabase } from './supabase'

export async function isPlatformAdmin() {
  const { data, error } = await supabase.rpc('is_platform_admin')
  if (error) return false
  return !!data
}

export async function getPlatformStats() {
  const { data, error } = await supabase.rpc('admin_platform_stats')
  if (error) throw error
  return data
}

export async function listAccounts() {
  const { data, error } = await supabase.rpc('admin_list_accounts')
  if (error) throw error
  return data ?? []
}

export async function setMrrPrice(price) {
  const { error } = await supabase.rpc('admin_set_mrr_price', { p_price: price })
  if (error) throw error
}

// Cortesia: a conta usa o app sem assinatura e sem prazo de teste.
export async function setBillingExempt(ownerId, exempt) {
  const { error } = await supabase.rpc('admin_set_billing_exempt', { p_owner_id: ownerId, p_exempt: exempt })
  if (error) throw error
}

// Soma dias ao teste gratis (a partir de hoje, se ja tiver vencido).
export async function extendTrial(ownerId, days) {
  const { data, error } = await supabase.rpc('admin_extend_trial', { p_owner_id: ownerId, p_days: days })
  if (error) throw error
  return data
}

// Status de acesso de uma conta na lista do painel (mesma regra do banco).
export function accountAccessStatus(a) {
  if (a.billing_exempt) return 'cortesia'
  if (['profissional', 'basico'].includes(a.plan)) return 'assinante'
  if (a.trial_ends_at && new Date(a.trial_ends_at) > new Date()) return 'teste'
  if (a.plan === 'cancelado') return 'cancelado'
  return a.has_access ? 'admin' : 'teste_encerrado'
}

export const PLAN_LABEL = {
  trial: 'Trial',
  profissional: 'Profissional',
  cancelado: 'Cancelado',
}

export const SUB_STATUS_LABEL = {
  authorized: 'Assinatura ativa',
  pending: 'Assinatura pendente',
  cancelled: 'Assinatura cancelada',
  paused: 'Assinatura pausada',
}
