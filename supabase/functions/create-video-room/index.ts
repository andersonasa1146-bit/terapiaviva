// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: create-video-room
// Fase 2 do roadmap: teleconsulta integrada (Daily.co). Cria (ou
// reaproveita, se ja existir e nao tiver expirado) uma sala de video para
// um agendamento ONLINE, usando o Daily Prebuilt (embed via iframe simples
// — https://www.daily.co/pricing/video-sdk/), sem exigir SDK no frontend.
//
// SIMPLIFICACAO CONSCIENTE: as salas sao criadas com privacy "public" (a
// URL em si e o segredo — nao listada em lugar nenhum, apenas guardada no
// nosso banco) em vez de "private" + meeting tokens, para reduzir a
// complexidade inicial da integracao. Quem tiver o link entra. Se isso for
// uma preocupacao para a clinica, o proximo passo natural e migrar para
// salas privadas com token de acesso por participante.
//
// Configure em producao:
//   supabase secrets set DAILY_API_KEY=...
// Sem essa chave, a funcao responde 501 com mensagem amigavel.

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

    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return json(corsHeaders, { error: "Sessao invalida" }, 401);

    const { data: ownerId, error: ownerErr } = await supabase.rpc("current_owner_id");
    if (ownerErr || !ownerId) return json(corsHeaders, { error: "Nao foi possivel resolver a clinica do usuario" }, 500);

    const rl = await checkRateLimit(supabase, `create-video-room:${ownerId}`, 30, 60);
    if (!rl) return rateLimitResponse(corsHeaders);

    const { data: hasAccess } = await supabase.rpc("has_clinical_access");
    if (!hasAccess) return json(corsHeaders, { error: "Seu papel na equipe nao tem acesso a agenda clinica" }, 403);

    if (!dailyApiKey) {
      return json(corsHeaders, {
        error: "A teleconsulta ainda nao foi configurada nesta instalacao. Peca ao administrador para configurar DAILY_API_KEY.",
      }, 501);
    }

    const body = await req.json().catch(() => ({}));
    const appointmentId: string | undefined = body?.appointment_id;
    if (!appointmentId) return json(corsHeaders, { error: "appointment_id obrigatorio" }, 400);

    const { data: appt, error: aErr } = await supabase
      .from("appointments").select("id, starts_at, ends_at, mode").eq("id", appointmentId).single();
    if (aErr || !appt) return json(corsHeaders, { error: "Agendamento nao encontrado" }, 404);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: existing } = await admin
      .from("video_rooms").select("*").eq("appointment_id", appointmentId).maybeSingle();
    if (existing && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
      return json(corsHeaders, { ok: true, room_url: existing.room_url });
    }

    const expUnix = Math.floor(new Date(appt.ends_at).getTime() / 1000) + 2 * 60 * 60; // +2h de folga
    const roomName = `terapiaviva-${appointmentId}`.slice(0, 41);

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

    const { data: saved, error: sErr } = await admin.from("video_rooms").upsert({
      appointment_id: appointmentId,
      owner_id: ownerId,
      provider: "daily",
      room_name: dailyData.name,
      room_url: dailyData.url,
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
