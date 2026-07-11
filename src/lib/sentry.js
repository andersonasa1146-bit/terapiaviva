// TerapiaViva — monitoramento de erros do frontend (Task #32).
// Sem VITE_SENTRY_DSN configurada no .env, tudo aqui vira no-op silencioso
// (nenhum comportamento do app muda). Configure em produção:
//   VITE_SENTRY_DSN=https://<public_key>@<host>/<project_id>
// (veja .env.example) — o mesmo projeto Sentry pode ser usado tanto para o
// frontend quanto para as Edge Functions (ver supabase/functions/_shared/sentry.ts).
import * as Sentry from '@sentry/react'

let called = false
let enabled = false

export function initSentry() {
  if (called) return
  called = true

  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    // Sem replay/screenshots — dados de prontuario sao sensiveis (LGPD),
    // entao mantemos a captura restrita a mensagem/stack do erro.
  })
  enabled = true
}

export function captureException(error, extra) {
  if (!enabled) return
  Sentry.captureException(error, extra ? { extra } : undefined)
}
