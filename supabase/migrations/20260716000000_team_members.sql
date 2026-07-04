-- Task #29: multiusuario / perfis de acesso (clinica com equipe) --------
-- Permite que uma conta "dona" (a terapeuta que criou a clinica) convide
-- outras pessoas (associadas, estagiarias, recepcao) para operar sobre o
-- MESMO conjunto de pacientes/agenda/financeiro, com papeis diferentes:
--
--   owner     — a propria conta que criou a clinica (implicito, nao tem
--               linha em team_members; sempre acesso total)
--   admin     — acesso clinico + financeiro completo, pode gerenciar a
--               propria equipe (nao pode mexer no Mercado Pago pessoal
--               nem no Google Calendar do proprietario)
--   terapeuta — acesso clinico completo (pacientes, sessoes, anamneses,
--               escalas, arquivos, agenda, oracao), SEM financeiro
--   recepcao  — apenas pacientes (dados basicos/contato) e agenda; SEM
--               acesso a sessoes, anamneses, escalas, arquivos, alertas
--               de risco, financeiro ou cobranca
--
-- Cada membro convidado continua sendo uma linha normal em `therapists`
-- (criada automaticamente pelo trigger de signup ja existente); a tabela
-- `team_members` apenas vincula esse `auth.uid()` como operando sob o
-- `owner_id` de outra conta. Todas as tabelas clinicas continuam usando a
-- MESMA coluna `therapist_id` que ja tinham — o que muda e que o valor
-- comparado deixa de ser sempre `auth.uid()` e passa a ser
-- `current_owner_id()`, que resolve para o dono da clinica em que o
-- usuario atual estiver operando (ou para o proprio `auth.uid()` quando
-- ele nao pertence a nenhuma equipe, preservando o comportamento anterior
-- para contas individuais).

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.therapists(id) on delete cascade,
  member_id uuid unique references public.therapists(id) on delete cascade,
  role text not null default 'terapeuta' check (role in ('admin','terapeuta','recepcao')),
  invited_email text not null,
  invite_token uuid not null default gen_random_uuid(),
  status text not null default 'pendente' check (status in ('pendente','ativo','removido')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  removed_at timestamptz,
  check (member_id is null or member_id <> owner_id)
);

-- Um convite pendente por e-mail dentro da mesma clinica (evita duplicatas).
create unique index if not exists team_members_owner_email_pending_idx
  on public.team_members(owner_id, invited_email) where (status = 'pendente');

alter table public.team_members enable row level security;

drop policy if exists team_members_owner_manage on public.team_members;
create policy team_members_owner_manage on public.team_members
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists team_members_self_read on public.team_members;
create policy team_members_self_read on public.team_members
  for select using (member_id = auth.uid());

create index if not exists team_members_owner_idx on public.team_members(owner_id, status);
create index if not exists team_members_member_idx on public.team_members(member_id);

-- 1) Funcoes auxiliares de escopo/papel --------------------------------
create or replace function public.current_owner_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select owner_id from public.team_members where member_id = auth.uid() and status = 'ativo'),
    auth.uid()
  )
$$;
revoke all on function public.current_owner_id from public;
grant execute on function public.current_owner_id to authenticated;

create or replace function public.current_team_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.team_members where member_id = auth.uid() and status = 'ativo'),
    'owner'
  )
$$;
revoke all on function public.current_team_role from public;
grant execute on function public.current_team_role to authenticated;

create or replace function public.has_clinical_access()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_team_role() in ('owner','admin','terapeuta')
$$;
revoke all on function public.has_clinical_access from public;
grant execute on function public.has_clinical_access to authenticated;

create or replace function public.has_financial_access()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_team_role() in ('owner','admin')
$$;
revoke all on function public.has_financial_access from public;
grant execute on function public.has_financial_access to authenticated;

create or replace function public.is_team_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_team_role() in ('owner','admin')
$$;
revoke all on function public.is_team_admin from public;
grant execute on function public.is_team_admin to authenticated;

-- 2) RPCs de convite/gestao de equipe (somente o PROPRIETARIO da conta) --
create or replace function public.invite_team_member(p_email text, p_role text default 'terapeuta')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_token uuid;
begin
  if auth.uid() <> public.current_owner_id() then
    raise exception 'Apenas o proprietario da conta pode convidar membros da equipe';
  end if;
  if p_role not in ('admin','terapeuta','recepcao') then
    raise exception 'Papel invalido: %', p_role;
  end if;
  if p_email is null or trim(p_email) = '' then
    raise exception 'Informe um e-mail valido';
  end if;

  insert into public.team_members (owner_id, invited_email, role)
  values (auth.uid(), lower(trim(p_email)), p_role)
  on conflict (owner_id, invited_email) where (status = 'pendente')
  do update set role = excluded.role, invited_at = now()
  returning invite_token into v_token;

  return v_token;
