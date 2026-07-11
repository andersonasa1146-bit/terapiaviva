// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: google-oauth-start
// Gera a URL de consentimento do Google OAuth2 (Calendar) e um nonce de
// CSRF armazenado em therapists.google_oauth_state, verificado depois em
// google-oauth-callback.
//
// Configure em producao:
//   supabase secrets set GOOGLE_CLIENT_ID=...apps.googleusercontent.com
//   supabase secrets set GOOGLE_CLIENT_SECRET=...
//   supabase secrets set GOOGLE_REDIRECT_URI=https://SEU-PROJETO.supabase.co/functions/v1/google-oauth-callback
// E cadastre GOOGLE_REDIRECT_URI como "Authorized redirect URI" no Google Cloud Console.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

initSentry("google-oauth-start");


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
    const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");

    if (!clientId || !redirectUri) {
      return json(corsHeaders, {
        error: "Integracao com Google Calendar nao configurada neste servidor. Peca ao administrador para configurar GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI.",
      }, 501);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return json(corsHeaders, { error: "Sessao invalida" }, 401);

    const rl = await checkRateLimit(supabase, `google-oauth-start:${userRes.user.id}`, 5, 60);
    if (!rl) return rateLimitResponse(corsHeaders);

    const nonce = crypto.randomUUID();
    const state = btoa(JSON.stringify({ tid: userRes.user.id, nonce }));

    await supabase.from("therapists").update({ google_oauth_state: nonce }).eq("id", userRes.user.id);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "https://www.googleapis.com/auth/calendar.events",
      state,
    });

    return json(corsHeaders, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (e) {
    captureError(e, { function: "google-oauth-start" });
    return json(corsHeaders, { error: String((e as Error).message ?? e) }, 500);
  }
});

function json(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
