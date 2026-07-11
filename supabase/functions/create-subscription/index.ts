// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: create-subscription
// Cria uma assinatura recorrente (preapproval) no Mercado Pago para a
// terapeuta autenticada e devolve a URL de checkout para redirecionamento.
//
// PENDENTE DE ATIVACAO — para funcionar, configure:
//   supabase secrets set MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
//   supabase secrets set MP_PLAN_PRICE=97.00           (valor mensal em BRL)
//   supabase secrets set MP_BACK_URL=https://app.seudominio.com/config
// Enquanto MERCADOPAGO_ACCESS_TOKEN nao estiver configurado, esta funcao
// responde 501 (nao implementado) para nao quebrar o restante do app.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

initSentry("create-subscription");


Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(corsHeaders, { error: "Method not allowed" }, 405);

  const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!mpToken) {
    return json(corsHeaders, {
      error: "Cobranca ainda nao configurada. Defina MERCADOPAGO_ACCESS_TOKEN nas secrets do Supabase para habilitar assinaturas.",
    }, 501);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(corsHeaders, { error: "Sem token" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return json(corsHeaders, { error: "Sessao invalida" }, 401);

    // Rate limit de curto prazo (evita criar preapprovals duplicados no MP
    // por cliques repetidos no botao de assinar).
    const rl = await checkRateLimit(supabase, `create-subscription:${userRes.user.id}`, 5, 60);
    if (!rl) return rateLimitResponse(corsHeaders);

    const { data: therapist } = await supabase
      .from("therapists").select("full_name, email").eq("id", userRes.user.id).maybeSingle();

    const price = Number(Deno.env.get("MP_PLAN_PRICE") ?? "97.00");
    const backUrl = Deno.env.get("MP_BACK_URL") ?? "";

    // Cria um "preapproval" (assinatura recorrente mensal) no Mercado Pago.
    // Docs: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan
    const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mpToken}`,
      },
      body: JSON.stringify({
        reason: "Assinatura TerapiaViva",
        external_reference: userRes.user.id,
        payer_email: therapist?.email ?? userRes.user.email,
        back_url: backUrl,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: price,
          currency_id: "BRL",
        },
        status: "pending",
      }),
    });

    if (!mpRes.ok) {
      const err = await mpRes.text();
      return json(corsHeaders, { error: "Erro ao criar assinatura no Mercado Pago", detail: err }, 502);
    }

    const mpData = await mpRes.json();

    await supabase.from("therapists").update({
      mp_subscription_id: mpData.id,
      mp_subscription_status: "pending",
    }).eq("id", userRes.user.id);

    return json(corsHeaders, { ok: true, checkout_url: mpData.init_point ?? mpData.sandbox_init_point });
  } catch (e) {
    captureError(e, { function: "create-subscription" });
    return json(corsHeaders, { error: String((e as Error).message ?? e) }, 500);
  }
});

function json(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
