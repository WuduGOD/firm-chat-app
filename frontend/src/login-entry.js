// Jeśli UŻYWASZ bundlera (np. Webpack, Parcel), zostaw ten import.
// Jeśli NIE UŻYWASZ bundlera, usuń tę linię i podłącz style.css w HTML.
import './style.css';
import { supabase } from './supabaseClient.js';

console.log('► login-entry.js załadowany');

document.addEventListener('DOMContentLoaded', () => {
    // Pobierz elementy formularza logowania
    const form = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.querySelector('.password-wrapper .eye i'); // Pobierz element ikony oka

    if (!form) {
        console.error('❌ Nie znaleziono <form id="loginForm"> w login.html');
        return;
    }

    // Dodaj obsługę kliknięcia dla ikony oka
    if (eyeIcon && passwordInput) {
        eyeIcon.addEventListener('click', () => {
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                eyeIcon.classList.remove('fa-eye');
                eyeIcon.classList.add('fa-eye-slash'); // Zmień ikonę na przekreślone oko
            } else {
                passwordInput.type = 'password';
                eyeIcon.classList.remove('fa-eye-slash');
                eyeIcon.classList.add('fa-eye'); // Zmień ikonę na zwykłe oko
            }
        });
    } else {
        console.warn('⚠️ Nie znaleziono ikony oka lub pola hasła. Sprawdź HTML.');
    }


    // Obsługa wysyłania formularza logowania
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            alert('Proszę wypełnić wszystkie pola.');
            return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            console.error('Błąd logowania Supabase:', error);
            alert('Błąd logowania: ' + error.message);
        } else {
            console.log('Zalogowano pomyślnie!', data);
            // Przekierowanie po udanym logowaniu
            window.location.href = '/chat.html'; // Upewnij się, że ścieżka jest poprawna
        }
    });
});