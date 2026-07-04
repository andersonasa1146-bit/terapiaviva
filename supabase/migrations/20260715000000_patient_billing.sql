-- Task #28: cobranca de pacientes (Mercado Pago pessoal da terapeuta) ---
-- Distinto da assinatura SaaS (create-subscription, secao 9 do README):
-- aqui a TERAPEUTA cobra os PROPRIOS pacientes usando a CONTA MERCADO PAGO
-- DELA MESMA (nao a do operador da plataforma). O token fica no banco,
-- protegido por RLS + column-level revoke (nunca sai via select('*') do
-- client, que e o padrao usado no AuthContext).

alter table public.therapists add column if not exists mp_patient_access_token text;
comment on column public.therapists.mp_patient_access_token is 'Token pessoal da terapeuta no Mercado Pago (para cobrar seus pacientes). Nunca deve ser exposto ao client.';

-- Bloqueia a leitura dessa coluna especifica pelo role usado no client
-- (authenticated), mesmo que a RLS da tabela permita SELECT nas demais
-- colunas. Funcoes SECURITY DEFINER abaixo continuam enxergando a coluna.
revoke select (mp_patient_access_token) on public.therapists from authenticated;

create table if not exists public.patient_charges (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  description text not null,
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','cancelled','expired')),
  mp_preference_id text,
  mp_payment_id text,
  payment_link text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table public.patient_charges enable row level security;
drop policy if exists patient_charges_owner_all on public.patient_charges;
create policy patient_charges_owner_all on public.patient_charges
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());

create index if not exists patient_charges_patient_idx on public.patient_charges(patient_id);

-- Salva o token pessoal da terapeuta (write-only do ponto de vista do client).
create or replace function public.set_patient_mp_token(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.therapists set mp_patient_access_token = nullif(trim(p_token), '') where id = auth.uid();
end $$;
revoke all on function public.set_patient_mp_token from public;
grant execute on function public.set_patient_mp_token to authenticated;

create or replace function public.clear_patient_mp_token()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.therapists set mp_patient_access_token = null where id = auth.uid();
end $$;
revoke all on function public.clear_patient_mp_token from public;
grant execute on function public.clear_patient_mp_token to authenticated;

-- Permite ao client saber SE ha um token configurado, sem nunca ver o valor.
create or replace function public.has_patient_mp_token()
returns boolean language sql security definer set search_path = public as $$
  select mp_patient_access_token is not null from public.therapists where id = auth.uid();
$$;
revoke all on function public.has_patient_mp_token from public;
grant execute on function public.has_patient_mp_token to authenticated;
