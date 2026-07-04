-- TerapiaViva v2 — Escalas clinicas padronizadas (PHQ-9, GAD-7)

create type public.scale_type as enum ('phq9', 'gad7');

create table public.clinical_scales (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  scale scale_type not null,
  answers int[] not null,
  total_score int not null,
  severity text not null,
  applied_at date not null default current_date,
  created_at timestamptz not null default now()
);
create index on public.clinical_scales (patient_id, scale, applied_at);
create index on public.clinical_scales (therapist_id, applied_at desc);

alter table public.clinical_scales enable row level security;
create policy clinical_scales_owner_all on public.clinical_scales
  for all using (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

comment on table public.clinical_scales is 'Respostas e pontuacao de escalas clinicas padronizadas (PHQ-9, GAD-7) aplicadas aos pacientes';
