// profiles.js
// Import klienta Supabase
import { supabase } from './supabaseClient.js';

/**
 * Ładuje wszystkie profile użytkowników z bazy danych.
 * @returns {Promise<Array>} Tablica obiektów profili.
 */
export async function loadAllProfiles() {
    try {
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url'); // Upewnij się, że pobierasz 'username' i 'full_name'

        if (error) {
            console.error('Błąd ładowania wszystkich profili:', error);
            return [];
        }
        return profiles || [];
    } catch (err) {
        console.error('Wyjątek w loadAllProfiles:', err);
        return [];
    }
}

/**
 * Pobiera profil użytkownika na podstawie jego ID.
 * @param {string} userId ID użytkownika.
 * @returns {Promise<Object|null>} Obiekt profilu lub null, jeśli nie znaleziono.
 */
export async function getProfileById(userId) {
    if (!userId) {
        console.warn("getProfileById: Brak userId.");
        return null;
    }
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 oznacza brak wyników
            console.error(`Błąd pobierania profilu dla ID ${userId}:`, error);
            return null;
        }
        return profile;
    } catch (err) {
        console.error(`Wyjątek w getProfileById dla ID ${userId}:`, err);
        return null;
    }
}

/**
 * Pobiera etykietę użytkownika (nazwę) na podstawie jego ID.
 * Priorytetyzuje 'username', potem 'full_name', a na końcu generuje etykietę z ID.
 * @param {string} userId ID użytkownika.
 * @returns {Promise<string>} Nazwa użytkownika lub domyślna etykieta, jeśli nie znaleziono.
 */
export async function getUserLabelById(userId) {
    if (!userId) return 'Nieznany (brak ID)'; // Upewnij się, że userId nie jest null/undefined

    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('username, full_name') // Pamiętaj, aby pobierać te kolumny
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Błąd pobierania etykiety profilu:', error);
            return `Użytkownik (${userId.substring(0, 4)}...)`; // Zwróć identyfikator z ID w przypadku błędu
        }

        if (profile) {
            // Zwróć username, jeśli istnieje, w przeciwnym razie full_name, a jeśli oba brak, to etykietę z ID
            return profile.username || profile.full_name || `Użytkownik (${userId.substring(0, 4)}...)`;
        } else {
            return `Użytkownik (${userId.substring(0, 4)}...)`; // Użytkownik nie znaleziony
        }
    } catch (err) {
        console.error('Wyjątek w getUserLabelById:', err);
        return 'Błąd Użytkownika (ID:' + userId.substring(0, 4) + '...)'; // Zwróć etykietę błędu w przypadku wyjątku
    }
}