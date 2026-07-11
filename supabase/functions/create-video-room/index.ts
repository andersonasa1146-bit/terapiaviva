// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: create-video-room
// Teleconsulta integrada com provedor configuravel por instalacao:
//
//   VIDEO_PROVIDER=jitsi (padrao) — salas no Jitsi Meet publico
//     (https://meet.jit.si). 100% gratuito, sem conta e sem cartao; o
//     paciente entra pelo link direto no navegador. Observacao: no
//     meet.jit.si o PRIMEIRO participante (a terapeuta) pode precisar
//     autenticar-se como moderador (login Google/GitHub) ao abrir a sala.
//
//   VIDEO_PROVIDER=daily — salas no Daily.co (Daily Prebuilt). Qualidade
//     e recursos superiores, mas exige DAILY_API_KEY e metodo de pagamento
//     cadastrado na conta Daily:
//       supabase secrets set VIDEO_PROVIDER=daily DAILY_API_KEY=...
//
// SIMPLIFICACAO CONSCIENTE: em ambos os provedores a URL da sala e o
// segredo (nome com UUID do agendamento, nao listado publicamente). O
// upgrade natural e sala privada com token por participante.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

initSentry("create-video-room");

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(corsHeaders, { error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(corsHeaders, { error: "Sem token" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dailyApiKey = Deno.env.get("DAILY_API_KEY");
    const provider = (Deno.env.get("VIDEO_PROVIDER") ?? "jitsi").toLowerCase();

    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return json(corsHeaders, { error: "Sessao invalida" }, 401);

    const { data: ownerId, error: ownerErr } = await supabase.rpc("current_owner_id");
    if (ownerErr || !ownerId) return json(corsHeaders, { error: "Nao foi possivel resolver a clinica do usuario" }, 500);

    const rl = await checkRateLimit(supabase, `create-video-room:${ownerId}`, 30, 60);
    if (!rl) return rateLimitResponse(corsHeaders);

    const { data: hasAccess } = await supabase.rpc("has_clinical_access");
    if (!hasAccess) return json(corsHeaders, { error: "Seu papel na equipe nao tem acesso a agenda clinica" }, 403);

    const body = await req.json().catch(() => ({}));
    const appointmentId: string | undefined = body?.appointment_id;
    if (!appointmentId) return json(corsHeaders, { error: "appointment_id obrigatorio" }, 400);

    const { data: appt, error: aErr } = await supabase
      .from("appointments").select("id, starts_at, ends_at, mode").eq("id", appointmentId).single();
    if (aErr || !appt) return json(corsHeaders, { error: "Agendamento nao encontrado" }, 404);

    const admin = createClient(supabaseUrl, serviceKey);

    // Reaproveita a sala existente apenas se for do MESMO provedor e ainda
    // nao tiver expirado (trocar de provedor recria a sala na hora).
    const { data: existing } = await admin
      .from("video_rooms").select("*").eq("appointment_id", appointmentId).maybeSingle();
    if (
      existing && existing.provider === provider &&
      (!existing.expires_at || new Date(existing.expires_at) > new Date())
    ) {
      return json(corsHeaders, { ok: true, room_url: existing.room_url });
    }

    const expUnix = Math.floor(new Date(appt.ends_at).getTime() / 1000) + 2 * 60 * 60; // +2h de folga
    let roomName: string;
    let roomUrl: string;

    if (provider === "daily") {
      if (!dailyApiKey) {
        return json(corsHeaders, {
          error: "VIDEO_PROVIDER=daily exige DAILY_API_KEY. Configure a secret ou remova VIDEO_PROVIDER para usar o Jitsi (gratuito).",
        }, 501);
      }
      roomName = `terapiaviva-${appointmentId}`.slice(0, 41);
      const dailyRes = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: { Authorization: `Bearer ${dailyApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roomName,
          privacy: "public",
          properties: { exp: expUnix, eject_at_room_exp: true, enable_chat: true },
        }),
      });
      const dailyData = await dailyRes.json().catch(() => ({}));
      if (!dailyRes.ok || !dailyData?.url) {
        return json(corsHeaders, { error: "Erro ao criar sala no Daily.co", detail: dailyData }, 502);
      }
      roomName = dailyData.name;
      roomUrl = dailyData.url;
    } else {
      // Jitsi Meet publico: sem API — o nome unico (UUID do agendamento) e a URL.
      roomName = `TerapiaViva-${appointmentId}`;
      roomUrl = `https://meet.jit.si/${roomName}`;
    }

    const { data: saved, error: sErr } = await admin.from("video_rooms").upsert({
      appointment_id: appointmentId,
      owner_id: ownerId,
      provider,
      room_name: roomName,
      room_url: roomUrl,
      expires_at: new Date(expUnix * 1000).toISOString(),
    }, { onConflict: "appointment_id" }).select().single();
    if (sErr || !saved) return json(corsHeaders, { error: "Falha ao registrar sala de video" }, 500);

    return json(corsHeaders, { ok: true, room_url: saved.room_url });
  } catch (e) {
    captureError(e, { function: "create-video-room" });
    return json(corsHeaders, { error: String((e as Error).message ?? e) }, 500);
  }
});

function json(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
