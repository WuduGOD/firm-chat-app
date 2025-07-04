import { createClient } from '@supabase/supabase-js'

const profilesCache = new Map()
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export { supabase, profilesCache }
