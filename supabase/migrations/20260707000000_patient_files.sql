-- Task #20: anexar arquivos/exames ao prontuario ------------------------

-- Bucket privado (nao publico) para arquivos de pacientes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-files', 'patient-files', false, 15728640,
  array['application/pdf','image/png','image/jpeg','image/webp','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

-- RLS em storage.objects: cada terapeuta so acessa arquivos dentro da
-- pasta com o proprio uid (caminho: {therapist_id}/{patient_id}/{arquivo}).
drop policy if exists "patient_files_owner_select" on storage.objects;
create policy "patient_files_owner_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'patient-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "patient_files_owner_insert" on storage.objects;
create policy "patient_files_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'patient-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "patient_files_owner_delete" on storage.objects;
create policy "patient_files_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'patient-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Metadados dos arquivos anexados ao prontuario.
create table if not exists public.patient_files (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.patient_files enable row level security;

drop policy if exists patient_files_owner_all on public.patient_files;
create policy patient_files_owner_all on public.patient_files
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());

create index if not exists patient_files_patient_idx on public.patient_files(patient_id);
