# Testes E2E (Playwright)

## Racional

Os testes em `public.spec.js` cobrem apenas fluxos **públicos/não autenticados**
(login, cadastro visual, páginas legais). Eles **não criam nem alteram dados**,
então são seguros de rodar contra o backend apontado pelo `.env` a qualquer momento.

## Como rodar

```bash
npm run test:e2e        # headless
npm run test:e2e:ui     # modo interativo
```

Requisito: `npx playwright install chromium` na primeira vez.

## Como estender com fluxos autenticados

1. Crie um projeto Supabase de **staging** (nunca use produção).
2. Configure `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` de staging no ambiente do CI
   (secrets `STAGING_SUPABASE_URL`/`STAGING_SUPABASE_ANON_KEY`, ver `.github/workflows/ci.yml`).
3. Crie uma conta de teste via `supabase.auth.admin` num `globalSetup` e use
   `storageState` do Playwright para reaproveitar a sessão entre testes.
4. Prefixe dados criados com `e2e-` e limpe-os no `globalTeardown`.

No CI, o job `e2e` roda apenas manualmente (workflow_dispatch) por exigir backend acessível.
