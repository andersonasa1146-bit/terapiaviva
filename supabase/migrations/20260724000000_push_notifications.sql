-- Fase 2: notificacoes push (PWA) ---------------------------------------
-- Permite que a terapeuta (ou membro de equipe) receba notificacoes no
-- proprio dispositivo (celular/desktop com o PWA instalado) para lembretes
-- de sessao e alertas de risco, sem precisar abrir o app manualmente.
--
-- Escopo: push e um canal PARA A EQUIPE (quem usa o app), nao para o
-- paciente — lembretes ao paciente continuam via e-mail/WhatsApp (task #24).
--
-- Cada dispositivo/navegador em que a pessoa clicar em "Ativar notificacoes"
-- gera uma "subscription" (Web Push API padrao), guardada aqui.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.therapists(id) on delete cascade,
  user_id uuid not null references public.therapists(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_self_all on public.push_subscriptions;
create policy push_subscriptions_self_all on public.push_subscriptions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and owner_id = public.current_owner_id());

create index if not exists push_subscriptions_owner_idx on public.push_subscriptions(owner_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- Fase 2: dispara um push (best-effort) para a clinica sempre que um novo
-- alerta de risco e criado, reaproveitando o MESMO segredo compartilhado
-- (cron_secret) ja usado pelo pg_cron de lembretes (task #24), e a mesma
-- Edge Function send-push (criada nesta fase). Nao interrompe o fluxo
-- clinico caso a chamada HTTP falhe (rede fora do ar, secret nao
-- configurado etc.) — o alerta em si sempre e criado normalmente.
create or replace function public.create_risk_alert(
  p_therapist_id uuid, p_patient_id uuid, p_source text, p_severity text, p_message text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.risk_alerts
    where therapist_id = p_therapist_id and patient_id = p_patient_id and source = p_source
      and resolved = false and created_at > now() - interval '6 hours'
  ) then
    return;
  end if;
  insert into public.risk_alerts (therapist_id, patient_id, source, severity, message)
  values (p_therapist_id, p_patient_id, p_source, p_severity, p_message);

  begin
    perform net.http_post(
      url := 'https://dabvcapplqysxwmdhwew.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := jsonb_build_object(
        'owner_id', p_therapist_id,
        'title', 'Alerta de risco - TerapiaViva',
        'body', p_message,
        'url', '/alertas'
      )
    );
  exception when others then
    null;
  end;
end $$;
