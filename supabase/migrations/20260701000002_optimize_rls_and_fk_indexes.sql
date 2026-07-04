-- Otimizacao 1: RLS com (select auth.uid()) — avaliado uma vez por query, nao por linha

drop policy therapist_self_read on public.therapists;
drop policy therapist_self_update on public.therapists;
drop policy patient_owner_all on public.patients;
drop policy session_owner_all on public.sessions;
drop policy anamnesis_owner_all on public.anamneses;
drop policy appointment_owner_all on public.appointments;
drop policy financial_owner_all on public.financial_entries;
drop policy prayer_owner_all on public.prayer_requests;

create policy therapist_self_read on public.therapists
  for select using (id = (select auth.uid()));
create policy therapist_self_update on public.therapists
  for update using (id = (select auth.uid()));

create policy patient_owner_all on public.patients
  for all using (therapist_id = (select auth.uid()))
  with check (therapist_id = (select auth.uid()));

create policy session_owner_all on public.sessions
  for all using (therapist_id = (select auth.uid()))
  with check (therapist_id = (select auth.uid()));

create policy anamnesis_owner_all on public.anamneses
  for all using (therapist_id = (select auth.uid()))
  with check (therapist_id = (select auth.uid()));

create policy appointment_owner_all on public.appointments
  for all using (therapist_id = (select auth.uid()))
  with check (therapist_id = (select auth.uid()));

create policy financial_owner_all on public.financial_entries
  for all using (therapist_id = (select auth.uid()))
  with check (therapist_id = (select auth.uid()));

create policy prayer_owner_all on public.prayer_requests
  for all using (therapist_id = (select auth.uid()))
  with check (therapist_id = (select auth.uid()));

-- Otimizacao 2: indices para FKs restantes
create index if not exists anamneses_patient_id_idx on public.anamneses (patient_id);
create index if not exists financial_entries_patient_id_idx on public.financial_entries (patient_id);
create index if not exists financial_entries_appointment_id_idx on public.financial_entries (appointment_id);
create index if not exists prayer_requests_patient_id_idx on public.prayer_requests (patient_id);
