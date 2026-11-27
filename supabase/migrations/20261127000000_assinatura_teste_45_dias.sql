-- =====================================================================
-- TerapiaViva — Assinatura: teste gratis de 45 dias, cortesia, bloqueio
-- quando o teste vence ou a assinatura cai, e trava das colunas de plano.
-- =====================================================================
-- Antes desta migration:
--   * `trial_ends_at` era gravado (14 dias) mas nada o verificava — teste,
--     assinatura paga e cancelada usavam o app inteiro;
--   * a policy `therapist_self_update` deixava a propria usuaria alterar
--     QUALQUER coluna da propria linha, inclusive `plan`, `plan_ai_limit` e
--     `ai_calls_this_month` (bastava chamar a API com o proprio login).
--
-- Regra de acesso (uma unica fonte: `account_has_access`), avaliada sempre
-- sobre o DONO da clinica (membros de equipe herdam o acesso da clinica):
--   1. cortesia (`billing_exempt`)                -> libera
--   2. plano pago (`profissional`/`basico`)       -> libera
--   3. dentro do teste (`trial_ends_at > now()`)  -> libera
--   4. administrador da plataforma                -> libera (nunca se tranca)
--   senao -> bloqueado: o app fica SOMENTE LEITURA no banco (consultar e
--   excluir continuam possiveis — LGPD), IA/lembretes param e a interface
--   mostra a tela de assinatura. Nenhum dado e apagado.
--
-- O webhook do Mercado Pago ja existente continua sendo quem liga/desliga
-- o plano pago (authorized -> profissional; paused/cancelled -> cancelado).

-- 1) Cortesia -----------------------------------------------------------
-- Contas que JA existiam antes desta migration viram cortesia, para que
-- ninguem que ja usa o app seja bloqueado de surpresa. O operador pode
-- tirar a cortesia conta a conta no Painel admin. O bloco so roda na
-- primeira aplicacao (quando a coluna ainda nao existe).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'therapists' and column_name = 'billing_exempt'
  ) then
    alter table public.therapists add column billing_exempt boolean not null default false;
    update public.therapists set billing_exempt = true;
  end if;
end $$;

comment on column public.therapists.billing_exempt is
  'Conta de cortesia: usa o app sem assinatura e sem prazo de teste. So o operador da plataforma altera (admin_set_billing_exempt).';

-- 2) Teste gratis passa de 14 para 45 dias (contas novas) ----------------
alter table public.therapists
  alter column trial_ends_at set default (now() + interval '45 days');

-- 3) Regra de acesso ----------------------------------------------------
create or replace function public.account_has_access(p_owner uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select t.billing_exempt
        or t.plan in ('profissional', 'basico')
        or t.trial_ends_at > now()
        or exists (select 1 from public.platform_admins pa where pa.id = t.id)
      from public.therapists t
     where t.id = p_owner
  ), false)
$$;
revoke all on function public.account_has_access(uuid) from public, anon, authenticated;
grant execute on function public.account_has_access(uuid) to service_role;

-- Usada nas policies (RLS) — avalia a clinica de quem esta logado.
create or replace function public.has_active_access()
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.account_has_access(public.current_owner_id())
$$;
revoke all on function public.has_active_access() from public, anon;
grant execute on function public.has_active_access() to authenticated, service_role;

-- Status detalhado para a interface (tela de bloqueio, aviso de dias
-- restantes, Configuracoes). Sempre sobre a clinica de quem esta logado.
create or replace function public.get_my_access_status()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid := public.current_owner_id();
  t public.therapists%rowtype;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida';
  end if;

  select * into t from public.therapists where id = v_owner;
  if not found then
    return jsonb_build_object('has_access', false, 'status', 'sem_conta', 'is_owner', v_owner = auth.uid());
  end if;

  v_status := case
    when t.billing_exempt then 'cortesia'
    when t.plan in ('profissional', 'basico') then 'assinante'
    when t.trial_ends_at > now() then 'teste'
    when exists (select 1 from public.platform_admins pa where pa.id = t.id) then 'cortesia'
    when t.plan = 'cancelado' then 'cancelado'
    else 'teste_encerrado'
  end;

  return jsonb_build_object(
    'has_access', public.account_has_access(v_owner),
    'status', v_status,
    'plan', t.plan,
    'trial_ends_at', t.trial_ends_at,
    'days_left', greatest(0, ceil(extract(epoch from (t.trial_ends_at - now())) / 86400.0))::int,
    'subscription_status', t.mp_subscription_status,
    'is_owner', v_owner = auth.uid()
  );
end $$;
revoke all on function public.get_my_access_status() from public, anon;
grant execute on function public.get_my_access_status() to authenticated;

