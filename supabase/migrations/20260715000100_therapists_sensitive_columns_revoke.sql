-- Correcao de seguranca: os tokens OAuth do Google (gravados na task de
-- sincronizacao com Google Calendar) estavam acessiveis ao client via
-- `select('*')` no AuthContext, pois nenhuma coluna havia sido revogada
-- ainda. Aplicamos aqui o mesmo tratamento dado ao token do Mercado Pago
-- pessoal: a coluna passa a nao ser legivel pelo role "authenticated"
-- (usado pelo client via anon key + JWT do usuario); apenas Edge Functions
-- com a Service Role Key (ou funcoes SECURITY DEFINER) continuam
-- enxergando o valor.
revoke select (google_access_token, google_refresh_token, google_oauth_state)
  on public.therapists from authenticated;
