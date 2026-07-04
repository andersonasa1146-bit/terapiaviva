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
