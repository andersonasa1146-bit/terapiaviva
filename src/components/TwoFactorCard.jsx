import { useEffect, useState } from 'react'
import { useToast } from './Toast'
import { listFactors, enrollTotp, verifyEnrollment, unenrollFactor } from '../lib/mfa'

// Task #30: card de gestao de 2FA (TOTP) — disponivel para QUALQUER
// usuario logado (proprietaria ou membro de equipe), ja que e uma
// protecao da conta pessoal de cada um, nao uma configuracao da clinica.
export default function TwoFactorCard() {
  const { toast, confirm } = useToast()
  const [factors, setFactors] = useState([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(null) // { id, totp } | null
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    listFactors().then(setFactors).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const startEnroll = async () => {
    try {
      const data = await enrollTotp()
      setEnrolling(data)
      setCode('')
    } catch (e) { toast.error(e.message) }
  }

  const cancelEnroll = async () => {
    if (enrolling) { try { await unenrollFactor(enrolling.id) } catch { /* ja pode ter sido removido */ } }
    setEnrolling(null)
  }

  const confirmEnroll = async (e) => {
    e.preventDefault()
    if (!enrolling) return
    setBusy(true)
    try {
      await verifyEnrollment(enrolling.id, code.trim())
      toast.success('Autenticação de dois fatores ativada!')
      setEnrolling(null)
      load()
    } catch (e2) {
      toast.error(e2.message)
    }
    setBusy(false)
  }

  const remove = async (f) => {
    const ok = await confirm('Desativar a autenticação de dois fatores desta conta? Isso reduz a segurança do seu login.', { danger: true, confirmLabel: 'Desativar' })
    if (!ok) return
    try {
      await unenrollFactor(f.id)
      toast.success('2FA desativado.')
      load()
    } catch (e) { toast.error(e.message) }
  }

  const verifiedFactor = factors.find((f) => f.status === 'verified')

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="chdr">🔐 Autenticação de dois fatores (2FA)</div>
      <div className="cbdy">
        <p style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 12 }}>
          Adiciona uma segunda etapa de verificação (código de 6 dígitos de um aplicativo autenticador) ao
          fazer login, além da senha. Protege sua conta mesmo que a senha vaze.
        </p>

        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Carregando…</div>
        ) : enrolling ? (
          <form onSubmit={confirmEnroll}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12 }}>
              {enrolling.totp?.qr_code && (
                <img src={enrolling.totp.qr_code} alt="QR code para configurar o autenticador" style={{ width: 150, height: 150, border: '1px solid var(--bdr)', borderRadius: 8 }} />
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 8 }}>
                  Escaneie o QR code com Google Authenticator, Authy, 1Password ou similar. Se preferir, digite a
                  chave manualmente:
                </p>
                <code style={{ fontSize: 11, wordBreak: 'break-all', background: 'var(--bg)', padding: '4px 6px', borderRadius: 4, display: 'inline-block' }}>
                  {enrolling.totp?.secret}
                </code>
              </div>
            </div>
            <div className="field" style={{ maxWidth: 200 }}>
              <label>Código de 6 dígitos</label>
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                inputMode="numeric" placeholder="000000" style={{ letterSpacing: 3, textAlign: 'center' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-p btn-sm" type="submit" disabled={busy || code.length < 6}>{busy ? 'Confirmando…' : 'Confirmar e ativar'}</button>
              <button className="btn btn-sm" type="button" onClick={cancelEnroll}>Cancelar</button>
            </div>
          </form>
        ) : verifiedFactor ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>✅ Ativado ({verifiedFactor.friendly_name || 'Aplicativo autenticador'})</div>
            <button className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={() => remove(verifiedFactor)}>Desativar</button>
          </div>
        ) : (
          <button className="btn btn-p btn-sm" onClick={startEnroll}>+ Ativar 2FA</button>
        )}
      </div>
    </div>
  )
}
