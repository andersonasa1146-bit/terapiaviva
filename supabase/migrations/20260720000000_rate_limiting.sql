-- Task #32: rate limiting geral (defesa contra abuso/spam em Edge Functions
-- e chamadas repetidas de IA), complementando a cota mensal ja existente
-- (check_ai_quota) com um limite de curto prazo por usuario/clinica/IP.

create table if not exists public.rate_limit_buckets (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

create index if not exists idx_rate_limit_buckets_window_start
  on public.rate_limit_buckets (window_start);

-- Sem grant nenhum ao client: a unica forma de interagir com esta tabela
-- e via a funcao SECURITY DEFINER abaixo (mesmo padrao de tamper-resistance
-- usado em access_audit_log).
revoke all on public.rate_limit_buckets from authenticated, anon;

create or replace function public.check_rate_limit(p_key text, p_max_calls int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limit_buckets (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case
      when rate_limit_buckets.window_start < now() - make_interval(secs => p_window_seconds)
      then 1
      else rate_limit_buckets.count + 1
    end,
    window_start = case
      when rate_limit_buckets.window_start < now() - make_interval(secs => p_window_seconds)
      then now()
      else rate_limit_buckets.window_start
    end
  returning count into v_count;

  return v_count <= p_max_calls;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public;
grant execute on function public.check_rate_limit(text, int, int) to authenticated, service_role;
revoke execute on function public.check_rate_limit(text, int, int) from anon;

-- Limpeza diaria dos buckets antigos (evita crescimento indefinido da tabela).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-rate-limit-buckets') then
    perform cron.unschedule('cleanup-rate-limit-buckets');
  end if;
end $$;

select cron.schedule(
  'cleanup-rate-limit-buckets',
  '30 3 * * *',
  $$delete from public.rate_limit_buckets where window_start < now() - interval '1 day'$$
);
