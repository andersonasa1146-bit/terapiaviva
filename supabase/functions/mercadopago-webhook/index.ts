// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: mercadopago-webhook
// Recebe notificacoes do Mercado Pago sobre mudancas de status de assinatura
// (preapproval) e atualiza o plano da terapeuta correspondente.
//
// PENDENTE DE ATIVACAO — configure no painel do Mercado Pago a URL deste
// webhook (https://SEU-PROJETO.supabase.co/functions/v1/mercadopago-webhook)
// e defina a secret:
//   supabase secrets set MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
//
// Este endpoint usa a Service Role key para poder atualizar qualquer conta
// (terapeutas nao estao autenticadas quando o MP chama este webhook).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, clientIp } from "../_shared/rateLimit.ts";
import { verifyMpSignature } from "../_shared/mercadopago.ts";

initSentry("mercadopago-webhook");

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!mpToken || !serviceKey || !supabaseUrl) {
    return new Response(JSON.stringify({ error: "Webhook nao configurado (faltam secrets)" }), { status: 501 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Rate limit por IP — generoso, pois o Mercado Pago pode chamar em rajada,
  // mas ainda protege contra bots martelando o endpoint publico.
  const rl = await checkRateLimit(supabase, `mercadopago-webhook:${clientIp(req)}`, 120, 60);
  if (!rl) return new Response(JSON.stringify({ error: "Muitas requisicoes" }), { status: 429 });

  try {
    const body = await req.json().catch(() => ({}));
    // Mercado Pago envia { type: "preapproval", data: { id } } ou via query string ?topic=&id=
    const url = new URL(req.url);
    const preapprovalId = body?.data?.id ?? url.searchParams.get("id");
    const topic = body?.type ?? url.searchParams.get("topic");

    // Valida a assinatura HMAC do Mercado Pago (header x-signature) antes de
    // processar. Sem MERCADOPAGO_WEBHOOK_SECRET configurada, apenas avisa.
    const sig = await verifyMpSignature(req, String(preapprovalId ?? url.searchParams.get("data.id") ?? ""));
    if (!sig.ok) {
      return new Response(JSON.stringify({ error: `Assinatura do webhook rejeitada: ${sig.reason}` }), { status: 401 });
    }

    if (!preapprovalId || (topic && topic !== "preapproval" && topic !== "subscription_preapproval")) {
      // Notificacao de outro tipo (ex.: pagamento avulso) — ignora silenciosamente.
      return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200 });
    }

    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!mpRes.ok) {
      return new Response(JSON.stringify({ error: "Falha ao consultar assinatura no Mercado Pago" }), { status: 502 });
    }
    const preapproval = await mpRes.json();
    const therapistId = preapproval.external_reference;
    if (!therapistId) return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200 });

    // Mapeia status do MP (authorized, paused, cancelled, pending) para o plano.
    const status = preapproval.status as string;
    const patch: Record<string, unknown> = { mp_subscription_status: status };
    if (status === "authorized") {
      patch.plan = "profissional";
      patch.plan_ai_limit = Number(Deno.env.get("MP_PLAN_AI_LIMIT") ?? "300");
    } else if (status === "cancelled" || status === "paused") {
      patch.plan = "cancelado";
    }

    await supabase.from("therapists").update(patch).eq("id", therapistId);

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    captureError(e, { function: "mercadopago-webhook" });
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 500 });
  }
});
