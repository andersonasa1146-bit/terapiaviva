// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: send-push
// Fase 2 do roadmap: notificacoes push (PWA). Serve DOIS propositos com um
// unico endpoint (deployado com --no-verify-jwt, autenticacao feita aqui
// dentro, no mesmo espirito de send-reminders):
//
//   1) Chamada INTERNA (pg_net/pg_cron ou outra Edge Function), autenticada
//      pelo header x-cron-secret (MESMO segredo ja usado em send-reminders)
//      — envia para TODA a clinica (owner_id).
//   2) Chamada pelo PROPRIO usuario autenticado (Bearer JWT), so para
//      disparar uma notificacao de TESTE para os proprios dispositivos —
//      usado pelo botao "Enviar notificacao de teste" em Configuracoes.
//
// Configure em producao (ver supabase/functions/_shared/push.ts):
//   supabase secrets set VAPID_PUBLIC_KEY=...
//   supabase secrets set VAPID_PRIVATE_KEY=...
//   supabase secrets set VAPID_SUBJECT=mailto:contato@seudominio.com
// CRON_SECRET e o mesmo ja configurado para send-reminders.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { sendPushToOwner, sendPushToUser } from "../_shared/push.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

initSentry("send-push");


Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(corsHeaders, { error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));

    const expected = Deno.env.get("CRON_SECRET");
    const provided = req.headers.get("x-cron-secret");
    if (expected && provided === expected) {
      const ownerId = body?.owner_id;
      if (!ownerId) return json(corsHeaders, { error: "owner_id obrigatorio" }, 400);
      const result = await sendPushToOwner(admin, ownerId, {
        title: body?.title ?? "TerapiaViva",
        body: body?.body ?? "",
        url: body?.url ?? "/",
      });
      return json(corsHeaders, { ok: true, ...result });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes?.user) return json(corsHeaders, { error: "Sessao invalida" }, 401);

      const rl = await checkRateLimit(supabase, `send-push-test:${userRes.user.id}`, 5, 60);
      if (!rl) return rateLimitResponse(corsHeaders);

      const result = await sendPushToUser(admin, userRes.user.id, {
        title: "TerapiaViva",
        body: "Notificacoes push configuradas com sucesso.",
        url: "/config",
      });
      return json(corsHeaders, { ok: true, ...result });
    }

    return json(corsHeaders, { error: "Nao autorizado" }, 401);
  } catch (e) {
    captureError(e, { function: "send-push" });
    return json(corsHeaders, { error: String((e as Error).message ?? e) }, 500);
  }
});

function json(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
