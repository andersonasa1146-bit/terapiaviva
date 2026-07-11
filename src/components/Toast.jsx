import { createContext, useCallback, useContext, useRef, useState } from 'react'

// Sistema simples de notificacoes (substitui alert()/prompt() nativos,
// que travam a interface e nao podem ser estilizados).
const ToastCtx = createContext(null)

let idSeq = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const [promptState, setPromptState] = useState(null)
  const resolvers = useRef({})

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const push = useCallback((message, { type = 'info', duration = 4000 } = {}) => {
    const id = ++idSeq
    setToasts((t) => [...t, { id, message, type }])
    if (duration) setTimeout(() => remove(id), duration)
    return id
  }, [remove])

  const toast = {
    success: (msg, opts) => push(msg, { ...opts, type: 'success' }),
    error: (msg, opts) => push(msg, { ...opts, type: 'error' }),
    info: (msg, opts) => push(msg, { ...opts, type: 'info' }),
  }

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      const id = ++idSeq
      resolvers.current[id] = resolve
      setConfirmState({ id, message, ...opts })
    })
  }, [])

  const promptCopy = useCallback((message, value) => {
    return new Promise((resolve) => {
      const id = ++idSeq
      resolvers.current[id] = resolve
      setPromptState({ id, message, value })
    })
  }, [])

  const closeConfirm = (result) => {
    if (confirmState) {
      resolvers.current[confirmState.id]?.(result)
      delete resolvers.current[confirmState.id]
    }
    setConfirmState(null)
  }

  const closePrompt = () => {
    if (promptState) {
      resolvers.current[promptState.id]?.(true)
      delete resolvers.current[promptState.id]
    }
    setPromptState(null)
  }

  return (
    <ToastCtx.Provider value={{ toast, confirm, promptCopy }}>
      {children}

      <div style={{ position: 'fixed', top: 14, right: 14, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            background: t.type === 'error' ? '#FBE4E4' : t.type === 'success' ? '#E1F5EE' : '#EEF3F2',
            color: t.type === 'error' ? '#A32D2D' : t.type === 'success' ? '#0B5E44' : '#33403E',
            border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, padding: '10px 14px',
            fontSize: 12.5, lineHeight: 1.5, boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
          }}>
            {t.message}
          </div>
        ))}
      </div>

      {confirmState && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <p style={{ fontSize: 13.5, color: '#33403E', lineHeight: 1.6, marginBottom: 18, whiteSpace: 'pre-line' }}>{confirmState.message}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => closeConfirm(false)} style={btnGhost}>{confirmState.cancelLabel || 'Cancelar'}</button>
              <button onClick={() => closeConfirm(true)} style={{ ...btnSolid, background: confirmState.danger ? '#A32D2D' : '#1D9E75' }}>
                {confirmState.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {promptState && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <p style={{ fontSize: 13.5, color: '#33403E', lineHeight: 1.6, marginBottom: 10 }}>{promptState.message}</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <input readOnly value={promptState.value} onFocus={(e) => e.target.select()}
                style={{ flex: 1, fontSize: 12.5, padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE8E5' }} />
              <button
                onClick={() => { navigator.clipboard?.writeText(promptState.value); toast.success('Link copiado!') }}
                style={btnSolid}
              >
                Copiar
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={closePrompt} style={btnGhost}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  )
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(20,30,28,0.35)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16,
}
const modalStyle = {
  background: '#fff', borderRadius: 12, padding: 22, width: '100%', maxWidth: 380,
  boxShadow: '0 10px 40px rgba(0,0,0,0.18)',
}
const btnGhost = {
  background: 'transparent', border: '1px solid #DDE8E5', borderRadius: 7,
  padding: '8px 14px', fontSize: 12.5, cursor: 'pointer', color: '#556866',
}
const btnSolid = {
  background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 7,
  padding: '8px 14px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600,
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>')
  return ctx
}
