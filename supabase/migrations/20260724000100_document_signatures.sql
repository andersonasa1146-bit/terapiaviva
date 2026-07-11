-- Fase 2: assinatura digital para relatorios -----------------------------
-- Registra o envio de relatorios/documentos para assinatura eletronica via
-- provedor externo (Autentique, por padrao) e o resultado desse fluxo.
-- Nao guardamos o arquivo assinado em nosso proprio Storage (o webhook so
-- recebe a URL do documento assinado hospedada pelo provedor) — se no
-- futuro quisermos espelhar o arquivo, e so estender signed_document_url
-- para um storage_path do bucket patient-files.

create table if not exists public.document_signatures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.therapists(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  document_title text not null,
  provider text not null default 'autentique',
  external_id text,
  status text not null default 'pendente' check (status in ('pendente','enviado','assinado','recusado','cancelado')),
  signer_name text,
  signer_email text,
  signed_document_url text,
  created_at timestamptz not null default now(),
  signed_at timestamptz
);

alter table public.document_signatures enable row level security;

drop policy if exists document_signatures_owner_all on public.document_signatures;
create policy document_signatures_owner_all on public.document_signatures
  for all using (owner_id = public.current_owner_id() and public.has_clinical_access())
  with check (owner_id = public.current_owner_id() and public.has_clinical_access());

create index if not exists document_signatures_patient_idx on public.document_signatures(patient_id);
create index if not exists document_signatures_external_idx on public.document_signatures(external_id);
