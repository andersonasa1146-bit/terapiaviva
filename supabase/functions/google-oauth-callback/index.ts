// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: google-oauth-callback
// Redirect_uri do fluxo OAuth2 do Google. Chamada pelo proprio Google
// (sem JWT do usuario), entao valida a integridade via "state" assinado
// com o nonce armazenado em therapists.google_oauth_state.
// Usa a Service Role Key para gravar os tokens (nunca expostos ao browser).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, clientIp } from "../_shared/rateLimit.ts";

initSentry("google-oauth-callback");

const TOKEN_URL = "https://oauth2.googleapis.com/token";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const appUrl = Deno.env.get("APP_URL") ?? "/";

  const fail = (msg: string) => Response.redirect(`${appUrl}/config?google=error&msg=${encodeURIComponent(msg)}`, 302);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Chamada publica (sem JWT) — rate limit por IP, ja que este endpoint e
    // um alvo obvio de scans/bots (parametros code/state invalidos).
    const rl = await checkRateLimit(admin, `google-oauth-callback:${clientIp(req)}`, 20, 60);
    if (!rl) return fail("Muitas tentativas. Aguarde um instante.");

    if (!code || !state) return fail("Parametros ausentes");

    let parsed: any;
    try { parsed = JSON.parse(atob(state)); } catch { return fail("State invalido"); }
    const { tid, nonce } = parsed ?? {};
    if (!tid || !nonce) return fail("State invalido");

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) return fail("Integracao nao configurada no servidor");

    const { data: therapist } = await admin.from("therapists").select("google_oauth_state").eq("id", tid).maybeSingle();
    if (!therapist || therapist.google_oauth_state !== nonce) return fail("State nao confere (possivel CSRF)");

    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return fail("Falha ao trocar o codigo por tokens");
    const tokens = await tokenRes.json();

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    await admin.from("therapists").update({
      google_access_token: tokens.access_token,
      google_refresh_token: tokens.refresh_token ?? undefined,
      google_token_expires_at: expiresAt,
      google_calendar_connected: true,
      google_oauth_state: null,
    }).eq("id", tid);

    return Response.redirect(`${appUrl}/config?google=connected`, 302);
  } catch (e) {
    captureError(e, { function: "google-oauth-callback" });
    return fail(String((e as Error).message ?? e));
  }
});
