# TerapiaViva v2

SaaS (modelo white-label — uma instalacao por cliente) para terapeutas: prontuario,
anamnese com IA, agenda com sincronizacao Google Calendar, deteccao de conflito
de horario, recorrencia e lembretes automaticos, mural de oracao, financeiro
com graficos comparativos YoY e exportacao CSV, bloco de prospeccao/aperfeicoamento
profissional, controle de uso de IA por plano, escalas clinicas (PHQ-9/GAD-7),
anexos e transcricao de audio, alertas automaticos de risco, cobranca direta de
pacientes via Mercado Pago pessoal, equipe multiusuario com perfis de acesso
(admin/terapeuta/recepcao), autenticacao de dois fatores (2FA/TOTP), log de
auditoria de acesso a prontuario, monitoramento de erros e rate limiting geral
nas Edge Functions, testes end-to-end (Playwright), painel administrativo
multi-clinica para o dono do produto, onboarding guiado para novas contas, PWA
instalavel com suporte offline e notificacoes push, teleconsulta integrada
(Daily.co), assinatura digital de relatorios (Autentique), e assinatura
recorrente via Mercado Pago.

## Stack

- **Frontend**: Vite + React 18 + React Router + Recharts + vite-plugin-pwa (PWA/service worker + notificacoes push, ver secao 9i/9j)
- **Backend**: Supabase (Postgres + Auth + Row Level Security + Storage + Edge Functions Deno + pg_cron/pg_net)
- **IA**: Anthropic Claude Sonnet 4.6 (analises clinicas) + OpenAI Whisper (transcricao de audio) — chaves *nunca* expostas no browser
- **Integracoes**: Mercado Pago (assinatura SaaS, ver secao 9, e cobranca de pacientes, ver secao 9b) + Google Calendar (OAuth2, ver secao 5) + Resend/Z-API (lembretes, ver secao 5) + Sentry (monitoramento de erros, ver secao 9f) + Daily.co (teleconsulta, ver secao 9j) + Autentique (assinatura digital, ver secao 9j) + Web Push/VAPID (notificacoes push, ver secao 9j)
- **Qualidade**: ESLint + Prettier + Vitest (`npm run lint` / `npm test`) + Playwright para E2E (`npm run test:e2e`, ver secao 8b)
- **Deploy sugerido**: Cloudflare Pages (frontend) + Supabase (backend)

---

## 1) Pre-requisitos

