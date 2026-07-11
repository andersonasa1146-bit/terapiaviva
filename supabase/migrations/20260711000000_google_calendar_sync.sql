-- Task #23: sincronizacao com Google Calendar ---------------------------
-- Guarda os tokens OAuth2 por terapeuta (instalacao white-label = 1 conta
-- Google por instalacao). Tokens nunca sao expostos ao browser: so as
-- Edge Functions os leem/gravam via RLS (dono = auth.uid()).

alter table public.therapists
  add column if not exists google_access_token text,
  add column if not exists google_refresh_token text,
  add column if not exists google_token_expires_at timestamptz,
  add column if not exists google_calendar_connected boolean not null default false,
  add column if not exists google_oauth_state text;

comment on column public.therapists.google_refresh_token is 'Token OAuth2 de longa duracao para renovar acesso ao Google Calendar (somente Edge Functions leem isto)';
comment on column public.therapists.google_oauth_state is 'Nonce temporario de CSRF durante o fluxo OAuth (limpo apos o callback)';

alter table public.appointments
  add column if not exists google_event_id text;

comment on column public.appointments.google_event_id is 'ID do evento espelhado no Google Calendar da terapeuta, quando a sincronizacao esta ativa';

-- Desconecta a integracao (limpa tokens) sem expor os valores ao cliente.
create or replace function public.disconnect_google_calendar()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.therapists
    set google_access_token = null, google_refresh_token = null,
        google_token_expires_at = null, google_calendar_connected = false,
        google_oauth_state = null
  where id = auth.uid();
end $$;

revoke all on function public.disconnect_google_calendar from public;
grant execute on function public.disconnect_google_calendar to authenticated;
