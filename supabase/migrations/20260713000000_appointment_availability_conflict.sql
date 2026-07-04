-- Task #25: disponibilidade e deteccao de conflito de horario ----------

create extension if not exists btree_gist;

-- Horario de atendimento configuravel por terapeuta (dia da semana -> lista
-- de intervalos "HH:MM"-"HH:MM"). Usado apenas como aviso na Agenda (nao
-- bloqueia o salvamento), pois excecoes (encaixes) sao legitimas.
alter table public.therapists
  add column if not exists working_hours jsonb not null default '{
    "mon": [["08:00","18:00"]], "tue": [["08:00","18:00"]], "wed": [["08:00","18:00"]],
    "thu": [["08:00","18:00"]], "fri": [["08:00","18:00"]], "sat": [], "sun": []
  }'::jsonb;

comment on column public.therapists.working_hours is 'Horario de atendimento por dia da semana, usado para avisar (nao bloquear) agendamentos fora do expediente';

-- Impede, a nivel de banco, dois agendamentos ativos (agendado/confirmado)
-- da MESMA terapeuta com horarios sobrepostos. Race-condition-safe (ao
-- contrario de uma checagem so no cliente).
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    therapist_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = any (array['agendado'::appointment_status, 'confirmado'::appointment_status]));

-- Helper para o front consultar conflitos antes de tentar salvar (evita
-- descobrir o erro so depois do INSERT).
create or replace function public.check_appointment_conflict(
  p_starts_at timestamptz, p_ends_at timestamptz, p_exclude_id uuid default null
) returns table (id uuid, starts_at timestamptz, ends_at timestamptz, patient_name text)
language sql security invoker set search_path = public as $$
  select a.id, a.starts_at, a.ends_at, p.full_name
  from public.appointments a
  left join public.patients p on p.id = a.patient_id
  where a.therapist_id = auth.uid()
    and a.status = any (array['agendado'::appointment_status, 'confirmado'::appointment_status])
    and (p_exclude_id is null or a.id <> p_exclude_id)
    and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_starts_at, p_ends_at);
$$;

revoke all on function public.check_appointment_conflict from public;
grant execute on function public.check_appointment_conflict to authenticated;
