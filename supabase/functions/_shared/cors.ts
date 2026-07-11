// TerapiaViva — helper compartilhado de CORS (antes duplicado em 10 functions).
//
// Politica:
//   - ALLOWED_ORIGINS configurado  -> so as origens listadas recebem CORS valido
//     (navegadores de outras origens sao bloqueados pelo proprio CORS).
//   - ALLOWED_ORIGINS NAO configurado -> modo permissivo "*" APENAS para
//     desenvolvimento local, com aviso ruidoso no log a cada request para que
//     isso nunca passe despercebido em producao.
//
// Configure em producao:
//   supabase secrets set ALLOWED_ORIGINS=https://app.seudominio.com

const RAW = Deno.env.get("ALLOWED_ORIGINS") ?? "";
const ALLOWED_ORIGINS = RAW.split(",").map((o) => o.trim()).filter(Boolean);
const CONFIGURED = ALLOWED_ORIGINS.length > 0;

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  let allowOrigin: string;

  if (!CONFIGURED) {
    console.warn(
      "[cors] ALLOWED_ORIGINS nao configurado — usando modo permissivo (*). " +
        "Em producao: supabase secrets set ALLOWED_ORIGINS=https://app.seudominio.com",
    );
    allowOrigin = "*";
  } else if (ALLOWED_ORIGINS.includes("*")) {
    allowOrigin = "*";
  } else {
    // Origem desconhecida recebe a primeira origem permitida — o navegador
    // do atacante bloqueia a resposta por nao haver match (fail-closed).
    allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? "");
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