end $$;
revoke all on function public.invite_team_member from public;
grant execute on function public.invite_team_member to authenticated;

create or replace function public.accept_team_invite(p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_row public.team_members%rowtype;
  v_email text;
begin
  select * into v_row from public.team_members where invite_token = p_token and status = 'pendente';
  if not found then
    raise exception 'Convite invalido, expirado ou ja utilizado';
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null or lower(v_email) <> v_row.invited_email then
    raise exception 'Este convite foi enviado para outro e-mail. Entre com a conta correta antes de aceitar.';
  end if;

  if exists (select 1 from public.team_members where member_id = auth.uid() and status = 'ativo') then
    raise exception 'Esta conta ja pertence a uma equipe';
  end if;
  if v_row.owner_id = auth.uid() then
    raise exception 'Voce nao pode aceitar um convite da propria conta';
  end if;

  update public.team_members
     set member_id = auth.uid(), status = 'ativo', joined_at = now()
   where id = v_row.id;
end $$;
revoke all on function public.accept_team_invite from public;
grant execute on function public.accept_team_invite to authenticated;

create or replace function public.remove_team_member(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() <> public.current_owner_id() then
    raise exception 'Apenas o proprietario da conta pode remover membros da equipe';
  end if;
  update public.team_members set status = 'removido', removed_at = now()
   where id = p_id and owner_id = auth.uid();
end $$;
revoke all on function public.remove_team_member from public;
grant execute on function public.remove_team_member to authenticated;

create or replace function public.update_team_member_role(p_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() <> public.current_owner_id() then
    raise exception 'Apenas o proprietario da conta pode alterar papeis da equipe';
  end if;
  if p_role not in ('admin','terapeuta','recepcao') then
    raise exception 'Papel invalido: %', p_role;
  end if;
  update public.team_members set role = p_role where id = p_id and owner_id = auth.uid();
end $$;
revoke all on function public.update_team_member_role from public;
grant execute on function public.update_team_member_role to authenticated;

create or replace function public.list_team_members()
returns table (
  id uuid, invited_email text, role text, status text,
  invited_at timestamptz, joined_at timestamptz, invite_token uuid, is_me boolean
) language sql security definer set search_path = public as $$
  select tm.id, tm.invited_email, tm.role, tm.status, tm.invited_at, tm.joined_at,
    case when auth.uid() = tm.owner_id and tm.status = 'pendente' then tm.invite_token else null end,
    tm.member_id = auth.uid()
  from public.team_members tm
  where tm.owner_id = public.current_owner_id() and tm.status <> 'removido'
  order by tm.invited_at desc
$$;
revoke all on function public.list_team_members from public;
grant execute on function public.list_team_members to authenticated;

-- 3) Reescreve as policies de RLS para considerar o escopo da equipe -----
-- Pacientes e agenda: todos os papeis da equipe (inclusive recepcao).
drop policy if exists patient_owner_all on public.patients;
create policy patient_owner_all on public.patients
  for all using (therapist_id = public.current_owner_id())
  with check (therapist_id = public.current_owner_id());

drop policy if exists appointment_owner_all on public.appointments;
create policy appointment_owner_all on public.appointments
  for all using (therapist_id = public.current_owner_id())
  with check (therapist_id = public.current_owner_id());

drop policy if exists prayer_owner_all on public.prayer_requests;
create policy prayer_owner_all on public.prayer_requests
  for all using (therapist_id = public.current_owner_id())
  with check (therapist_id = public.current_owner_id());

-- Dados clinicos: owner/admin/terapeuta (NAO recepcao).
drop policy if exists session_owner_all on public.sessions;
create policy session_owner_all on public.sessions
  for all using (therapist_id = public.current_owner_id() and public.has_clinical_access())
  with check (therapist_id = public.current_owner_id() and public.has_clinical_access());

drop policy if exists anamnesis_owner_all on public.anamneses;
create policy anamnesis_owner_all on public.anamneses
  for all using (therapist_id = public.current_owner_id() and public.has_clinical_access())
  with check (therapist_id = public.current_owner_id() and public.has_clinical_access());

drop policy if exists clinical_scales_owner_all on public.clinical_scales;
create policy clinical_scales_owner_all on public.clinical_scales
  for all using (therapist_id = public.current_owner_id() and public.has_clinical_access())
  with check (therapist_id = public.current_owner_id() and public.has_clinical_access());

drop policy if exists patient_files_owner_all on public.patient_files;
create policy patient_files_owner_all on public.patient_files
  for all using (therapist_id = public.current_owner_id() and public.has_clinical_access())
  with check (therapist_id = public.current_owner_id() and public.has_clinical_access());

drop policy if exists risk_alerts_owner_all on public.risk_alerts;
create policy risk_alerts_owner_all on public.risk_alerts
  for all using (therapist_id = public.current_owner_id() and public.has_clinical_access())
  with check (therapist_id = public.current_owner_id() and public.has_clinical_access());

-- Financeiro e cobranca de pacientes: owner/admin apenas.
drop policy if exists financial_owner_all on public.financial_entries;
create policy financial_owner_all on public.financial_entries
  for all using (therapist_id = public.current_owner_id() and public.has_financial_access())
  with check (therapist_id = public.current_owner_id() and public.has_financial_access());

drop policy if exists patient_charges_owner_all on public.patient_charges;
create policy patient_charges_owner_all on public.patient_charges
  for all using (therapist_id = public.current_owner_id() and public.has_financial_access())
  with check (therapist_id = public.current_owner_id() and public.has_financial_access());

-- 4) Storage: pastas identificadas pelo dono da clinica, nao por auth.uid() --
drop policy if exists "patient_files_owner_select" on storage.objects;
create policy "patient_files_owner_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'patient-files' and (storage.foldername(name))[1] = public.current_owner_id()::text and public.has_clinical_access());

drop policy if exists "patient_files_owner_insert" on storage.objects;
create policy "patient_files_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'patient-files' and (storage.foldername(name))[1] = public.current_owner_id()::text and public.has_clinical_access());

drop policy if exists "patient_files_owner_delete" on storage.objects;
create policy "patient_files_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'patient-files' and (storage.foldername(name))[1] = public.current_owner_id()::text and public.has_clinical_access());

drop policy if exists "session_audio_owner_select" on storage.objects;
create policy "session_audio_owner_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'session-audio' and (storage.foldername(name))[1] = public.current_owner_id()::text and public.has_clinical_access());

drop policy if exists "session_audio_owner_insert" on storage.objects;
create policy "session_audio_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'session-audio' and (storage.foldername(name))[1] = public.current_owner_id()::text and public.has_clinical_access());

drop policy if exists "session_audio_owner_delete" on storage.objects;
create policy "session_audio_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'session-audio' and (storage.foldername(name))[1] = public.current_owner_id()::text and public.has_clinical_access());

-- 5) Cota de uso de IA passa a ser compartilhada por toda a clinica -------
-- (o parametro p_therapist_id e mantido apenas por compatibilidade com as
-- Edge Functions existentes, mas a checagem/consumo real sempre usa
-- current_owner_id(), garantindo que o limite mensal seja da CLINICA,
-- nao de cada login individual).
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

