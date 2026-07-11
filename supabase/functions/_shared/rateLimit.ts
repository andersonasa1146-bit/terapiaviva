// deno-lint-ignore-file no-explicit-any
// TerapiaViva — helper compartilhado de rate limiting (Task #32).
// Usa a funcao Postgres `check_rate_limit` (SECURITY DEFINER, ver migration
// rate_limiting) para limitar chamadas de curto prazo por usuario/clinica/IP,
// complementando a cota mensal de IA (check_ai_quota) que ja existia.
//
// Filosofia "fail open": se a checagem falhar por qualquer motivo de infra
// (banco fora do ar, funcao ainda nao migrada etc.), a chamada e permitida
// em vez de bloquear a terapeuta/paciente por um problema que nao e dela —
// rate limiting e defesa contra abuso, nao deve virar um novo ponto de
// indisponibilidade do produto.

export async function checkRateLimit(
  client: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> },
  key: string,
  maxCalls: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await client.rpc("check_rate_limit", {
      p_key: key,
      p_max_calls: maxCalls,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error(`[rate-limit] falha ao checar "${key}", permitindo (fail-open):`, error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error(`[rate-limit] excecao ao checar "${key}", permitindo (fail-open):`, e);
    return true;
  }
}

// Extrai o IP do cliente a partir dos headers de proxy usados pela
// plataforma de Edge Functions do Supabase (Cloudflare/Deno Deploy).
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}

// Monta uma resposta 429 padrao (mesmo formato json() usado nas funcoes).
export function rateLimitResponse(corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({
    error: "Muitas requisicoes em pouco tempo. Aguarde um instante e tente novamente.",
  }), {
    status: 429,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
