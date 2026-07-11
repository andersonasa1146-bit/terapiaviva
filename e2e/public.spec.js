// TerapiaViva — E2E (Task #33): fluxos publicos/nao-autenticados.
// Deliberadamente restrito a fluxos que NAO criam nem alteram dados no
// projeto Supabase real (o mesmo apontado pelo .env local) — seguro de
// rodar contra o backend de producao a qualquer momento. Ver e2e/README.md
// para o racional e como estender com fluxos autenticados.
import { test, expect } from '@playwright/test'

test.describe('Login', () => {
  test('renders branding, form fields and legal links', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('.auth-card h1')).toContainText('TerapiaViva')
    await expect(page.locator('.auth-card input[type="email"]')).toBeVisible()
    await expect(page.locator('.auth-card input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/termos.html')
    await expect(page.getByRole('link', { name: 'Politica de Privacidade' })).toHaveAttribute('href', '/privacidade.html')
  })

  test('switches to signup mode and shows the full name field', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('Nome completo')).not.toBeVisible()
    await page.getByText('Criar conta gratis').click()
    await expect(page.getByText('Nome completo')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Criar conta' })).toBeVisible()
  })

  test('shows an error message for invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.locator('.auth-card input[type="email"]').fill(`e2e-${Date.now()}@naoexiste.invalid`)
    await page.locator('.auth-card input[type="password"]').fill('senha-incorreta-123')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.locator('.auth-card')).toContainText(/invalid|erro/i, { timeout: 15000 })
  })
})

test.describe('Paginas legais estaticas', () => {
  test('Termos de Uso carrega', async ({ page }) => {
    await page.goto('/termos.html')
    await expect(page.locator('h1')).toHaveText('Termos de Uso')
  })

  test('Politica de Privacidade carrega', async ({ page }) => {
    await page.goto('/privacidade.html')
    await expect(page.locator('h1')).toBeVisible()
  })
})

test.describe('Portal publico de anamnese (/a/:token)', () => {
  test('renders the form for an arbitrary/invalid token without erroring', async ({ page }) => {
    await page.goto('/a/token-invalido-de-teste-e2e')
    await expect(page.getByText(/Etapa 1 de/)).toBeVisible()
    await expect(page.locator('.consent-box')).toContainText('confidencial')
  })
})

test.describe('Aceitar convite de equipe (/equipe/aceitar/:token)', () => {
  test('shows a login prompt when logged out', async ({ page }) => {
    await page.goto('/equipe/aceitar/token-invalido-de-teste-e2e')
    await expect(page.getByText('Convite para a equipe da clinica')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ir para o login' })).toBeVisible()
  })
})

test.describe('Rotas privadas sem sessao', () => {
  test('redirects an unknown route to /login when logged out', async ({ page }) => {
    await page.goto('/uma-rota-que-nao-existe')
    await page.waitForURL('**/login')
    await expect(page.locator('.auth-card')).toBeVisible()
  })

  test('redirects /patients to /login when logged out', async ({ page }) => {
    await page.goto('/patients')
    await page.waitForURL('**/login')
  })
})
