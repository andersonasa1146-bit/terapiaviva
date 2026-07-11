-- Task #19: permitir edicao de sessoes ja salvas
alter table public.sessions add column if not exists edited_at timestamptz;
comment on column public.sessions.edited_at is 'Preenchido quando a sessao e editada apos o registro original (task #19)';
