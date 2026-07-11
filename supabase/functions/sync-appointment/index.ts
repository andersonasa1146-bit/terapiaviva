// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: sync-appointment
// Espelha um agendamento no Google Calendar da terapeuta (criar/atualizar/
// excluir). Best-effort: se a integracao nao estiver conectada, retorna
// { skipped: true } em vez de erro, para nao quebrar o fluxo de agenda.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

initSentry("sync-appointment");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";


async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Falha ao renovar token do Google");
  return res.json();
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(corsHeaders, { error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(corsHeaders, { error: "Sem token" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return json(corsHeaders, { error: "Sessao invalida" }, 401);

    // Rate limit generoso — esta funcao e chamada a cada criacao/edicao de
    // agendamento, um fluxo legitimamente frequente.
    const rl = await checkRateLimit(supabase, `sync-appointment:${userRes.user.id}`, 30, 60);
    if (!rl) return rateLimitResponse(corsHeaders);

    const { data: therapist } = await supabase.from("therapists")
      .select("google_calendar_connected, google_access_token, google_refresh_token, google_token_expires_at")
      .eq("id", userRes.user.id).maybeSingle();

    if (!therapist?.google_calendar_connected || !clientId || !clientSecret) {
      return json(corsHeaders, { skipped: true, reason: "Google Calendar nao conectado" });
    }

    const body = await req.json().catch(() => ({}));
    const appointmentId: string | undefined = body?.appointment_id;
    const action: string = body?.action ?? "upsert";
    if (!appointmentId) return json(corsHeaders, { error: "appointment_id obrigatorio" }, 400);

    const { data: appt, error: aErr } = await supabase
      .from("appointments")
      .select("id, starts_at, ends_at, mode, google_event_id, patients:patient_id(full_name)")
      .eq("id", appointmentId).single();
    if (aErr || !appt) return json(corsHeaders, { error: "Agendamento nao encontrado" }, 404);

    // Renova access_token se expirado/proximo de expirar.
    let accessToken = therapist.google_access_token;
    const expiresAt = therapist.google_token_expires_at ? new Date(therapist.google_token_expires_at).getTime() : 0;
    if (!accessToken || expiresAt < Date.now() + 60_000) {
      if (!therapist.google_refresh_token) return json(corsHeaders, { skipped: true, reason: "Sem refresh token" });
      const fresh = await refreshAccessToken(therapist.google_refresh_token, clientId, clientSecret);
      accessToken = fresh.access_token;
      await supabase.from("therapists").update({
        google_access_token: accessToken,
        google_token_expires_at: new Date(Date.now() + (fresh.expires_in ?? 3600) * 1000).toISOString(),
      }).eq("id", userRes.user.id);
    }

    const gHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    if (action === "delete") {
      if (appt.google_event_id) {
        await fetch(`${CAL_BASE}/${appt.google_event_id}`, { method: "DELETE", headers: gHeaders });
      }
      return json(corsHeaders, { ok: true, deleted: true });
    }

    const p: any = Array.isArray(appt.patients) ? appt.patients[0] : appt.patients;
    const eventBody = {
      summary: `Sessao — ${p?.full_name ?? "Paciente"}`,
      description: `Modalidade: ${appt.mode === "online" ? "Online" : "Presencial"} (sincronizado automaticamente do TerapiaViva)`,
      start: { dateTime: appt.starts_at },
      end: { dateTime: appt.ends_at },
    };

    let gRes: Response;
    if (appt.google_event_id) {
      gRes = await fetch(`${CAL_BASE}/${appt.google_event_id}`, {
        method: "PATCH", headers: gHeaders, body: JSON.stringify(eventBody),
      });
    } else {
      gRes = await fetch(CAL_BASE, { method: "POST", headers: gHeaders, body: JSON.stringify(eventBody) });
    }

    if (!gRes.ok) {
      const err = await gRes.text();
      return json(corsHeaders, { error: "Erro na API do Google Calendar", detail: err }, 502);
    }
    const gEvent = await gRes.json();

    if (!appt.google_event_id) {
      await supabase.from("appointments").update({ google_event_id: gEvent.id }).eq("id", appointmentId);
    }

    return json(corsHeaders, { ok: true, event_id: gEvent.id });
  } catch (e) {
    captureError(e, { function: "sync-appointment" });
    return json(corsHeaders, { error: String((e as Error).message ?? e) }, 500);
  }
});

function json(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
