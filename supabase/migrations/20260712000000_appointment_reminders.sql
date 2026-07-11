-- Task #24: lembretes automaticos por WhatsApp/e-mail -------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.appointments add column if not exists reminder_sent_at timestamptz;

alter table public.therapists
  add column if not exists reminder_hours_before int not null default 24,
  add column if not exists reminder_email_enabled boolean not null default true,
  add column if not exists reminder_whatsapp_enabled boolean not null default false;

comment on column public.appointments.reminder_sent_at is 'Preenchido quando o lembrete automatico (email/whatsapp) foi enviado, para nao duplicar envios';
comment on column public.therapists.reminder_hours_before is 'Quantas horas antes do horario marcado o lembrete automatico deve ser enviado ao paciente';

-- Retorna os agendamentos elegiveis para lembrete (dentro da janela
-- configurada por terapeuta, ainda nao enviados). So chamavel pela
-- service role (Edge Function de cron), nunca pelo cliente.
create or replace function public.list_pending_reminders()
returns table (
  appointment_id uuid,
  therapist_id uuid,
  starts_at timestamptz,
  mode text,
  therapist_name text,
  patient_name text,
  patient_email text,
  patient_phone text,
  email_enabled boolean,
  whatsapp_enabled boolean
)
language sql security definer set search_path = public as $$
  select a.id, a.therapist_id, a.starts_at, a.mode::text,
         t.full_name, p.full_name, p.email, p.phone,
         t.reminder_email_enabled, t.reminder_whatsapp_enabled
  from public.appointments a
  join public.therapists t on t.id = a.therapist_id
  left join public.patients p on p.id = a.patient_id
  where a.reminder_sent_at is null
    and a.status = any (array['agendado'::appointment_status, 'confirmado'::appointment_status])
    and a.starts_at > now()
    and a.starts_at <= now() + make_interval(hours => t.reminder_hours_before);
$$;

revoke all on function public.list_pending_reminders from public;
grant execute on function public.list_pending_reminders to service_role;

create or replace function public.mark_reminder_sent(p_appointment_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.appointments set reminder_sent_at = now() where id = p_appointment_id;
$$;

revoke all on function public.mark_reminder_sent from public;
grant execute on function public.mark_reminder_sent to service_role;

-- Segredo compartilhado entre o pg_cron (dentro do Postgres) e a Edge
-- Function send-reminders, para autenticar a chamada HTTP interna sem
-- depender de um JWT de usuario (o pg_net roda "fora" de uma sessao logada).
-- O MESMO valor deve ser configurado como secret da Edge Function:
--   supabase secrets set CRON_SECRET=MV7ZKmbtG66fEs7vjB8Be8ZEjz3dhaRWe4E7vZeCX2w
select vault.create_secret(
  'MV7ZKmbtG66fEs7vjB8Be8ZEjz3dhaRWe4E7vZeCX2w',
  'cron_secret',
  'Segredo compartilhado entre pg_cron e a Edge Function send-reminders'
) where not exists (select 1 from vault.decrypted_secrets where name = 'cron_secret');

select cron.unschedule('send-appointment-reminders') where exists (
  select 1 from cron.job where jobname = 'send-appointment-reminders'
);

select cron.schedule(
  'send-appointment-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://dabvcapplqysxwmdhwew.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
