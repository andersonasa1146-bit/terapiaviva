-- Corrige achado do advisor (ERROR: security_definer_view): v_dashboard_kpis
-- era uma view sem `security_invoker`, ou seja, rodava com os privilegios de
-- quem a criou (bypassando RLS), e nao tinha WHERE nenhum restringindo a
-- linha de `therapists` — qualquer usuario autenticado que chamasse a view
-- filtrando por outro therapist_id conseguiria ver os KPIs agregados de
-- OUTRA clinica (vazamento de dados entre tenants). Corrigido com
-- security_invoker = true, o que faz a viewrespeitar a RLS de `therapists`
-- (e das tabelas usadas nas subqueries) com base em quem esta consultando.
--
-- Tambem estende a policy de leitura de `therapists` para permitir que um
-- membro de equipe veja a linha do PROPRIETARIO da clinica (necessario para
-- o dashboard compartilhado e para configuracoes somente-leitura da
-- clinica) — updates continuam restritos a auth.uid() = id (so o dono ou o
-- proprio usuario edita sua propria linha).
drop policy if exists therapist_self_read on public.therapists;
create policy therapist_self_read on public.therapists
  for select using (id = auth.uid() or id = public.current_owner_id());

create or replace view public.v_dashboard_kpis
with (security_invoker = true) as
select t.id as therapist_id,
    (select count(*) from public.patients p where p.therapist_id = t.id and p.status = 'ativo') as active_patients,
    (select count(*) from public.appointments a where a.therapist_id = t.id
        and (a.starts_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
        and a.status = any (array['agendado','confirmado']::public.appointment_status[])) as today_appointments,
    (select count(*) from public.anamneses an where an.therapist_id = t.id
        and an.status = any (array['submitted','sent']::public.anamnesis_status[])) as pending_anamneses,
    (select count(*) from public.anamneses an where an.therapist_id = t.id
        and an.risk_flagged and an.status = 'submitted'::public.anamnesis_status) as flagged_anamneses,
    (select count(*) from public.risk_alerts ra where ra.therapist_id = t.id and ra.resolved = false) as unresolved_risk_alerts
from public.therapists t;
