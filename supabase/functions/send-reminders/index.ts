// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: send-reminders
// Chamada periodicamente pelo pg_cron (a cada 15 min, ver migration
// appointment_reminders) para enviar lembretes de sessao por e-mail
// (Resend) e/ou WhatsApp (Z-API) aos pacientes com agendamento proximo.
//
// Fase 2 (notificacoes push): alem dos canais do PACIENTE acima, tambem
// dispara um push para a CLINICA (terapeuta/equipe que tiver ativado
// notificacoes no proprio dispositivo) avisando da sessao proxima — ver
// supabase/functions/_shared/push.ts. Sem VAPID configurado, essa parte e
// pulada silenciosamente (log-only), sem afetar e-mail/WhatsApp.
//
// Nao e chamada por usuarios (verify_jwt=false) — autenticada por um
// segredo compartilhado (CRON_SECRET) enviado no header x-cron-secret.
// Por isso NAO leva rate limiting adicional (o segredo compartilhado ja
// restringe quem pode chamar) — apenas monitoramento de erros via Sentry.
//
// Configure em producao:
//   supabase secrets set CRON_SECRET=<mesmo valor gravado no Vault pela migration>
//   supabase secrets set RESEND_API_KEY=re_...              (opcional, e-mail)
//   supabase secrets set RESEND_FROM_EMAIL=lembretes@seudominio.com (opcional)
//   supabase secrets set ZAPI_INSTANCE_ID=...                (opcional, WhatsApp)
//   supabase secrets set ZAPI_TOKEN=...                      (opcional, WhatsApp)
//   supabase secrets set ZAPI_CLIENT_TOKEN=...               (opcional, seguranca Z-API)
//   supabase secrets set VAPID_PUBLIC_KEY=...                (opcional, push)
//   supabase secrets set VAPID_PRIVATE_KEY=...               (opcional, push)
// Sem essas chaves, a funcao roda normalmente mas nao envia nada (log-only).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { sendPushToOwner } from "../_shared/push.ts";

initSentry("send-reminders");

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

async function sendEmail(to: string, therapistName: string, when: string, mode: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY nao configurada" };
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "onboarding@resend.dev";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to,
      subject: `Lembrete: sua sessao com ${therapistName}`,
      html: `<p>Ola!</p><p>Este e um lembrete da sua sessao com <strong>${therapistName}</strong>:</p>
        <p><strong>${when}</strong> — ${mode === "online" ? "Online" : "Presencial"}</p>
        <p>Ate breve!</p>`,
    }),
  });
  if (!res.ok) return { sent: false, reason: await res.text() };
  return { sent: true };
}

async function sendWhatsapp(phone: string, therapistName: string, when: string, mode: string) {
  const instance = Deno.env.get("ZAPI_INSTANCE_ID");
  const token = Deno.env.get("ZAPI_TOKEN");
  if (!instance || !token) return { sent: false, reason: "ZAPI_INSTANCE_ID/ZAPI_TOKEN nao configurados" };
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

  const digits = phone.replace(/\D/g, "");
  const message = `Ola! Lembrete da sua sessao com ${therapistName}: *${when}* (${mode === "online" ? "Online" : "Presencial"}). Ate breve!`;

  const res = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(clientToken ? { "Client-Token": clientToken } : {}),
    },
    body: JSON.stringify({ phone: digits, message }),
  });
  if (!res.ok) return { sent: false, reason: await res.text() };
  return { sent: true };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!expected || provided !== expected) {
    return json({ error: "Nao autorizado" }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: pending, error } = await admin.rpc("list_pending_reminders");
    if (error) return json({ error: error.message }, 500);

    const results: any[] = [];
    for (const appt of pending ?? []) {
      const when = fmtWhen(appt.starts_at);
      let sentAny = false;

      if (appt.email_enabled && appt.patient_email) {
        const r = await sendEmail(appt.patient_email, appt.therapist_name, when, appt.mode);
        results.push({ appointment_id: appt.appointment_id, channel: "email", ...r });
        if (r.sent) sentAny = true;
      }
      if (appt.whatsapp_enabled && appt.patient_phone) {
        const r = await sendWhatsapp(appt.patient_phone, appt.therapist_name, when, appt.mode);
        results.push({ appointment_id: appt.appointment_id, channel: "whatsapp", ...r });
        if (r.sent) sentAny = true;
      }

      // Fase 2: push para a propria equipe (independente dos canais do
      // paciente acima) — quem ativou notificacoes no dispositivo recebe um
      // aviso de que uma sessao esta chegando.
      const pushResult = await sendPushToOwner(admin, appt.therapist_id, {
        title: "Sessao em breve",
        body: `${appt.patient_name ?? "Paciente"} — ${when} (${appt.mode === "online" ? "Online" : "Presencial"})`,
        url: "/agenda",
      });
      if (pushResult.sent) {
        results.push({ appointment_id: appt.appointment_id, channel: "push", sent: pushResult.sent > 0, count: pushResult.sent });
        if (pushResult.sent > 0) sentAny = true;
      }

      if (sentAny) {
        await admin.rpc("mark_reminder_sent", { p_appointment_id: appt.appointment_id });
      }
    }

    return json({ ok: true, processed: (pending ?? []).length, results });
  } catch (e) {
    captureError(e, { function: "send-reminders" });
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
