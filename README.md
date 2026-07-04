# TerapiaViva v2

SaaS (modelo white-label — uma instalacao por cliente) para terapeutas: prontuario,
anamnese com IA, agenda, mural de oracao, financeiro com graficos comparativos YoY,
bloco de prospeccao/aperfeicoamento profissional, controle de uso de IA por plano
e assinatura recorrente via Mercado Pago.

## Stack

- **Frontend**: Vite + React 18 + React Router + Recharts
- **Backend**: Supabase (Postgres + Auth + Row Level Security + Edge Functions Deno)
- **IA**: Anthropic Claude Sonnet 4.6 — chave *nunca* exposta no browser
- **Cobranca**: Mercado Pago (assinatura recorrente — opcional, ver secao 9)
- **Qualidade**: ESLint + Prettier + Vitest (`npm run lint` / `npm test`)
- **Deploy sugerido**: Cloudflare Pages (frontend) + Supabase (backend)

---

## 1) Pre-requisitos

- Node 18+ (`node -v`)
- Conta gratuita no [Supabase](https://supabase.com)
- Supabase CLI: `npm i -g supabase`
- Chave da API da [Anthropic](https://console.anthropic.com)

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
  `financial_entries`, `prayer_requests`, `erasure_log`
- Views: `v_financial_monthly`, `v_financial_by_category`, `v_dashboard_kpis`
- Trigger que cria automaticamente `therapists` ao registrar um novo usuario
- **RLS estrita**: cada terapeuta so acessa os proprios pacientes
- Funcao publica `submit_anamnesis` (token de 7 dias para o paciente responder)
- Funcoes de **LGPD**: `export_patient_data` (portabilidade) e `erase_patient`
  (direito ao esquecimento), ambas acessiveis pelos botoes "Exportar" e "Excluir"
  na tela de Pacientes
- Colunas de **plano e uso de IA** em `therapists` (`plan`, `plan_ai_limit`,
  `ai_calls_this_month`) e funcoes `check_ai_quota` / `record_ai_usage`

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

## 6) Deploy das Edge Functions

```bash
npm run fn:deploy
# ou individualmente:
supabase functions deploy analyze-session
supabase functions deploy analyze-anamnese
supabase functions deploy create-subscription
supabase functions deploy mercadopago-webhook
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
4. Cadastrar seu primeiro paciente
5. Gerar link de anamnese → enviar por WhatsApp
6. Registrar sessao e clicar em **🧠 Salvar e analisar com IA**

## 8) Qualidade de codigo

```bash
npm run lint          # ESLint
npm run format        # Prettier (grava)
npm run format:check  # Prettier (so verifica)
npm test              # Vitest
npm run build         # build de producao (Vite)
```

## 9) Cobranca — Mercado Pago (opcional)

O app funciona normalmente sem cobranca configurada (plano `trial` com limite
de IA padrao). Para habilitar assinaturas recorrentes:

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
| Auth | Supabase Auth (email/senha, opcional 2FA) |
| Autorizacao | Row Level Security por `auth.uid()` em todas as tabelas |
| Chave Anthropic | Somente `Deno.env` da Edge Function — nunca no browser |
| CORS | `ALLOWED_ORIGINS` restringe quais dominios chamam as Edge Functions |
| Transporte | HTTPS obrigatorio (Supabase + Cloudflare) |
| At rest | AES-256 padrao Supabase + backup diario |
| Portal paciente | Rota `/a/:token` publica, mas token unico expira em 7 dias |
| Uso de IA | Cota mensal por conta (`check_ai_quota`), base para planos pagos |
| LGPD | Exportacao (`export_patient_data`) e exclusao (`erase_patient`) self-service por paciente |
| Auditoria | `created_at`, `updated_at`, `ai_evaluated_at` em todos os registros + `erasure_log` |

---

## Modulos do app

| Rota | Modulo |
|---|---|
| `/` | Dashboard (sem receita — foco em pacientes, agenda e insights IA) |
| `/patients` | CRUD de pacientes + exportar/excluir dados (LGPD) |
| `/patients/:id` | Prontuario: Sessoes + Ficha + Relatorio (PDF via print) |
| `/anamnese` | Gerar links de anamnese, revisar respostas com IA |
| `/agenda` | Calendario + novo agendamento |
| `/ia` | Atalho por paciente para analise de IA |
| `/prayer` | Mural de intencoes |
| `/biblical` | Versiculo do dia + temas do consultorio |
| `/financial` | **Graficos YoY (12 meses) + composicao por categoria + bloco de prospeccao/formacao** |
| `/config` | Perfil, plano/uso de IA, assinatura, seguranca, roadmap |
| `/a/:token` | Portal publico do paciente para responder anamnese |

---

## Proximos passos (Fase 2/3)

- [ ] Envio WhatsApp do link de anamnese (Z-API)
- [ ] Teleconsulta embutida (Daily.co)
- [ ] Geracao de PDF real (Puppeteer via Edge Function)
- [ ] PWA instalavel (mobile-first) — manifest ja incluido, falta service worker
- [ ] Google Calendar sync
- [ ] Painel administrativo para o dono do produto (contas, uso, MRR)
- [ ] Migrar modulos criticos para TypeScript
- [ ] Testes automatizados para as Edge Functions (Deno test)

Ver avaliacao tecnica e comercial completa entregue em Julho/2026.
