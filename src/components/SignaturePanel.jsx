import { useEffect, useState } from 'react'
import { signReport, listSignatures } from '../lib/signature'
import { useToast } from './Toast'

const STATUS_STYLE = {
  pendente: { bg: '#EEF3F2', fg: '#556866', label: 'Pendente' },
  enviado: { bg: '#FDF6E3', fg: '#8a5a06', label: 'Aguardando assinatura' },
  assinado: { bg: '#E1F5EE', fg: '#0B5E44', label: 'Assinado' },
  recusado: { bg: '#FBE4E4', fg: '#A32D2D', label: 'Recusado' },
  cancelado: { bg: '#EEF3F2', fg: '#556866', label: 'Cancelado' },
}

// Fase 2: assinatura digital de relatorios — envia o relatorio clinico do
// paciente para assinatura eletronica (Autentique) e acompanha o status.
export default function SignaturePanel({ patientId }) {
  const { toast } = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const load = () => {
    setLoading(true)
    listSignatures(patientId).then(setItems).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { if (patientId) load() }, [patientId])

  const send = async () => {
    setSending(true)
    try {
      await signReport(patientId)
      toast.success('Relatorio enviado para assinatura digital.')
      load()
    } catch (e) { toast.error(e.message) }
    setSending(false)
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="chdr">
        ✍️ Assinatura digital do relatorio
        <div className="chdr-act">
          <button className="btn btn-sm btn-p" onClick={send} disabled={sending}>
            {sending ? 'Enviando…' : '+ Assinar digitalmente'}
          </button>
        </div>
      </div>
      <div className="cbdy" style={{ padding: '10px 13px' }}>
        <p style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 10 }}>
          Envia o historico de sessoes deste paciente para assinatura eletronica, dando validade e
          autenticidade adicionais ao relatorio emitido.
        </p>
        {loading ? (
          <div style={{ padding: '10px 0', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>Carregando…</div>
        ) : items.length ? items.map((s) => {
          const st = STATUS_STYLE[s.status] || STATUS_STYLE.pendente
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--bdr)' }}>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.fg, fontWeight: 600, flexShrink: 0 }}>{st.label}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{s.document_title}</div>
                <div style={{ fontSize: 10.5, color: 'var(--txt2)' }}>
                  Enviado em {new Date(s.created_at).toLocaleDateString('pt-BR')}
                  {s.signed_at ? ` · assinado em ${new Date(s.signed_at).toLocaleDateString('pt-BR')}` : ''}
                </div>
              </div>
              {s.signed_document_url && (
                <a className="btn btn-sm" href={s.signed_document_url} target="_blank" rel="noreferrer">Ver assinado</a>
              )}
            </div>
          )
        }) : (
          <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>Nenhum relatorio enviado para assinatura ainda.</div>
        )}
      </div>
    </div>
  )
}
