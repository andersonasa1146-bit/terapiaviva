# Runbook — Instalação para um novo cliente (white-label)

Passo a passo para colocar uma nova instalação do TerapiaViva no ar.
Tempo estimado: 2–4 horas.

## 1. Supabase (backend)

1. Crie um projeto novo em https://supabase.com (região São Paulo).
2. Instale a CLI (`npm i -g supabase`), `supabase link --project-ref <ref>`.
3. Aplique o schema: `npm run db:push` (roda as migrations de `supabase/migrations`).
4. Configure as secrets das Edge Functions:

```bash
supabase secrets set ANTHROPIC_API_KEY=...            # IA de sessões/anamnese
supabase secrets set GROQ_API_KEY=...                 # transcrição Whisper
supabase secrets set ALLOWED_ORIGINS=https://app.dominio-do-cliente.com
supabase secrets set MERCADOPAGO_ACCESS_TOKEN=...     # assinatura da plataforma
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET=...   # painel MP > Webhooks > assinatura secreta
supabase secrets set CRON_SECRET=...                  # lembretes agendados
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...
supabase secrets set AUTENTIQUE_TOKEN=... AUTENTIQUE_WEBHOOK_SECRET=...   # assinatura digital (opcional)
supabase secrets set DAILY_API_KEY=...                # teleconsulta (opcional)
supabase secrets set SENTRY_DSN=...                   # monitoramento (opcional)
# White-label da IA (opcional — padrão é tradição bíblica batista):
supabase secrets set THERAPY_TRADITION_LABEL="..." COUNSELING_TRAINING="..."
```

5. Deploy das functions: `npm run fn:deploy` (ou tag `v*` no GitHub com CI configurado).

## 2. Frontend (Vercel ou Cloudflare Pages)

1. Copie `.env.example` para `.env` e preencha o branding do cliente
   (VITE_APP_NAME, VITE_THERAPIST_NAME, VITE_THEME_COLOR, VITE_LOGIN_VERSE etc.).
2. Substitua `public/foto.webp` pela foto/logo do cliente.
3. Importe o repositório na Vercel — o `vercel.json` já cuida do build e das rewrites de SPA.
4. Defina as variáveis `VITE_*` no painel da Vercel (mesmos valores do `.env`).
5. Aponte o domínio do cliente e confirme HTTPS.

## 3. Integrações do cliente

- **Mercado Pago**: cadastrar aplicação, configurar webhook para
  `https://<ref>.supabase.co/functions/v1/mercadopago-webhook` e copiar a assinatura secreta.
- **Google Calendar**: criar credenciais OAuth2 e configurar `GOOGLE_CLIENT_ID/SECRET` nas secrets.
- **Autentique** (opcional): token de API + webhook.

## 4. Checklist de aceite antes de entregar

- [ ] Login + criação de conta funcionando no domínio final
- [ ] 2FA: enrolar e desafiar um TOTP de teste
- [ ] Criar paciente, sessão, análise de IA e escala PHQ-9
- [ ] Cobrança de paciente (sandbox MP) muda status ao pagar
- [ ] Lembrete de consulta chega (e-mail/push)
- [ ] PWA instala no celular e recebe push
- [ ] `ALLOWED_ORIGINS` e `MERCADOPAGO_WEBHOOK_SECRET` configuradas (sem avisos nos logs)
- [ ] Exportar LGPD de um paciente de teste
- [ ] Sentry recebendo eventos
