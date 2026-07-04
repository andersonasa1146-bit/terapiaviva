// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: autentique-webhook
// Recebe eventos do Autentique (https://docs.autentique.com.br/api/integration-basics/webhooks)
// para marcar um documento como assinado/recusado assim que o signatario
// concluir a acao — sem isso, o app nunca saberia que a assinatura aconteceu.
//
// Nao e chamada por usuarios (verify_jwt=false, igual mercadopago-webhook)
// — autenticada via HMAC no header x-autentique-signature, calculado sobre
// o corpo BRUTO da requisicao com o segredo definido ao registrar o
// endpoint no painel do Autentique.
//
// Configure em producao:
//   1. Registre este endpoint (https://SEU-PROJETO.supabase.co/functions/v1/autentique-webhook)
//      no painel do Autentique, escolhendo os eventos "document.finished" e
//      "signature.rejected".
//   2. supabase secrets set AUTENTIQUE_WEBHOOK_SECRET=<mesmo segredo configurado no painel>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry("autentique-webhook");

async function verifySignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (computed.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const rawBody = await req.text();
    const secret = Deno.env.get("AUTENTIQUE_WEBHOOK_SECRET");

    if (!secret) {
      console.warn("[autentique-webhook] AUTENTIQUE_WEBHOOK_SECRET nao configurado — evento ignorado.");
      return json({ ok: true, ignored: true }, 200);
    }

    const signature = req.headers.get("x-autentique-signature");
    const valid = await verifySignature(rawBody, signature, secret);
    if (!valid) return json({ error: "Assinatura invalida" }, 401);

    const payload = JSON.parse(rawBody);
    const event = payload?.event;
    const type = event?.type;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    if (type === "document.finished") {
      const doc = event.data?.object ?? event.data;
      const docId = doc?.id;
      if (docId) {
        await admin.from("document_signatures").update({
          status: "assinado",
          signed_at: new Date().toISOString(),
          signed_document_url: doc?.files?.signed ?? null,
        }).eq("external_id", docId);
      }
    } else if (type === "signature.rejected") {
      const docId = event.data?.document;
      if (docId) {
        await admin.from("document_signatures").update({ status: "recusado" }).eq("external_id", docId);
      }
    }
    // Outros tipos de evento (document.created, signature.viewed etc.) sao
    // ignorados deliberadamente — so nos interessa o desfecho final.

    return json({ ok: true }, 200);
  } catch (e) {
    captureError(e, { function: "autentique-webhook" });
    // Sempre 200 para eventos que ja passaram da validacao de assinatura,
    // para o Autentique nao ficar re-tentando indefinidamente por um erro
    // de processamento do nosso lado que provavelmente vai se repetir.
    return json({ ok: false, error: String((e as Error).message ?? e) }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
