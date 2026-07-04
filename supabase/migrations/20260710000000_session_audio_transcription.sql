-- Task #22: transcricao de audio da sessao por IA -----------------------

alter table public.sessions
  add column if not exists audio_path text,
  add column if not exists audio_transcript text,
  add column if not exists audio_transcribed_at timestamptz;

-- Bucket privado para os arquivos de audio das sessoes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'session-audio', 'session-audio', false, 26214400,
  array['audio/mpeg','audio/mp4','audio/wav','audio/webm','audio/ogg','audio/x-m4a','audio/aac']
)
on conflict (id) do nothing;

drop policy if exists "session_audio_owner_select" on storage.objects;
create policy "session_audio_owner_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'session-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "session_audio_owner_insert" on storage.objects;
create policy "session_audio_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'session-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "session_audio_owner_delete" on storage.objects;
create policy "session_audio_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'session-audio' and (storage.foldername(name))[1] = auth.uid()::text);