-- 4) Trava das colunas de plano/cota/teste ------------------------------
-- A policy `therapist_self_update` continua permitindo que a usuaria edite
-- o proprio perfil (nome, bio, horarios, lembretes...). Este trigger
-- impede apenas que o CLIENT (roles `authenticated`/`anon`) mexa nas
-- colunas de cobranca. Webhook/Edge Functions (service_role), funcoes
-- SECURITY DEFINER (check_ai_quota, RPCs do admin) e o painel do Supabase
-- (postgres) continuam podendo. A unica mudanca liberada ao client e
-- marcar a assinatura como 'pending' (feita pela Edge Function
-- create-subscription com o JWT da usuaria na versao ja publicada).
-- Importante: o trigger NAO e security definer, para que `current_user`
-- reflita quem executa o UPDATE.
create or replace function public.protect_therapist_billing_columns()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.plan is distinct from old.plan
       or new.plan_ai_limit is distinct from old.plan_ai_limit
       or new.ai_calls_this_month is distinct from old.ai_calls_this_month
       or new.ai_calls_reset_at is distinct from old.ai_calls_reset_at
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.billing_exempt is distinct from old.billing_exempt
       or (new.mp_subscription_status is distinct from old.mp_subscription_status
           and new.mp_subscription_status is distinct from 'pending')
    then
      raise exception 'Plano, cota de IA e período de teste só podem ser alterados pelo sistema de cobrança.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t_therapists_protect_billing on public.therapists;
create trigger t_therapists_protect_billing
  before update on public.therapists
  for each row execute function public.protect_therapist_billing_columns();

-- 5) IA so para clinicas com acesso (vale mesmo sem republicar as Edge
--    Functions, que ja chamam check_ai_quota antes da Anthropic/Whisper) --
create or replace function public.check_ai_quota(p_therapist_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid := public.current_owner_id();
  v_limit int;
  v_used int;
  v_reset date;
begin
  if not public.has_clinical_access() then
    return jsonb_build_object('allowed', false, 'used', 0, 'limit', 0);
  end if;

  if not public.account_has_access(v_owner) then
    return jsonb_build_object('allowed', false, 'used', 0, 'limit', 0, 'reason', 'sem_assinatura');
  end if;

  select plan_ai_limit, ai_calls_this_month, ai_calls_reset_at
    into v_limit, v_used, v_reset
    from public.therapists where id = v_owner
    for update;

  if v_reset is null or date_trunc('month', v_reset) <> date_trunc('month', current_date) then
    update public.therapists
       set ai_calls_this_month = 0, ai_calls_reset_at = date_trunc('month', current_date)::date
     where id = v_owner;
    v_used := 0;
  end if;

  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit);
end $$;

-- 6) Lembretes automaticos so para clinicas com acesso -------------------
create or replace function public.list_pending_reminders()
returns table (
  appointment_id uuid,
  therapist_id uuid,
  starts_at timestamptz,
  mode text,
  therapist_name text,
  patient_name text,
  patient_email text,
  patient_phone text,
  email_enabled boolean,
  whatsapp_enabled boolean
)
language sql security definer set search_path = public as $$
  select a.id, a.therapist_id, a.starts_at, a.mode::text,
         t.full_name, p.full_name, p.email, p.phone,
         t.reminder_email_enabled, t.reminder_whatsapp_enabled
  from public.appointments a
  join public.therapists t on t.id = a.therapist_id
  left join public.patients p on p.id = a.patient_id
  where a.reminder_sent_at is null
    and a.status = any (array['agendado'::appointment_status, 'confirmado'::appointment_status])
    and a.starts_at > now()
    and a.starts_at <= now() + make_interval(hours => t.reminder_hours_before)
    and public.account_has_access(a.therapist_id);
$$;

-- 7) Sem acesso = somente leitura no banco -------------------------------
-- Policies RESTRICTIVE (somam-se as existentes com AND) apenas para
-- INSERT/UPDATE do role `authenticated`. SELECT e DELETE nao mudam
-- (consultar, exportar e excluir dados continuam possiveis — LGPD). O
-- paciente anonimo (anamnese publica via submit_anamnesis) e a
-- service_role (webhooks/cron) nao sao afetados.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'patients', 'sessions', 'anamneses', 'appointments', 'financial_entries',
    'prayer_requests', 'clinical_scales', 'patient_files', 'risk_alerts',
    'patient_charges', 'document_signatures', 'video_rooms'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop policy if exists %I on public.%I', v_table || '_assinatura_ins', v_table);
      execute format(
        'create policy %I on public.%I as restrictive for insert to authenticated
           with check ((select public.has_active_access()))',
        v_table || '_assinatura_ins', v_table);
      execute format('drop policy if exists %I on public.%I', v_table || '_assinatura_upd', v_table);
      execute format(
        'create policy %I on public.%I as restrictive for update to authenticated
           using ((select public.has_active_access()))
           with check ((select public.has_active_access()))',
        v_table || '_assinatura_upd', v_table);
    end if;
  end loop;
