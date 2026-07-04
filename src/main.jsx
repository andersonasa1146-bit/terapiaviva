import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import OfflineBanner from './components/OfflineBanner'
import App from './App'
import { SITE } from './config/site'
import { initSentry } from './lib/sentry'
import './styles/globals.css'

document.title = SITE.therapistName ? `${SITE.appName} — ${SITE.therapistName}` : SITE.appName

// Task #32 (monitoramento de erros): sem VITE_SENTRY_DSN configurada, isso
// e um no-op silencioso — o app funciona identico a hoje.
initSentry()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <OfflineBanner />
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
