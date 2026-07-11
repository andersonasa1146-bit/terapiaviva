-- =====================================================================
-- TerapiaViva v2 — Migration: plano/uso de IA + base para cobranca (Mercado Pago)
-- =====================================================================
-- Contexto: viabilizar (1) limite de uso de IA por conta antes de vender
-- o produto para terceiros, e (2) as colunas minimas para integrar
-- assinatura recorrente via Mercado Pago numa fase seguinte.
-- Nao inclui nenhuma chamada externa nem credenciais — apenas schema.

-- 1) Colunas de plano/assinatura em therapists ------------------------
alter table public.therapists
  add column if not exists plan text not null default 'trial'
    check (plan in ('trial','basico','profissional','cancelado')),
  add column if not exists plan_ai_limit int not null default 30,
  add column if not exists ai_calls_this_month int not null default 0,
  add column if not exists ai_calls_reset_at date not null default date_trunc('month', current_date)::date,
  add column if not exists mp_subscription_id text,
  add column if not exists mp_subscription_status text
    check (mp_subscription_status is null or mp_subscription_status in ('pending','authorized','paused','cancelled')),
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '14 days');

comment on column public.therapists.plan is 'Plano comercial da conta (trial = periodo gratuito de avaliacao)';
comment on column public.therapists.plan_ai_limit is 'Quantidade de analises de IA permitidas por mes no plano atual';
comment on column public.therapists.mp_subscription_id is 'ID da assinatura no Mercado Pago (preencher na integracao de cobranca)';

-- 2) Verifica e consome cota de IA (chamado ANTES de chamar a Anthropic) --
create or replace function public.check_ai_quota(p_therapist_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_limit int;
  v_used int;
  v_reset date;
begin
  select plan_ai_limit, ai_calls_this_month, ai_calls_reset_at
    into v_limit, v_used, v_reset
    from public.therapists where id = p_therapist_id
    for update;

  if v_reset is null or date_trunc('month', v_reset) <> date_trunc('month', current_date) then
    update public.therapists
       set ai_calls_this_month = 0, ai_calls_reset_at = date_trunc('month', current_date)::date
     where id = p_therapist_id;
    v_used := 0;
  end if;

  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit);
end $$;

revoke all on function public.check_ai_quota from public;
grant execute on function public.check_ai_quota to authenticated;

-- 3) Registra uso de IA (chamado DEPOIS de uma analise bem-sucedida) ------
create or replace function public.record_ai_usage(p_therapist_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.therapists
     set ai_calls_this_month = ai_calls_this_month + 1
   where id = p_therapist_id;
end $$;

revoke all on function public.record_ai_usage from public;
grant execute on function public.record_ai_usage to authenticated;

-- 4) Direito ao esquecimento — exportacao de dados do paciente -----------
-- Retorna todo o historico do paciente em JSON para portabilidade (LGPD art. 18).
-- RLS ja garante que so a terapeuta dona do paciente pode chamar isto,
-- mas checamos explicitamente por seguranca em profundidade.
create or replace function public.export_patient_data(p_patient_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_result jsonb;
begin
  select therapist_id into v_owner from public.patients where id = p_patient_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Paciente nao encontrado ou acesso negado';
  end if;

  select jsonb_build_object(
    'patient', to_jsonb(p.*),
    'sessions', coalesce((select jsonb_agg(s.* order by s.session_date) from public.sessions s where s.patient_id = p_patient_id), '[]'::jsonb),
    'anamneses', coalesce((select jsonb_agg(a.* order by a.created_at) from public.anamneses a where a.patient_id = p_patient_id), '[]'::jsonb),
    'appointments', coalesce((select jsonb_agg(ap.* order by ap.starts_at) from public.appointments ap where ap.patient_id = p_patient_id), '[]'::jsonb),
    'exported_at', now()
  ) into v_result
  from public.patients p where p.id = p_patient_id;

  return v_result;
end $$;

revoke all on function public.export_patient_data from public;
grant execute on function public.export_patient_data to authenticated;

-- 5) Direito ao esquecimento — exclusao definitiva do paciente ------------
-- Observacao: a tabela `patients` ja tem "on delete cascade" para sessions
-- e "on delete set null" para anamneses/appointments/financial_entries,
-- entao um DELETE simples ja e suficiente e ja e permitido pela policy
-- `patient_owner_all` (FOR ALL). Esta funcao existe para (a) checagem
-- explicita de posse e (b) log minimo de exclusao para auditoria.
create table if not exists public.erasure_log (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  patient_initials text,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.erasure_log enable row level security;
create policy erasure_log_owner_read on public.erasure_log
  for select using (therapist_id = auth.uid());

create or replace function public.erase_patient(p_patient_id uuid, p_reason text default 'solicitacao do paciente')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_initials text;
begin
  select therapist_id, initials into v_owner, v_initials
    from public.patients where id = p_patient_id;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Paciente nao encontrado ou acesso negado';
  end if;

  insert into public.erasure_log (therapist_id, patient_initials, reason)
  values (v_owner, v_initials, p_reason);

  delete from public.patients where id = p_patient_id;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.erase_patient from public;
grant execute on function public.erase_patient to authenticated;
