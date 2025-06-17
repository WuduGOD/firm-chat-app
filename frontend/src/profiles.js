// profiles.js
// Import klienta Supabase
import { supabase } from './supabaseClient.js';

// Globalna zmienna do przechowywania wszystkich załadowanych profili.
// Służy jako prosty cache, aby uniknąć wielokrotnych zapytań do bazy danych.
let allProfiles = [];

/**
 * Ładuje wszystkie profile użytkowników z tabeli 'profiles' w Supabase.
 * Pobiera tylko 'id' i 'username', ponieważ te pola są najczęściej potrzebne.
 * Możesz dodać więcej pól, jeśli są potrzebne (np. 'avatar_url').
 * Buforuje profile w zmiennej 'allProfiles'.
 * @returns {Array<Object>} Tablica załadowanych obiektów profilu.
 */
export async function getUserLabelById(userId) {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('username, full_name') // Upewnij się, że pobierasz 'username' lub 'full_name'
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Błąd pobierania profilu:', error);
            return 'Nieznany Użytkownik'; // Zwróć domyślną etykietę w przypadku błędu
        }

        if (profile) {
            // Zwróć username, jeśli istnieje, w przeciwnym razie full_name, a jeśli oba brak, to domyślną etykietę
            return profile.username || profile.full_name || `Użytkownik (${userId.substring(0, 4)}...)`;
        } else {
            return 'Nieznany Użytkownik'; // Użytkownik nie znaleziony
        }
    } catch (err) {
        console.error('Wyjątek w getUserLabelById:', err);
        return 'Błąd Użytkownika'; // Zwróć etykietę błędu w przypadku wyjątku
    }
}

/**
 * Zwraca nazwę użytkownika (username) na podstawie jego ID.
 * Najpierw szuka w buforowanych profilach, a jeśli nie znajdzie, próbuje pobrać z bazy danych.
 * @param {string} userId ID użytkownika.
 * @returns {Promise<string>} Nazwa użytkownika lub 'Nieznany użytkownik' jeśli nie znaleziono.
 */
export async function getUserLabelById(userId) {
    if (!userId) return 'Nieznany (brak ID)';

    // Spróbuj znaleźć w buforowanych profilach
    const profile = allProfiles.find(p => p.id === userId);
    if (profile && profile.username) {
        return profile.username;
    }

    // Jeśli nie ma w buforze, spróbuj pobrać z bazy danych
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('username') // Pobierz tylko username
            .eq('id', userId)
            .single(); // Oczekujemy jednego rekordu

        if (error && error.code !== 'PGRST116') { // PGRST116 oznacza "no rows found", co jest OK
            console.error(`Błąd podczas pobierania nazwy użytkownika dla ID ${userId}:`, error.message);
            throw error;
        }

        if (data && data.username) {
            // Dodaj pobrany profil do bufora, aby przyspieszyć przyszłe zapytania
            // Możemy po prostu dodać, jeśli nie ma pełnego profilu.
            if (!allProfiles.find(p => p.id === userId)) {
                allProfiles.push({ id: userId, username: data.username });
            }
            return data.username;
        }
        return 'Nieznany użytkownik';
    } catch (err) {
        console.error(`Wyjątek w getUserLabelById dla ID ${userId}:`, err.message);
        return 'Nieznany użytkownik';
    }
}

/**
 * Zwraca cały obiekt profilu użytkownika na podstawie jego ID.
 * Najpierw szuka w buforowanych profilach, a jeśli nie znajdzie, próbuje pobrać z bazy danych.
 * Może być użyteczne do pobierania dodatkowych danych, takich jak avatar_url.
 * @param {string} userId ID użytkownika.
 * @returns {Promise<Object|null>} Obiekt profilu użytkownika lub null, jeśli nie znaleziono.
 */
export async function getProfileById(userId) {
    if (!userId) return null;

    // Spróbuj znaleźć w buforowanych profilach
    const profile = allProfiles.find(p => p.id === userId);
    if (profile) {
        return profile;
    }

    // Jeśli nie ma w buforze, spróbuj pobrać z bazy danych
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*') // Pobierz wszystkie kolumny profilu
            .eq('id', userId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error(`Błąd podczas pobierania profilu dla ID ${userId}:`, error.message);
            throw error;
        }

        if (data) {
            // Dodaj pobrany profil do bufora
            const existingIndex = allProfiles.findIndex(p => p.id === data.id);
            if (existingIndex > -1) {
                allProfiles[existingIndex] = data; // Zaktualizuj, jeśli już istnieje
            } else {
                allProfiles.push(data); // Dodaj nowy
            }
            return data;
        }
        return null; // Profil nie znaleziony
    } catch (err) {
        console.error(`Wyjątek w getProfileById dla ID ${userId}:`, err.message);
        return null;
    }
}