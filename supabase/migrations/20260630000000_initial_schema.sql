-- =====================================================================
-- TerapiaViva v2 — Schema inicial
-- Estrategia de seguranca:
--   * Autenticacao via Supabase Auth (auth.users)
--   * Cada terapeuta so enxerga os proprios pacientes via RLS
--   * Colunas sensiveis marcadas com comentario "SENSITIVE"
--   * Criptografia at-rest padrao do Supabase (AES-256) + RLS estrita
--   * pgcrypto habilitado para hashes e tokens de link publico
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- =====================================================================
-- 1) TERAPEUTAS
-- =====================================================================
create table public.therapists (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  city text,
  church text,
  crp text,                             -- registro profissional (opcional)
  bio text,
  photo_url text,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.therapists is 'Cadastro do profissional (1 usuario Auth = 1 terapeuta)';

-- =====================================================================
-- 2) PACIENTES
-- =====================================================================
create type public.risk_level as enum ('baixo', 'moderado', 'alto', 'critico');
create type public.session_mode as enum ('presencial', 'online');
create type public.patient_status as enum ('ativo', 'inativo', 'alta', 'encaminhado');

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  initials text not null,                        -- ex. "MG"
  full_name text not null,                       -- SENSITIVE
  birthdate date,                                -- SENSITIVE
  profession text,
  city text,
  church text,
  phone text,                                    -- SENSITIVE
  email text,                                    -- SENSITIVE
  risk public.risk_level not null default 'baixo',
  status public.patient_status not null default 'ativo',
  avatar_bg text default '#E1F5EE',
  avatar_fg text default '#085041',
  goals text[] not null default '{}',
  started_at date not null default current_date,
  next_appointment_at timestamptz,
  notes text,                                    -- SENSITIVE (observacoes gerais)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.patients (therapist_id, status);
create index on public.patients (therapist_id, next_appointment_at);

-- =====================================================================
-- 3) SESSOES
-- =====================================================================
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  session_number int not null,
  session_date date not null,
  mode public.session_mode not null default 'presencial',
  arrival text,                                  -- SENSITIVE (como o paciente chegou)
  content text not null,                         -- SENSITIVE (conteudo clinico)
  mood int check (mood between 1 and 10),
  spirit int check (spirit between 1 and 10),
  openness int check (openness between 1 and 10),
  goals_done text[] not null default '{}',
  next_goals text,                               -- SENSITIVE
  private_notes text,                            -- SENSITIVE — so a terapeuta ve
  ai_analysis jsonb,                             -- resultado bruto da IA
  ai_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sessions (patient_id, session_date desc);
create index on public.sessions (therapist_id, session_date desc);
create unique index on public.sessions (patient_id, session_number);

-- =====================================================================
-- 4) ANAMNESES
-- =====================================================================
create type public.anamnesis_status as enum ('pending', 'sent', 'submitted', 'reviewed');

create table public.anamneses (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  status public.anamnesis_status not null default 'pending',
  public_token text unique default encode(gen_random_bytes(24), 'hex'),
  token_expires_at timestamptz default (now() + interval '7 days'),
  answers jsonb not null default '{}'::jsonb,    -- SENSITIVE (respostas do paciente)
  ai_evaluation jsonb,                           -- avaliacao IA
  ai_evaluated_at timestamptz,
  risk_flagged boolean not null default false,   -- true se marcou risco imediato
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.anamneses (therapist_id, status);
create index on public.anamneses (public_token);
create index on public.anamneses (therapist_id, risk_flagged) where risk_flagged;

-- =====================================================================
-- 5) AGENDA
-- =====================================================================
create type public.appointment_status as enum ('agendado', 'confirmado', 'realizado', 'cancelado', 'faltou');

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode public.session_mode not null default 'presencial',
  status public.appointment_status not null default 'agendado',
  meeting_url text,
  amount numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.appointments (therapist_id, starts_at);
create index on public.appointments (patient_id, starts_at);

-- =====================================================================
-- 6) FINANCEIRO
-- =====================================================================
create type public.entry_kind as enum ('receita', 'despesa');
create type public.entry_status as enum ('pendente', 'pago', 'cancelado');
create type public.entry_category as enum (
  'sessao', 'pacote', 'workshop', 'palestra',            -- receitas
  'aluguel', 'plataforma', 'marketing', 'formacao',      -- despesas
  'material', 'impostos', 'outros'
);

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  kind public.entry_kind not null,
  category public.entry_category not null default 'outros',
  description text not null,
  amount numeric(10,2) not null,
  entry_date date not null default current_date,
  due_date date,
  status public.entry_status not null default 'pago',
  payment_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.financial_entries (therapist_id, entry_date desc);
create index on public.financial_entries (therapist_id, kind, entry_date);

-- =====================================================================
-- 7) MURAL DE ORACAO
-- =====================================================================
create table public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete cascade,
  intention text not null,
  answered boolean not null default false,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.prayer_requests (therapist_id, answered, created_at desc);