create or replace function public.record_ai_usage(p_therapist_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.therapists
     set ai_calls_this_month = ai_calls_this_month + 1
   where id = public.current_owner_id();
end $$;

-- 6) LGPD (exportacao/exclusao) passam a respeitar o escopo da equipe ----
create or replace function public.export_patient_data(p_patient_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_result jsonb;
begin
  select therapist_id into v_owner from public.patients where id = p_patient_id;
  if v_owner is null or v_owner <> public.current_owner_id() or not public.has_clinical_access() then
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

create or replace function public.erase_patient(p_patient_id uuid, p_reason text default 'solicitacao do paciente')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_initials text;
begin
  select therapist_id, initials into v_owner, v_initials
    from public.patients where id = p_patient_id;

  if v_owner is null or v_owner <> public.current_owner_id() or not public.has_clinical_access() then
    raise exception 'Paciente nao encontrado ou acesso negado';
  end if;

  insert into public.erasure_log (therapist_id, patient_initials, reason)
  values (v_owner, v_initials, p_reason);

  delete from public.patients where id = p_patient_id;

  return jsonb_build_object('ok', true);
end $$;

comment on table public.team_members is 'Convites/vinculos de equipe: permite que outras contas (auth.uid() distintos) operem sobre os dados da mesma clinica (owner_id) com papeis diferentes (admin/terapeuta/recepcao).';
