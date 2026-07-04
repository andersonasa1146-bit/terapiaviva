-- Fase 2: teleconsulta integrada (Daily.co) ------------------------------
-- Guarda a sala de video criada para cada agendamento ONLINE, para que o
-- mesmo link seja reaproveitado se a terapeuta/paciente reabrirem a
-- teleconsulta antes do horario expirar.

create table if not exists public.video_rooms (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  owner_id uuid not null references public.therapists(id) on delete cascade,
  provider text not null default 'daily',
  room_name text not null,
  room_url text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table public.video_rooms enable row level security;

drop policy if exists video_rooms_owner_all on public.video_rooms;
create policy video_rooms_owner_all on public.video_rooms
  for all using (owner_id = public.current_owner_id() and public.has_clinical_access())
  with check (owner_id = public.current_owner_id() and public.has_clinical_access());

create index if not exists video_rooms_owner_idx on public.video_rooms(owner_id);
