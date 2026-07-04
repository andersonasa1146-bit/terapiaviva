-- Fix 1: set_updated_at com search_path fixo
create or replace function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin new.updated_at = now(); return new; end $$;

-- Fix 2: handle_new_user nao deve ser chamavel via RPC
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- submit_anamnesis PRECISA continuar acessivel pelo paciente sem login
-- (esse permanece como warning esperado)
