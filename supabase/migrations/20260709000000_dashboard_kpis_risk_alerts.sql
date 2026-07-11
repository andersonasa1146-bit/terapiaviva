-- Task #21: adiciona contagem de alertas de risco nao resolvidos ao
-- painel de KPIs usado pela Sidebar/Dashboard.
create or replace view public.v_dashboard_kpis as
select
  t.id as therapist_id,
  (select count(*) from patients p where p.therapist_id = t.id and p.status = 'ativo'::patient_status) as active_patients,
  (select count(*) from appointments a where a.therapist_id = t.id
     and (a.starts_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
     and a.status = any (array['agendado'::appointment_status, 'confirmado'::appointment_status])) as today_appointments,
  (select count(*) from anamneses an where an.therapist_id = t.id
     and an.status = any (array['submitted'::anamnesis_status, 'sent'::anamnesis_status])) as pending_anamneses,
  (select count(*) from anamneses an where an.therapist_id = t.id and an.risk_flagged and an.status = 'submitted'::anamnesis_status) as flagged_anamneses,
  (select count(*) from risk_alerts ra where ra.therapist_id = t.id and ra.resolved = false) as unresolved_risk_alerts
from therapists t;
