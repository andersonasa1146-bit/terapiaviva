-- Defesa em profundidade: o projeto tem privilegios padrao que concedem
-- EXECUTE a "anon" em toda funcao nova do schema public (padrao do
-- Supabase). Para as funcoes de gestao de equipe — que tratam de convite/
-- vinculo de conta — revogamos explicitamente de "anon", mesmo que a
-- logica interna (auth.uid() is null) ja rejeite chamadas nao autenticadas.
revoke execute on function public.invite_team_member(text, text) from anon;
revoke execute on function public.accept_team_invite(uuid) from anon;
revoke execute on function public.remove_team_member(uuid) from anon;
revoke execute on function public.update_team_member_role(uuid, text) from anon;
revoke execute on function public.list_team_members() from anon;
revoke execute on function public.current_owner_id() from anon;
revoke execute on function public.current_team_role() from anon;
revoke execute on function public.has_clinical_access() from anon;
revoke execute on function public.has_financial_access() from anon;
revoke execute on function public.is_team_admin() from anon;
