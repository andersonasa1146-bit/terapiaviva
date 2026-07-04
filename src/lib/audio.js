import { supabase } from './supabase'

const BUCKET = 'session-audio'
export const MAX_AUDIO_MB = 25

// Envia o arquivo de audio para o bucket privado e vincula o caminho a sessao.
export async function uploadSessionAudio(therapistId, sessionId, file) {
  if (file.size > MAX_AUDIO_MB * 1024 * 1024) {
    throw new Error(`Arquivo excede o limite de ${MAX_AUDIO_MB}MB.`)
  }
  const safeName = file.name.replace(/[^\w.-]+/g, '_')
  const path = `${therapistId}/${sessionId}/${Date.now()}_${safeName}`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
  if (upErr) throw upErr
  const { error: updErr } = await supabase.from('sessions').update({ audio_path: path }).eq('id', sessionId)
  if (updErr) throw updErr
  return path
}

export async function getAudioSignedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120)
  if (error) throw error
  return data.signedUrl
}

export async function removeSessionAudio(sessionId, path) {
  await supabase.storage.from(BUCKET).remove([path])
  const { error } = await supabase.from('sessions').update({
    audio_path: null, audio_transcript: null, audio_transcribed_at: null,
  }).eq('id', sessionId)
  if (error) throw error
}
