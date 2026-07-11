-- Task #31: log de auditoria de acesso a prontuario -----------------------
-- Registra quem (actor_id) acessou o prontuario de qual paciente e quando,
-- para fins de auditoria/compliance (LGPD art. 37 — registro das operacoes
-- de tratamento). So a proprietaria/administradores da clinica podem
-- consultar o log; a insercao so acontece via a funcao SECURITY DEFINER
-- abaixo (a tabela nao tem nenhum GRANT de INSERT/UPDATE/DELETE direto
-- para "authenticated", entao o client nao pode forjar ou apagar entradas).

create table if not exists public.access_audit_log (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  actor_id uuid not null references public.therapists(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  patient_initials text,
  action text not null check (action in (
    'view_patient','view_session','view_scale','view_files','view_billing',
    'view_report','export_patient_data','erase_patient'
  )),
  created_at timestamptz not null default now()
);

alter table public.access_audit_log enable row level security;

drop policy if exists access_audit_log_admin_read on public.access_audit_log;
create policy access_audit_log_admin_read on public.access_audit_log
  for select using (therapist_id = public.current_owner_id() and public.is_team_admin());

-- Sem GRANT de insert/update/delete para authenticated/anon: apenas a
-- funcao abaixo (executada com privilegios do dono do schema) escreve.
revoke all on public.access_audit_log from authenticated, anon;
grant select on public.access_audit_log to authenticated;

create index if not exists access_audit_log_owner_idx on public.access_audit_log(therapist_id, created_at desc);
create index if not exists access_audit_log_patient_idx on public.access_audit_log(patient_id, created_at desc);

create or replace function public.log_patient_access(p_patient_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_initials text;
begin
  if not public.has_clinical_access() then
    return;
  end if;
  if p_action not in ('view_patient','view_session','view_scale','view_files','view_billing','view_report','export_patient_data','erase_patient') then
    return;
  end if;

  select therapist_id, initials into v_owner, v_initials from public.patients where id = p_patient_id;
  if v_owner is null or v_owner <> public.current_owner_id() then
    return;
  end if;

  insert into public.access_audit_log (therapist_id, actor_id, patient_id, patient_initials, action)
  values (v_owner, auth.uid(), p_patient_id, v_initials, p_action);
end $$;
revoke all on function public.log_patient_access from public;
grant execute on function public.log_patient_access to authenticated;

create or replace function public.list_access_audit_log(p_patient_id uuid default null, p_limit int default 200)
returns table (
  id uuid, actor_id uuid, actor_name text, patient_id uuid, patient_name text,
  action text, created_at timestamptz
) language sql security definer set search_path = public as $$
  select l.id, l.actor_id, coalesce(t.full_name, 'Ex-membro removido'),
    l.patient_id, coalesce(p.full_name, l.patient_initials, 'Paciente removido'),
    l.action, l.created_at
  from public.access_audit_log l
  left join public.therapists t on t.id = l.actor_id
  left join public.patients p on p.id = l.patient_id
  where l.therapist_id = public.current_owner_id()
    and public.is_team_admin()
    and (p_patient_id is null or l.patient_id = p_patient_id)
  order by l.created_at desc
  limit least(greatest(p_limit, 1), 500)
$$;
revoke all on function public.list_access_audit_log from public;
grant execute on function public.list_access_audit_log to authenticated;

-- Permite que colegas da mesma clinica vejam o perfil basico uns dos
-- outros (necessario para exibir nomes no log de auditoria e na lista de
-- equipe) — colunas sensiveis continuam protegidas por REVOKE de coluna.
drop policy if exists therapist_self_read on public.therapists;
create policy therapist_self_read on public.therapists
  for select using (
    id = auth.uid()
    or id = public.current_owner_id()
    or exists (
      select 1 from public.team_members tm
      where tm.member_id = therapists.id
        and tm.owner_id = public.current_owner_id()
        and tm.status = 'ativo'
    )
  );

revoke execute on function public.log_patient_access from anon;
revoke execute on function public.list_access_audit_log from anon;
