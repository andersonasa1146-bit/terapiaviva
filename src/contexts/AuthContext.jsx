import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthCtx = createContext(null)

// Colunas seguras para expor ao client. Tokens de terceiros (Google OAuth,
// Mercado Pago pessoal) ficam de fora deliberadamente — essas colunas tem
// SELECT revogado para o role "authenticated" no banco (ver migrations
// google_calendar_sync, patient_billing e therapists_sensitive_columns_revoke),
// entao um `select('*')` quebraria a query. Listar explicitamente aqui evita
// esse problema e documenta a intencao de nunca trafegar esses segredos.
const THERAPIST_SAFE_COLUMNS = [
  'id', 'full_name', 'email', 'city', 'church', 'crp', 'bio', 'photo_url',
  'onboarded_at', 'created_at', 'updated_at',
  'plan', 'plan_ai_limit', 'ai_calls_this_month', 'ai_calls_reset_at',
  'mp_subscription_id', 'mp_subscription_status', 'trial_ends_at',
  'google_token_expires_at', 'google_calendar_connected',
  'reminder_hours_before', 'reminder_email_enabled', 'reminder_whatsapp_enabled',
  'working_hours',
].join(', ')

// Task #29 (multiusuario/clinica com equipe): alem da propria conta, um
// usuario pode estar operando dentro da clinica de OUTRA pessoa (como
// membro convidado — admin/terapeuta/recepcao). Por isso o contexto expoe
// dois objetos distintos:
//  - `profile`: a linha de `therapists` do PROPRIO login (identidade
//    pessoal — nome exibido no topo, foto, bio).
//  - `therapist`: a linha de `therapists` do DONO da clinica em que o
//    usuario atual opera (plano/uso de IA, horario de expediente, Google
//    Calendar, lembretes) — para uma conta individual (sem equipe) isso e
//    exatamente a mesma linha que `profile`.
// `ownerId` deve ser usado (em vez de `session.user.id`) em toda insercao/
// filtro de dados clinicos, agenda e financeiro, pois e o valor que a RLS
// espera na coluna `therapist_id` dessas tabelas.
//
// Task #30 (2FA): `mfaPending` indica que a sessao tem um fator TOTP
// verificado mas ainda esta em nivel de garantia aal1 (so senha) — o app
// deve bloquear as rotas privadas e exigir o codigo de 6 digitos antes de
// liberar o acesso (ver MFAChallenge.jsx e App.jsx).
//
// Task #34 (painel administrativo do dono do produto): `isPlatformAdmin` e
// ORTOGONAL ao papel de equipe (`teamRole`/`isTeamAdmin`) — e o operador da
// plataforma TerapiaViva (nao necessariamente dono de nenhuma clinica),
// resolvido via a RPC `is_platform_admin` (tabela `platform_admins`).
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [therapist, setTherapist] = useState(null)
  const [ownerId, setOwnerId] = useState(null)
  const [teamRole, setTeamRole] = useState('owner')
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mfaPending, setMfaPending] = useState(false)
  const [mfaChecked, setMfaChecked] = useState(false)

  const refreshMfaStatus = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!error && data) {
      setMfaPending(data.currentLevel === 'aal1' && data.nextLevel === 'aal2')
    }
    setMfaChecked(true)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setMfaChecked(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) { setMfaPending(false); setMfaChecked(true); return }
    refreshMfaStatus()
  }, [session, refreshMfaStatus])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null); setTherapist(null); setOwnerId(null); setTeamRole('owner'); setIsPlatformAdmin(false)
      return
    }
    let cancelled = false

    ;(async () => {
      const [{ data: oid }, { data: role }, { data: platformAdmin }] = await Promise.all([
        supabase.rpc('current_owner_id'),
        supabase.rpc('current_team_role'),
        supabase.rpc('is_platform_admin'),
      ])
      if (cancelled) return
      const effectiveOwnerId = oid || session.user.id
      setOwnerId(effectiveOwnerId)
      setTeamRole(role || 'owner')
      setIsPlatformAdmin(!!platformAdmin)

      const { data: own } = await supabase.from('therapists')
        .select(THERAPIST_SAFE_COLUMNS).eq('id', session.user.id).maybeSingle()
      if (cancelled) return
      setProfile(own)

      if (effectiveOwnerId === session.user.id) {
        setTherapist(own)
      } else {
        const { data: clinicRow } = await supabase.from('therapists')
          .select(THERAPIST_SAFE_COLUMNS).eq('id', effectiveOwnerId).maybeSingle()
        if (cancelled) return
        setTherapist(clinicRow)
      }
    })()

    return () => { cancelled = true }
  }, [session])

  const signIn  = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const signUp  = (email, password, full_name) => supabase.auth.signUp({
    email, password, options: { data: { full_name } },
  })
  const signOut = () => supabase.auth.signOut()

  const isOwner = !!session?.user && ownerId === session.user.id
  const hasClinicalAccess = ['owner', 'admin', 'terapeuta'].includes(teamRole)
  const hasFinancialAccess = ['owner', 'admin'].includes(teamRole)
  const isTeamAdmin = ['owner', 'admin'].includes(teamRole)

  return (
    <AuthCtx.Provider value={{
      session, profile, therapist, ownerId, teamRole, loading,
      isOwner, hasClinicalAccess, hasFinancialAccess, isTeamAdmin, isPlatformAdmin,
      mfaPending, mfaChecked, refreshMfaStatus,
      signIn, signUp, signOut,
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
