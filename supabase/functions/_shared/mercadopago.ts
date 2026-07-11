// TerapiaViva — validacao da assinatura de webhooks do Mercado Pago.
//
// O MP assina cada notificacao com HMAC-SHA256 no header "x-signature"
// (formato "ts=...,v1=..."), calculado sobre o manifest:
//   id:{data.id};request-id:{x-request-id};ts:{ts};
// Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
//
// Configure em producao (painel MP > Webhooks > "Assinatura secreta"):
//   supabase secrets set MERCADOPAGO_WEBHOOK_SECRET=<assinatura secreta do painel>
//
// Politica:
//   - Secret configurada  -> assinatura invalida/ausente e REJEITADA (401).
//   - Secret NAO configurada -> requisicao e aceita com aviso ruidoso no log
//     (compatibilidade com instalacoes existentes; configure antes de vender).

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Valida a assinatura do webhook. `dataId` e o id da notificacao
 * (query param "data.id" ou body.data.id), em minusculas se alfanumerico.
 * Retorna { ok } — quando a secret nao esta configurada, ok=true com aviso.
 */
export async function verifyMpSignature(req: Request, dataId: string | null): Promise<{ ok: boolean; reason?: string }> {
  const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
  if (!secret) {
    console.warn(
      "[mercadopago] MERCADOPAGO_WEBHOOK_SECRET nao configurada — assinatura NAO validada. " +
        "Em producao: supabase secrets set MERCADOPAGO_WEBHOOK_SECRET=<secret do painel MP>",
    );
    return { ok: true, reason: "secret_not_configured" };
  }

  const xSignature = req.headers.get("x-signature") ?? "";
  const xRequestId = req.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(
    xSignature.split(",").map((p) => p.trim().split("=", 2)).filter((kv) => kv.length === 2),
  ) as Record<string, string>;
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return { ok: false, reason: "assinatura ausente ou malformada" };

  const id = (dataId ?? "").toLowerCase();
  const manifest = `id:${id};request-id:${xRequestId};ts:${ts};`;
  const expected = await hmacSha256Hex(secret, manifest);
  if (!timingSafeEqualHex(expected, v1.toLowerCase())) {
    return { ok: false, reason: "assinatura invalida" };
  }
  return { ok: true };
}
