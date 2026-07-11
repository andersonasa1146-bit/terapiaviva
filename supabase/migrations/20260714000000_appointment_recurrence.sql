-- Task #26: recorrencia de agendamentos ---------------------------------

alter table public.appointments
  add column if not exists recurrence_id uuid,
  add column if not exists recurrence_index int;

comment on column public.appointments.recurrence_id is 'Agrupa ocorrencias geradas pela mesma serie recorrente (semanal/quinzenal/mensal)';
comment on column public.appointments.recurrence_index is 'Posicao (1-based) da ocorrencia dentro da serie recorrente';

create index if not exists appointments_recurrence_idx on public.appointments(recurrence_id) where recurrence_id is not null;

-- Cancela todas as ocorrencias futuras (a partir de agora) de uma serie
-- recorrente pertencente a terapeuta autenticada.
create or replace function public.cancel_recurrence_series(p_recurrence_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  update public.appointments
     set status = 'cancelado'
   where recurrence_id = p_recurrence_id
     and therapist_id = auth.uid()
     and starts_at > now()
     and status <> 'cancelado';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.cancel_recurrence_series from public;
grant execute on function public.cancel_recurrence_series to authenticated;
