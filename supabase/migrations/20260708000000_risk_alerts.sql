-- Task #21: alerta automatico de risco critico -------------------------
-- Centraliza sinais de risco (escalas clinicas, IA de sessao, IA de
-- anamnese, autorrelato de risco imediato) numa unica tabela que
-- alimenta um painel/alerta visivel para a terapeuta, sem depender de
-- ela lembrar de abrir cada prontuario manualmente.

create table if not exists public.risk_alerts (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  source text not null check (source in ('clinical_scale','ai_session','ai_anamnese','self_report')),
  severity text not null default 'critico' check (severity in ('moderado','alto','critico')),
  message text not null,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.risk_alerts enable row level security;

drop policy if exists risk_alerts_owner_all on public.risk_alerts;
create policy risk_alerts_owner_all on public.risk_alerts
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());

create index if not exists risk_alerts_therapist_idx on public.risk_alerts(therapist_id, resolved, created_at desc);

-- Evita spam: so cria um novo alerta se nao existir um igual (mesmo
-- paciente + origem + severidade) ainda nao resolvido nas ultimas 6h.
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
end $$;

-- 1) Escalas clinicas: item de ideacao suicida/autolesao do PHQ-9 (pergunta 9,
--    indice 1-based no array) ou severidade alta em qualquer escala.
create or replace function public.trg_clinical_scale_risk_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.scale = 'phq9' and coalesce(new.answers[9], 0) > 0 then
    perform public.create_risk_alert(new.therapist_id, new.patient_id, 'clinical_scale', 'critico',
      'PHQ-9: resposta positiva ao item de ideacao suicida/autolesao (pergunta 9). Avaliar risco imediatamente.');
  elsif new.severity in ('Severa','Moderadamente severa') then
    perform public.create_risk_alert(new.therapist_id, new.patient_id, 'clinical_scale', 'alto',
      upper(new.scale) || ': pontuacao ' || new.total_score || ' — severidade ' || new.severity || '.');
  end if;
  return new;
end $$;

drop trigger if exists clinical_scales_risk_alert on public.clinical_scales;
create trigger clinical_scales_risk_alert
  after insert on public.clinical_scales
  for each row execute function public.trg_clinical_scale_risk_alert();

-- 2) Analise de IA da sessao: nivel_sessao alto ou lista de alertas nao vazia.
create or replace function public.trg_session_ai_risk_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_therapist uuid;
  v_nivel text;
  v_alertas jsonb;
begin
  if new.ai_analysis is null then return new; end if;
  if old.ai_analysis is not distinct from new.ai_analysis then return new; end if;

  select therapist_id into v_therapist from public.patients where id = new.patient_id;
  v_nivel := new.ai_analysis->>'nivel_sessao';
  v_alertas := coalesce(new.ai_analysis->'alertas', '[]'::jsonb);

  if v_nivel = 'alto' or jsonb_array_length(v_alertas) > 0 then
    perform public.create_risk_alert(v_therapist, new.patient_id, 'ai_session',
      case when v_nivel = 'alto' then 'alto' else 'moderado' end,
      'IA sinalizou sessao #' || new.session_number || ' como risco ' || coalesce(v_nivel,'?') ||
      case when jsonb_array_length(v_alertas) > 0 then '. Alertas: ' || (select string_agg(x, '; ') from jsonb_array_elements_text(v_alertas) x) else '' end || '.');
  end if;
  return new;
end $$;

drop trigger if exists sessions_ai_risk_alert on public.sessions;
create trigger sessions_ai_risk_alert
  after update of ai_analysis on public.sessions
  for each row execute function public.trg_session_ai_risk_alert();

-- 3) Anamnese: autorrelato de risco imediato (risk_flagged) e/ou avaliacao
--    de IA com nivel_risco alto/critico.
create or replace function public.trg_anamnese_risk_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nivel text;
begin
  if new.risk_flagged is true and (old.risk_flagged is distinct from true) then
    perform public.create_risk_alert(new.therapist_id, new.patient_id, 'self_report', 'critico',
      'Paciente sinalizou risco imediato no formulario de anamnese. Contato prioritario recomendado.');
  end if;

  if new.ai_evaluation is not null and (old.ai_evaluation is distinct from new.ai_evaluation) then
    v_nivel := new.ai_evaluation->>'nivel_risco';
    if v_nivel in ('alto','critico') then
      perform public.create_risk_alert(new.therapist_id, new.patient_id, 'ai_anamnese', v_nivel,
        'IA avaliou a anamnese como risco ' || v_nivel || '.');
    end if;
  end if;

  return new;
end $$;

drop trigger if exists anamneses_risk_alert on public.anamneses;
create trigger anamneses_risk_alert
  after insert or update on public.anamneses
  for each row execute function public.trg_anamnese_risk_alert();
