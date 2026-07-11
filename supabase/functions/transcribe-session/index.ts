// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: transcribe-session
// Recebe { session_id }, baixa o audio anexado (bucket privado
// "session-audio") e transcreve via API de Speech-to-Text (OpenAI Whisper).
// A chave do provedor fica em Deno.env.get("OPENAI_API_KEY") — nunca no browser.
//
// Configure em producao:
//   supabase secrets set OPENAI_API_KEY=sk-...
// Sem essa chave configurada, a funcao responde 501 (recurso desabilitado),
// sem quebrar o resto do aplicativo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

initSentry("transcribe-session");

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const BUCKET = "session-audio";


Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(corsHeaders, { error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(corsHeaders, { error: "Sem token" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return json(corsHeaders, { error: "Sessao invalida" }, 401);

    if (!openaiKey) {
      return json(corsHeaders, {
        error: "Transcricao de audio nao configurada neste servidor. Peca ao administrador para configurar OPENAI_API_KEY (supabase secrets set OPENAI_API_KEY=...).",
      }, 501);
    }

    // Rate limit de curto prazo — transcricao e mais custosa (arquivo de audio),
    // limite mais apertado que os das analises de texto.
    const rl = await checkRateLimit(supabase, `transcribe-session:${userRes.user.id}`, 6, 60);
    if (!rl) return rateLimitResponse(corsHeaders);

    // Checa cota mensal de IA do plano ANTES de gastar com o provedor.
    const { data: quota } = await supabase.rpc("check_ai_quota", { p_therapist_id: userRes.user.id });
    if (quota && quota.allowed === false) {
      return json(corsHeaders, {
        error: `Limite mensal de analises de IA atingido (${quota.used}/${quota.limit}). Faca upgrade do plano para continuar.`,
        quota,
      }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const sessionId: string | undefined = body?.session_id;
    if (!sessionId) return json(corsHeaders, { error: "session_id obrigatorio" }, 400);

    // RLS garante que so retorna se a sessao pertencer a terapeuta autenticada.
    const { data: sess, error: sErr } = await supabase
      .from("sessions")
      .select("id, audio_path")
      .eq("id", sessionId)
      .single();
    if (sErr || !sess) return json(corsHeaders, { error: "Sessao nao encontrada" }, 404);
    if (!sess.audio_path) return json(corsHeaders, { error: "Nenhum audio anexado a esta sessao" }, 400);

    // Baixa o arquivo de audio do bucket privado (RLS tambem se aplica ao storage).
    const { data: fileBlob, error: dlErr } = await supabase.storage.from(BUCKET).download(sess.audio_path);
    if (dlErr || !fileBlob) return json(corsHeaders, { error: "Falha ao baixar o audio: " + (dlErr?.message ?? "desconhecido") }, 500);

    const form = new FormData();
    form.append("file", fileBlob, sess.audio_path.split("/").pop() || "audio.webm");
    form.append("model", "whisper-1");
    form.append("language", "pt");

    const whisperRes = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      return json(corsHeaders, { error: "Erro no provedor de transcricao", detail: err }, 502);
    }

    const result = await whisperRes.json();
    const transcript: string = result.text ?? "";

    await supabase.from("sessions").update({
      audio_transcript: transcript,
      audio_transcribed_at: new Date().toISOString(),
    }).eq("id", sessionId);

    await supabase.rpc("record_ai_usage", { p_therapist_id: userRes.user.id }).then(
      () => {},
      () => {},
    );

    return json(corsHeaders, { ok: true, transcript });
  } catch (e) {
    captureError(e, { function: "transcribe-session" });
    return json(corsHeaders, { error: String((e as Error).message ?? e) }, 500);
  }
});

function json(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
