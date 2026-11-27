// TerapiaViva — acesso da clinica (teste gratis de 45 dias, assinatura,
// cortesia). A regra de verdade mora no banco (funcao account_has_access,
// migration 20261127000000_assinatura_teste_45_dias); aqui so buscamos o
// status e montamos os textos da interface.
import { supabase } from './supabase'

export const TRIAL_DAYS = 45

// Busca o status da clinica de quem esta logado. "Fail-open": se a funcao
// ainda nao existir no banco (site publicado antes da migration) ou a rede
// falhar, devolve null e o app segue liberado — nunca tranca a terapeuta
// por erro de infraestrutura. O bloqueio real continua garantido no banco.
export async function getMyAccessStatus() {
  try {
    const { data, error } = await supabase.rpc('get_my_access_status')
    if (error || !data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

// null/undefined (status desconhecido) conta como liberado.
export function isBlocked(access) {
  return !!access && access.has_access === false
}

export function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function daysLabel(n) {
  const days = Math.max(0, Number(n) || 0)
  if (days === 0) return 'último dia'
  return days === 1 ? '1 dia' : `${days} dias`
}

export const ACCESS_STATUS_LABEL = {
  cortesia: 'Cortesia',
  assinante: 'Assinatura ativa',
  teste: 'Teste grátis',
  teste_encerrado: 'Teste encerrado',
  cancelado: 'Assinatura cancelada',
  sem_conta: 'Conta não encontrada',
}

// Texto curto usado no cartao de plano (Configuracoes) e no painel admin.
export function describeAccess(access) {
  if (!access) return { label: 'Período de teste', detail: '' }
  const label = ACCESS_STATUS_LABEL[access.status] || access.status || 'Período de teste'
  switch (access.status) {
    case 'teste': {
      const left = daysLabel(access.days_left)
      const until = formatDate(access.trial_ends_at)
      return {
        label,
        detail:
          access.days_left === 0
            ? `Último dia do teste (${until})`
            : `Faltam ${left} — até ${until}`,
      }
    }
    case 'teste_encerrado':
      return { label, detail: `Terminou em ${formatDate(access.trial_ends_at)}` }
    case 'cancelado':
      return { label, detail: 'Assine novamente para voltar a usar o app' }
    case 'cortesia':
      return { label, detail: 'Uso liberado sem cobrança' }
    case 'assinante':
      return { label, detail: 'Cobrança mensal pelo Mercado Pago' }
    default:
      return { label, detail: '' }
  }
}

// O botao "Assinar" faz sentido no teste, no teste vencido e na assinatura
// cancelada — nunca para cortesia ou assinante ativo.
export function canSubscribe(access) {
  if (!access) return true
  return ['teste', 'teste_encerrado', 'cancelado'].includes(access.status)
}

// Aviso no topo durante o teste: discreto no inicio, destacado na reta final.
export function trialBanner(access) {
  if (!access || access.status !== 'teste' || !access.is_owner) return null
  const days = Number(access.days_left) || 0
  return {
    urgent: days <= 7,
    text:
      days === 0
        ? 'Hoje é o último dia do seu teste grátis.'
        : `Teste grátis: faltam ${daysLabel(days)} (até ${formatDate(access.trial_ends_at)}).`,
  }
}