-- =====================================================================
-- 8) TRIGGERS updated_at
-- =====================================================================
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger t_therapists_updated before update on public.therapists
  for each row execute function public.set_updated_at();
create trigger t_patients_updated before update on public.patients
  for each row execute function public.set_updated_at();
create trigger t_sessions_updated before update on public.sessions
  for each row execute function public.set_updated_at();
create trigger t_anamneses_updated before update on public.anamneses
  for each row execute function public.set_updated_at();
create trigger t_appointments_updated before update on public.appointments
  for each row execute function public.set_updated_at();
create trigger t_financial_updated before update on public.financial_entries
  for each row execute function public.set_updated_at();

-- Cria registro em therapists automaticamente quando um usuario se registra
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.therapists (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'Nova Terapeuta'), new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 9) VIEWS PARA DASHBOARD FINANCEIRO
-- =====================================================================
-- Serie mensal dos ultimos 24 meses (para comparacao YoY)
create or replace view public.v_financial_monthly
with (security_invoker = true) as
select
  therapist_id,
  date_trunc('month', entry_date)::date as month,
  sum(case when kind = 'receita' and status = 'pago' then amount else 0 end) as revenue,
  sum(case when kind = 'despesa' and status = 'pago' then amount else 0 end) as expenses,
  sum(case when kind = 'receita' and status = 'pago' then amount else 0 end)
    - sum(case when kind = 'despesa' and status = 'pago' then amount else 0 end) as net,
  count(*) filter (where kind = 'receita' and status = 'pago') as receita_count,
  count(*) filter (where kind = 'despesa' and status = 'pago') as despesa_count
from public.financial_entries
where entry_date >= (current_date - interval '24 months')
group by therapist_id, date_trunc('month', entry_date);

-- Serie mensal por categoria (para grafico de composicao)
create or replace view public.v_financial_by_category
with (security_invoker = true) as
select
  therapist_id,
  date_trunc('month', entry_date)::date as month,
  category,
  kind,
  sum(amount) as total
from public.financial_entries
where status = 'pago'
  and entry_date >= (current_date - interval '12 months')
group by therapist_id, date_trunc('month', entry_date), category, kind;

-- KPIs consolidados
create or replace view public.v_dashboard_kpis
with (security_invoker = true) as
select
  t.id as therapist_id,
  (select count(*) from public.patients p where p.therapist_id = t.id and p.status = 'ativo') as active_patients,
  (select count(*) from public.appointments a
     where a.therapist_id = t.id
       and a.starts_at::date = current_date
       and a.status in ('agendado','confirmado')) as today_appointments,
  (select count(*) from public.anamneses an
     where an.therapist_id = t.id and an.status in ('submitted','sent')) as pending_anamneses,
  (select count(*) from public.anamneses an
     where an.therapist_id = t.id and an.risk_flagged and an.status = 'submitted') as flagged_anamneses
from public.therapists t;

-- =====================================================================
-- 10) RLS — Row Level Security
-- =====================================================================
alter table public.therapists         enable row level security;
alter table public.patients           enable row level security;
alter table public.sessions           enable row level security;
alter table public.anamneses          enable row level security;
alter table public.appointments       enable row level security;
alter table public.financial_entries  enable row level security;
alter table public.prayer_requests    enable row level security;

-- therapists: cada terapeuta so ve/edita a si mesma
create policy therapist_self_read on public.therapists
  for select using (id = auth.uid());
create policy therapist_self_update on public.therapists
  for update using (id = auth.uid());

-- patients
create policy patient_owner_all on public.patients
  for all using (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

-- sessions
create policy session_owner_all on public.sessions
  for all using (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

-- anamneses: leitura/escrita da terapeuta
create policy anamnesis_owner_all on public.anamneses
  for all using (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

-- appointments
create policy appointment_owner_all on public.appointments
  for all using (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

-- financial
create policy financial_owner_all on public.financial_entries
  for all using (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

-- prayer
create policy prayer_owner_all on public.prayer_requests
  for all using (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

-- =====================================================================
-- 11) FUNCAO PUBLICA — Anamnese pelo token (paciente)
-- Permite paciente enviar respostas sem estar autenticado, apenas com token.
-- =====================================================================
create or replace function public.submit_anamnesis(
  p_token text,
  p_answers jsonb,
  p_risk_flagged boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  update public.anamneses
     set answers = p_answers,
         risk_flagged = p_risk_flagged,
         status = 'submitted',
         submitted_at = now()
   where public_token = p_token
     and (token_expires_at is null or token_expires_at > now())
     and status in ('pending','sent')
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'Token invalido ou expirado');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function public.submit_anamnesis from public;
grant execute on function public.submit_anamnesis to anon, authenticated;

-- =====================================================================
-- 12) SEED opcional — descomente para popular com dados demo
-- =====================================================================
-- (mantido comentado — o app cria dados demo apos primeiro login via UI)
