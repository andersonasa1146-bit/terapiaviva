// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: analyze-anamnese
// Gera avaliacao preliminar da anamnese enviada pelo paciente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

initSentry("analyze-anamnese");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";


// Nicho/tradicao de aconselhamento — configuravel por instalacao (white-label).
// Se nao configurado, mantem o comportamento atual (tradicao biblica batista).
const TRADITION_LABEL = Deno.env.get("THERAPY_TRADITION_LABEL")
  ?? "Terapeuta Biblica Crista (tradicao batista)";
const COUNSELING_TRAINING = Deno.env.get("COUNSELING_TRAINING")
  ?? "psicologia clinica DSM-5/CID-11, TCC, ACT, trauma, apego, aconselhamento biblico noutetico, teologia pastoral batista";

function buildSystemPrompt() {
  return `Voce e assistente clinico de apoio a uma ${TRADITION_LABEL}.
Gere avaliacao preliminar CONFIDENCIAL da anamnese.
Treinamento: ${COUNSELING_TRAINING}.
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
}
Se a abordagem configurada nao for religiosa, retorne "observacoes_espirituais" como uma lista vazia.`;
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
    if (!anthropicKey) return json(corsHeaders, { error: "ANTHROPIC_API_KEY nao configurada" }, 500);

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return json(corsHeaders, { error: "Sessao invalida" }, 401);

    // Rate limit de curto prazo (defesa contra cliques repetidos/loop de retry,
    // complementar a cota mensal check_ai_quota abaixo).
    const rl = await checkRateLimit(supabase, `analyze-anamnese:${userRes.user.id}`, 10, 60);
    if (!rl) return rateLimitResponse(corsHeaders);

    // Checa cota mensal de IA do plano ANTES de gastar com a Anthropic.
    const { data: quota } = await supabase.rpc("check_ai_quota", { p_therapist_id: userRes.user.id });
    if (quota && quota.allowed === false) {
      return json(corsHeaders, {
        error: `Limite mensal de analises de IA atingido (${quota.used}/${quota.limit}). Faca upgrade do plano para continuar.`,
        quota,
      }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const anamnesisId: string | undefined = body?.anamnesis_id;
    if (!anamnesisId) return json(corsHeaders, { error: "anamnesis_id obrigatorio" }, 400);

    const { data: an, error } = await supabase
      .from("anamneses")
      .select("id, answers")
      .eq("id", anamnesisId)
      .single();
    if (error || !an) return json(corsHeaders, { error: "Anamnese nao encontrada" }, 404);

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

    await supabase.from("anamneses").update({
      ai_evaluation: parsed,
      ai_evaluated_at: new Date().toISOString(),
      status: "reviewed",
    }).eq("id", anamnesisId);

    // Registra o uso de IA para controle de cota do plano (best-effort).
    await supabase.rpc("record_ai_usage", { p_therapist_id: userRes.user.id }).then(
      () => {},
      () => {},
    );

    return json(corsHeaders, { ok: true, evaluation: parsed });
  } catch (e) {
    captureError(e, { function: "analyze-anamnese" });
    return json(corsHeaders, { error: String((e as Error).message ?? e) }, 500);
  }
});

function json(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
