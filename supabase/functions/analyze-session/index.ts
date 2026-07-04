// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: analyze-session
// Recebe { session_id }, valida JWT, monta prompt clinico e chama Anthropic.
// A chave da Anthropic fica em Deno.env.get("ANTHROPIC_API_KEY") — nunca no browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Voce e assistente clinico de apoio a uma Terapeuta Biblica Crista (tradicao batista).
Analise as anotacoes da sessao e gere insights complementares.
Treinamento: TCC, ACT, trauma, apego, aconselhamento biblico noutetico, teologia pastoral batista.
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
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Sem token" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY nao configurada no servidor" }, 500);

    // Cliente com o JWT do usuario — herda RLS
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return json({ error: "Sessao invalida" }, 401);

    const body = await req.json().catch(() => ({}));
    const sessionId: string | undefined = body?.session_id;
    if (!sessionId) return json({ error: "session_id obrigatorio" }, 400);

    // Busca a sessao (RLS garante que so vem se for da terapeuta)
    const { data: sess, error: sErr } = await supabase
      .from("sessions")
      .select(`
        id, session_number, session_date, mode, arrival, content, mood, spirit, openness,
        goals_done, next_goals, private_notes,
        patients:patient_id ( full_name, birthdate, profession, risk, goals )
      `)
      .eq("id", sessionId)
      .single();
    if (sErr || !sess) return json({ error: "Sessao nao encontrada" }, 404);

    // Historico das 3 sessoes anteriores desse paciente
    const { data: hist } = await supabase
      .from("sessions")
      .select("session_number, content")
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
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!ai.ok) {
      const err = await ai.text();
      return json({ error: "Anthropic error", detail: err }, 502);
    }

    const data = await ai.json();
    const txt: string = (data.content ?? [])
      .map((c: any) => c.text ?? "")
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    let parsed: any;
    try { parsed = JSON.parse(txt); }
    catch { return json({ error: "IA retornou JSON invalido", raw: txt }, 502); }

    // Salva na sessao para evitar reanalisar sem necessidade
    await supabase.from("sessions").update({
      ai_analysis: parsed,
      ai_analyzed_at: new Date().toISOString(),
    }).eq("id", sessionId);

    return json({ ok: true, analysis: parsed });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
