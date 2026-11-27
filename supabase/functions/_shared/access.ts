// deno-lint-ignore-file no-explicit-any
// TerapiaViva — helper compartilhado: a clinica de quem chamou ainda tem
// acesso (teste gratis de 45 dias em andamento, assinatura ativa ou
// cortesia)? Usa a funcao Postgres `has_active_access` (migration
// 20261127000000_assinatura_teste_45_dias).
//
// Mesma filosofia "fail open" do rate limiting: se a checagem falhar por
// infraestrutura (ou a migration ainda nao tiver sido aplicada), a chamada
// segue — o bloqueio de verdade tambem existe no banco (RLS somente leitura
// e check_ai_quota), entao nao ha brecha.

export async function hasActiveAccess(
  client: { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }> },
): Promise<boolean> {
  try {
    const { data, error } = await client.rpc("has_active_access");
    if (error) {
      console.error("[access] falha ao checar acesso, permitindo (fail-open):", error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error("[access] excecao ao checar acesso, permitindo (fail-open):", e);
    return true;
  }
}

export function noAccessResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: "O teste grátis terminou ou a assinatura não está ativa. Assine o plano Profissional em Configurações para continuar.",
      code: "sem_assinatura",
    }),
    { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
