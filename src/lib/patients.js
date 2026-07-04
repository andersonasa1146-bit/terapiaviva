import { supabase } from './supabase'
import { initials } from './format'

// Paleta de cores do avatar, sorteada ao criar um paciente — compartilhada
// entre o cadastro manual (Patients.jsx) e o cadastro a partir de uma
// anamnese ja respondida (Anamnese.jsx), para nao duplicar a logica.
const PALETTES = [
  { bg: '#E1F5EE', fg: '#085041' }, { bg: '#EEEDFE', fg: '#3C3489' },
  { bg: '#FAEEDA', fg: '#633806' }, { bg: '#FCEBEB', fg: '#A32D2D' },
  { bg: '#EAF3DE', fg: '#27500A' },
]

export function randomPalette() {
  return PALETTES[Math.floor(Math.random() * PALETTES.length)]
}

// Cria um paciente para a clinica do usuario logado (ownerId). `fields`
// aceita os mesmos campos da tabela patients (full_name, phone, email,
// profession, city, church, risk, goals...) — initials/avatar sao
// calculados automaticamente.
export async function createPatient(ownerId, fields) {
  const palette = randomPalette()
  const { data, error } = await supabase.from('patients').insert({
    therapist_id: ownerId,
    initials: initials(fields.full_name),
    avatar_bg: palette.bg,
    avatar_fg: palette.fg,
    risk: 'baixo',
    goals: [],
    ...fields,
  }).select().single()
  if (error) throw error
  return data
}
