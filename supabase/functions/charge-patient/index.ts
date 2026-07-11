// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: charge-patient
// Cria uma cobranca (Mercado Pago Checkout Pro) para UM PACIENTE, usando
// o token PESSOAL da propria terapeuta (nao o token da plataforma usado
// em create-subscription). Isso permite cobrar sessoes avulsas, pacotes
// etc. diretamente dos pacientes, com o dinheiro caindo na conta MP da
// propria terapeuta.
//
// A terapeuta configura seu token pessoal em Configuracoes -> Cobranca de
// pacientes (RPC set_patient_mp_token). Sem token configurado, responde 501.
//
// Task #29 (equipe): quem chama esta funcao pode ser um membro de equipe
// (admin) operando na clinica de outra pessoa (a PROPRIETARIA da conta,
// dona do token pessoal do Mercado Pago). Por isso resolvemos
// current_owner_id() (RPC que respeita o vinculo em team_members) via o
// client autenticado do usuario ANTES de usar o client Service Role — o
// token e o registro de cobranca sempre pertencem ao PROPRIETARIO da
// clinica, nunca a quem apertou o botao.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

initSentry("charge-patient");


Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(corsHeaders, { error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(corsHeaders, { error: "Sem token" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const appUrl = Deno.env.get("APP_URL") ?? "";

    // Cliente com o JWT do usuario — usado para tudo que respeita RLS.
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return json(corsHeaders, { error: "Sessao invalida" }, 401);

    // Resolve o proprietario da clinica (pode ser o proprio usuario, ou o
    // dono da conta se quem chamou for um membro de equipe com acesso
    // financeiro — RLS/roles ja garantem isso na RPC).
    const { data: ownerId, error: ownerErr } = await supabase.rpc("current_owner_id");
    if (ownerErr || !ownerId) return json(corsHeaders, { error: "Nao foi possivel resolver a clinica do usuario" }, 500);

    // Rate limit por CLINICA (nao por usuario individual), ja que qualquer
    // membro de equipe com acesso financeiro compartilha o mesmo token MP.
    const rl = await checkRateLimit(supabase, `charge-patient:${ownerId}`, 20, 60);
    if (!rl) return rateLimitResponse(corsHeaders);

    const { data: hasAccess } = await supabase.rpc("has_financial_access");
    if (!hasAccess) return json(corsHeaders, { error: "Seu papel na equipe nao tem acesso a cobranca de pacientes" }, 403);

    const body = await req.json().catch(() => ({}));
    const patientId: string | undefined = body?.patient_id;
    const amount = Number(body?.amount);
    const description: string = (body?.description ?? "").trim();
    const sessionId: string | undefined = body?.session_id || null;

    if (!patientId) return json(corsHeaders, { error: "patient_id obrigatorio" }, 400);
    if (!amount || amount <= 0) return json(corsHeaders, { error: "amount deve ser maior que zero" }, 400);
    if (!description) return json(corsHeaders, { error: "description obrigatoria" }, 400);

    // Confirma que o paciente pertence a esta clinica (RLS garante isso).
    const { data: patient, error: pErr } = await supabase
      .from("patients").select("id, full_name, email").eq("id", patientId).single();
    if (pErr || !patient) return json(corsHeaders, { error: "Paciente nao encontrado" }, 404);

    // Cliente com Service Role — unico jeito de ler o token pessoal DO
    // PROPRIETARIO, ja que essa coluna tem SELECT revogado para
    // "authenticated".
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: therapistRow } = await admin
      .from("therapists").select("mp_patient_access_token").eq("id", ownerId).maybeSingle();
    const mpToken = therapistRow?.mp_patient_access_token;

    if (!mpToken) {
      return json(corsHeaders, {
        error: "A proprietaria desta clinica ainda nao configurou o token pessoal do Mercado Pago. Va em Configuracoes -> Cobranca de pacientes.",
      }, 501);
    }

    // Cria o registro de cobranca primeiro (para ter um ID de referencia
    // que tambem vai na URL de notificacao, permitindo ao webhook
    // identificar a cobranca sem precisar varrer todas as terapeutas).
    // therapist_id sempre e o PROPRIETARIO da clinica, nao quem chamou.
    const { data: charge, error: cErr } = await admin.from("patient_charges").insert({
      therapist_id: ownerId,
      patient_id: patientId,
      session_id: sessionId,
      description,
      amount,
    }).select().single();
    if (cErr || !charge) return json(corsHeaders, { error: "Falha ao registrar cobranca" }, 500);

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${mpToken}` },
      body: JSON.stringify({
        items: [{ title: description, quantity: 1, unit_price: amount, currency_id: "BRL" }],
        payer: patient.email ? { email: patient.email } : undefined,
        external_reference: charge.id,
        notification_url: `${supabaseUrl}/functions/v1/mercadopago-patient-webhook?charge_id=${charge.id}`,
        back_urls: appUrl ? { success: `${appUrl}/patients/${patientId}`, pending: `${appUrl}/patients/${patientId}`, failure: `${appUrl}/patients/${patientId}` } : undefined,
      }),
    });

    if (!mpRes.ok) {
      const err = await mpRes.text();
      await admin.from("patient_charges").update({ status: "cancelled" }).eq("id", charge.id);
      return json(corsHeaders, { error: "Erro ao criar cobranca no Mercado Pago", detail: err }, 502);
    }

    const mpData = await mpRes.json();
    const paymentLink = mpData.init_point ?? mpData.sandbox_init_point;

    await admin.from("patient_charges").update({
      mp_preference_id: mpData.id,
      payment_link: paymentLink,
    }).eq("id", charge.id);

    return json(corsHeaders, { ok: true, charge_id: charge.id, payment_link: paymentLink });
  } catch (e) {
    captureError(e, { function: "charge-patient" });
    return json(corsHeaders, { error: String((e as Error).message ?? e) }, 500);
  }
});

function json(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
