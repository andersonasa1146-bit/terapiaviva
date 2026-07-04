-- Usa data local Brasil para comparacoes de "hoje"
create or replace view public.v_dashboard_kpis
with (security_invoker = true) as
select
  t.id as therapist_id,
  (select count(*) from public.patients p where p.therapist_id = t.id and p.status = 'ativo') as active_patients,
  (select count(*) from public.appointments a
     where a.therapist_id = t.id
       and (a.starts_at at time zone 'America/Sao_Paulo')::date
           = (now() at time zone 'America/Sao_Paulo')::date
       and a.status in ('agendado','confirmado')) as today_appointments,
  (select count(*) from public.anamneses an
     where an.therapist_id = t.id and an.status in ('submitted','sent')) as pending_anamneses,
  (select count(*) from public.anamneses an
     where an.therapist_id = t.id and an.risk_flagged and an.status = 'submitted') as flagged_anamneses
from public.therapists t;
