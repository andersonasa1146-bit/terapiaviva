-- Hardening: revoke EXECUTE de "anon" em funcoes SECURITY DEFINER que ja
-- validam auth.uid()/current_owner_id() internamente, mas nunca tiveram
-- essa revogacao explicita feita (o Postgres concede EXECUTE a PUBLIC por
-- padrao em toda funcao nova). Nenhuma dessas funcoes e explorada de fato
-- por um chamador anonimo (a checagem interna sempre falha sem sessao),
-- mas revogar e defesa em profundidade e remove o alerta
-- anon_security_definer_function_executable do advisor de seguranca.
--
-- submit_anamnesis fica de fora DE PROPOSITO: e a unica funcao desta
-- familia que precisa continuar publica (o paciente responde a anamnese
-- sem estar logado).

revoke execute on function public.cancel_recurrence_series(uuid) from anon;
revoke execute on function public.check_ai_quota(uuid) from anon;
revoke execute on function public.clear_patient_mp_token() from anon;
revoke execute on function public.create_risk_alert(uuid, uuid, text, text, text) from anon;
revoke execute on function public.disconnect_google_calendar() from anon;
revoke execute on function public.erase_patient(uuid, text) from anon;
revoke execute on function public.export_patient_data(uuid) from anon;
revoke execute on function public.has_patient_mp_token() from anon;
revoke execute on function public.list_pending_reminders() from anon;
revoke execute on function public.mark_reminder_sent(uuid) from anon;
revoke execute on function public.record_ai_usage(uuid) from anon;
revoke execute on function public.set_patient_mp_token(text) from anon;
