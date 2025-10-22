import { supabase, profilesCache } from './supabaseClient.js'

export async function loadAllProfiles() {
  const { data: profiles, error } = await supabase.from('profiles').select('id,email,username')
  if (error) {
    console.error('Błąd ładowania profili:', error)
    return []; // Zwracaj pustą tablicę w przypadku błędu
  }
  profilesCache.clear()
  profiles.forEach(({ id, email, username }) => {
    profilesCache.set(id, { email, username })
  })
  return profiles; // Zwracaj profile, jeśli wszystko poszło dobrze
}

export function getUserLabelById(id) {
  const profile = profilesCache.get(id)
  if (!profile) return id
  return profile.username || profile.email || id
}

/**
 * Generuje publiczny URL do awatara użytkownika w Supabase Storage.
 * @param {string} userId - ID użytkownika.
 * @returns {string} Publiczny URL do awatara.
 */
export function getAvatarUrl(userId) {
    if (!userId) {
        // Zwróć domyślny awatar, jeśli ID jest nieprawidłowe
        return 'https://placehold.co/48x48/cccccc/FFFFFF?text=?';
    }
    // Konstruuj URL do pliku w Supabase Storage
    // Zakładamy, że pliki mają nazwę userID.png lub userID.jpg
    // Supabase sam obsłuży odpowiedni Content-Type
    // Dodajemy timestamp, aby uniknąć problemów z cache przeglądarki
    const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(`avatars/${userId}`, {
             // Opcjonalnie: transformacja obrazu po stronie Supabase
             /* transform: {
                 width: 48,
                 height: 48,
                 resize: 'cover' // lub 'contain'
             } */
         });

    // Zwracamy URL z dodanym timestampem, aby wymusić odświeżenie
    return `${data.publicUrl}?t=${new Date().getTime()}`;
}
