import { supabase } from './supabase'

// Task #29: multiusuario / perfis de acesso (clinica com equipe).
// Todas as funcoes abaixo chamam RPCs SECURITY DEFINER que ja fazem a
// checagem de que apenas o PROPRIETARIO da conta pode convidar/gerenciar
// (ver migration team_members).

export async function listTeamMembers() {
  const { data, error } = await supabase.rpc('list_team_members')
  if (error) throw error
  return data ?? []
}

export async function inviteTeamMember(email, role) {
  const { data, error } = await supabase.rpc('invite_team_member', { p_email: email, p_role: role })
  if (error) throw error
  return data // invite_token (uuid)
}

export async function acceptTeamInvite(token) {
  const { error } = await supabase.rpc('accept_team_invite', { p_token: token })
  if (error) throw error
}

export async function removeTeamMember(id) {
  const { error } = await supabase.rpc('remove_team_member', { p_id: id })
  if (error) throw error
}

export async function updateTeamMemberRole(id, role) {
  const { error } = await supabase.rpc('update_team_member_role', { p_id: id, p_role: role })
  if (error) throw error
}

export const ROLE_LABEL = {
  admin: 'Administrador(a)',
  terapeuta: 'Terapeuta',
  recepcao: 'Recepção',
}

export const ROLE_DESCRIPTION = {
  admin: 'Acesso clínico e financeiro completo, gerencia a equipe',
  terapeuta: 'Acesso clínico completo (pacientes, sessões, agenda), sem financeiro',
  recepcao: 'Apenas pacientes e agenda — sem sessões, financeiro ou dados sensíveis',
}
