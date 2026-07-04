# TerapiaViva v2

SaaS para terapeutas biblicas cristas: prontuario, anamnese com IA, agenda,
mural de oracao, financeiro com graficos comparativos YoY e bloco de
prospeccao/aperfeicoamento profissional.

## Stack

- **Frontend**: Vite + React 18 + React Router + Recharts
- **Backend**: Supabase (Postgres + Auth + Row Level Security + Edge Functions Deno)
- **IA**: Anthropic Claude Sonnet 4.6 — chave *nunca* exposta no browser
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
# preencha .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
```

## 3) Criar o projeto no Supabase

1. Em https://supabase.com crie um projeto (regiao `sa-east-1` para latencia PT-BR).
2. Copie **Project URL** e **anon key** para o `.env`.
3. Faca login na CLI e vincule o projeto:

```bash
supabase login
supabase link --project-ref SEU-PROJETO-REF
```

## 4) Aplicar a migration (schema + RLS)

```bash
supabase db push
```

Isso cria:
- Tabelas: `therapists`, `patients`, `sessions`, `anamneses`, `appointments`,
  `financial_entries`, `prayer_requests`
- Views: `v_financial_monthly`, `v_financial_by_category`, `v_dashboard_kpis`
- Trigger que cria automaticamente `therapists` ao registrar um novo usuario
- **RLS estrita**: cada terapeuta so acessa os proprios pacientes
- Funcao publica `submit_anamnesis` (token de 7 dias para o paciente responder)

## 5) Configurar segredos das Edge Functions

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
```

A chave fica **apenas no servidor**. O front nunca a ve.

## 6) Deploy das Edge Functions

```bash
supabase functions deploy analyze-session
supabase functions deploy analyze-anamnese
# ou
npm run fn:deploy
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

## 8) Deploy em producao

**Cloudflare Pages (frontend)**:

```bash
npm run build
# faca upload da pasta dist/ para Cloudflare Pages
# OU use wrangler pages deploy dist
```

Configure as env `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` na dashboard
do Cloudflare.

---

## Arquitetura de seguranca

| Camada | Protecao |
|---|---|
| Auth | Supabase Auth (email/senha, opcional 2FA) |
| Autorizacao | Row Level Security por `auth.uid()` em todas as tabelas |
| Chave Anthropic | Somente `Deno.env` da Edge Function — nunca no browser |
| Transporte | HTTPS obrigatorio (Supabase + Cloudflare) |
| At rest | AES-256 padrao Supabase + backup diario |
| Portal paciente | Rota `/a/:token` publica, mas token unico expira em 7 dias |
| Auditoria | `created_at`, `updated_at`, `ai_evaluated_at` em todos os registros |

---

## Modulos do app

| Rota | Modulo |
|---|---|
| `/` | Dashboard (sem receita — foco em pacientes, agenda e insights IA) |
| `/patients` | CRUD de pacientes |
| `/patients/:id` | Prontuario: Sessoes + Ficha + Relatorio (PDF via print) |
| `/anamnese` | Gerar links de anamnese, revisar respostas com IA |
| `/agenda` | Calendario + novo agendamento |
| `/ia` | Atalho por paciente para analise de IA |
| `/prayer` | Mural de intencoes |
| `/biblical` | Versiculo do dia + temas do consultorio |
| `/financial` | **Graficos YoY (12 meses) + composicao por categoria + bloco de prospeccao/formacao** |
| `/config` | Perfil, seguranca, roadmap |
| `/a/:token` | Portal publico do paciente para responder anamnese |

---

## Proximos passos (Fase 2)

- [ ] Envio WhatsApp do link de anamnese (Z-API)
- [ ] Teleconsulta embutida (Daily.co)
- [ ] Cobranca automatica (Asaas / Mercado Pago Pix)
- [ ] Geracao de PDF real (Puppeteer via Edge Function)
- [ ] PWA instalavel (mobile-first)
- [ ] Google Calendar sync

Ver detalhes no chat da Flavia com o Claude (avaliacao Junho/2026).
