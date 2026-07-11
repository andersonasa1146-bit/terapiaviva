// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: mercadopago-patient-webhook
// Recebe notificacoes do Mercado Pago sobre pagamentos de cobrancas de
// pacientes (criadas por charge-patient). Cada cobranca pode ter sido paga
// atraves da conta MP de uma terapeuta DIFERENTE, entao o token usado para
// consultar o pagamento e sempre o da terapeuta dona da cobranca.
//
// charge-patient ja inclui ?charge_id=... na notification_url, entao esta
// funcao sabe imediatamente qual cobranca/terapeuta consultar, sem precisar
// varrer todas as contas. Nao exige JWT (verify_jwt=false), pois quem chama
// e o proprio Mercado Pago.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, clientIp } from "../_shared/rateLimit.ts";
import { verifyMpSignature } from "../_shared/mercadopago.ts";

initSentry("mercadopago-patient-webhook");

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const rl = await checkRateLimit(admin, `mercadopago-patient-webhook:${clientIp(req)}`, 120, 60);
    if (!rl) return json({ error: "Muitas requisicoes" }, 429);

    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    const paymentId = url.searchParams.get("data.id") || body?.data?.id || body?.id;
    const chargeId = url.searchParams.get("charge_id");
    if (!paymentId || !chargeId) return json({ ok: true, ignored: true });

    // Valida a assinatura HMAC do Mercado Pago (header x-signature) antes de
    // processar. Sem MERCADOPAGO_WEBHOOK_SECRET configurada, apenas avisa.
    const sig = await verifyMpSignature(req, String(paymentId));
    if (!sig.ok) return json({ error: `Assinatura do webhook rejeitada: ${sig.reason}` }, 401);

    const { data: charge } = await admin.from("patient_charges").select("*").eq("id", chargeId).maybeSingle();
    if (!charge) return json({ ok: true, unresolved: true });
    if (charge.status === "paid") return json({ ok: true, already_paid: true });

    const { data: therapistRow } = await admin
      .from("therapists").select("mp_patient_access_token").eq("id", charge.therapist_id).maybeSingle();
    const mpToken = therapistRow?.mp_patient_access_token;
    if (!mpToken) return json({ ok: true, no_token: true });

    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!payRes.ok) return json({ ok: true, mp_error: true });
    const payment = await payRes.json();

    if (payment.status === "approved") {
      await admin.from("patient_charges").update({
        status: "paid", mp_payment_id: String(paymentId), paid_at: new Date().toISOString(),
      }).eq("id", charge.id);

      // Reflete automaticamente no financeiro da terapeuta.
      await admin.from("financial_entries").insert({
        therapist_id: charge.therapist_id,
        kind: "receita",
        category: "sessao",
        description: `Cobranca paga: ${charge.description}`,
        amount: charge.amount,
        entry_date: new Date().toISOString().slice(0, 10),
        status: "pago",
      });
    } else if (["cancelled", "rejected"].includes(payment.status)) {
      await admin.from("patient_charges").update({ status: "cancelled" }).eq("id", charge.id);
    }

    return json({ ok: true });
  } catch (e) {
    captureError(e, { function: "mercadopago-patient-webhook" });
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
