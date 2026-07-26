import { supabase } from './supabase'

// Task #31: log de auditoria de acesso a prontuario. Falhas aqui NUNCA
// devem quebrar a experiencia do usuario — por isso todas as chamadas
// engolem erros silenciosamente (o registro e importante, mas secundario
// a funcionalidade principal da tela).

export function logPatientAccess(patientId, action) {
  if (!patientId) return
  supabase.rpc('log_patient_access', { p_patient_id: patientId, p_action: action }).then(() => {})
}

export async function listAccessAuditLog({ patientId = null, limit = 200 } = {}) {
  const { data, error } = await supabase.rpc('list_access_audit_log', { p_patient_id: patientId, p_limit: limit })
  if (error) throw error
  return data ?? []
}

export const ACTION_LABEL = {
  view_patient: 'Abriu o prontuário',
  view_session: 'Visualizou sessões',
  view_scale: 'Visualizou escalas clínicas',
  view_files: 'Visualizou arquivos/exames',
  view_billing: 'Visualizou cobrança',
  view_report: 'Gerou relatório/PDF',
  export_patient_data: 'Exportou dados (LGPD)',
  erase_patient: 'Excluiu dados (LGPD)',
}