- Node 18+ (`node -v`)
- Conta gratuita no [Supabase](https://supabase.com)
- Supabase CLI: `npm i -g supabase`
- Chave da API da [Anthropic](https://console.anthropic.com)
- (Opcional) Chave da API da [OpenAI](https://platform.openai.com) para transcricao de audio
- (Opcional) Projeto no [Google Cloud Console](https://console.cloud.google.com) para sincronizar agenda
- (Opcional) Conta [Resend](https://resend.com) (e-mail) e/ou [Z-API](https://www.z-api.io) (WhatsApp) para lembretes automaticos
- (Opcional) Conta [Sentry](https://sentry.io) para monitoramento de erros (frontend e Edge Functions)
- (Opcional) Conta [Daily.co](https://www.daily.co) para teleconsulta integrada
- (Opcional) Conta [Autentique](https://www.autentique.com.br) para assinatura digital de relatorios

## 2) Instalar

```bash
cd _Projetos/TerapiaViva-v2
npm install
cp .env.example .env
# preencha .env com VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e as variaveis
# de marca/nicho (veja os comentarios do proprio .env.example)
```

## 3) Criar o projeto no Supabase

1. Em https://supabase.com crie um projeto (regiao `sa-east-1` para latencia PT-BR).
2. Copie **Project URL** e **anon key** para o `.env`.
3. Faca login na CLI e vincule o projeto:

```bash
supabase login
supabase link --project-ref SEU-PROJETO-REF
```

## 4) Aplicar as migrations (schema + RLS + LGPD + plano/uso)

```bash
supabase db push
```

Isso cria:
- Tabelas: `therapists`, `patients`, `sessions`, `anamneses`, `appointments`,
  `financial_entries`, `prayer_requests`, `erasure_log`, `clinical_scales`,
  `patient_files`, `risk_alerts`, `patient_charges`, `team_members`,
  `access_audit_log`, `rate_limit_buckets`, `platform_admins`,
  `platform_settings`, `push_subscriptions`, `document_signatures`,
  `video_rooms`
- Buckets de Storage privados: `patient-files` (anexos/exames) e
  `session-audio` (audio das sessoes), com RLS por pasta escopada pela
  **clinica** (`{owner_id}/...`, ver secao 9c sobre multiusuario)
- Views: `v_financial_monthly`, `v_financial_by_category`, `v_dashboard_kpis`
  (esta ultima com `security_invoker = true`, para nunca vazar KPIs de outra
  clinica mesmo sob consulta direta)
- Trigger que cria automaticamente `therapists` ao registrar um novo usuario
- **RLS estrita**: cada clinica (conta proprietaria + equipe convidada) so
  acessa os proprios pacientes — ver secao 9c para o modelo de multiusuario
- Funcao publica `submit_anamnesis` (token de 7 dias para o paciente responder)
- Funcoes de **LGPD**: `export_patient_data` (portabilidade) e `erase_patient`
  (direito ao esquecimento), ambas acessiveis pelos botoes "Exportar" e "Excluir"
  na tela de Pacientes
- Colunas de **plano e uso de IA** em `therapists` (`plan`, `plan_ai_limit`,
  `ai_calls_this_month` — cota compartilhada por toda a equipe da clinica) e
  funcoes `check_ai_quota` / `record_ai_usage`
- Triggers de **alerta automatico de risco** (`risk_alerts`) disparados por
  escalas clinicas (item de ideacao suicida do PHQ-9), avaliacao de IA da
  sessao/anamnese com risco alto/critico, e autorrelato de risco imediato
  — e que, desde a Fase 2, tambem disparam um **push best-effort** para a
  clinica (ver secao 9j)
- Colunas e funcao `disconnect_google_calendar` para a integracao com
  **Google Calendar** (tokens OAuth2 por terapeuta)
- Extensoes `pg_cron` + `pg_net`, funcoes `list_pending_reminders` /
  `mark_reminder_sent` e um job agendado a cada 15 min que chama a Edge
  Function `send-reminders` (lembretes automaticos de sessao, que desde a
  Fase 2 tambem dispara push para a propria equipe)
- Extensao `btree_gist` + **exclusion constraint** em `appointments` que
  impede, a nivel de banco, dois agendamentos ativos sobrepostos da mesma
  clinica (deteccao de conflito robusta contra condicao de corrida),
  coluna `working_hours` (horario de expediente) e colunas de recorrencia
  (`recurrence_id`, `recurrence_index`) com funcao `cancel_recurrence_series`
- Coluna `mp_patient_access_token` em `therapists` (token pessoal da
  terapeuta no Mercado Pago, com `SELECT` revogado do role `authenticated` —
  nunca trafega para o browser) e tabela `patient_charges` para **cobranca
  direta de pacientes**, com funcoes `set_patient_mp_token` /
  `clear_patient_mp_token` / `has_patient_mp_token`
- Tabela `team_members` e funcoes `current_owner_id` / `current_team_role` /
  `has_clinical_access` / `has_financial_access` / `invite_team_member` /
  `accept_team_invite` / `remove_team_member` / `update_team_member_role` /
  `list_team_members` para **multiusuario / perfis de acesso** (ver secao 9c)
- Tabela `access_audit_log` (sem nenhuma permissao de escrita para o client —
  o unico caminho de gravacao e a funcao SECURITY DEFINER abaixo) e funcoes
  `log_patient_access` / `list_access_audit_log` para o **log de auditoria de
  acesso a prontuario** (ver secao 9e)
- Tabela `rate_limit_buckets` (tambem sem permissao de escrita para o client)
  e funcao `check_rate_limit` para o **rate limiting geral** das Edge
  Functions (ver secao 9f), com limpeza diaria automatica via `pg_cron`
- Tabelas `platform_admins` e `platform_settings` (idem, sem permissao de
  escrita para o client) e funcoes `is_platform_admin` / `admin_list_accounts`
  / `admin_platform_stats` / `admin_set_mrr_price` para o **painel
  administrativo multi-clinica** do dono do produto (ver secao 9g)
- Tabela `push_subscriptions` (RLS: cada pessoa so gerencia a propria
  inscricao) para **notificacoes push** (ver secao 9j)
- Tabela `document_signatures` para **assinatura digital de relatorios**
  via Autentique (ver secao 9j)
- Tabela `video_rooms` para **teleconsulta integrada** via Daily.co (ver
  secao 9j)

A **autenticacao de dois fatores** (ver secao 9d) usa a API nativa
`supabase.auth.mfa.*` do Supabase Auth — nao requer nenhuma migration, tabela
ou segredo adicional. O **onboarding guiado** (ver secao 9h) tambem nao requer
nenhuma migration nova — reaproveita a coluna `onboarded_at` de `therapists`,
que ja existia no schema desde a migration inicial. O **PWA/offline** (ver
secao 9i) e puramente frontend — nenhuma migration ou tabela envolvida. O
**cadastro de paciente a partir da anamnese** (ver secao 7) tambem nao exigiu
nenhuma migration nova — reaproveita a coluna `patient_id` (ja nullable) de
`anamneses` e a RLS existente da tabela.

## 5) Configurar segredos das Edge Functions

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
supabase secrets set ALLOWED_ORIGINS=https://app.seudominio.com
```

A chave da Anthropic fica **apenas no servidor**. O front nunca a ve.
`ALLOWED_ORIGINS` restringe quais dominios podem chamar as Edge Functions
(use `*` apenas em desenvolvimento local).

Para personalizar o nicho/tradicao de aconselhamento usado nos prompts de IA
(por padrao configurado para tradicao biblica batista):

```bash
supabase secrets set THERAPY_TRADITION_LABEL="Psicologa Clinica (abordagem TCC)"
supabase secrets set COUNSELING_TRAINING="TCC, ACT, DBT, terapia do esquema"
```

Para habilitar a **transcricao de audio das sessoes** (opcional — sem isso a
funcao responde com um erro amigavel em vez de quebrar o app):

```bash
supabase secrets set OPENAI_API_KEY=sk-...
```

Para habilitar a **sincronizacao com Google Calendar** (opcional):

1. No [Google Cloud Console](https://console.cloud.google.com), crie um projeto,
   ative a **Google Calendar API** e crie uma credencial OAuth2 (tipo
   "Web application").
2. Em "Authorized redirect URIs", cadastre:
   `https://SEU-PROJETO.supabase.co/functions/v1/google-oauth-callback`
3. Configure os segredos:

```bash
supabase secrets set GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
supabase secrets set GOOGLE_CLIENT_SECRET=xxxxx
supabase secrets set GOOGLE_REDIRECT_URI=https://SEU-PROJETO.supabase.co/functions/v1/google-oauth-callback
supabase secrets set APP_URL=https://app.seudominio.com
```

Sem essas variaveis, o botao "Conectar Google Calendar" em **Configuracoes**
mostra um erro amigavel em vez de quebrar o app. Uma vez conectado, todo novo
agendamento criado na Agenda e espelhado automaticamente (best-effort, nao
bloqueia o salvamento caso a API do Google esteja indisponivel).

Para habilitar os **lembretes automaticos por e-mail/WhatsApp** (opcional):

```bash
# Segredo interno que autentica a chamada do pg_cron -> Edge Function
# (o mesmo valor JA FOI gravado no Vault do banco pela migration
# appointment_reminders — copie o valor exibido no final desta configuracao
# ou rode `select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret';`
# no SQL editor do Supabase para recupera-lo). O MESMO segredo autentica a
# Edge Function send-push (ver secao 9j).
supabase secrets set CRON_SECRET=<valor gravado no vault>

# E-mail (Resend) — opcional
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set RESEND_FROM_EMAIL=lembretes@seudominio.com

# WhatsApp (Z-API) — opcional
supabase secrets set ZAPI_INSTANCE_ID=...
supabase secrets set ZAPI_TOKEN=...
supabase secrets set ZAPI_CLIENT_TOKEN=...
```

Sem `CRON_SECRET`, a funcao recusa as chamadas do cron (401) e nada e
enviado. Sem `RESEND_API_KEY`/`ZAPI_*`, o canal correspondente e pulado
silenciosamente (log-only) — o app nunca quebra por falta dessas chaves.
As preferencias de lembrete (canais, horas de antecedencia) ficam em
**Configuracoes → Lembretes automaticos de sessao**, e o cadastro de
paciente agora tem campos de e-mail e telefone para recebe-los.

Para habilitar o **monitoramento de erros das Edge Functions** (opcional, ver
secao 9f):

```bash
supabase secrets set SENTRY_DSN=https://<public_key>@<host>/<project_id>
supabase secrets set SENTRY_ENVIRONMENT=production
```

Para habilitar as integracoes da **Fase 2** (notificacoes push, teleconsulta,
assinatura digital), ver secao 9j — todas opcionais e "fail-open".

## 6) Deploy das Edge Functions

```bash
npm run fn:deploy
# ou individualmente:
supabase functions deploy analyze-session
supabase functions deploy analyze-anamnese
supabase functions deploy create-subscription
supabase functions deploy mercadopago-webhook
supabase functions deploy transcribe-session
supabase functions deploy google-oauth-start
supabase functions deploy google-oauth-callback --no-verify-jwt
supabase functions deploy sync-appointment
supabase functions deploy send-reminders --no-verify-jwt
supabase functions deploy charge-patient
supabase functions deploy mercadopago-patient-webhook --no-verify-jwt
supabase functions deploy send-push --no-verify-jwt
supabase functions deploy sign-report
supabase functions deploy autentique-webhook --no-verify-jwt
supabase functions deploy create-video-room
```

## 7) Rodar em desenvolvimento

```bash
npm run dev
# abre em http://localhost:5173
```

Fluxo inicial:
1. `/login` → **Criar conta gratis** (email + senha)
2. Confirmar email (Supabase envia)
3. Voltar e fazer login
4. Cadastrar seu primeiro paciente (ou gere um link de anamnese para alguem
   novo e cadastre-a depois — ver abaixo)
5. Gerar link de anamnese → enviar por WhatsApp
6. Registrar sessao e clicar em **🧠 Salvar e analisar com IA**

O card **Primeiros passos** no Dashboard (ver secao 9h) guia exatamente esse
fluxo, com links diretos para cada etapa.

**Anamnese → cadastro de paciente**: ao gerar um link de anamnese
(`/anamnese`), e possivel vincular a um paciente ja existente ou deixar em
aberto para alguem novo. Depois que a pessoa responde, a tela de detalhe
mostra um botao **+ Cadastrar como paciente**, que cria o cadastro
automaticamente usando nome, telefone, cidade, profissao, igreja e objetivos
ja preenchidos no formulario (o nivel de risco tambem e herdado do
autorrelato/avaliacao de IA), e vincula a anamnese ao novo prontuario — sem
precisar redigitar nada na tela de Pacientes.

## 8) Qualidade de codigo

```bash
npm run lint          # ESLint
npm run format        # Prettier (grava)
npm run format:check  # Prettier (so verifica)
npm test              # Vitest
npm run build         # build de producao (Vite) — tambem gera o service worker (ver secao 9i)
```

## 8b) Testes end-to-end (Playwright)

```bash
npx playwright install --with-deps chromium   # uma vez, baixa o navegador
npm run test:e2e        # roda os testes (headless)
npm run test:e2e:ui     # modo interativo (util para debugar seletor a seletor)
```

Os testes ficam em `e2e/` e sobem automaticamente o servidor de dev do Vite
(`npm run dev`, configurado em `playwright.config.js`) antes de rodar.

Escopo atual (`e2e/public.spec.js`) — deliberadamente restrito a fluxos
**publicos/nao-autenticados**, que nao criam nem alteram nenhum dado no
projeto Supabase apontado pelo `.env`, tornando-os seguros de rodar a
qualquer momento contra o backend real (inclusive em produção, se preciso):
tela de login (renderizacao, alternancia login/cadastro, mensagem de erro em
credenciais invalidas), paginas legais estaticas (`/termos.html`,
`/privacidade.html`), portal publico de anamnese (`/a/:token`) com token
invalido, pagina de aceitar convite de equipe (`/equipe/aceitar/:token`)
deslogado, e redirecionamento de rotas privadas para `/login` quando nao ha
sessao.

Fluxos **autenticados** (dashboard, CRUD de pacientes, agenda etc.) ficam de
fora deliberadamente por agora — testa-los contra o backend real exigiria uma
conta de teste dedicada (risco de poluir dados de um projeto de producao) ou
uma camada de mock das respostas do Supabase via interceptacao de rede do
Playwright (`page.route`). Ambas as abordagens sao viaveis como proxima
etapa; ver "Proximos passos" no fim deste README.

> Nota de ambiente: rodar `npx playwright test` exige acesso de rede de saida
> irrestrito (o driver do Playwright e o download inicial dos navegadores
> precisam disso); em sandboxes com rede bloqueada/allowlisted isso pode
> travar. Rode localmente na sua maquina ou em CI (GitHub Actions, por
> exemplo) para verificacao confiavel.

## 9) Cobranca da assinatura SaaS — Mercado Pago (opcional)

O app funciona normalmente sem cobranca configurada (plano `trial` com limite
de IA padrao). Para habilitar assinaturas recorrentes (a terapeuta paga o
uso do TerapiaViva ao operador da plataforma):

```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
supabase secrets set MP_PLAN_PRICE=97.00
supabase secrets set MP_PLAN_AI_LIMIT=300
supabase secrets set MP_BACK_URL=https://app.seudominio.com/config
```

E, no painel do Mercado Pago, configure a URL de webhook:
`https://SEU-PROJETO.supabase.co/functions/v1/mercadopago-webhook`

O botao "Assinar plano Profissional" aparece em **Configuracoes** e, sem a
chave configurada, retorna um erro amigavel em vez de quebrar o app.

## 9b) Cobranca de pacientes — Mercado Pago pessoal (opcional)

Distinto da secao anterior: aqui a **proprietaria da clinica** conecta a
**propria conta** pessoal do Mercado Pago para cobrar sessoes/pacotes
diretamente dos seus pacientes — o dinheiro cai na conta da terapeuta, nao na
do operador da plataforma. Nao ha segredo global a configurar; a proprietaria
cola seu proprio Access Token em **Configuracoes → Cobranca de pacientes**,
que e salvo via RPC `set_patient_mp_token` numa coluna com `SELECT` revogado
do client (`authenticated`) — apenas as Edge Functions (Service Role)
conseguem le-la.

Fluxo:
1. A proprietaria gera um **Access Token de producao** em
   Mercado Pago → Suas integracoes → Credenciais e cola em Configuracoes.
2. No prontuario do paciente (aba **💵 Cobranca**, visivel apenas a quem tem
   acesso financeiro — ver secao 9c), informa-se valor e descricao; a Edge
   Function `charge-patient` resolve a clinica de quem chamou (`current_owner_id`,
   permitindo que um administrador de equipe tambem gere cobrancas em nome da
   proprietaria), cria uma preferencia de Checkout Pro usando o token pessoal
   da proprietaria e devolve um `payment_link` para copiar/enviar ao paciente.
3. Ao ser paga, o Mercado Pago chama `mercadopago-patient-webhook` (a URL de
   notificacao ja inclui o `charge_id`, permitindo localizar a cobranca e a
   terapeuta correta sem varrer todas as contas); o webhook confirma o
   pagamento junto ao Mercado Pago com o **token daquela clinica** e
   registra automaticamente um lancamento em `financial_entries`.

Sem token pessoal configurado, a aba de cobranca mostra um aviso e a Edge
Function responde 501 em vez de quebrar o app.

## 9c) Multiusuario — equipe com perfis de acesso (opcional)

Por padrao, cada conta opera sozinha (modelo "conta individual"). Uma clinica
com mais de uma pessoa pode convidar colegas para operar sobre os MESMOS
pacientes, agenda e (conforme o papel) financeiro, cada uma com seu proprio
login:

| Papel | Acesso |
|---|---|
| **Proprietaria** (implicito, quem criou a conta) | Tudo — inclusive gerenciar a equipe, o token do Mercado Pago pessoal e o Google Calendar |
| **Administrador(a)** | Pacientes, sessoes, anamneses, escalas, arquivos, agenda, oracao e financeiro/cobranca completos, alem do log de auditoria (ver secao 9e) |
| **Terapeuta** | Pacientes, sessoes, anamneses, escalas, arquivos, agenda e oracao — **sem** financeiro/cobranca e sem log de auditoria |
| **Recepcao** | Apenas pacientes (dados de contato/agendamento) e agenda — **sem** sessoes, anamneses, escalas, arquivos, alertas de risco, financeiro, cobranca ou log de auditoria |

Como convidar: em **Configuracoes → Equipe da clinica** (visivel apenas para a
proprietaria), informe o e-mail e o papel e clique em **Convidar**. Um link de
convite (`/equipe/aceitar/:token`) e gerado — envie-o para a pessoa. Ela deve
criar uma conta ou entrar com o **mesmo e-mail convidado** e depois abrir o
link para confirmar. So entao ela passa a enxergar os dados da clinica.

Detalhes tecnicos: a coluna `therapist_id`, ja usada em todas as tabelas
clinicas, agora e comparada a `current_owner_id()` (uma funcao que resolve
para o proprio `auth.uid()` numa conta individual, ou para o `owner_id` da
clinica quando o usuario e um membro de equipe ativo) em vez de sempre
`auth.uid()`. Isso significa que nenhuma tabela ou coluna nova precisou ser
duplicada por terapeuta — o modelo de RLS existente foi estendido, nao
substituido. A cota mensal de IA (`plan_ai_limit`/`ai_calls_this_month`) e
compartilhada por toda a equipe da clinica, e nao por login individual.

## 9d) Autenticacao de dois fatores (2FA / TOTP)

Disponivel para **qualquer** conta logada (proprietaria ou membro de equipe),
ja que protege o login individual de cada pessoa, nao um dado da clinica. Usa
a API nativa `supabase.auth.mfa.*` — nenhum segredo, tabela ou Edge Function
adicional e necessario; o segredo TOTP fica inteiramente gerenciado pelo
Supabase Auth.

Como ativar: em **Configuracoes → Autenticacao de dois fatores**, clique em
"Ativar 2FA", escaneie o QR code com um aplicativo autenticador (Google
Authenticator, Authy, 1Password, etc.) e confirme com o codigo de 6 digitos.
A partir dai, todo novo login (mesmo com a senha correta) exige o codigo do
aplicativo antes de liberar o acesso as rotas privadas — a tela de desafio
(`MFAChallenge`) intercepta a sessao em nivel `aal1` (so senha) e so libera o
app apos a verificacao subir o nivel para `aal2`.

## 9e) Log de auditoria de acesso a prontuario

Registra automaticamente, para cada paciente, quem abriu o prontuario, gerou
um relatorio/PDF, exportou os dados (LGPD) ou excluiu o paciente (LGPD) — util
para a proprietaria/administradora auditar o uso da equipe e para atender uma
eventual solicitacao regulatoria sobre quem acessou dados sensiveis de saude.

Como funciona: a tabela `access_audit_log` **nao tem nenhuma permissao de
INSERT/UPDATE/DELETE concedida ao client** (nem para `authenticated`, nem
para `anon`) — a unica forma de gravar uma entrada e a funcao
`log_patient_access(p_patient_id, p_action)`, que roda como SECURITY DEFINER,
valida que quem chamou tem acesso clinico e que o paciente pertence a clinica
de quem chamou, e so entao insere a linha com `actor_id = auth.uid()`. Isso
torna o log resistente a adulteracao pelo proprio client (diferente de um
simples RLS baseado em coluna `created_by`, que ainda permitiria INSERT
direto). O app chama essa funcao (silenciosamente, sem bloquear a interface
em caso de falha) ao abrir um prontuario, gerar um relatorio, exportar dados
ou excluir um paciente.

Quem pode ver: apenas a proprietaria e administradores de equipe, na tela
**Auditoria** (`/auditoria`, item de navegacao visivel so para esses papeis),
via a funcao `list_access_audit_log`, que devolve nome de quem acessou e nome
(ou identificador salvo) do paciente, mesmo que um dos dois tenha sido
removido depois.

## 9f) Monitoramento de erros (Sentry) + rate limiting geral

Duas melhorias de robustez independentes, ambas opcionais e "fail-open"
(nunca bloqueiam o uso normal do app caso nao estejam configuradas ou caso a
propria checagem falhe por instabilidade de infraestrutura):

**Monitoramento de erros**: o `ErrorBoundary` do frontend e o bloco `catch`
de cada Edge Function agora enviam excecoes nao tratadas para o Sentry,
quando `VITE_SENTRY_DSN` (frontend) e/ou `SENTRY_DSN` (Edge Functions,
`supabase secrets set SENTRY_DSN=...`) estiverem configurados — o mesmo
projeto Sentry pode ser reaproveitado dos dois lados. Sem essas variaveis,
tudo continua funcionando exatamente como antes, so sem essa visibilidade
extra (os erros continuam logados no console/`supabase functions logs`).
Nas Edge Functions, o envio usa a Sentry Envelope API diretamente via
`fetch` (sem depender do SDK oficial `@sentry/deno`, cujo bundle e pesado
demais para o build sob demanda do CDN usado pelas Edge Functions — isso
chegou a estourar o timeout de deploy em teste).

**Rate limiting geral**: a funcao Postgres `check_rate_limit(chave, limite,
janela_em_segundos)` implementa um limitador de requisicoes de curto prazo
por usuario/clinica/IP (tabela `rate_limit_buckets`, sem nenhum grant de
escrita ao client — mesmo padrao de tamper-resistance do log de auditoria).
Ela complementa a cota MENSAL de IA (`check_ai_quota`) com um limite de
CURTO PRAZO — por exemplo, `analyze-session` e `analyze-anamnese` aceitam no
maximo 10 chamadas/minuto por usuario, `transcribe-session` 6/minuto (mais
custosa), `charge-patient` 20/minuto por CLINICA (nao por usuario, ja que
qualquer membro com acesso financeiro compartilha o mesmo token de Mercado
Pago), e os webhooks publicos (`mercadopago-webhook`,
`mercadopago-patient-webhook`, `google-oauth-callback`) sao limitados por IP.
Ao exceder o limite, a Edge Function responde `429` com uma mensagem amigavel.
A unica excecao e `send-reminders`, que ja e protegida por um segredo
compartilhado (`CRON_SECRET`) e por isso nao leva rate limiting adicional.

## 9g) Painel administrativo (dono do produto)

Camada de permissao **ortogonal** aos perfis de equipe da secao 9c: enquanto
`is_team_admin`/`has_financial_access` etc. valem DENTRO de uma clinica, o
painel administrativo enxerga **todas as clinicas cadastradas na
instalacao**, para quem opera o TerapiaViva como produto (nao para a
terapeuta cliente).

Como funciona: a tabela `platform_admins` lista os `id` (referenciando
`therapists`) autorizados a essa visao — sem nenhum grant de escrita ao
client, assim como `access_audit_log`/`rate_limit_buckets`. A funcao
`is_platform_admin()` (SECURITY DEFINER) resolve se o usuario logado esta
nessa lista; o resultado e carregado no `AuthContext` (`isPlatformAdmin`) e
tambem controla a visibilidade do item **Painel admin** na navegacao.

Quem e admin de plataforma ve, em `/admin`:
- Contas/clinicas cadastradas, assinaturas ativas, contas em trial e
  canceladas (via `admin_platform_stats`, SECURITY DEFINER)
- Total de pacientes e de chamadas de IA no mes, somados entre todas as
  clinicas
- **MRR estimado** = numero de assinaturas ativas × um preco de referencia
  editavel (tabela `platform_settings`, chave `mrr_price_brl`, atualizavel via
  `admin_set_mrr_price`). Esse valor e **apenas informativo/de referencia** —
  nao afeta a cobranca real, que continua controlada pelo segredo
  `MP_PLAN_PRICE` da Edge Function (ver secao 9)
- Lista de contas (`admin_list_accounts`, SECURITY DEFINER) com plano,
  status de assinatura, uso de IA no mes, tamanho da equipe, numero de
  pacientes e data de cadastro

Bootstrap: o primeiro administrador de plataforma precisa ser inserido
manualmente no banco (`insert into platform_admins (id) select id from
therapists where email = 'seu-email@dominio.com';`) — nao ha fluxo de
autopromocao pela UI, por design.

## 9h) Onboarding guiado para novas contas

Card **Primeiros passos** exibido no topo do Dashboard para quem acabou de
criar a conta, com uma checklist de configuracao inicial e links diretos
para cada tela:

- Cadastrar o primeiro paciente
- Enviar um link de anamnese
- Registrar a primeira sessao
- (opcional) Ativar a autenticacao de dois fatores (2FA)
- (opcional) Conectar o Google Calendar

Cada item e calculado dinamicamente (numero de pacientes/anamneses/sessoes
ja cadastrados, fatores MFA verificados, `google_calendar_connected`) — nao
depende de nenhum estado extra gravado durante o preenchimento, so na hora
de fechar o card. So aparece para quem opera como **proprietaria** da propria
clinica (`current_team_role() = 'owner'`): um membro de equipe convidado nao
tem o que fazer com convite de equipe/2FA/calendario de outra pessoa, entao
nunca ve o card.

O card some sozinho assim que os 3 passos essenciais (paciente, anamnese,
sessao) forem concluidos, ou a qualquer momento clicando em **Ocultar**.
Ambos os caminhos gravam a coluna `onboarded_at` (que ja existia em
`therapists` desde a migration inicial, mas nunca era usada por nenhuma
tela) via um simples `update` do client — permitido porque a policy de RLS
`therapist_self_update` (`id = auth.uid()`) ja cobre a propria linha do
usuario logado. Por isso a feature **nao precisou de nenhuma migration
nova**.

## 9i) PWA instalavel + suporte offline

O app pode ser **instalado** (Android/desktop Chrome/Edge: banner/menu
"Instalar app"; iOS Safari: "Adicionar a Tela de Inicio") e continua
abrindo mesmo sem conexao, gracas a um service worker (`src/sw.js`,
estrategia `injectManifest` do `vite-plugin-pwa`/Workbox) gerado durante
`npm run build`.

**O que fica disponivel offline**: apenas os arquivos ESTATICOS do proprio
app (HTML/CSS/JS/imagens do build) — a interface abre e navega normalmente
mesmo sem rede. **O que NUNCA e cacheado**: qualquer chamada ao Supabase
(dados de pacientes, sessoes, agenda, financeiro, autenticacao). Isso e
deliberado: numa area de saude, mostrar dados clinicos desatualizados sem
deixar isso claro seria perigoso, entao o app sempre exige rede para
ler/gravar dados reais — ele so evita a tela em branco/erro de navegador ao
abrir sem conexao. Quando a conexao cai, um aviso fixo no topo da tela
(`OfflineBanner`) deixa isso explicito para quem esta usando o app, em vez
de deixar requisicoes falharem silenciosamente.

**Branding por cliente**: como o projeto e white-label (secao 10), o
manifest (`nome`, `cor do tema`) e gerado em tempo de build a partir de
`VITE_APP_NAME`/`VITE_THEME_COLOR` do `.env` de cada instalacao — nao existe
mais um `public/manifest.webmanifest` estatico (esse arquivo nao passava
pela substituicao de variaveis do Vite e sempre ficava com a marca generica
"TerapiaViva", mesmo em instalacoes de outros clientes).

**Limitacao conhecida**: o icone atual (`favicon.svg`) funciona para o
manifest (Android/desktop) mas o `apple-touch-icon` do iOS exige PNG —
Safari ainda nao renderiza SVG nesse papel. Para melhor suporte em iOS, gere
icones PNG (192×192 e 512×512, e um 180×180 para `apple-touch-icon`) a partir
da arte de cada cliente e aponte os caminhos em `vite.config.js`
(`VitePWA({ manifest: { icons: [...] } })`) e em `index.html`.

## 9j) Fase 2 — teleconsulta, assinatura digital e notificacoes push

Tres integracoes novas, todas **opcionais e "fail-open"**: sem as chaves
configuradas, os botoes correspondentes mostram um aviso amigavel em vez de
quebrar o app (mesmo padrao de Google Calendar/Mercado Pago pessoal).

**Notificacoes push (PWA)** — unica das tres que nao depende de nenhuma
conta de terceiros: usa o protocolo Web Push padrao (chaves VAPID geradas
uma vez, sem servico proprietario tipo Firebase/OneSignal). Em
**Configuracoes → Notificacoes push**, qualquer pessoa da equipe pode
ativar no proprio dispositivo (exige instalar o app na tela de inicio no
iPhone) e receber avisos de sessao proxima (via `send-reminders`) e de
alertas de risco (via trigger em `risk_alerts`), mesmo com o app fechado.

```bash
# gere uma vez (ex.: npx web-push generate-vapid-keys) e configure:
supabase secrets set VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set VAPID_SUBJECT=mailto:contato@seudominio.com
# a chave publica tambem vai no .env do frontend:
# VITE_VAPID_PUBLIC_KEY=...
```

**Teleconsulta integrada (Daily.co)** — botao **🎥 Iniciar teleconsulta** na
Agenda, visivel em agendamentos online: a Edge Function `create-video-room`
cria (ou reaproveita) uma sala via API do Daily.co e o app abre um modal com
o Daily Prebuilt embutido (iframe), sem exigir SDK de video no frontend.

```bash
supabase secrets set DAILY_API_KEY=...
```

**Assinatura digital de relatorios (Autentique)** — botao **Assinar
digitalmente** na aba Relatorio do prontuario: a Edge Function `sign-report`
envia o historico do paciente para assinatura eletronica via API do
Autentique, e a Edge Function `autentique-webhook` marca o documento como
assinado assim que o webhook confirmar (`document.finished`).

```bash
supabase secrets set AUTENTIQUE_API_TOKEN=...
# registre o webhook no painel do Autentique apontando para:
#   https://SEU-PROJETO.supabase.co/functions/v1/autentique-webhook
supabase secrets set AUTENTIQUE_WEBHOOK_SECRET=<mesmo segredo do painel>
```

> Nota juridica: antes de operar com pacientes reais, confirme com um
> advogado/o Conselho de Classe se a assinatura eletronica simples (sem
> certificado ICP-Brasil) e suficiente para o tipo de documento clinico
> emitido — ver o documento `TerapiaViva_Viabilidade_Integracoes_Fase2.docx`
> para o comparativo completo de fornecedores e custos.

## 10) Deploy em producao

**Cloudflare Pages (frontend)**:

```bash
npm run build
# faca upload da pasta dist/ para Cloudflare Pages
# OU use wrangler pages deploy dist
```

Configure as env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e as variaveis
de marca (`VITE_APP_NAME`, `VITE_THERAPIST_NAME`, etc.) na dashboard do
Cloudflare — uma instalacao por cliente, cada uma com seu proprio projeto
Supabase e suas proprias variaveis.

Antes de operar com pacientes reais, revise e complete `/termos.html` e
`/privacidade.html` (rascunhos LGPD) com um advogado.

---

## Arquitetura de seguranca

| Camada | Protecao |
|---|---|
| Auth | Supabase Auth (email/senha) + 2FA/TOTP opcional por usuario (ver secao 9d) |
| Autorizacao | Row Level Security por `current_owner_id()` (escopo de clinica/equipe) em todas as tabelas e no Storage — ver secao 9c |
| Papeis da equipe | `has_clinical_access()`/`has_financial_access()`/`is_team_admin()` gatam RLS por papel (admin/terapeuta/recepcao), alem de esconder a navegacao correspondente no client |
| Chave Anthropic/OpenAI/Google/Resend/Z-API/Sentry/Daily.co/Autentique | Somente `Deno.env` da Edge Function — nunca no browser |
| Tokens sensiveis em tabela | `google_access_token`/`google_refresh_token`/`google_oauth_state`/`mp_patient_access_token` tem `SELECT` revogado do role `authenticated` — mesmo com RLS liberando a linha, o client nunca ve essas colunas; so Edge Functions com Service Role leem |
| Views agregadas | `v_dashboard_kpis` criada com `security_invoker = true` — sem isso, uma view SECURITY DEFINER poderia vazar KPIs agregados de outra clinica ao ser consultada com um `therapist_id` arbitrario (achado corrigido pelo advisor de seguranca do Supabase) |
| CORS | `ALLOWED_ORIGINS` restringe quais dominios chamam as Edge Functions |
| Transporte | HTTPS obrigatorio (Supabase + Cloudflare) |
| At rest | AES-256 padrao Supabase + backup diario |
| Storage de arquivos/audio | Buckets privados, RLS por pasta `{owner_id}/...` (escopada pela clinica, nao pelo login individual), URLs assinadas com expiracao curta |
| OAuth Google | State assinado com nonce de uso unico, tokens gravados via Service Role, nunca lidos pelo browser |
| Cron interno | `send-reminders`/`send-push` autenticadas por segredo compartilhado (`CRON_SECRET`) guardado no Vault do Postgres, nunca exposto ao cliente |
| Conflito de agenda | Exclusion constraint no Postgres (nao apenas checagem no cliente) — impossivel sobrepor horarios mesmo sob condicao de corrida |
| Portal paciente | Rota `/a/:token` publica, mas token unico expira em 7 dias |
| Uso de IA | Cota mensal por clinica (`check_ai_quota`), compartilhada pela equipe, base para planos pagos |
| LGPD | Exportacao (`export_patient_data`) e exclusao (`erase_patient`) self-service, disponiveis para quem tem acesso clinico |
| Alertas de risco | Triggers automaticos (`risk_alerts`) para escalas clinicas, IA e autorrelato, com push best-effort para a clinica (ver secao 9j) |
| Cobranca de pacientes | Token pessoal da proprietaria isolado por coluna revogada + webhook correlaciona pagamento a clinica certa via `charge_id` na URL de notificacao (nunca por busca ampla) |
| Convite de equipe | `invite_team_member`/`remove_team_member`/`update_team_member_role` restritos a proprietaria da conta; `accept_team_invite` valida que o e-mail logado bate com o e-mail convidado |
| 2FA | Segredo TOTP gerenciado inteiramente pelo Supabase Auth (nunca passa pelo nosso backend); sessao so atinge `aal2` apos verificacao do codigo, bloqueada pelo componente `MFAChallenge` |
| Auditoria | `created_at`, `updated_at`, `ai_evaluated_at`, `edited_at` em todos os registros + `erasure_log`; alem disso, `access_audit_log` registra quem visualizou/exportou/excluiu cada prontuario, com escrita **exclusiva** via funcao SECURITY DEFINER (zero grant de INSERT/UPDATE/DELETE ao client, para `authenticated` ou `anon`) — o proprio usuario logado nao consegue forjar ou apagar entradas |
| Rate limiting | `check_rate_limit` (mesmo padrao de escrita exclusiva via SECURITY DEFINER) limita chamadas de curto prazo por usuario/clinica/IP em todas as Edge Functions publicas ou custosas (IA, cobranca, OAuth, webhooks, push, video, assinatura); filosofia "fail-open" — falha de infraestrutura nunca bloqueia o uso legitimo (ver secao 9f) |
| Monitoramento de erros | Sentry opcional (frontend via `ErrorBoundary`, Edge Functions via envio direto a Envelope API) — nunca expõe segredos, nunca bloqueia o fluxo do app (ver secao 9f) |
| Testes E2E | Suite Playwright (`e2e/`) restrita a fluxos publicos que nao alteram dados reais — segura de rodar contra o backend de producao a qualquer momento (ver secao 8b) |
| Painel admin de plataforma | `platform_admins`/`platform_settings` sem grant de escrita ao client; `is_platform_admin`/`admin_list_accounts`/`admin_platform_stats`/`admin_set_mrr_price` SECURITY DEFINER, nivel de permissao ortogonal aos papeis de equipe (ver secao 9g) |
| Onboarding | So le contadores/flags que ja respeitam a RLS existente (patients/anamneses/sessions escopados por `therapist_id`, `google_calendar_connected`, fatores MFA da propria sessao); a gravacao de `onboarded_at` e restrita a propria linha (`id = auth.uid()`) — nenhuma superficie nova de escrita (ver secao 9h) |
| PWA/offline | O service worker so faz precache de assets estaticos do build — nenhuma chamada ao Supabase e cacheada, entao dados clinicos nunca ficam desatualizados silenciosamente offline (ver secao 9i) |
| Push/teleconsulta/assinatura | `push_subscriptions`/`document_signatures`/`video_rooms` com RLS por `current_owner_id()` + `has_clinical_access()`; chave privada VAPID e tokens do Daily.co/Autentique somente em `Deno.env`; webhook do Autentique validado por HMAC (`x-autentique-signature`) (ver secao 9j) |
| Anamnese → paciente | O cadastro criado a partir da anamnese usa a mesma RLS ja existente (`anamnesis_owner_all`, escopada por `current_owner_id()` + `has_clinical_access()`) — a vinculacao `patient_id` e um simples `update` do client, sem nenhuma nova superficie de escrita ou funcao SECURITY DEFINER |

---

## Modulos do app

| Rota | Modulo |
|---|---|
| `/` | Dashboard (card de onboarding para contas novas, ver secao 9h + banner de alertas de risco + pacientes, agenda e insights IA) |
| `/alertas` | Alertas automaticos de risco (escalas clinicas, IA, autorrelato) — acesso clinico |
| `/patients` | CRUD de pacientes (com e-mail/telefone p/ lembretes) + exportar/excluir dados (LGPD) |
| `/patients/:id` | Prontuario: Sessoes (editaveis + audio/transcricao) + Escalas (PHQ-9/GAD-7) + Arquivos + Cobranca (Mercado Pago pessoal, acesso financeiro) + Ficha + Relatorio (PDF via print + assinatura digital, ver secao 9j) |
| `/anamnese` | Gerar links de anamnese (com ou sem paciente ja vinculado), revisar respostas com IA e cadastrar como paciente com um clique — acesso clinico |
| `/agenda` | Calendario, novo agendamento (recorrente ou unico), deteccao de conflito, teleconsulta integrada para agendamentos online (ver secao 9j), lista de proximos agendamentos com cancelamento (individual ou por serie) e sincronizacao com Google Calendar |
| `/ia` | Atalho por paciente para analise de IA — acesso clinico |
| `/prayer` | Mural de intencoes |
| `/biblical` | Versiculo do dia + temas do consultorio |
| `/financial` | **Graficos YoY (12 meses) + composicao por categoria + exportacao CSV (lancamentos e resumo mensal) + bloco de prospeccao/formacao** — acesso financeiro |
| `/auditoria` | Log de auditoria de acesso a prontuario — visivel apenas para proprietaria/administradores (ver secao 9e) |
| `/admin` | Painel administrativo multi-clinica (contas, uso, MRR estimado) — visivel apenas para administradores de plataforma (ver secao 9g) |
| `/config` | Perfil pessoal + 2FA + notificacoes push (todos), e para a proprietaria: plano/uso de IA, equipe, cobranca de pacientes, Google Calendar, horario de expediente, lembretes automaticos, seguranca, integracoes Fase 2 |
| `/equipe/aceitar/:token` | Aceitar convite de equipe (publica; pede login/cadastro se necessario) |
| `/a/:token` | Portal publico do paciente para responder anamnese |

---

## Proximos passos (Fase 3)

- [x] Teleconsulta embutida (Daily.co) — implementado, aguardando `DAILY_API_KEY` (ver secao 9j)
- [x] Assinatura digital para relatorios (Autentique) — implementado, aguardando `AUTENTIQUE_API_TOKEN` (ver secao 9j)
- [x] Notificacoes push (PWA) — implementado e funcional assim que `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` forem configuradas (ver secao 9j)
- [x] Anamnese usada para cadastrar paciente — implementado (botao "+ Cadastrar como paciente" na anamnese respondida e vinculo de paciente existente ao gerar o link, ver secao 7)
- [ ] Geracao de PDF real (Puppeteer via Edge Function) — hoje o relatorio e HTML impresso pelo navegador; a assinatura digital (secao 9j) ja funciona sobre esse HTML, mas um PDF nativo melhoraria a fidelidade visual
- [ ] Salas de teleconsulta privadas com token por participante (hoje as salas do Daily.co sao "public" — o link em si e o segredo, nao listado em lugar nenhum, mas sem token de acesso individual)
- [ ] Icones PNG dedicados (192/512/apple-touch-icon) por cliente para instalacao PWA em iOS (ver secao 9i)
- [ ] Migrar modulos criticos para TypeScript
- [ ] Testes automatizados para as Edge Functions (Deno test)
- [ ] Testes E2E autenticados (dashboard, CRUD de pacientes etc.) — via conta
      de teste dedicada ou mock de rede do Playwright (ver secao 8b)
- [ ] Nota fiscal eletronica (requer integracao com provedor fiscal — Focus NFe/eNotas/NFe.io — e dados tributarios de cada terapeuta)
- [ ] Convite de equipe por e-mail automatico (hoje o link e gerado e copiado manualmente; falta enviar via Resend)
- [ ] Permitir que administradores de equipe (nao so a proprietaria) tambem convidem/gerenciem membros
- [ ] 2FA obrigatorio (hoje e opcional por usuario) para contas com acesso financeiro
- [ ] Diario das emocoes, tarefas de casa, tags/fila de espera e modulo de documentos — ver `TerapiaViva_Avaliacao_Viabilidade_Funcionalidades.docx` para a analise de viabilidade item a item
