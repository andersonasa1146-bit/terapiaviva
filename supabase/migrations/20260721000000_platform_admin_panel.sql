-- Task #34: Painel administrativo para o dono do produto (contas, uso, MRR).
-- Distinto do papel "administrador de equipe" (task #29, escopado a UMA
-- clinica) -- este e um nivel ACIMA, o operador da plataforma TerapiaViva,
-- que enxerga um resumo agregado de TODAS as contas/clinicas cadastradas
-- neste projeto Supabase (relevante enquanto o mesmo projeto hospeda mais
-- de uma clinica; em instalacoes white-label 1-cliente-1-projeto, so existira
-- a propria conta).

create table if not exists public.platform_admins (
  id uuid primary key references public.therapists(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on public.platform_admins from authenticated, anon;

create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value)
  values ('mrr_price_brl', '97.00')
  on conflict (key) do nothing;
revoke all on public.platform_settings from authenticated, anon;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from public.platform_admins where id = auth.uid());
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;
revoke execute on function public.is_platform_admin() from anon;

create or replace function public.admin_list_accounts()
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
  created_at timestamptz
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
    (1 + coalesce((select count(*) from public.team_members tm where tm.owner_id = t.id and tm.status = 'ativo'), 0))::bigint as team_size,
    coalesce((select count(*) from public.patients p where p.therapist_id = t.id), 0)::bigint as patient_count,
    t.created_at
  from public.therapists t
  where not exists (
    select 1 from public.team_members tm2 where tm2.member_id = t.id and tm2.status = 'ativo'
  )
  order by t.created_at desc;
end;
$$;
revoke all on function public.admin_list_accounts() from public;
grant execute on function public.admin_list_accounts() to authenticated;
revoke execute on function public.admin_list_accounts() from anon;

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

  select jsonb_build_object(
    'total_accounts', (
      select count(*) from public.therapists t
      where not exists (select 1 from public.team_members tm where tm.member_id = t.id and tm.status = 'ativo')
    ),
    'active_subscriptions', (select count(*) from public.therapists where mp_subscription_status = 'authorized'),
    'trial_accounts', (select count(*) from public.therapists where plan = 'trial' or plan is null),
    'cancelled_accounts', (select count(*) from public.therapists where plan = 'cancelado'),
    'total_patients', (select count(*) from public.patients),
    'total_ai_calls_this_month', (select coalesce(sum(ai_calls_this_month), 0) from public.therapists),
    'mrr_price_brl', v_price,
    'mrr_estimate', (select count(*) from public.therapists where mp_subscription_status = 'authorized') * v_price
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.admin_platform_stats() from public;
grant execute on function public.admin_platform_stats() to authenticated;
revoke execute on function public.admin_platform_stats() from anon;

create or replace function public.admin_set_mrr_price(p_price numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito a administradores da plataforma';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Preco invalido';
  end if;
  insert into public.platform_settings (key, value, updated_at)
  values ('mrr_price_brl', p_price::text, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function public.admin_set_mrr_price(numeric) from public;
grant execute on function public.admin_set_mrr_price(numeric) to authenticated;
revoke execute on function public.admin_set_mrr_price(numeric) from anon;

-- Bootstrap: concede acesso de administrador da plataforma a conta que
-- corresponde ao operador do produto (identificada pelo e-mail cadastrado
-- nesta instalacao). Instalacoes futuras devem conceder via SQL manual
-- (ver README secao 9g) -- nao ha UI de autopromocao por design.
insert into public.platform_admins (id)
select id from public.therapists where email = 'andersonasa1146@gmail.com'
on conflict (id) do nothing;
