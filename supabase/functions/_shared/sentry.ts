// deno-lint-ignore-file no-explicit-any
// TerapiaViva — helper compartilhado de monitoramento de erros (Task #32).
// Implementacao minima, SEM dependencias externas: monta o evento e envia
// direto para a Sentry Envelope API via fetch. Deliberadamente evitamos o
// SDK oficial (@sentry/deno via esm.sh) porque seu bundle e pesado demais
// para o build sob demanda do esm.sh, o que estourou o timeout de deploy
// da Edge Function em teste — uma dependencia arriscada demais para uma
// funcao que so existe para observabilidade (nunca deveria colocar em
// risco o deploy do restante do app). Sem SENTRY_DSN configurada, tudo
// aqui vira no-op silencioso.
//
// Configure em producao (opcional):
//   supabase secrets set SENTRY_DSN=https://<public_key>@<host>/<project_id>
//   supabase secrets set SENTRY_ENVIRONMENT=production

interface ParsedDsn {
  publicKey: string;
  host: string;
  projectId: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    return { publicKey, host: url.host, projectId };
  } catch {
    return null;
  }
}

let functionName = "unknown";

// Mantido por compatibilidade de API com o restante das funcoes (todas
// chamam initSentry(nome) uma vez no topo do modulo) — aqui so guarda o
// nome da funcao para marcar nos eventos, nada precisa ser "inicializado".
export function initSentry(name: string) {
  functionName = name;
}

export function captureError(err: unknown, extra?: Record<string, unknown>) {
  // Sempre loga no console (visivel em `supabase functions logs`),
  // independente de SENTRY_DSN estar configurada ou nao.
  console.error(err);

  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return;
  const parsed = parseDsn(dsn);
  if (!parsed) return;

  try {
    const environment = Deno.env.get("SENTRY_ENVIRONMENT") ?? "production";
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const eventId = crypto.randomUUID().replace(/-/g, "");

    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "other",
      server_name: functionName,
      environment,
      tags: { function: functionName },
      extra: extra ?? {},
      exception: {
        values: [{
          type: err instanceof Error ? err.name : "Error",
          value: message,
          stacktrace: stack
            ? { frames: stack.split("\n").slice(1).map((l) => ({ filename: l.trim() })) }
            : undefined,
        }],
      },
    };

    const envelopeHeader = JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() });
    const itemHeader = JSON.stringify({ type: "event" });
    const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}\n`;
    const ingestUrl = `https://${parsed.host}/api/${parsed.projectId}/envelope/`;

    // Fire-and-forget: monitoramento de erro nunca deve atrasar a resposta
    // real ao usuario nem virar um novo ponto de falha da funcao.
    fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=terapiaviva-edge/1.0, sentry_key=${parsed.publicKey}`,
      },
      body,
    }).catch((e) => console.error("[sentry] falha ao enviar evento:", e));
  } catch (e) {
    console.error("[sentry] falha ao montar evento:", e);
  }
}
