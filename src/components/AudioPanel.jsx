import { useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import { uploadSessionAudio, getAudioSignedUrl, removeSessionAudio, MAX_AUDIO_MB } from '../lib/audio'
import { transcribeSession } from '../lib/ai'

export default function AudioPanel({ s, onUpdated }) {
  const { ownerId } = useAuth()
  const { toast, confirm, promptCopy } = useToast()
  const [uploading, setUploading] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [playUrl, setPlayUrl] = useState(null)
  const inputRef = useRef(null)

  const onPick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      await uploadSessionAudio(ownerId, s.id, file)
      toast.success('Audio anexado. Clique em "Transcrever" para gerar o texto.')
      onUpdated()
    } catch (err) {
      toast.error(err.message)
    }
    setUploading(false)
  }

  const play = async () => {
    try {
      const url = await getAudioSignedUrl(s.audio_path)
      setPlayUrl(url)
    } catch (err) { toast.error(err.message) }
  }

  const transcribe = async () => {
    setTranscribing(true)
    try {
      const r = await transcribeSession(s.id)
      toast.success('Transcricao concluida.')
      onUpdated(r.transcript)
    } catch (err) {
      toast.error(err.message)
    }
    setTranscribing(false)
  }

  const remove = async () => {
    const ok = await confirm('Remover o audio e a transcricao desta sessao? Esta acao nao pode ser desfeita.', { danger: true, confirmLabel: 'Remover' })
    if (!ok) return
    try {
      await removeSessionAudio(s.id, s.audio_path)
      toast.success('Audio removido.')
      setPlayUrl(null)
      onUpdated(null)
    } catch (err) { toast.error(err.message) }
  }

  const copyTranscript = () => promptCopy('Transcricao da sessao (somente leitura):', s.audio_transcript || '')

  return (
    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', marginTop: 6 }}>
      {!s.audio_path ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-sm btn-p" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Enviando…' : '🎙️ Anexar audio'}
          </button>
          <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>MP3, WAV, M4A ou WebM, ate {MAX_AUDIO_MB}MB.</span>
          <input ref={inputRef} type="file" hidden accept="audio/*" onChange={onPick} />
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12 }}>🎧 Audio anexado</span>
            <button className="btn btn-sm" onClick={play}>▶ Ouvir</button>
            {!s.audio_transcript && (
              <button className="btn btn-sm btn-p" onClick={transcribe} disabled={transcribing}>
                {transcribing ? 'Transcrevendo…' : '📝 Transcrever com IA'}
              </button>
            )}
            <button className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={remove}>🗑 Remover</button>
          </div>
          {playUrl && <audio controls src={playUrl} style={{ width: '100%', marginTop: 8 }} />}
          {s.audio_transcript && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--txt2)' }}>Transcricao automatica</span>
                <button className="btn btn-sm" onClick={copyTranscript}>⧉ Copiar</button>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5, background: '#fff', border: '1px solid var(--bdr)', borderRadius: 6, padding: 10, maxHeight: 160, overflowY: 'auto' }}>
                {s.audio_transcript}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
