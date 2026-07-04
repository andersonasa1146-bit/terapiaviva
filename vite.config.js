import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Task #36: PWA instalavel + suporte offline. O manifest passa a ser gerado
// aqui (em vez do antigo public/manifest.webmanifest estatico) para que o
// nome/cor do app respeitem as variaveis de branding white-label
// (VITE_APP_NAME / VITE_THEME_COLOR) de cada instalacao/cliente — o arquivo
// estatico anterior nao passava pela substituicao de variaveis do Vite (essa
// so acontece em .html) e sempre ficava com a marca generica "TerapiaViva".
//
// Fase 2 (notificacoes push): trocamos a estrategia de "generateSW" para
// "injectManifest" — o service worker agora tem codigo-fonte proprio
// (src/sw.js) para poder escutar os eventos "push"/"notificationclick",
// algo que "generateSW" nao permite customizar.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const appName = env.VITE_APP_NAME || 'TerapiaViva'
  const themeColor = env.VITE_THEME_COLOR || '#1D9E75'

  return {
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: appName,
          short_name: appName,
          description: 'Gestao de prontuario, agenda e financeiro para terapeutas.',
          lang: 'pt-BR',
          start_url: '/',
          display: 'standalone',
          background_color: '#F3F6F5',
          theme_color: themeColor,
          icons: [
            { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          ],
        },
        injectManifest: {
          // So faz precache dos assets ESTATICOS do proprio app (JS/CSS/HTML/
          // imagens do build) — nunca de chamadas ao Supabase. Dados
          // clinicos (pacientes, sessoes, agenda, financeiro) sempre exigem
          // rede: cachear isso seria arriscado (dado desatualizado sem
          // aviso, numa area de saude). Ver src/components/OfflineBanner.jsx
          // para o aviso explicito de "voce esta offline" mostrado ao
          // usuario nesse caso.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
        },
        devOptions: { enabled: false, type: 'module' },
      }),
    ],
    server: { port: 5173, host: true },
    build: { outDir: 'dist', sourcemap: false },
    test: {
      environment: 'node',
      globals: true,
      include: ['src/**/*.test.js'],
    },
  }
})
