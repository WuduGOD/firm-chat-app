import { supabase, profilesCache } from './supabaseClient.js'

export async function loadAllProfiles() {
  // ZMIANA: Pobierz 'avatar_url' zamiast 'user_metadata'
  const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, email, username, avatar_url'); // <-- ZMIANA TUTAJ

  if (error) {
    console.error('Błąd ładowania profili:', error);
    return [];
  }
  profilesCache.clear();
  profiles.forEach(({ id, email, username, avatar_url }) => { // <-- ZMIANA TUTAJ
    // ZMIANA: Zapisz 'avatar_url' bezpośrednio
    profilesCache.set(id, {
        email,
        username,
        avatar_url: avatar_url || null // <-- ZMIANA TUTAJ
    });
  });
  console.log("Profile cache updated with avatar URLs:", profilesCache);
  return profiles;
}

export function getUserLabelById(id) {
  const profile = profilesCache.get(id)
  if (!profile) return id
  return profile.username || profile.email || id
}

/**
 * Pobiera publiczny URL do awatara użytkownika z cache lub zwraca placeholder.
 * @param {string} userId - ID użytkownika.
 * @returns {string} Publiczny URL do awatara lub placeholder.
 */
export function getAvatarUrl(userId) {
    if (!userId) {
        return 'https://placehold.co/48x48/cccccc/FFFFFF?text=?'; // Placeholder
    }

    const profile = profilesCache.get(userId);
    const cachedUrl = profile?.avatar_url;

    if (cachedUrl) {
        // Zwróć zapisany URL z dodanym timestampem, aby odświeżyć cache przeglądarki
        // Upewnij się, że URL nie ma już timestampa
        const urlWithoutTimestamp = cachedUrl.split('?t=')[0];
        return `${urlWithoutTimestamp}?t=${new Date().getTime()}`;
    } else {
        // Jeśli URL nie jest zapisany, użyj domyślnego avatara Pravatar jako fallback
        // LUB możesz zwrócić bardziej generyczny placeholder:
        // return 'https://placehold.co/48x48/cccccc/FFFFFF?text=?';
        console.warn(`Nie znaleziono avatar_url w cache dla użytkownika ${userId}. Używam Pravatar.`);
        return `https://i.pravatar.cc/150?img=${userId.charCodeAt(0) % 70 + 1}`;
    }
}
