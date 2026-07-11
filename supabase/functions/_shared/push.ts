// deno-lint-ignore-file no-explicit-any
// TerapiaViva — helper compartilhado de notificacoes push (Fase 2 do
// roadmap). Usa a biblioteca "web-push" (via npm specifier do Deno) para
// falar o protocolo Web Push padrao com VAPID, sem depender de nenhum
// servico de push proprietario (Firebase, OneSignal etc.) — o proprio
// navegador de cada usuario e quem entrega a notificacao.
//
// Configure em producao (mesma chave publica tambem vai no frontend, como
// VITE_VAPID_PUBLIC_KEY):
//   supabase secrets set VAPID_PUBLIC_KEY=...
//   supabase secrets set VAPID_PRIVATE_KEY=...
//   supabase secrets set VAPID_SUBJECT=mailto:contato@seudominio.com
// Sem essas chaves, o envio e pulado (log-only), sem quebrar o restante do
// fluxo (lembretes/alertas continuam funcionando pelos outros canais).

import webpush from "npm:web-push@3.6.7";

let configured = false;

export function vapidConfigured(): boolean {
  return !!(Deno.env.get("VAPID_PUBLIC_KEY") && Deno.env.get("VAPID_PRIVATE_KEY"));
}

function ensureVapid() {
  if (configured) return;
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@terapiaviva.app";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

type Sub = { id: string; endpoint: string; p256dh: string; auth_key: string };
type Admin = { from: (t: string) => any };

export async function sendPushToSubscriptions(admin: Admin, subs: Sub[], payload: Record<string, unknown>) {
  if (!vapidConfigured()) return { sent: 0, reason: "VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY nao configuradas" };
  ensureVapid();

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify(payload),
      );
      sent++;
    } catch (e: any) {
      // 404/410 = inscricao expirada ou revogada pelo navegador — remove.
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("[push] falha ao enviar para", sub.id, e?.message ?? e);
      }
    }
  }
  return { sent };
}

export async function sendPushToOwner(admin: any, ownerId: string, payload: Record<string, unknown>) {
  const { data: subs } = await admin
    .from("push_subscriptions").select("id, endpoint, p256dh, auth_key").eq("owner_id", ownerId);
  return sendPushToSubscriptions(admin, subs ?? [], payload);
}

export async function sendPushToUser(admin: any, userId: string, payload: Record<string, unknown>) {
  const { data: subs } = await admin
    .from("push_subscriptions").select("id, endpoint, p256dh, auth_key").eq("user_id", userId);
  return sendPushToSubscriptions(admin, subs ?? [], payload);
}
