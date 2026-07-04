// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: analyze-anamnese
// Gera avaliacao preliminar da anamnese enviada pelo paciente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Voce e assistente clinico de apoio a uma Terapeuta Biblica Crista (tradicao batista).
Gere avaliacao preliminar CONFIDENCIAL da anamnese.
Treinamento: psicologia clinica DSM-5/CID-11, TCC, ACT, trauma, apego,
aconselhamento biblico noutetico, teologia pastoral batista.
Retorne SOMENTE JSON valido:
{
  "nivel_risco": "baixo" | "moderado" | "alto" | "critico",
  "justificativa_risco": "",
  "indicadores_clinicos": [""],
  "hipoteses_diagnosticas": [""],
  "observacoes_espirituais": [""],
  "fatores_protecao": [""],
  "abordagens_recomendadas": [""],
  "foco_primeira_sessao": "",
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
    if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY nao configurada" }, 500);

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return json({ error: "Sessao invalida" }, 401);

    const body = await req.json().catch(() => ({}));
    const anamnesisId: string | undefined = body?.anamnesis_id;
    if (!anamnesisId) return json({ error: "anamnesis_id obrigatorio" }, 400);

    const { data: an, error } = await supabase
      .from("anamneses")
      .select("id, answers")
      .eq("id", anamnesisId)
      .single();
    if (error || !an) return json({ error: "Anamnese nao encontrada" }, 404);

    const d = (an.answers ?? {}) as Record<string, any>;
    const arr = (v: any) => Array.isArray(v) ? v.join(", ") : (v ?? "-");
    const prompt = `ANAMNESE
Nome: ${d.nome ?? "-"} | Nasc: ${d.nasc ?? "-"} | Estado civil: ${d.estado_civil ?? "-"} | Profissao: ${d.profissao ?? "-"}
Queixa: ${d.qp ?? "-"}
Expectativa: ${d.qe ?? "-"}
Areas: ${arr(d.qa)}
Infancia: ${d.hi ?? "-"} | Dor: ${d.hid ?? "-"}
Visao de Deus: ${d.hd ?? "-"}
Sentimentos: ${arr(d.df)}
Comportamentos: ${arr(d.dc)}
Espiritual conflito: ${arr(d.de)}
Sintomas: ${arr(d.sl)} | RISCO IMEDIATO: ${d.ri ?? "-"}
Saude: ${d.sa ?? "-"} | Medicamentos: ${d.sm ?? "-"} | Diagnostico: ${d.sd ?? "-"}
Religioso: ${d.re ?? "-"} | Igreja: ${d.ig ?? "-"} | Salvacao: ${d.fc ?? "-"}
Pais: ${d.fp ?? "-"} | Pai: ${d.fpa ?? "-"} | Mae: ${d.fma ?? "-"}
Relacionamento atual: ${d.rd ?? "-"}
Objetivos: ${d.obj ?? "-"}`;

    const ai = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1600,
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

    await supabase.from("anamneses").update({
      ai_evaluation: parsed,
      ai_evaluated_at: new Date().toISOString(),
      status: "reviewed",
    }).eq("id", anamnesisId);

    return json({ ok: true, evaluation: parsed });
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