end $$;

-- Uploads de arquivos/audio tambem param (outros buckets nao sao afetados).
drop policy if exists "assinatura_upload_ins" on storage.objects;
create policy "assinatura_upload_ins" on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id not in ('patient-files', 'session-audio') or (select public.has_active_access()));

-- 8) Painel admin: status, cortesia e prorrogacao de teste ---------------
-- admin_list_accounts muda o tipo de retorno (novas colunas) -> drop/create.
drop function if exists public.admin_list_accounts();
create function public.admin_list_accounts()
returns table (
  owner_id uuid,
  full_name text,
  email text,
  plan text,
  mp_subscription_status text,
  ai_calls_this_month int,
  plan_ai_limit int,
  team_size bigint,
  patient_count bigint,
  created_at timestamptz,
  billing_exempt boolean,
  trial_ends_at timestamptz,
  has_access boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito a administradores da plataforma';
  end if;

  return query
  select
    t.id,
    t.full_name,
    t.email,
    t.plan,
    t.mp_subscription_status,
    t.ai_calls_this_month,
    t.plan_ai_limit,
    (1 + coalesce((select count(*) from public.team_members tm where tm.owner_id = t.id and tm.status = 'ativo'), 0))::bigint,
    coalesce((select count(*) from public.patients p where p.therapist_id = t.id), 0)::bigint,
    t.created_at,
    t.billing_exempt,
    t.trial_ends_at,
    public.account_has_access(t.id)
  from public.therapists t
  where not exists (
    select 1 from public.team_members tm2 where tm2.member_id = t.id and tm2.status = 'ativo'
  )
  order by t.created_at desc;
end;
$$;
revoke all on function public.admin_list_accounts() from public, anon;
grant execute on function public.admin_list_accounts() to authenticated;

-- Contadores passam a considerar so contas-dono (nao membros de equipe) e
-- separam cortesia, teste em andamento e teste vencido.
create or replace function public.admin_platform_stats()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result jsonb;
  v_price numeric;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito a administradores da plataforma';
  end if;

  select value::numeric into v_price from public.platform_settings where key = 'mrr_price_brl';
  v_price := coalesce(v_price, 97.00);

  with owners as (
    select t.* from public.therapists t
     where not exists (select 1 from public.team_members tm where tm.member_id = t.id and tm.status = 'ativo')
  )
  select jsonb_build_object(
    'total_accounts', (select count(*) from owners),
    'active_subscriptions', (select count(*) from owners where mp_subscription_status = 'authorized'),
    'courtesy_accounts', (select count(*) from owners where billing_exempt),
    'trial_accounts', (select count(*) from owners
                        where not billing_exempt and coalesce(plan, 'trial') not in ('profissional', 'basico')
                          and trial_ends_at > now()),
    'expired_accounts', (select count(*) from owners where not public.account_has_access(owners.id)),
    'cancelled_accounts', (select count(*) from owners where plan = 'cancelado'),
    'total_patients', (select count(*) from public.patients),
    'total_ai_calls_this_month', (select coalesce(sum(ai_calls_this_month), 0) from owners),
    'mrr_price_brl', v_price,
    'mrr_estimate', (select count(*) from owners where mp_subscription_status = 'authorized') * v_price
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_set_billing_exempt(p_owner_id uuid, p_exempt boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito a administradores da plataforma';
  end if;
  update public.therapists set billing_exempt = coalesce(p_exempt, false) where id = p_owner_id;
  if not found then
    raise exception 'Conta não encontrada';
  end if;
end;
$$;
revoke all on function public.admin_set_billing_exempt(uuid, boolean) from public, anon;
grant execute on function public.admin_set_billing_exempt(uuid, boolean) to authenticated;

-- Soma dias ao teste (a partir de hoje se ja tiver vencido).
create or replace function public.admin_extend_trial(p_owner_id uuid, p_days int)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito a administradores da plataforma';
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'Informe entre 1 e 365 dias';
  end if;
  update public.therapists
     set trial_ends_at = greatest(trial_ends_at, now()) + make_interval(days => p_days)
   where id = p_owner_id
  returning trial_ends_at into v_new;
  if v_new is null then
    raise exception 'Conta não encontrada';
  end if;
  return v_new;
end;
$$;
revoke all on function public.admin_extend_trial(uuid, int) from public, anon;
grant execute on function public.admin_extend_trial(uuid, int) to authenticated;
