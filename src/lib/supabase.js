import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('[TerapiaViva] Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env')
}

export const supabase = createClient(url ?? 'http://localhost', key ?? 'anon', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
