// TerapiaViva — configuracao do Playwright (Task #33).
// Roda contra o servidor de dev do Vite (npm run dev), que ja sobe com as
// variaveis reais de .env (inclusive VITE_SUPABASE_URL/ANON_KEY do projeto).
// Isso e seguro: os testes cobertos aqui sao fluxos publicos/nao-autenticados
// (login, paginas estaticas, portais publicos por token) — nenhum cria ou
// altera dados reais. Ver e2e/README.md para o escopo e como estender com
// fluxos autenticados.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
