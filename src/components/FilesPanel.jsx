import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'

const BUCKET = 'patient-files'
const MAX_MB = 15

function fmtSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function iconFor(mime) {
  if (!mime) return '📎'
  if (mime.includes('pdf')) return '📄'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime.includes('word')) return '📝'
  return '📎'
}

export default function FilesPanel({ patientId }) {
  const { session, ownerId } = useAuth()
  const { toast, confirm } = useToast()
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  const load = async () => {
    const { data } = await supabase.from('patient_files')
      .select('*').eq('patient_id', patientId).order('created_at', { ascending: false })
    setFiles(data ?? [])
  }
  useEffect(() => { if (patientId) load() }, [patientId])

  const onPick = async (e) => {
    const list = Array.from(e.target.files || [])
    e.target.value = ''
    if (!list.length) return
    setUploading(true)
    for (const file of list) {
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(`"${file.name}" excede o limite de ${MAX_MB}MB.`)
        continue
      }
      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const path = `${ownerId}/${patientId}/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
      if (upErr) { toast.error(`Falha ao enviar "${file.name}": ${upErr.message}`); continue }
      const { error: insErr } = await supabase.from('patient_files').insert({
        therapist_id: ownerId,
        patient_id: patientId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      })
      if (insErr) toast.error(insErr.message)
    }
    setUploading(false)
    toast.success('Upload concluido.')
    load()
  }

  const download = async (f) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 60)
    if (error) { toast.error(error.message); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const remove = async (f) => {
    const ok = await confirm(`Excluir o arquivo "${f.file_name}"? Esta acao nao pode ser desfeita.`, { danger: true, confirmLabel: 'Excluir' })
    if (!ok) return
    await supabase.storage.from(BUCKET).remove([f.storage_path])
    const { error } = await supabase.from('patient_files').delete().eq('id', f.id)
    if (error) { toast.error(error.message); return }
    toast.success('Arquivo excluido.')
    load()
  }

  return (
    <div className="card">
      <div className="chdr">
        <span>📎 Arquivos e exames ({files.length})</span>
        <button className="btn btn-sm btn-p" onClick={() => inputRef.current?.click()} disabled={uploading || !session}>
          {uploading ? 'Enviando…' : '+ Anexar arquivo'}
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={onPick}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" />
      </div>
      <div className="cbdy" style={{ padding: '4px 13px' }}>
        <p style={{ fontSize: 10.5, color: 'var(--txt3)', margin: '8px 0' }}>
          PDF, imagens e Word, ate {MAX_MB}MB por arquivo. Armazenamento privado — acessivel apenas pela equipe clinica.
        </p>
        {files.length ? files.map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--bdr)' }}>
            <span style={{ fontSize: 18 }}>{iconFor(f.mime_type)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--txt2)' }}>
                {fmtSize(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString('pt-BR')}
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => download(f)}>⬇ Baixar</button>
            <button className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={() => remove(f)}>🗑</button>
          </div>
        )) : <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>Nenhum arquivo anexado.</div>}
      </div>
    </div>
  )
}
