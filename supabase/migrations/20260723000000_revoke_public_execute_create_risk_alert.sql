-- create_risk_alert ainda tinha o GRANT EXECUTE TO PUBLIC padrao do Postgres
-- intacto (revogar so de "anon" nao basta quando PUBLIC continua concedendo
-- a todo mundo, anon incluso). Revoga de PUBLIC e re-concede explicitamente
-- so para authenticated e service_role, no mesmo padrao das demais funcoes
-- SECURITY DEFINER do projeto.
revoke execute on function public.create_risk_alert(uuid, uuid, text, text, text) from public;
grant execute on function public.create_risk_alert(uuid, uuid, text, text, text) to authenticated, service_role;
