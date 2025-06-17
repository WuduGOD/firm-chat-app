import { supabase, profilesCache } from './supabaseClient.js'

export async function loadAllProfiles() {
  const { data: profiles, error } = await supabase.from('profiles').select('id,email,username')
  if (error) {
    console.error('Błąd ładowania profili:', error)
    return
  }
  profilesCache.clear()
  profiles.forEach(({ id, email, username }) => {
    profilesCache.set(id, { email, username })
  })
}

export function getUserLabelById(id) {
  const profile = profilesCache.get(id)
  if (!profile) return id
  return profile.username || profile.email || id
}
