// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: analyze-session
// Recebe { session_id }, valida JWT, monta prompt clinico e chama Anthropic.
// A chave da Anthropic fica em Deno.env.get("ANTHROPIC_API_KEY") — nunca no browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

initSentry("analyze-session");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";


// Nicho/tradicao de aconselhamento — configuravel por instalacao (white-label).
// Configure em produção, por exemplo:
//   supabase secrets set THERAPY_TRADITION_LABEL="Psicologa Clinica (abordagem TCC)"
//   supabase secrets set COUNSELING_TRAINING="TCC, ACT, DBT, terapia do esquema"
// Se nao configurado, mantem o comportamento atual (tradicao biblica batista).
const TRADITION_LABEL = Deno.env.get("THERAPY_TRADITION_LABEL")
  ?? "Terapeuta Biblica Crista (tradicao batista)";
const COUNSELING_TRAINING = Deno.env.get("COUNSELING_TRAINING")
  ?? "TCC, ACT, trauma, apego, aconselhamento biblico noutetico, teologia pastoral batista";

function buildSystemPrompt() {
  return `Voce e assistente clinico de apoio a uma ${TRADITION_LABEL}.
Analise as anotacoes da sessao e gere insights complementares.
Treinamento: ${COUNSELING_TRAINING}.
Retorne SOMENTE JSON valido no formato:
{
  "nivel_sessao": "baixo" | "moderado" | "alto",
  "observacoes_clinicas": [""],
  "estado_geral": "",
  "padroes": [""],
  "sugestoes_proxima": [""],
  "versiculos": [{"ref":"", "contexto":""}],
  "alertas": [""],
  "nota_terapeuta": ""
}
Se a abordagem configurada nao for religiosa, retorne "versiculos" como uma lista vazia.`;
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
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) return json(corsHeaders, { error: "ANTHROPIC_API_KEY nao configurada no servidor" }, 500);

    // Cliente com o JWT do usuario — herda RLS
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return json(corsHeaders, { error: "Sessao invalida" }, 401);

    // Rate limit de curto prazo (defesa contra cliques repetidos/loop de retry,
    // complementar a cota mensal check_ai_quota abaixo).
    const rl = await checkRateLimit(supabase, `analyze-session:${userRes.user.id}`, 10, 60);
    if (!rl) return rateLimitResponse(corsHeaders);

    // Checa cota mensal de IA do plano ANTES de gastar com a Anthropic.
    // Se a funcao ainda nao existir (banco nao migrado), segue sem bloquear.
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

    // Busca a sessao (RLS garante que so vem se for da terapeuta)
    const { data: sess, error: sErr } = await supabase
      .from("sessions")
      .select(`
        id, patient_id, session_number, session_date, mode, arrival, content, mood, spirit, openness,
        goals_done, next_goals, private_notes,
        patients:patient_id ( full_name, birthdate, profession, risk, goals )
      `)
      .eq("id", sessionId)
      .single();
    if (sErr || !sess) return json(corsHeaders, { error: "Sessao nao encontrada" }, 404);

    // Historico das 3 sessoes anteriores DESTE MESMO paciente.
    // IMPORTANTE: filtrar por patient_id — sem isso, a consulta pega as ultimas
    // sessoes de QUALQUER paciente da terapeuta e contamina a analise de IA
    // com o historico clinico de outra pessoa.
    const { data: hist } = await supabase
      .from("sessions")
      .select("session_number, content")
      .eq("patient_id", sess.patient_id)
      .neq("id", sessionId)
      .order("session_date", { ascending: false })
      .limit(3);

    const p: any = Array.isArray(sess.patients) ? sess.patients[0] : sess.patients;
    const age = p?.birthdate ? Math.floor((Date.now() - new Date(p.birthdate).getTime()) / 3.15576e10) : "-";
    const historyText = (hist ?? [])
      .map((h: any) => `Sessao #${h.session_number}: ${(h.content ?? "").slice(0, 140)}...`)
      .join("\n") || "Sem historico anterior";

    const prompt = `PACIENTE: ${p?.full_name}, ${age} anos, ${p?.profession ?? "-"}, risco ${p?.risk}
OBJETIVOS: ${(p?.goals ?? []).join(", ")}
SESSAO #${sess.session_number}: Humor ${sess.mood ?? 5}/10, Espiritual ${sess.spirit ?? 5}/10, Abertura ${sess.openness ?? 5}/10
Chegou: ${sess.arrival ?? "nao informado"}
ANOTACOES: ${sess.content}
Proximos objetivos: ${sess.next_goals ?? "-"}
Historico recente:
${historyText}`;

    const ai = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1400,
        system: buildSystemPrompt(),
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!ai.ok) {
      const err = await ai.text();
      return json(corsHeaders, { error: "Anthropic error", detail: err }, 502);
    }

    const data = await ai.json();
    const txt: string = (data.content ?? [])
      .map((c: any) => c.text ?? "")
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    let parsed: any;
    try { parsed = JSON.parse(txt); }
    catch { return json(corsHeaders, { error: "IA retornou JSON invalido", raw: txt }, 502); }

    // Salva na sessao para evitar reanalisar sem necessidade
    await supabase.from("sessions").update({
      ai_analysis: parsed,
      ai_analyzed_at: new Date().toISOString(),
    }).eq("id", sessionId);

    // Registra o uso de IA para controle de cota do plano (best-effort).
    await supabase.rpc("record_ai_usage", { p_therapist_id: userRes.user.id }).then(
      () => {},
      () => {},
    );

    return json(corsHeaders, { ok: true, analysis: parsed });
  } catch (e) {
    captureError(e, { function: "analyze-session" });
    return json(corsHeaders, { error: String((e as Error).message ?? e) }, 500);
  }
});

function json(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
