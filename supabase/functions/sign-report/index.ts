// deno-lint-ignore-file no-explicit-any
// TerapiaViva — Edge Function: sign-report
// Fase 2 do roadmap: assinatura digital para relatorios. Envia o relatorio
// clinico do paciente para assinatura eletronica via API do Autentique
// (https://docs.autentique.com.br/api/mutations/criando-um-documento),
// usando o token PESSOAL da propria terapeuta/clinica (nao um token da
// plataforma), no mesmo espirito de charge-patient (Mercado Pago pessoal).
//
// Por padrao a PROPRIA terapeuta e quem assina (da autenticidade/validade
// ao documento gerado por ela) — o chamador pode opcionalmente indicar
// signer_name/signer_email para enviar a outra pessoa (ex.: co-assinatura
// do paciente), mas isso e uma extensao futura, nao o fluxo padrao.
//
// LIMITACAO CONHECIDA (documentar antes de operar com pacientes reais):
// nao existe ainda geracao de PDF real no servidor (ver roadmap — Puppeteer
// esta pendente), entao o documento enviado para assinatura e um HTML
// auto-contido gerado aqui. O proprio Autentique aceita HTML como fonte de
// documento (confirmado na documentacao oficial, secao "Create a document
// from a template") e converte para PDF no proprio fluxo de assinatura.
//
// Configure em producao:
//   supabase secrets set AUTENTIQUE_API_TOKEN=...
// Sem essa chave, a funcao responde 501 com uma mensagem amigavel (o botao
// "Assinar digitalmente" no prontuario mostra esse erro ao clicar).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

initSentry("sign-report");


function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

function buildReportHtml(therapistName: string, patient: any, sessions: any[]) {
  const rows = sessions.map((s) => `
    <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #ddd;">
      <strong>Sessao #${s.session_number}</strong> — ${new Date(s.session_date).toLocaleDateString("pt-BR")}<br/>
      <span>${escapeHtml(s.content ?? "")}</span>
    </div>`).join("\n");

  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:13px;color:#222;">
    <h2>Relatorio Clinico — ${escapeHtml(patient.full_name)}</h2>
    <p style="color:#666;">Documento confidencial · LGPD · Emitido por ${escapeHtml(therapistName)} em ${new Date().toLocaleDateString("pt-BR")}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr><td><strong>Profissao</strong></td><td>${escapeHtml(patient.profession ?? "—")}</td></tr>
      <tr><td><strong>Total de sessoes</strong></td><td>${sessions.length}</td></tr>
      <tr><td><strong>Nivel de risco</strong></td><td>${escapeHtml((patient.risk ?? "").toUpperCase())}</td></tr>
    </table>
    <h3>Historico de sessoes</h3>
    ${rows || "<p>Nenhuma sessao registrada.</p>"}
  </body></html>`;
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const autentiqueToken = Deno.env.get("AUTENTIQUE_API_TOKEN");

    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return json(corsHeaders, { error: "Sessao invalida" }, 401);

    const { data: ownerId, error: ownerErr } = await supabase.rpc("current_owner_id");
    if (ownerErr || !ownerId) return json(corsHeaders, { error: "Nao foi possivel resolver a clinica do usuario" }, 500);

    const rl = await checkRateLimit(supabase, `sign-report:${ownerId}`, 10, 60);
    if (!rl) return rateLimitResponse(corsHeaders);

    const { data: hasAccess } = await supabase.rpc("has_clinical_access");
    if (!hasAccess) return json(corsHeaders, { error: "Seu papel na equipe nao tem acesso clinico para gerar relatorios" }, 403);

    if (!autentiqueToken) {
      return json(corsHeaders, {
        error: "A assinatura digital ainda nao foi configurada nesta instalacao. Peca ao administrador para configurar AUTENTIQUE_API_TOKEN.",
      }, 501);
    }

    const body = await req.json().catch(() => ({}));
    const patientId: string | undefined = body?.patient_id;
    if (!patientId) return json(corsHeaders, { error: "patient_id obrigatorio" }, 400);

    const { data: patient, error: pErr } = await supabase
      .from("patients").select("id, full_name, profession, risk").eq("id", patientId).single();
    if (pErr || !patient) return json(corsHeaders, { error: "Paciente nao encontrado" }, 404);

    const { data: sessions } = await supabase
      .from("sessions").select("session_number, session_date, content").eq("patient_id", patientId)
      .order("session_date", { ascending: true });

    const { data: profile } = await supabase
      .from("therapists").select("full_name, email").eq("id", userRes.user.id).maybeSingle();

    const signerName: string = (body?.signer_name || profile?.full_name || "Terapeuta responsavel").trim();
    const signerEmail: string | undefined = body?.signer_email || profile?.email;

    const title = `Relatorio Clinico - ${patient.full_name} - ${new Date().toLocaleDateString("pt-BR")}`;
    const html = buildReportHtml(profile?.full_name ?? "TerapiaViva", patient, sessions ?? []);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: sigRow, error: sigErr } = await admin.from("document_signatures").insert({
      owner_id: ownerId,
      patient_id: patientId,
      document_title: title,
      provider: "autentique",
      status: "enviado",
      signer_name: signerName,
      signer_email: signerEmail,
    }).select().single();
    if (sigErr || !sigRow) return json(corsHeaders, { error: "Falha ao registrar envio para assinatura" }, 500);

    const operations = JSON.stringify({
      query: `mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
        createDocument(document: $document, signers: $signers, file: $file) { id name created_at }
      }`,
      variables: {
        document: { name: title },
        signers: [signerEmail ? { email: signerEmail, action: "SIGN" } : { name: signerName, action: "SIGN" }],
        file: null,
      },
    });
    const map = JSON.stringify({ file: ["variables.file"] });

    const form = new FormData();
    form.append("operations", operations);
    form.append("map", map);
    form.append("file", new Blob([html], { type: "text/html" }), `relatorio-${patientId}.html`);

    const autRes = await fetch("https://api.autentique.com.br/v2/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${autentiqueToken}` },
      body: form,
    });
    const autData = await autRes.json().catch(() => ({}));

    if (!autRes.ok || autData?.errors || !autData?.data?.createDocument?.id) {
      await admin.from("document_signatures").update({ status: "cancelado" }).eq("id", sigRow.id);
      return json(corsHeaders, {
        error: "Erro ao enviar documento para o Autentique",
        detail: autData?.errors ?? (await autRes.text().catch(() => "")),
      }, 502);
    }

    await admin.from("document_signatures").update({
      external_id: autData.data.createDocument.id,
    }).eq("id", sigRow.id);

    return json(corsHeaders, { ok: true, signature_id: sigRow.id, status: "enviado" });
  } catch (e) {
    captureError(e, { function: "sign-report" });
    return json(corsHeaders, { error: String((e as Error).message ?? e) }, 500);
  }
});

function json(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
